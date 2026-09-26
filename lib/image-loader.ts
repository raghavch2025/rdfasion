// next/image loader for storage paths in the public `catalog` bucket.
// With NEXT_PUBLIC_IMAGE_TRANSFORM=on (Supabase Pro), images are resized and
// served as WebP by Supabase image transformation; otherwise the stored file
// is served as is. Paths starting with "/" are files in public/.
type LoaderArgs = { src: string; width: number; quality?: number };

export default function supabaseLoader({ src, width, quality }: LoaderArgs): string {
  if (/^(data:|blob:)/.test(src)) return src;
  if (/^(https?:|\/)/.test(src)) return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (process.env.NEXT_PUBLIC_IMAGE_TRANSFORM !== "on") {
    return `${base}/storage/v1/object/public/catalog/${src}?w=${width}`;
  }
  return `${base}/storage/v1/render/image/public/catalog/${src}?width=${width}&quality=${quality ?? 70}&resize=contain`;
}
