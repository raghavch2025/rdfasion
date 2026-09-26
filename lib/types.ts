export type Category = "tshirt" | "lower" | "cargo" | "jacket";
export type ProductStatus = "draft" | "live" | "hidden" | "sold_out";
export type OrderStatus = "new" | "contacted" | "confirmed" | "dispatched" | "cancelled";
export const ORDER_STATUSES: OrderStatus[] = ["new", "contacted", "confirmed", "dispatched", "cancelled"];
export const CATEGORIES: Category[] = ["tshirt", "lower", "cargo", "jacket"];

export type ProductColor = {
  id: string;
  product_id: string;
  color_name: string;
  color_hex: string | null;
  source: "photo" | "recolour";
  approved_image_path: string | null;
  thumb_path: string | null;
  status: "pending" | "approved" | "sold_out";
  sold_out_sizes: string[];
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  fabric: string | null;
  gsm: string | null;
  price_per_piece: number;
  moq_pieces: number;
  size_set: string[];
  status: ProductStatus;
  sort_order: number;
  created_at: string;
  original_image_path: string | null;
  print_type: "solid" | "print" | "stripe" | null;
};

export type ProductWithColors = Product & { product_colors: ProductColor[] };

export type PublicSettings = {
  shop_name: string;
  instagram: string;
  whatsapp_number: string;
  call_number: string;
  second_number?: string;
  address: string;
  hours: string | null;
  rating: string | null;
  popular_cities?: string[];
};

export type PaletteColour = { name: string; hex: string };
