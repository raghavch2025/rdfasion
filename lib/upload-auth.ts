import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getAdmin } from "./auth.ts";

// The private upload link is /u/<UPLOAD_TOKEN>: whoever has it can add and
// publish designs (nothing else: no orders, no settings). It works only when
// UPLOAD_TOKEN is set to 16 or more characters; change it to revoke the link.
export function uploadTokenOk(token: string | null | undefined): boolean {
  const want = process.env.UPLOAD_TOKEN ?? "";
  if (want.length < 16 || !token) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Upload actions accept either the link's token or a signed-in admin.
export async function canUpload(token: string | null | undefined): Promise<boolean> {
  if (uploadTokenOk(token)) return true;
  return Boolean(await getAdmin());
}

export function uploadLinkPath(): string | null {
  const t = process.env.UPLOAD_TOKEN ?? "";
  return t.length >= 16 ? `/u/${t}` : null;
}
