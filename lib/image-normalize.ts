import "server-only";
import sharp from "sharp";

// Photos arriving on the server (WhatsApp, share fallback) are turned into a
// JPEG of at most 1600 px, upright: small enough for Claude's many-image
// requests (2000 px limit) and for try-on, and the same shape as the photos
// the upload page resizes in the browser. Throws for formats sharp cannot read
// (e.g. HEIC); callers skip those photos.
export async function toCatalogJpeg(input: ArrayBuffer | Buffer): Promise<Buffer> {
  return sharp(Buffer.isBuffer(input) ? input : Buffer.from(input), { failOn: "error" })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}
