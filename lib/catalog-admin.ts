import "server-only";
import { revalidatePath } from "next/cache";
import { adminDb } from "./supabase/admin.ts";
import { publishToCatalog } from "./storage.ts";
import { CATEGORIES, type Category } from "./types.ts";

// Catalogue changes shared by /admin (signed-in admins) and the private
// upload link. Callers check who is asking first.

export function revalidateCatalogue(slug?: string) {
  revalidatePath("/");
  if (slug) revalidatePath(`/p/${slug}`);
}

async function afterColourChange(productId: string) {
  const { data } = await adminDb().from("products").select("slug").eq("id", productId).single();
  revalidatePath(`/admin/products/${productId}`);
  revalidateCatalogue(data?.slug);
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
  const ext = fromPath.split(".").pop() ?? "jpg";
  const to = `products/${productId}/${colorId}-${Date.now().toString(36)}.${ext}`;
  await publishToCatalog(fromPath, to);
  await adminDb()
    .from("product_colors")
    .update({ approved_image_path: to, thumb_path: to, status: "approved" })
    .eq("id", colorId)
    .eq("product_id", productId);
}

// Use the shop's own photo for a colour (no AI image). A colour that already
// shows a photo (e.g. one shipped in public/seed) just keeps it.
export async function applyOriginal(productId: string, colorId: string): Promise<void> {
  const db = adminDb();
  const path = await colourOriginalPath(productId, colorId);
  if (path) await setColourImage(productId, colorId, path);
  else {
    const { data: c } = await db.from("product_colors").select("approved_image_path").eq("id", colorId).single();
    if (!c?.approved_image_path) throw new Error("no photo");
    await db.from("product_colors").update({ status: "approved" }).eq("id", colorId);
  }
  await db.from("product_images").update({ status: "rejected" }).eq("color_id", colorId).eq("status", "pending_approval");
  await afterColourChange(productId);
}

export async function approveCandidate(productId: string, colorId: string, imageId: string): Promise<boolean> {
  const db = adminDb();
  const { data: img } = await db
    .from("product_images")
    .select("storage_path, status")
    .eq("id", imageId)
    .eq("color_id", colorId)
    .single();
  if (!img || img.status !== "pending_approval") return false;
  await setColourImage(productId, colorId, img.storage_path);
  await db.from("product_images").update({ status: "approved" }).eq("id", imageId);
  await afterColourChange(productId);
  return true;
}

export type PublishFields = { name?: string; price?: number; moq?: number; sizes?: string[]; category?: Category };

// A design cannot go live with an unapproved colour or without a real rate.
export async function publishDesign(productId: string, fields: PublishFields = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = adminDb();
  const { data: p } = await db
    .from("products")
    .select("id, slug, status, price_per_piece, original_image_path, product_colors (status)")
    .eq("id", productId)
    .single();
  if (!p) return { ok: false, error: "not found" };
  const colours = p.product_colors as { status: string }[];
  if (colours.length === 0 || colours.some((c) => c.status === "pending")) return { ok: false, error: "unapproved" };

  const update: Record<string, unknown> = { status: "live" };
  if (fields.name?.trim()) update.name = fields.name.trim().slice(0, 80);
  if (fields.category && CATEGORIES.includes(fields.category)) update.category = fields.category;
  if (fields.price !== undefined) {
    if (!Number.isInteger(fields.price) || fields.price < 20 || fields.price > 50000) return { ok: false, error: "rate" };
    update.price_per_piece = fields.price;
  } else if ((p.price_per_piece as number) < 20) {
    return { ok: false, error: "rate" };
  }
  if (fields.moq !== undefined) {
    if (!Number.isInteger(fields.moq) || fields.moq < 1 || fields.moq > 1000) return { ok: false, error: "moq" };
    update.moq_pieces = fields.moq;
  }
  if (fields.sizes) {
    const sizes = fields.sizes.map((s) => s.trim().toUpperCase().slice(0, 10)).filter(Boolean);
    if (!sizes.length) return { ok: false, error: "sizes" };
    update.size_set = [...new Set(sizes)];
  }

  if (!p.original_image_path) {
    const { data: o } = await db
      .from("product_images")
      .select("storage_path")
      .eq("product_id", productId)
      .eq("kind", "original")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (o?.storage_path) {
      update.original_image_path = await publishToCatalog(
        o.storage_path,
        `products/${productId}/original.${o.storage_path.split(".").pop() ?? "jpg"}`,
      );
    }
  }
  if (p.status === "draft") {
    const { data: top } = await db.from("products").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    update.sort_order = (top?.sort_order ?? 0) + 1;
  }
  const { error } = await db.from("products").update(update).eq("id", productId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  revalidateCatalogue(p.slug);
  return { ok: true };
}
