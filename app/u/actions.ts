"use server";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/supabase/admin";
import { canUpload, isIssuedUploadPath } from "@/lib/upload-auth";
import { addItems, createBatch, MAX_BATCH_PHOTOS, processBatch, type BatchSummary } from "@/lib/autocatalog";
import { advanceJobs, falConfigured, baseModelPath, retryColour, startGeneration } from "@/lib/generation";
import { applyOriginal, approveCandidate, publishDesign, revalidateCatalogue, type PublishFields } from "@/lib/catalog-admin";
import { ORIGINALS } from "@/lib/storage";

type Fail = { ok: false; error: string };
const denied: Fail = { ok: false, error: "Link galat hai ya band hai" };

function refresh() {
  revalidatePath("/u/[token]", "page");
  revalidatePath("/admin/upload");
}

// Step 1: reserve a batch and one signed upload URL per photo, so the phone
// uploads straight to storage (no size limit on our server).
export async function startUpload(
  token: string | null,
  count: number,
): Promise<{ ok: true; batchId: string; uploads: { path: string; token: string }[] } | Fail> {
  if (!(await canUpload(token))) return denied;
  const n = Math.max(1, Math.min(MAX_BATCH_PHOTOS, Math.floor(count)));
  const batchId = await createBatch(token ? "link" : "admin");
  const storage = adminDb().storage.from(ORIGINALS);
  const uploads = [];
  for (let i = 0; i < n; i++) {
    const path = `uploads/${batchId}/${String(i + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { data, error } = await storage.createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: error?.message ?? "upload url" };
    uploads.push({ path, token: data.token });
  }
  return { ok: true, batchId, uploads };
}

// Step 2: register the uploaded photos and catalogue them (Claude groups
// them into designs and colours; AI model images are queued).
export async function finishUpload(
  token: string | null,
  batchId: string,
  paths: string[],
  priceHint: number | null,
): Promise<{ ok: true; summary: BatchSummary | null } | Fail> {
  if (!(await canUpload(token))) return denied;
  if (!/^[0-9a-f-]{36}$/.test(batchId)) return { ok: false, error: "batch" };
  const mine = [...new Set(paths)].filter((p) => typeof p === "string" && isIssuedUploadPath(p, batchId)).slice(0, MAX_BATCH_PHOTOS);
  if (!mine.length) return { ok: false, error: "Koi photo upload nahi hui" };
  if (priceHint && Number.isInteger(priceHint) && priceHint >= 20 && priceHint <= 50000) {
    await adminDb().from("upload_batches").update({ price_hint: priceHint }).eq("id", batchId);
  }
  await addItems(batchId, mine.map((storage_path) => ({ storage_path })));
  try {
    const summary = await processBatch(batchId);
    refresh();
    return { ok: true, summary };
  } catch (err) {
    refresh();
    return { ok: false, error: err instanceof Error ? err.message : "processing failed" };
  }
}

export async function publish(token: string | null, productId: string, fields: PublishFields): Promise<{ ok: true } | Fail> {
  if (!(await canUpload(token))) return denied;
  const res = await publishDesign(productId, fields);
  refresh();
  if (!res.ok) {
    const msg: Record<string, string> = {
      unapproved: "Pehle har colour ki photo theek karein",
      rate: "Wholesale rate daalein (₹20 se zyada)",
      moq: "Minimum piece sahi daalein",
      sizes: "Size chunein",
    };
    return { ok: false, error: msg[res.error] ?? res.error };
  }
  return { ok: true };
}

export async function approve(token: string | null, productId: string, colorId: string, imageId: string): Promise<{ ok: boolean }> {
  if (!(await canUpload(token))) return { ok: false };
  const ok = await approveCandidate(productId, colorId, imageId);
  refresh();
  return { ok };
}

export async function applyShopPhoto(token: string | null, productId: string, colorId: string): Promise<{ ok: boolean }> {
  if (!(await canUpload(token))) return { ok: false };
  await applyOriginal(productId, colorId);
  refresh();
  return { ok: true };
}

// "AI photo banayein": model images for a design's colours (e.g. designs that
// were listed with the shop's own photos before AI was set up).
export async function makeAiPhotos(token: string | null, productId: string, colorIds?: string[]): Promise<{ ok: true } | Fail> {
  if (!(await canUpload(token))) return denied;
  if (!falConfigured() || !(await baseModelPath())) {
    return { ok: false, error: "AI abhi set nahi hai: Vercel mein FAL_KEY aur settings mein base model photo chahiye" };
  }
  try {
    await startGeneration(productId, colorIds);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI failed" };
  }
  refresh();
  return { ok: true };
}

export async function retry(token: string | null, productId: string, colorId: string): Promise<{ ok: true } | Fail> {
  if (!(await canUpload(token))) return denied;
  try {
    await retryColour(productId, colorId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "retry failed" };
  }
  refresh();
  return { ok: true };
}

export async function removeColour(token: string | null, productId: string, colorId: string): Promise<{ ok: true } | Fail> {
  if (!(await canUpload(token))) return denied;
  const db = adminDb();
  const { count } = await db.from("order_items").select("id", { count: "exact", head: true }).eq("color_id", colorId);
  if (count) {
    // Ordered before: hide it instead of deleting.
    await db.from("product_colors").update({ status: "sold_out" }).eq("id", colorId).eq("product_id", productId);
  } else {
    await db.from("product_colors").delete().eq("id", colorId).eq("product_id", productId);
  }
  const { data } = await db.from("products").select("slug").eq("id", productId).single();
  revalidateCatalogue(data?.slug);
  refresh();
  return { ok: true };
}

export async function deleteDraft(token: string | null, productId: string): Promise<{ ok: true } | Fail> {
  if (!(await canUpload(token))) return denied;
  await adminDb().from("products").delete().eq("id", productId).eq("status", "draft");
  refresh();
  return { ok: true };
}

export async function poll(token: string | null): Promise<void> {
  if (!(await canUpload(token))) return;
  await advanceJobs();
}
