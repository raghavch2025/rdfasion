import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/buyer/Header";
import { ProductView } from "@/components/buyer/ProductView";
import { getProduct, getPublicSettings } from "@/lib/catalog";
import { rupees } from "@/lib/format";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return {};
  return {
    title: `${p.name} · ${rupees(p.price_per_piece)}/piece · RD Fashion`,
    description: `Wholesale from ${p.moq_pieces} pieces per colour. ${p.product_colors.map((c) => c.color_name).join(", ")}.`,
  };
}

export default async function ProductPage({ params }: Props) {
  const [product, settings] = await Promise.all([getProduct((await params).slug), getPublicSettings()]);
  if (!product || product.product_colors.length === 0) notFound();
  return (
    <>
      <Header back="/" />
      <ProductView product={product} callNumber={settings.call_number} />
    </>
  );
}
