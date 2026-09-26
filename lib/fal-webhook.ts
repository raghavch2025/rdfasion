import "server-only";
import { createHash, createPublicKey, verify } from "node:crypto";

// Verifies fal's ED25519 webhook signature: the message is request id, user
// id, timestamp and the SHA-256 hex of the body joined by newlines, checked
// against fal's published JWKS (cached for a day).
const JWKS_URL = "https://rest.alpha.fal.ai/.well-known/jwks.json";
let jwks: { keys: { x: string }[]; at: number } | null = null;

async function keys(): Promise<{ x: string }[]> {
  if (!jwks || Date.now() - jwks.at > 24 * 3600 * 1000) {
    const res = await fetch(JWKS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`jwks ${res.status}`);
    jwks = { keys: ((await res.json()) as { keys: { x: string }[] }).keys ?? [], at: Date.now() };
  }
  return jwks.keys;
}

export async function verifyFalSignature(headers: Headers, body: Buffer): Promise<boolean> {
  const requestId = headers.get("x-fal-webhook-request-id");
  const userId = headers.get("x-fal-webhook-user-id");
  const timestamp = headers.get("x-fal-webhook-timestamp");
  const signature = headers.get("x-fal-webhook-signature");
  if (!requestId || !userId || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const message = Buffer.from(
    [requestId, userId, timestamp, createHash("sha256").update(body).digest("hex")].join("\n"),
    "utf8",
  );
  const sig = Buffer.from(signature, "hex");
  for (const k of await keys()) {
    try {
      const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" });
      if (verify(null, message, key, sig)) return true;
    } catch {
      // try the next key
    }
  }
  return false;
}
