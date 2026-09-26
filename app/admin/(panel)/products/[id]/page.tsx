import { notFound } from "next/navigation";
import { adminDb } from "@/lib/supabase/admin";
import { signedOriginals } from "@/lib/storage";
import { falConfigured } from "@/lib/generation";
import { SITE_URL } from "@/lib/env";
import { catalogImageUrl } from "@/lib/image-url";
import { ProductEditor, type ColourView } from "@/components/admin/ProductEditor";
import type { ProductWithColors } from "@/lib/types";

export default async function ProductAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = adminDb();
  const [{ data: product }, { data: images }, { data: jobs }] = await Promise.all([
    db
      .from("products")
      .select("*, product_colors (id, product_id, color_name, color_hex, source, approved_image_path, thumb_path, status, sold_out_sizes)")
      .eq("id", id)
      .maybeSingle(),
    db
      .from("product_images")
      .select("id, color_id, kind, storage_path, status, error, provider, created_at")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
    db.from("generation_jobs").select("color_id, step, status").eq("product_id", id).in("status", ["queued", "running"]),
  ]);
  if (!product) notFound();
  const p = product as ProductWithColors;

  const originals = (images ?? []).filter((i) => i.kind === "original");
  const productOriginal = originals.find((o) => o.color_id === null)?.storage_path ?? null;
  const signed = await signedOriginals(
    [...new Set((images ?? []).filter((i) => i.storage_path && i.status !== "rejected").map((i) => i.storage_path))],
  );

  const colours: ColourView[] = p.product_colors.map((c) => {
    const tryon = (images ?? []).find((i) => i.color_id === c.id && i.kind === "tryon");
    const originalPath = originals.find((o) => o.color_id === c.id)?.storage_path ?? productOriginal;
    const running = (jobs ?? []).some((j) => j.color_id === c.id);
    return {
      id: c.id,
      name: c.color_name,
      hex: c.color_hex,
      status: c.status,
      soldOutSizes: c.sold_out_sizes,
      approvedUrl: catalogImageUrl(c.approved_image_path) ?? null,
      originalUrl: originalPath ? (signed[originalPath] ?? null) : null,
      candidate:
        tryon && tryon.status === "pending_approval" ? { id: tryon.id, url: signed[tryon.storage_path] ?? null } : null,
      generation: running ? "running" : tryon?.status === "failed" ? "failed" : null,
      error: tryon?.status === "failed" ? tryon.error : null,
    };
  });

  return (
    <ProductEditor
      product={{
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        price: p.price_per_piece,
        moq: p.moq_pieces,
        sizes: p.size_set,
        fabric: p.fabric,
        gsm: p.gsm,
      }}
      colours={colours}
      aiReady={falConfigured()}
      siteUrl={SITE_URL}
    />
  );
}
