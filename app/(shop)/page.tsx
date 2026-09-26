import { Catalogue } from "@/components/buyer/Catalogue";
import { Header } from "@/components/buyer/Header";
import { getCatalogue, getPublicSettings } from "@/lib/catalog";

export const revalidate = 60;

export default async function CataloguePage() {
  const [products, settings] = await Promise.all([getCatalogue(), getPublicSettings()]);
  const items = products.map((p) => {
    const c = p.product_colors[0];
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      price: p.price_per_piece,
      moq: p.moq_pieces,
      createdAt: p.created_at,
      thumb: c?.thumb_path ?? c?.approved_image_path ?? null,
      swatches: p.product_colors.map((x) => x.color_hex ?? "#cccccc"),
    };
  });
  return (
    <>
      <Header />
      <Catalogue items={items} callNumber={settings.call_number} />
    </>
  );
}
