import Link from "next/link";
import { adminDb } from "@/lib/supabase/admin";
import { rupees } from "@/lib/format";
import { catalogImageUrl } from "@/lib/image-url";
import { ProductRowActions } from "@/components/admin/ProductRowActions";
import type { ProductStatus } from "@/lib/types";
import { admin as s } from "@/strings";

type Row = {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  price_per_piece: number;
  product_colors: { thumb_path: string | null; status: string }[];
};

const label: Record<ProductStatus, string> = { live: s.live, hidden: s.hidden, draft: s.draft, sold_out: s.soldOut };

export default async function ProductsPage() {
  const { data } = await adminDb()
    .from("products")
    .select("id, name, slug, status, price_per_piece, product_colors (thumb_path, status)")
    .order("status", { ascending: true })
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{s.products}</h1>
        <Link href="/admin/new" className="min-h-11 rounded-lg bg-accent px-3 py-2.5 font-semibold text-white">
          + {s.newDesign}
        </Link>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.map((p) => {
          const thumb = p.product_colors.find((c) => c.thumb_path)?.thumb_path;
          return (
            <li key={p.id} className="flex items-center gap-3 p-2">
              <Link href={`/admin/products/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={catalogImageUrl(thumb)} alt="" className="h-16 w-12 shrink-0 rounded bg-soft object-cover" loading="lazy" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-sm text-muted">
                    {rupees(p.price_per_piece)} · {p.product_colors.length} colours ·{" "}
                    <span className={p.status === "live" ? "font-bold text-ok" : ""}>{label[p.status]}</span>
                  </p>
                </div>
              </Link>
              {p.status !== "draft" && <ProductRowActions id={p.id} status={p.status} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
