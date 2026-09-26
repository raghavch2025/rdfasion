// Full URL for an image path stored on a product colour: a path in the public
// `catalog` bucket, or a file shipped in public/ (paths starting with "/").
export function catalogImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|\/)/.test(path)) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/catalog/${path}`;
}
