import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createFalClient, type FalClient, type WebHookResponse } from "@fal-ai/client";
import { adminDb } from "./supabase/admin.ts";
import { SITE_URL, serverEnv } from "./env.ts";
import { catalogPublicUrl, signedOriginal, slugify, uploadFromUrl, extFromType } from "./storage.ts";
import type { Category } from "./types.ts";

// Model-image generation on fal.ai (PRD › "AI catalogue generation").
// Per colour: [recolour the original when there is no photo of that colour]
// -> virtual try-on on the shop's base model -> pending_approval.
// Jobs live in generation_jobs; results arrive by fal webhook, and the admin
// page and the cron poll fal as a fallback, so a lost webhook never stalls.

export const TRYON = "fal-ai/fashn/tryon/v1.6";
export const TRYON_FALLBACK = "fal-ai/kling/v1-5/kolors-virtual-try-on";
export const RECOLOUR = "fal-ai/flux-pro/kontext";
const MAX_ATTEMPTS = 3;
const STUCK_MS = 20 * 60 * 1000;

type Step = "recolour" | "tryon";
type PhotoType = "model" | "flat-lay" | "auto";
type JobPayload = {
  garment_path: string;
  photo_type?: PhotoType;
  colour_name: string;
  category: Category;
  endpoint?: string;
  seed?: number;
  image_id?: string;
  request_id?: string;
  model_path?: string;
};
type Job = {
  id: string;
  product_id: string;
  color_id: string | null;
  step: Step;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  payload: JobPayload;
  started_at: string | null;
};

export function falConfigured(): boolean {
  return Boolean(serverEnv("FAL_KEY"));
}

let falClient: FalClient | null = null;
function fal(): FalClient {
  if (!falClient) {
    // FAL_TEST_PROXY_URL exists only so tests can stand in for fal.ai locally.
    const testProxy = process.env.FAL_TEST_PROXY_URL;
    falClient = createFalClient({
      credentials: serverEnv("FAL_KEY"),
      ...(testProxy ? { proxyUrl: { url: testProxy, when: "always" as const } } : {}),
    });
  }
  return falClient;
}

function webhookSecret(): string {
  return serverEnv("CRON_SECRET") ?? serverEnv("SUPABASE_SECRET_KEY") ?? "dev";
}

export function webhookToken(jobId: string): string {
  return createHmac("sha256", webhookSecret()).update(jobId).digest("hex");
}

export function checkWebhookToken(jobId: string, token: string): boolean {
  const want = Buffer.from(webhookToken(jobId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function baseModelPath(): Promise<string | null> {
  const { data } = await adminDb().from("settings").select("value").eq("key", "base_models").maybeSingle();
  const list = Array.isArray(data?.value) ? (data.value as string[]) : [];
  return list[0] ?? null;
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

// Queue generation for every colour of a design (or the ones given). Every
// image is made on the same base model (the first photo in settings
// base_models), so the whole catalogue shows one model. photoTypes tells
// try-on whether a colour's photo already shows a person ("model") or the
// garment alone ("flat-lay"); a photo on another model is re-dressed onto ours.
export async function startGeneration(productId: string, colorIds?: string[], photoTypes: Record<string, PhotoType> = {}): Promise<void> {
  const db = adminDb();
  const { data: product } = await db
    .from("products")
    .select("id, category, product_colors (id, color_name, status, approved_image_path)")
    .eq("id", productId)
    .single();
  if (!product) throw new Error("product not found");
  const { data: originals } = await db
    .from("product_images")
    .select("color_id, storage_path, created_at")
    .eq("product_id", productId)
    .eq("kind", "original")
    .order("created_at", { ascending: false });
  const productOriginal = originals?.find((o) => o.color_id === null)?.storage_path ?? null;

  const colours = (product.product_colors as { id: string; color_name: string; approved_image_path: string | null }[]).filter(
    (c) => !colorIds || colorIds.includes(c.id),
  );
  const jobs = colours.flatMap((c) => {
    // A photo of this very colour goes straight to try-on. Without one, the
    // colour's current catalogue photo is used; failing that, the design's
    // main photo is recoloured first.
    const own =
      originals?.find((o) => o.color_id === c.id)?.storage_path ??
      (c.approved_image_path ? (c.approved_image_path.startsWith("/") ? c.approved_image_path : `catalog:${c.approved_image_path}`) : null);
    const garment = own ?? productOriginal;
    if (!garment) return [];
    return [
      {
        product_id: productId,
        color_id: c.id,
        step: (own ? "tryon" : "recolour") as Step,
        status: "queued",
        payload: {
          garment_path: garment,
          colour_name: c.color_name,
          category: product.category as Category,
          photo_type: photoTypes[c.id] ?? "auto",
        } satisfies JobPayload,
      },
    ];
  });
  if (jobs.length === 0) throw new Error("no photo to generate from");
  if (jobs.length === 0) return;
  await db.from("generation_jobs").insert(jobs);
  await advanceJobs(productId);
}

// Retry one colour's try-on with a new seed; after two tries on FASHN, use the fallback model.
export async function retryColour(productId: string, colorId: string): Promise<void> {
  const db = adminDb();
  const { data: last } = await db
    .from("generation_jobs")
    .select("payload")
    .eq("product_id", productId)
    .eq("color_id", colorId)
    .eq("step", "tryon")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!last) return startGeneration(productId, [colorId]);
  const { count } = await db
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("color_id", colorId)
    .eq("kind", "tryon");
  await db
    .from("product_images")
    .update({ status: "rejected" })
    .eq("color_id", colorId)
    .eq("status", "pending_approval");
  const payload = last.payload as JobPayload;
  await db.from("generation_jobs").insert({
    product_id: productId,
    color_id: colorId,
    step: "tryon",
    status: "queued",
    payload: {
      garment_path: payload.garment_path,
      colour_name: payload.colour_name,
      category: payload.category,
      photo_type: payload.photo_type,
      endpoint: (count ?? 0) >= 2 ? TRYON_FALLBACK : TRYON,
    } satisfies JobPayload,
  });
  await advanceJobs(productId);
}

function tryonCategory(c: Category): string {
  return c === "tshirt" || c === "jacket" ? "tops" : "bottoms";
}

// Garment photos live in three places: the private originals bucket (uploads),
// the public catalog bucket ("catalog:" prefix) or the site's own public/
// folder (paths starting with "/", e.g. the first designs in public/seed).
export async function garmentUrl(path: string): Promise<string | null> {
  if (path.startsWith("/")) return `${SITE_URL}${path}`;
  if (path.startsWith("catalog:")) return catalogPublicUrl(path.slice("catalog:".length));
  return signedOriginal(path);
}

async function buildInput(job: Job, endpoint: string, seed: number, modelPath: string | null) {
  const garment = await garmentUrl(job.payload.garment_path);
  if (!garment) throw new Error("garment photo missing");
  if (endpoint === RECOLOUR) {
    return {
      prompt: `Same garment, same print, same shape and background, colour ${job.payload.colour_name}`,
      image_url: garment,
      seed,
      output_format: "png",
    };
  }
  if (!modelPath) throw new Error("no base model photo in settings");
  const model = modelPath.startsWith("/") ? `${SITE_URL}${modelPath}` : catalogPublicUrl(modelPath);
  if (endpoint === TRYON_FALLBACK) return { human_image_url: model, garment_image_url: garment };
  return {
    model_image: model,
    garment_image: garment,
    category: tryonCategory(job.payload.category),
    garment_photo_type: job.payload.photo_type ?? "auto",
    mode: "quality",
    seed,
    num_samples: 1,
    output_format: "png",
  };
}

async function submit(job: Job): Promise<void> {
  const db = adminDb();
  // Claim the job so a webhook, the admin poll and the cron never double-submit.
  const { data: claimed } = await db
    .from("generation_jobs")
    .update({ status: "running", attempts: job.attempts + 1, started_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id");
  if (!claimed?.length) return;

  const endpoint = job.step === "recolour" ? RECOLOUR : (job.payload.endpoint ?? TRYON);
  const seed = randomSeed();
  const { data: image } = await db
    .from("product_images")
    .insert({
      product_id: job.product_id,
      color_id: job.color_id,
      kind: job.step,
      storage_path: "",
      provider: endpoint,
      seed,
      status: "running",
    })
    .select("id")
    .single();
  try {
    const modelPath = job.step === "tryon" ? await baseModelPath() : null;
    const input = await buildInput(job, endpoint, seed, modelPath);
    const webhookUrl = SITE_URL.startsWith("https://")
      ? `${SITE_URL}/api/fal/webhook?job=${job.id}&t=${webhookToken(job.id)}`
      : undefined;
    const { request_id } = await fal().queue.submit(endpoint, { input, webhookUrl });
    await db.from("product_images").update({ provider_request_id: request_id }).eq("id", image!.id);
    await db
      .from("generation_jobs")
      .update({ payload: { ...job.payload, endpoint, seed, image_id: image!.id, request_id, model_path: modelPath ?? undefined } })
      .eq("id", job.id);
  } catch (err) {
    await fail({ ...job, status: "running", attempts: job.attempts + 1, payload: { ...job.payload, image_id: image?.id } }, err);
  }
}

async function fail(job: Job, err: unknown): Promise<void> {
  const db = adminDb();
  const message = err instanceof Error ? err.message : String(err);
  const retry = job.attempts < MAX_ATTEMPTS && !/no base model|garment photo missing/.test(message);
  await db
    .from("generation_jobs")
    .update({ status: retry ? "queued" : "failed", finished_at: retry ? null : new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "running");
  if (job.payload.image_id) {
    await db.from("product_images").update({ status: "failed", error: message.slice(0, 500) }).eq("id", job.payload.image_id);
  }
}

function outputUrl(output: unknown): { url: string; type?: string } | null {
  const o = output as { images?: { url: string; content_type?: string }[]; image?: { url: string; content_type?: string } };
  const img = o?.images?.[0] ?? o?.image;
  return img?.url ? { url: img.url, type: img.content_type } : null;
}

async function complete(job: Job, output: unknown): Promise<void> {
  const db = adminDb();
  const { data: claimed } = await db
    .from("generation_jobs")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "running")
    .select("id");
  if (!claimed?.length) return;
  try {
    const out = outputUrl(output);
    if (!out) throw new Error("no image in fal output");
    const path = `${job.product_id}/generated/${slugify(job.payload.colour_name)}-${job.payload.image_id}.${extFromType(out.type)}`;
    await uploadFromUrl(out.url, path);
    await db
      .from("product_images")
      .update({ storage_path: path, status: job.step === "tryon" ? "pending_approval" : "approved" })
      .eq("id", job.payload.image_id!);
    if (job.step === "recolour") {
      const { data: next } = await db
        .from("generation_jobs")
        .insert({
          product_id: job.product_id,
          color_id: job.color_id,
          step: "tryon",
          status: "queued",
          // The recoloured garment is a flat product photo.
          payload: { garment_path: path, colour_name: job.payload.colour_name, category: job.payload.category, photo_type: "flat-lay" },
        })
        .select("*")
        .single();
      if (next) await submit(next as Job);
    }
  } catch (err) {
    await db.from("generation_jobs").update({ status: "running" }).eq("id", job.id);
    await fail(job, err);
  }
}

// Moves queued and running jobs forward by polling fal. Safe to call often.
export async function advanceJobs(productId?: string): Promise<void> {
  if (!falConfigured()) return;
  const db = adminDb();
  let q = db.from("generation_jobs").select("*").in("status", ["queued", "running"]).limit(50);
  if (productId) q = q.eq("product_id", productId);
  const { data: jobs } = await q;
  await Promise.all(
    ((jobs ?? []) as Job[]).map(async (job) => {
      if (job.status === "queued") return submit(job);
      const { request_id, endpoint } = job.payload;
      if (!request_id || !endpoint) {
        if (job.started_at && Date.now() - Date.parse(job.started_at) > STUCK_MS) await fail(job, new Error("stuck"));
        return;
      }
      try {
        const status = await fal().queue.status(endpoint, { requestId: request_id });
        if (status.status === "COMPLETED") {
          const result = await fal().queue.result(endpoint, { requestId: request_id });
          await complete(job, result.data);
        } else if (job.started_at && Date.now() - Date.parse(job.started_at) > STUCK_MS) {
          await fail(job, new Error("timed out"));
        }
      } catch (err) {
        await fail(job, err);
      }
    }),
  );
}

export async function handleWebhook(jobId: string, body: WebHookResponse): Promise<void> {
  const { data: job } = await adminDb().from("generation_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job || job.status !== "running" || (job.payload as JobPayload).request_id !== body.request_id) return;
  if (body.status === "OK") await complete(job as Job, body.payload);
  else await fail(job as Job, new Error(body.error || "fal error"));
}
