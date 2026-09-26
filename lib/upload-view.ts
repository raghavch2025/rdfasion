import "server-only";
import { adminDb } from "./supabase/admin.ts";
import { recentBatches, reviewQueue, type BatchSummary } from "./autocatalog.ts";
import { signedOriginals } from "./storage.ts";
import { catalogImageUrl } from "./image-url.ts";
import { baseModelPath, falConfigured } from "./generation.ts";
import type { Category } from "./types.ts";

export type ColourCard = {
  id: string;
  name: string;
  hex: string | null;
  status: "pending" | "approved" | "sold_out";
  imageUrl: string | null;
  candidate: { id: string; url: string | null } | null;
  shopPhotoUrl: string | null;
  generating: boolean;
  failed: string | null;
};
export type DesignCard = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  status: string;
  price: number | null;
  moq: number;
  sizes: string[];
  sizeOptions: string[];
  flatlayUrl: string | null;
  colours: ColourCard[];
};
export type BatchCard = { id: string; source: string; status: string; photos: number; createdAt: string; summary: BatchSummary | null; error: string | null };
export type DeskData = { designs: DesignCard[]; batches: BatchCard[]; aiReady: boolean; autofillReady: boolean };

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
// Letter sizes in wearing order, then waist sizes by number.
function bySize(a: string, b: string): number {
  const ia = SIZE_ORDER.indexOf(a);
  const ib = SIZE_ORDER.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return (Number.parseInt(a, 10) || 0) - (Number.parseInt(b, 10) || 0);
}

export async function loadDesk(): Promise<DeskData> {
  const [{ products, images, jobs }, batches, sizeSetsRow, aiModel] = await Promise.all([
    reviewQueue(),
    recentBatches(),
    adminDb().from("settings").select("value").eq("key", "size_sets").maybeSingle(),
    baseModelPath(),
  ]);
  const sizeSets = (sizeSetsRow.data?.value ?? {}) as Record<string, string[]>;
  const visible = images.filter((i) => i.storage_path && i.status !== "rejected" && i.status !== "failed");
  const signed = await signedOriginals([...new Set(visible.map((i) => i.storage_path))]);

  const designs: DesignCard[] = products.map((p) => {
    const colours = (p.product_colors as { id: string; color_name: string; color_hex: string | null; status: ColourCard["status"]; approved_image_path: string | null }[]).map(
      (c) => {
        const mine = images.filter((i) => i.color_id === c.id);
        const tryon = mine.find((i) => i.kind === "tryon");
        const shop = mine.find((i) => i.kind === "original");
        return {
          id: c.id,
          name: c.color_name,
          hex: c.color_hex,
          status: c.status,
          imageUrl: catalogImageUrl(c.approved_image_path) ?? null,
          candidate: tryon?.status === "pending_approval" ? { id: tryon.id, url: signed[tryon.storage_path] ?? null } : null,
          shopPhotoUrl: shop ? (signed[shop.storage_path] ?? null) : null,
          generating: jobs.some((j) => j.color_id === c.id),
          failed: tryon?.status === "failed" ? (tryon.error ?? "AI photo nahi bani") : null,
        };
      },
    );
    const cat = p.category as Category;
    const sizes = p.size_set as string[];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: cat,
      status: p.status,
      price: (p.price_per_piece as number) >= 20 ? (p.price_per_piece as number) : null,
      moq: p.moq_pieces as number,
      sizes,
      sizeOptions: [...new Set([...(sizeSets[cat] ?? []), ...sizes, "S", "M", "L", "XL", "XXL", "3XL"])].sort(bySize),
      flatlayUrl: catalogImageUrl(p.original_image_path) ?? null,
      colours,
    };
  });

  return {
    designs,
    batches: batches.map((b) => ({
      id: b.id,
      source: b.source,
      status: b.status,
      photos: (b.upload_items as unknown as { count: number }[])?.[0]?.count ?? 0,
      createdAt: b.created_at,
      summary: (b.summary && Object.keys(b.summary).length ? b.summary : null) as BatchSummary | null,
      error: b.error,
    })),
    aiReady: falConfigured() && Boolean(aiModel),
    autofillReady: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
