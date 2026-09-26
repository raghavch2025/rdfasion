import "server-only";
import { adminDb } from "./supabase/admin.ts";
import type { OrderStatus } from "./types.ts";

export type OrderLine = {
  colorId: string;
  productName: string;
  slug: string;
  colorName: string;
  image: string | null;
  pricePerPiece: number;
  sizes: [string, number][];
};

export type OrderDetail = {
  id: string;
  code: string;
  status: OrderStatus;
  total_pieces: number;
  total_amount: number;
  final_amount: number | null;
  advance_amount: number | null;
  note: string | null;
  source: string;
  utm: Record<string, string>;
  whatsapp_opened: boolean;
  transport_name: string | null;
  lr_number: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  buyer: { id: string; name: string; shop_name: string; city: string; phone: string; order_count: number };
  lines: OrderLine[];
};

type ItemRow = {
  size: string;
  qty: number;
  price_per_piece: number;
  color_id: string;
  products: { name: string; slug: string; size_set: string[] } | null;
  product_colors: { color_name: string; thumb_path: string | null; approved_image_path: string | null } | null;
};

export function isOrderCode(code: string): boolean {
  return /^RD-\d{4,9}$/.test(code);
}

// Orders are read only by code, on the server, with the service role.
export async function getOrderByCode(code: string): Promise<OrderDetail | null> {
  if (!isOrderCode(code)) return null;
  const { data, error } = await adminDb()
    .from("orders")
    .select(
      "id, code, status, total_pieces, total_amount, final_amount, advance_amount, note, source, utm, whatsapp_opened, transport_name, lr_number, cancel_reason, created_at, updated_at, buyer:buyers (id, name, shop_name, city, phone, order_count), order_items (size, qty, price_per_piece, color_id, products (name, slug, size_set), product_colors (color_name, thumb_path, approved_image_path))",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { order_items, ...order } = data as unknown as Omit<OrderDetail, "lines"> & { order_items: ItemRow[] };

  const byColor = new Map<string, OrderLine & { sizeSet: string[] }>();
  for (const it of order_items) {
    let line = byColor.get(it.color_id);
    if (!line) {
      line = {
        colorId: it.color_id,
        productName: it.products?.name ?? "",
        slug: it.products?.slug ?? "",
        colorName: it.product_colors?.color_name ?? "",
        image: it.product_colors?.thumb_path ?? it.product_colors?.approved_image_path ?? null,
        pricePerPiece: it.price_per_piece,
        sizes: [],
        sizeSet: it.products?.size_set ?? [],
      };
      byColor.set(it.color_id, line);
    }
    line.sizes.push([it.size, it.qty]);
  }
  const lines = [...byColor.values()].map(({ sizeSet, ...l }) => ({
    ...l,
    sizes: l.sizes.sort((a, b) => sizeSet.indexOf(a[0]) - sizeSet.indexOf(b[0])),
  }));
  return { ...order, lines };
}
