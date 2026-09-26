"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/supabase/admin";
import { sessionDb } from "@/lib/supabase/server";
import { isAllowedAdminPhone, requireAdmin } from "@/lib/auth";
import { analyseGarment, type GarmentGuess } from "@/lib/anthropic";
import { falConfigured, retryColour, startGeneration, advanceJobs, baseModelPath } from "@/lib/generation";
import { normalizePhone } from "@/lib/format";
import { publishToCatalog, signedOriginal, slugify, ORIGINALS } from "@/lib/storage";
import { CATEGORIES, ORDER_STATUSES, type Category, type OrderStatus, type PaletteColour } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };
const toInt = (v: FormDataEntryValue | null) => {
  const n = Number.parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};
const text = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max) || null;

function revalidateCatalogue(slug?: string) {
  revalidatePath("/");
  if (slug) revalidatePath(`/p/${slug}`);
}

// ---------------------------------------------------------------- auth

export async function checkAdminPhone(phone: string): Promise<{ ok: boolean }> {
  return { ok: await isAllowedAdminPhone(normalizePhone(phone)) };
}

export async function logout(): Promise<void> {
  const db = await sessionDb();
  await db.auth.signOut();
  redirect("/admin/login");
}

// ---------------------------------------------------------------- orders

export async function updateOrder(code: string, form: FormData): Promise<Result> {
  await requireAdmin();
  const status = String(form.get("status")) as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) return { ok: false, error: "status" };
  const { error } = await adminDb()
    .from("orders")
    .update({
      status,
      final_amount: toInt(form.get("final_amount")),
      advance_amount: toInt(form.get("advance_amount")),
      note: text(form.get("note"), 1000),
      transport_name: text(form.get("transport_name")),
      lr_number: text(form.get("lr_number"), 60),
      cancel_reason: status === "cancelled" ? text(form.get("cancel_reason"), 60) : null,
    })
    .eq("code", code);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${code}`);
  revalidatePath(`/o/${code}`);
  return { ok: true };
}

export async function markContacted(code: string): Promise<void> {
  await requireAdmin();
  await adminDb().from("orders").update({ status: "contacted" }).eq("code", code).eq("status", "new");
  revalidatePath("/admin");
}

// ---------------------------------------------------------------- publish flow

export async function createDraft(): Promise<{ id: string }> {
  const admin = await requireAdmin();
  const { data, error } = await adminDb()
    .from("products")
    .insert({
      slug: `draft-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: "Naya design",
      category: "tshirt",
      price_per_piece: 1,
      status: "draft",
      created_by: admin.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function analysePhoto(productId: string, path: string): Promise<GarmentGuess | null> {
  await requireAdmin();
  if (!path.startsWith(`${productId}/`)) return null;
  const [url, palette] = await Promise.all([signedOriginal(path, 600), getPalette()]);
  if (!url) return null;
  return analyseGarment(url, palette.map((p) => p.name));
}

async function getPalette(): Promise<PaletteColour[]> {
  const { data } = await adminDb().from("settings").select("value").eq("key", "colour_palette").maybeSingle();
  return Array.isArray(data?.value) ? (data.value as PaletteColour[]) : [];
}

async function uniqueSlug(name: string, productId: string): Promise<string> {
  const base = slugify(name);
  const { data } = await adminDb().from("products").select("slug, id").like("slug", `${base}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== productId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export type DesignDetails = {
  name: string;
  category: Category;
  print_type: "solid" | "print" | "stripe";
  price: number;
  moq: number;
  fabric: string;
  gsm: string;
  sizes: string[];
  originalPath: string;
  photoColour: string;
  colours: { name: string; hex: string; photoPath?: string | null }[];
};

// Saves the design and its colours, then either starts AI generation or
// uses the shop photos directly (mode "manual", phase 1 path).
export async function saveDesign(productId: string, d: DesignDetails, mode: "ai" | "manual"): Promise<Result> {
  await requireAdmin();
  const db = adminDb();
  const name = d.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Naam daalein" };
  if (!CATEGORIES.includes(d.category)) return { ok: false, error: "Category chunein" };
  if (!Number.isInteger(d.price) || d.price <= 0) return { ok: false, error: "Price daalein" };
  if (!Number.isInteger(d.moq) || d.moq <= 0) return { ok: false, error: "Min pieces" };
  const sizes = d.sizes.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (sizes.length === 0) return { ok: false, error: "Sizes chunein" };
  const colours = d.colours.filter((c) => c.name.trim());
  if (colours.length === 0) return { ok: false, error: "Colour chunein" };
  const ownPath = (p?: string | null) => (p && p.startsWith(`${productId}/`) ? p : null);
  if (!ownPath(d.originalPath)) return { ok: false, error: "Photo" };

  const slug = await uniqueSlug(name, productId);
  const { error } = await db
    .from("products")
    .update({
      name,
      slug,
      category: d.category,
      print_type: d.print_type,
      price_per_piece: d.price,
      moq_pieces: d.moq,
      size_set: sizes,
      fabric: d.fabric.trim().slice(0, 60) || null,
      gsm: d.gsm.trim().slice(0, 20) || null,
    })
    .eq("id", productId)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };

  // Replace colours and originals of this draft.
  await db.from("product_colors").delete().eq("product_id", productId);
  await db.from("product_images").delete().eq("product_id", productId).eq("kind", "original");
  const { data: rows, error: cErr } = await db
    .from("product_colors")
    .insert(
      colours.map((c) => ({
        product_id: productId,
        color_name: c.name.trim().slice(0, 40),
        color_hex: /^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : null,
        source: ownPath(c.photoPath) || c.name === d.photoColour ? "photo" : "recolour",
        status: "pending",
      })),
    )
    .select("id, color_name");
  if (cErr || !rows) return { ok: false, error: cErr?.message ?? "colours" };

  const images: Record<string, unknown>[] = [
    { product_id: productId, color_id: null, kind: "original", storage_path: d.originalPath, status: "approved" },
  ];
  for (const row of rows) {
    const c = colours.find((x) => x.name.trim().slice(0, 40) === row.color_name)!;
    const path = ownPath(c.photoPath) ?? (row.color_name === d.photoColour ? d.originalPath : null);
    if (path) images.push({ product_id: productId, color_id: row.id, kind: "original", storage_path: path, status: "approved" });
  }
  await db.from("product_images").insert(images);

  if (mode === "manual" || !falConfigured()) {
    for (const row of rows) await applyOriginalInner(productId, row.id);
  } else {
    if (!(await baseModelPath())) return { ok: false, error: "Settings mein base model photo daalein" };
    await startGeneration(productId);
  }
  return { ok: true };
}

async function colourOriginalPath(productId: string, colorId: string): Promise<string | null> {
  const { data } = await adminDb()
    .from("product_images")
    .select("color_id, storage_path")
    .eq("product_id", productId)
    .eq("kind", "original")
    .order("created_at", { ascending: false });
  return data?.find((r) => r.color_id === colorId)?.storage_path ?? data?.find((r) => r.color_id === null)?.storage_path ?? null;
}

async function setColourImage(productId: string, colorId: string, fromPath: string): Promise<void> {
  const db = adminDb();
  const ext = fromPath.split(".").pop() ?? "jpg";
  const to = `products/${productId}/${colorId}-${Date.now().toString(36)}.${ext}`;
  await publishToCatalog(fromPath, to);
  await db
    .from("product_colors")
    .update({ approved_image_path: to, thumb_path: to, status: "approved" })
    .eq("id", colorId)
    .eq("product_id", productId);
}

async function applyOriginalInner(productId: string, colorId: string) {
  const path = await colourOriginalPath(productId, colorId);
  if (!path) throw new Error("no photo");
  await setColourImage(productId, colorId, path);
  await adminDb().from("product_images").update({ status: "rejected" }).eq("color_id", colorId).eq("status", "pending_approval");
}

export async function applyOriginalPhoto(productId: string, colorId: string): Promise<Result> {
  await requireAdmin();
  await applyOriginalInner(productId, colorId);
  await afterColourChange(productId);
  return { ok: true };
}

export async function approveImage(productId: string, colorId: string, imageId: string): Promise<Result> {
  await requireAdmin();
  const db = adminDb();
  const { data: img } = await db
    .from("product_images")
    .select("storage_path, status")
    .eq("id", imageId)
    .eq("color_id", colorId)
    .single();
  if (!img || img.status !== "pending_approval") return { ok: false, error: "image" };
  await setColourImage(productId, colorId, img.storage_path);
  await db.from("product_images").update({ status: "approved" }).eq("id", imageId);
  await afterColourChange(productId);
  return { ok: true };
}

export async function retryImage(productId: string, colorId: string): Promise<Result> {
  await requireAdmin();
  try {
    await retryColour(productId, colorId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "retry" };
  }
}

export async function pollGeneration(productId: string): Promise<void> {
  await requireAdmin();
  await advanceJobs(productId);
}

async function afterColourChange(productId: string) {
  const { data } = await adminDb().from("products").select("slug").eq("id", productId).single();
  revalidatePath(`/admin/products/${productId}`);
  revalidateCatalogue(data?.slug);
}

// A design cannot go live with an unapproved colour.
export async function publishProduct(productId: string): Promise<Result> {
  await requireAdmin();
  const db = adminDb();
  const { data: p } = await db
    .from("products")
    .select("id, slug, status, original_image_path, product_colors (status)")
    .eq("id", productId)
    .single();
  if (!p) return { ok: false, error: "not found" };
  const colours = p.product_colors as { status: string }[];
  if (colours.length === 0 || colours.some((c) => c.status === "pending")) return { ok: false, error: "unapproved" };

  let original = p.original_image_path as string | null;
  if (!original) {
    const { data: o } = await db
      .from("product_images")
      .select("storage_path")
      .eq("product_id", productId)
      .eq("kind", "original")
      .is("color_id", null)
      .maybeSingle();
    if (o?.storage_path) {
      original = await publishToCatalog(o.storage_path, `products/${productId}/original.${o.storage_path.split(".").pop() ?? "jpg"}`);
    }
  }
  const { data: top } = await db.from("products").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  await db
    .from("products")
    .update({ status: "live", original_image_path: original, sort_order: (top?.sort_order ?? 0) + 1 })
    .eq("id", productId);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  revalidateCatalogue(p.slug);
  return { ok: true };
}

// ---------------------------------------------------------------- products

export async function updateProduct(productId: string, form: FormData): Promise<Result> {
  await requireAdmin();
  const price = toInt(form.get("price"));
  const moq = toInt(form.get("moq"));
  const name = text(form.get("name"), 80);
  const sizes = String(form.get("sizes") ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!name || !price || price <= 0 || !moq || moq <= 0 || sizes.length === 0) return { ok: false, error: "Check fields" };
  const { data, error } = await adminDb()
    .from("products")
    .update({ name, price_per_piece: price, moq_pieces: moq, size_set: sizes, fabric: text(form.get("fabric"), 60), gsm: text(form.get("gsm"), 20) })
    .eq("id", productId)
    .select("slug")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/products");
  revalidateCatalogue(data.slug);
  return { ok: true };
}

export async function setProductStatus(productId: string, status: "live" | "hidden" | "sold_out"): Promise<Result> {
  await requireAdmin();
  const db = adminDb();
  if (status === "live") {
    const { data: cols } = await db.from("product_colors").select("status").eq("product_id", productId);
    if (!cols?.length || cols.some((c) => c.status === "pending")) return { ok: false, error: "unapproved" };
  }
  const { data } = await db.from("products").update({ status }).eq("id", productId).neq("status", "draft").select("slug").maybeSingle();
  revalidatePath("/admin/products");
  revalidateCatalogue(data?.slug);
  return { ok: true };
}

export async function moveProduct(productId: string, direction: "up" | "down"): Promise<void> {
  await requireAdmin();
  const db = adminDb();
  const { data: list } = await db
    .from("products")
    .select("id, sort_order")
    .neq("status", "draft")
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false });
  if (!list) return;
  const i = list.findIndex((p) => p.id === productId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  // Renumber so every design has a distinct position, then swap the pair.
  const order = list.map((p) => p.id);
  [order[i], order[j]] = [order[j], order[i]];
  await Promise.all(order.map((id, k) => db.from("products").update({ sort_order: order.length - k }).eq("id", id)));
  revalidatePath("/admin/products");
  revalidateCatalogue();
}

export async function toggleColourSoldOut(productId: string, colorId: string): Promise<void> {
  await requireAdmin();
  const db = adminDb();
  const { data: c } = await db.from("product_colors").select("status").eq("id", colorId).single();
  if (!c || c.status === "pending") return;
  await db.from("product_colors").update({ status: c.status === "sold_out" ? "approved" : "sold_out" }).eq("id", colorId);
  await afterColourChange(productId);
}

export async function toggleSizeSoldOut(productId: string, colorId: string, size: string): Promise<void> {
  await requireAdmin();
  const db = adminDb();
  const { data: c } = await db.from("product_colors").select("sold_out_sizes").eq("id", colorId).single();
  if (!c) return;
  const cur = c.sold_out_sizes as string[];
  const next = cur.includes(size) ? cur.filter((s) => s !== size) : [...cur, size];
  await db.from("product_colors").update({ sold_out_sizes: next }).eq("id", colorId);
  await afterColourChange(productId);
}

export async function deleteDraft(productId: string): Promise<void> {
  await requireAdmin();
  const db = adminDb();
  const { data: files } = await db.storage.from(ORIGINALS).list(productId);
  if (files?.length) await db.storage.from(ORIGINALS).remove(files.map((f) => `${productId}/${f.name}`));
  await db.from("products").delete().eq("id", productId).eq("status", "draft");
  redirect("/admin/products");
}

// ---------------------------------------------------------------- settings

export async function saveSetting(key: string, value: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const db = adminDb();
  if (key === "public") {
    const v = value as Record<string, unknown>;
    const { data: cur } = await db.from("settings").select("value").eq("key", "public").single();
    const current = (cur?.value ?? {}) as Record<string, unknown>;
    // The WhatsApp number is owner-only.
    if (!admin.isOwner && v.whatsapp_number !== current.whatsapp_number) return { ok: false, error: "owner only" };
    const wa = String(v.whatsapp_number ?? "").replace(/\D/g, "");
    if (!/^91[6-9]\d{9}$/.test(wa)) return { ok: false, error: "WhatsApp number: 91 + 10 digits" };
    const cities = Array.isArray(v.popular_cities)
      ? (v.popular_cities as unknown[]).filter((c): c is string => typeof c === "string").map((c) => c.trim().slice(0, 40)).filter(Boolean).slice(0, 24)
      : current.popular_cities;
    value = { ...current, ...v, whatsapp_number: wa, popular_cities: cities };
  } else if (key === "admin_phones" || key === "owner_phones") {
    if (!admin.isOwner) return { ok: false, error: "owner only" };
    const list = (value as string[]).map(normalizePhone).filter((p) => /^[6-9]\d{9}$/.test(p));
    if (key === "admin_phones" && list.length === 0) return { ok: false, error: "at least one admin" };
    value = [...new Set(list)];
  } else if (!["colour_palette", "size_sets", "base_models"].includes(key)) {
    return { ok: false, error: "unknown setting" };
  }
  const { error } = await db.from("settings").upsert({ key, value });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  if (key === "public") revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- push

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<Result> {
  const admin = await requireAdmin();
  if (!sub?.endpoint?.startsWith("https://")) return { ok: false, error: "endpoint" };
  const { error } = await adminDb()
    .from("push_subscriptions")
    .upsert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_id: admin.userId }, { onConflict: "endpoint" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
