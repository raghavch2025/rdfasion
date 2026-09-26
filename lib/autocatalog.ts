import "server-only";
import { adminDb } from "./supabase/admin.ts";
import { groupPhotos, type Grouping } from "./anthropic.ts";
import { advanceJobs, baseModelPath, falConfigured, startGeneration } from "./generation.ts";
import { publishToCatalog, signedOriginal, slugify, ORIGINALS } from "./storage.ts";
import { catalogImageUrl } from "./image-url.ts";
import { SITE_URL } from "./env.ts";
import type { Category, PaletteColour } from "./types.ts";
import { parsePrice } from "./parse.ts";

// New designs from photos: Papa uploads (upload link) or sends (WhatsApp)
// photos, Claude groups them into designs and colours, each photo becomes a
// colour of a new draft design or of a design already in the catalogue, and
// every photo is redone by AI try-on on the shop's one base model, so the
// whole catalogue shows the same model. Papa then sets the rate and publishes.

// At most 20 images go to Claude in one request (above 20, each image must be
// 2000 px or smaller), so a batch holds up to 20 photos, and reference photos
// of existing designs fill whatever room is left.
export const MAX_BATCH_PHOTOS = 20;
const MAX_IMAGES_PER_REQUEST = 20;
// A batch stuck in "processing" this long (function limit hit) may be run again.
export const STUCK_PROCESSING_MS = 3 * 60 * 1000;

type Item = { id: string; storage_path: string; caption: string | null };
export type BatchSummary = {
  designs: { product_id: string; name: string; is_new: boolean; colours: string[]; ai: boolean }[];
  skipped: number;
  grouped_by: "claude" | "one-per-photo";
  ai_images: "queued" | "not-configured" | "not-needed";
  // Colours that need a look before they can go live: one photo showed
  // several colours (flat-lay), or no AI image could be made for them.
  needs_review: string[];
  note?: string;
};

export { parsePrice } from "./parse.ts";

export async function createBatch(source: "link" | "whatsapp" | "admin", senderPhone?: string | null): Promise<string> {
  const { data, error } = await adminDb()
    .from("upload_batches")
    .insert({ source, sender_phone: senderPhone ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function addItems(
  batchId: string,
  items: { storage_path: string; caption?: string | null; wa_message_id?: string | null }[],
): Promise<number> {
  if (!items.length) return 0;
  const db = adminDb();
  const { data, error } = await db
    .from("upload_items")
    .upsert(
      items.map((i) => ({ batch_id: batchId, storage_path: i.storage_path, caption: i.caption ?? null, wa_message_id: i.wa_message_id ?? null })),
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  await db.from("upload_batches").update({ last_item_at: new Date().toISOString() }).eq("id", batchId);
  return data?.length ?? 0;
}

async function settingsValue<T>(key: string, fallback: T): Promise<T> {
  const { data } = await adminDb().from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

function absoluteImage(path: string | null | undefined): string | null {
  const u = catalogImageUrl(path);
  if (!u) return null;
  return u.startsWith("/") ? `${SITE_URL}${u}` : u;
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  const { data } = await adminDb().from("products").select("slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

// Without Claude: one draft design per photo, for Papa to name and merge.
function onePerPhoto(items: Item[]): Grouping {
  return {
    groups: items.map((_, i) => ({
      existing_product_id: "",
      name: `Naya design ${i + 1}`,
      category: "tshirt" as Category,
      print_type: "solid" as const,
      photos: [{ photo: i + 1, colour_name: "Colour 1", colour_hex: "#cccccc", is_model_photo: false }],
    })),
    skipped: [],
  };
}

// Processes a batch once (claims it first, so a double tap or a webhook retry
// cannot run it twice). Returns the summary also stored on the batch.
export async function processBatch(batchId: string): Promise<BatchSummary | null> {
  const db = adminDb();
  const stuckBefore = new Date(Date.now() - STUCK_PROCESSING_MS).toISOString();
  const { data: claimed } = await db
    .from("upload_batches")
    .update({ status: "processing", error: null, last_item_at: new Date().toISOString() })
    .eq("id", batchId)
    .or(`status.in.(collecting,failed),and(status.eq.processing,last_item_at.lt.${stuckBefore})`)
    .select("id, price_hint")
    .maybeSingle();
  if (!claimed) return null;

  try {
    const { data: rows } = await db
      .from("upload_items")
      .select("id, storage_path, caption")
      .eq("batch_id", batchId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(MAX_BATCH_PHOTOS);
    const items = (rows ?? []) as Item[];
    if (!items.length) throw new Error("no photos in this batch");

    const priceHint =
      claimed.price_hint ?? items.map((i) => parsePrice(i.caption)).find((p): p is number => p !== null) ?? null;

    const [palette, sizeSets] = await Promise.all([
      settingsValue<PaletteColour[]>("colour_palette", []),
      settingsValue<Record<string, string[]>>("size_sets", {}),
    ]);

    // Existing designs Claude may add colours to: a catalogue photo, or for a
    // draft still waiting for its AI photos, the shop photo it was made from.
    const room = Math.max(0, MAX_IMAGES_PER_REQUEST - items.length);
    const { data: prods } = room
      ? await db
          .from("products")
          .select("id, name, category, status, product_colors (approved_image_path), product_images (kind, storage_path, created_at)")
          .in("status", ["live", "hidden", "draft", "sold_out"])
          .order("created_at", { ascending: false })
          .limit(40)
      : { data: [] };
    const candidates = (prods ?? []).map((p) => {
      const c = (p.product_colors as { approved_image_path: string | null }[]).find((x) => x.approved_image_path);
      const orig = (p.product_images as { kind: string; storage_path: string; created_at: string }[])
        .filter((i) => i.kind === "original" && i.storage_path)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      return { id: p.id as string, name: p.name as string, category: p.category as string, catalog: absoluteImage(c?.approved_image_path), original: orig?.storage_path ?? null };
    });
    const withPhoto = candidates.filter((c) => c.catalog || c.original).slice(0, room);
    const origUrls = await Promise.all(withPhoto.map((c) => (c.catalog ? Promise.resolve(null) : signedOriginal(c.original!, 1800))));
    const existing = withPhoto
      .map((c, i) => ({ id: c.id, name: c.name, category: c.category, url: c.catalog ?? origUrls[i] ?? "" }))
      .filter((e) => e.url);

    const signed = await Promise.all(items.map((i) => signedOriginal(i.storage_path, 1800)));
    const photos = items.map((it, i) => ({ number: i + 1, url: signed[i] ?? "", caption: it.caption })).filter((p) => p.url);

    const claude = await groupPhotos(photos, existing, palette.map((p) => p.name));
    const grouping = claude ?? onePerPhoto(items);
    const claudeSet = Boolean(process.env.ANTHROPIC_API_KEY);

    const aiReady = falConfigured() && Boolean(await baseModelPath());
    const summary: BatchSummary = {
      designs: [],
      skipped: 0,
      grouped_by: claude ? "claude" : "one-per-photo",
      ai_images: "not-needed",
      needs_review: [],
      note: !claude && claudeSet ? "Claude se grouping nahi ho payi (time ya photo ki dikkat); har photo alag design bani." : undefined,
    };
    const used = new Set<number>();
    const toGenerate = new Map<string, string[]>();
    const photoTypes: Record<string, "model" | "auto"> = {};
    // A photo showing several colours at once (a flat-lay) cannot go through
    // try-on as it is; those colours use the photo itself.
    const uses = new Map<number, number>();
    for (const g of grouping.groups) for (const ph of g.photos) uses.set(ph.photo, (uses.get(ph.photo) ?? 0) + 1);

    for (const g of grouping.groups) {
      const photosInGroup = g.photos.filter((ph) => ph.photo >= 1 && ph.photo <= items.length);
      if (!photosInGroup.length) continue;
      const category: Category = ["tshirt", "lower", "cargo", "jacket"].includes(g.category) ? g.category : "tshirt";

      let productId = existing.some((e) => e.id === g.existing_product_id) ? g.existing_product_id : "";
      let isNew = false;
      let productStatus = "draft";
      if (productId) {
        const { data: ps } = await db.from("products").select("status").eq("id", productId).single();
        productStatus = (ps?.status as string) ?? "draft";
      }
      if (!productId) {
        const name = (g.name || "Naya design").trim().slice(0, 80);
        const { data: created, error } = await db
          .from("products")
          .insert({
            slug: await uniqueSlug(name),
            name,
            category,
            print_type: g.print_type,
            // Placeholder until Papa types the rate; drafts are never shown.
            price_per_piece: priceHint ?? 1,
            size_set: sizeSets[category]?.length ? sizeSets[category] : ["M", "L", "XL", "XXL"],
            status: "draft",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        productId = created.id;
        isNew = true;
      }

      const { data: have } = await db.from("product_colors").select("color_name").eq("product_id", productId);
      const names = new Set((have ?? []).map((c) => c.color_name.toLowerCase()));
      const design = { product_id: productId, name: g.name, is_new: isNew, colours: [] as string[], ai: false };

      for (const ph of photosInGroup) {
        const item = items[ph.photo - 1];
        let colour = (ph.colour_name || "Colour").trim().slice(0, 40);
        for (let n = 2; names.has(colour.toLowerCase()); n++) colour = `${(ph.colour_name || "Colour").trim().slice(0, 36)} ${n}`;
        names.add(colour.toLowerCase());

        // With AI set up, every photo is redone on the shop's one base model
        // (a photo on some other model too), so all images show the same model.
        // A photo showing several colours (flat-lay) cannot go through try-on.
        const flatLay = (uses.get(ph.photo) ?? 0) > 1;
        const needsAi = aiReady && !flatLay;
        // Without an AI image, a photo goes in as it is only on a new draft
        // (nobody sees it until Papa publishes). On a live design, or for a
        // flat-lay, the colour waits for Papa to look at it ("Asli photo").
        const autoApprove = !needsAi && !flatLay && productStatus === "draft";
        const { data: colourRow, error: cErr } = await db
          .from("product_colors")
          .insert({
            product_id: productId,
            color_name: colour,
            color_hex: /^#[0-9a-fA-F]{6}$/.test(ph.colour_hex) ? ph.colour_hex : null,
            source: "photo",
            status: "pending",
          })
          .select("id")
          .single();
        if (cErr) throw new Error(cErr.message);
        await db.from("product_images").insert({
          product_id: productId,
          color_id: colourRow.id,
          kind: "original",
          storage_path: item.storage_path,
          status: "approved",
        });
        if (needsAi) {
          toGenerate.set(productId, [...(toGenerate.get(productId) ?? []), colourRow.id]);
          photoTypes[colourRow.id] = ph.is_model_photo ? "model" : "auto";
          design.ai = true;
        } else if (!autoApprove) {
          summary.needs_review.push(`${g.name}: ${colour}`);
        } else {
          // No AI configured, new draft: the photo goes in as it is.
          const ext = item.storage_path.split(".").pop() ?? "jpg";
          const to = `products/${productId}/${colourRow.id}.${ext}`;
          await publishToCatalog(item.storage_path, to);
          await db
            .from("product_colors")
            .update({ approved_image_path: to, thumb_path: to, status: "approved" })
            .eq("id", colourRow.id);
        }
        if (!used.has(ph.photo)) {
          used.add(ph.photo);
          await db.from("upload_items").update({ status: "grouped", product_id: productId, color_id: colourRow.id }).eq("id", item.id);
        }
        design.colours.push(colour);
      }
      summary.designs.push(design);
    }

    const skippedIds = items.filter((_, i) => !used.has(i + 1)).map((i) => i.id);
    if (skippedIds.length) {
      const reasons = new Map(grouping.skipped.map((s) => [s.photo, s.reason]));
      for (const [i, it] of items.entries()) {
        if (!used.has(i + 1)) await db.from("upload_items").update({ status: "skipped", note: reasons.get(i + 1) ?? null }).eq("id", it.id);
      }
    }
    summary.skipped = skippedIds.length;

    if (toGenerate.size) {
      summary.ai_images = "queued";
      for (const [pid, colourIds] of toGenerate) await startGeneration(pid, colourIds, photoTypes).catch((e) => console.error("generation", e));
    } else if (!aiReady) {
      summary.ai_images = "not-configured";
    }

    await db
      .from("upload_batches")
      .update({ status: "ready", price_hint: priceHint, summary, processed_at: new Date().toISOString() })
      .eq("id", batchId);
    return summary;
  } catch (err) {
    await db
      .from("upload_batches")
      .update({ status: "failed", error: err instanceof Error ? err.message.slice(0, 500) : String(err) })
      .eq("id", batchId);
    throw err;
  }
}

// Designs waiting for Papa: drafts, and live designs with colours still
// waiting for their AI image.
export async function reviewQueue() {
  const db = adminDb();
  const { data: products } = await db
    .from("products")
    .select(
      "id, slug, name, category, status, price_per_piece, moq_pieces, size_set, original_image_path, created_at, product_colors (id, color_name, color_hex, status, approved_image_path)",
    )
    .order("created_at", { ascending: false })
    .limit(60);
  const list = (products ?? []).filter(
    (p) => p.status === "draft" || (p.product_colors as { status: string }[]).some((c) => c.status === "pending"),
  );
  const ids = list.map((p) => p.id);
  const [{ data: images }, { data: jobs }] = await Promise.all([
    ids.length
      ? db
          .from("product_images")
          .select("id, product_id, color_id, kind, storage_path, status, error, created_at")
          .in("product_id", ids)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    ids.length
      ? db.from("generation_jobs").select("product_id, color_id, status").in("product_id", ids).in("status", ["queued", "running"])
      : Promise.resolve({ data: [] as never[] }),
  ]);
  return { products: list, images: images ?? [], jobs: jobs ?? [] };
}

export async function recentBatches(limit = 8) {
  const { data } = await adminDb()
    .from("upload_batches")
    .select("id, source, status, summary, error, created_at, last_item_at, photos:upload_items (count), pending:upload_items (count)")
    .eq("pending.status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function advanceQueue(): Promise<void> {
  await advanceJobs();
}

export { ORIGINALS };
