import "server-only";
import { cache } from "react";
import { publicDb } from "./supabase/server.ts";
import { DEFAULT_CALL, DEFAULT_WHATSAPP } from "./env.ts";
import type { ProductWithColors, PublicSettings } from "./types.ts";

const PRODUCT_COLUMNS =
  "id, slug, name, category, fabric, gsm, price_per_piece, moq_pieces, size_set, status, sort_order, created_at, original_image_path, print_type, product_colors (id, product_id, color_name, color_hex, source, approved_image_path, thumb_path, status, sold_out_sizes)";

const FALLBACK_SETTINGS: PublicSettings = {
  shop_name: "RD Fashion",
  instagram: "fashionlitigation",
  whatsapp_number: DEFAULT_WHATSAPP,
  call_number: DEFAULT_CALL,
  address: "16/152, Upper Ground Floor, Madan Complex, Main Tank Road, Karol Bagh, Delhi 110005",
  hours: null,
  rating: null,
};

export const getPublicSettings = cache(async (): Promise<PublicSettings> => {
  try {
    const { data } = await publicDb().from("settings").select("value").eq("key", "public").maybeSingle();
    return { ...FALLBACK_SETTINGS, ...((data?.value as Partial<PublicSettings>) ?? {}) };
  } catch {
    return FALLBACK_SETTINGS;
  }
});

// Catalogue: live designs, newest first (sort_order desc, then created_at desc).
export async function getCatalogue(): Promise<ProductWithColors[]> {
  const { data, error } = await publicDb()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("status", "live")
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ProductWithColors[])
    .map((p) => ({ ...p, product_colors: p.product_colors.filter((c) => c.status === "approved") }))
    .filter((p) => p.product_colors.length > 0);
}

export const getProduct = cache(async (slug: string): Promise<ProductWithColors | null> => {
  const { data, error } = await publicDb().from("products").select(PRODUCT_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const p = data as ProductWithColors;
  // Colours sold out entirely disappear from the product page.
  return { ...p, product_colors: p.product_colors.filter((c) => c.status === "approved") };
});
