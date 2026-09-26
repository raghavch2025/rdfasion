import { after, NextResponse } from "next/server";
import { uploadTokenOk } from "@/lib/upload-auth";
import { addItems, createBatch, MAX_BATCH_PHOTOS, parsePrice, processBatch } from "@/lib/autocatalog";
import { adminDb } from "@/lib/supabase/admin";
import { ORIGINALS, extFromType } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fallback for a WhatsApp share when the service worker is not active yet:
// the photos arrive here directly (Vercel caps a request at 4.5 MB, so the
// service worker path is the normal one). Always answer 303 so a refresh
// does not post the photos again.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!uploadTokenOk(token)) return new NextResponse("Forbidden", { status: 403 });
  const back = new URL(`/u/${token}`, req.url);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.redirect(back, 303);
  }
  const photos = form
    .getAll("photos")
    .filter((v): v is File => v instanceof File && v.size > 0 && v.type.startsWith("image/"))
    .slice(0, MAX_BATCH_PHOTOS);
  if (!photos.length) return NextResponse.redirect(back, 303);

  const caption = [form.get("title"), form.get("text")].filter((v) => typeof v === "string" && v).join(" ").slice(0, 300) || null;
  const batchId = await createBatch("link");
  const price = parsePrice(caption);
  if (price) await adminDb().from("upload_batches").update({ price_hint: price }).eq("id", batchId);

  const storage = adminDb().storage.from(ORIGINALS);
  const paths: string[] = [];
  for (const [i, f] of photos.entries()) {
    const path = `uploads/${batchId}/${String(i + 1).padStart(2, "0")}-shared.${extFromType(f.type)}`;
    const { error } = await storage.upload(path, await f.arrayBuffer(), { contentType: f.type, upsert: true });
    if (!error) paths.push(path);
  }
  await addItems(batchId, paths.map((storage_path) => ({ storage_path, caption })));
  after(async () => {
    await processBatch(batchId).catch((e) => console.error("share batch", e));
  });
  back.searchParams.set("batch", batchId);
  return NextResponse.redirect(back, 303);
}
