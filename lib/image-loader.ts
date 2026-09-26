// next/image loader: storage paths in the public `catalog` bucket are served
// through Supabase image transformation (WebP when the browser accepts it).
// Set NEXT_PUBLIC_IMAGE_TRANSFORM=off on plans without transformation.
type LoaderArgs = { src: string; width: number; quality?: number };

export default function supabaseLoader({ src, width, quality }: LoaderArgs): string {
  if (/^(https?:|data:|blob:|\/)/.test(src)) return src;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (process.env.NEXT_PUBLIC_IMAGE_TRANSFORM === "off") {
    return `${base}/storage/v1/object/public/catalog/${src}?w=${width}`;
  }
  return `${base}/storage/v1/render/image/public/catalog/${src}?width=${width}&quality=${quality ?? 70}&resize=contain`;
}
