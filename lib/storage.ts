import "server-only";
import { adminDb } from "./supabase/admin.ts";
import { SUPABASE_URL } from "./env.ts";

export const ORIGINALS = "originals";
export const CATALOG = "catalog";

// Every storage path used with the service role goes through this: plain
// segments only, no "..", ".", empty segments, "?" or "#", so a path can never
// leave its bucket (storage-js does not encode paths).
export function safePath(p: string): string {
  if (!/^[A-Za-z0-9._\/-]+$/.test(p) || p.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) {
    throw new Error("bad storage path");
  }
  return p;
}

export function catalogPublicUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${CATALOG}/${path}`;
}

export async function signedOriginal(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await adminDb().storage.from(ORIGINALS).createSignedUrl(safePath(path), seconds);
  return data?.signedUrl ?? null;
}

export async function signedOriginals(paths: string[], seconds = 3600): Promise<Record<string, string>> {
  const ok = paths.filter((p) => {
    try {
      return Boolean(safePath(p));
    } catch {
      return false;
    }
  });
  if (ok.length === 0) return {};
  const { data } = await adminDb().storage.from(ORIGINALS).createSignedUrls(ok, seconds);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  return out;
}

// Copies a private original (or generated image) into the public catalog bucket.
export async function publishToCatalog(fromOriginalsPath: string, toCatalogPath: string): Promise<string> {
  const db = adminDb();
  const { data, error } = await db.storage.from(ORIGINALS).download(safePath(fromOriginalsPath));
  if (error || !data) throw new Error(`download failed: ${error?.message}`);
  const { error: upErr } = await db.storage.from(CATALOG).upload(safePath(toCatalogPath), data, {
    contentType: data.type || "image/jpeg",
    upsert: true,
    cacheControl: "31536000",
  });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  return toCatalogPath;
}

export async function uploadFromUrl(url: string, toOriginalsPath: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  // The buckets take JPEG, PNG and WebP only; a CDN answering with a generic
  // type (e.g. application/octet-stream) falls back to the path's extension.
  const header = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = toOriginalsPath.split(".").pop();
  const type = ["image/jpeg", "image/png", "image/webp"].includes(header)
    ? header
    : ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : "image/png";
  const { error } = await adminDb()
    .storage.from(ORIGINALS)
    .upload(safePath(toOriginalsPath), await res.arrayBuffer(), { contentType: type, upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return toOriginalsPath;
}

export function extFromType(type: string | null | undefined): string {
  if (!type) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return "png";
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "design"
  );
}
