"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  approve,
  deleteDraft,
  finishUpload,
  makeAiPhotos,
  poll,
  publish,
  removeColour,
  retry,
  retryBatch,
  startUpload,
  applyShopPhoto,
} from "@/app/u/actions";
import { browserDb } from "@/lib/supabase/browser";
import { resizeImage } from "@/components/admin/resize";
import { CATEGORIES, type Category } from "@/lib/types";
import type { BatchSummary } from "@/lib/autocatalog";
import type { DeskData, DesignCard } from "@/lib/upload-view";
import { admin as adminStrings, uploader as s } from "@/strings";

// Same cap as the server (Claude sees at most 20 images per request).
const MAX_PHOTOS = 20;

function summaryText(sum: BatchSummary): string {
  const colours = sum.designs.reduce((n, d) => n + d.colours.length, 0);
  const notes = [s.doneSummary(sum.designs.length, colours)];
  if (sum.ai_images === "queued") notes.push(s.aiQueued);
  if (sum.ai_images === "not-configured") notes.push(s.aiMissing);
  if (sum.grouped_by === "one-per-photo" && sum.designs.length > 1) notes.push(s.groupedSimple);
  if (sum.needs_review?.length) notes.push(s.needsReview(sum.needs_review));
  if (sum.note) notes.push(sum.note);
  return notes.join(" ");
}

// token === null: the signed-in /admin/upload page (actions check the session).
export function UploadDesk({ token, data }: { token: string | null; data: DeskData }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [rate, setRate] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;
  const started = useRef(false);

  const generating = data.designs.some((d) => d.colours.some((c) => c.generating));

  // Share target: the service worker keeps shared photos in Cache Storage and
  // opens /u/<token>?inbox=<id>; pick them up and upload straight away.
  useEffect(() => {
    if (!token || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: `/u/${token}` }).catch(() => {});
    const inbox = new URLSearchParams(window.location.search).get("inbox");
    if (!inbox || started.current || !("caches" in window)) return;
    started.current = true;
    (async () => {
      const cache = await caches.open("share-inbox");
      const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith(`/share-inbox/${inbox}/`));
      const shared: File[] = [];
      let caption = "";
      for (const k of keys) {
        const res = await cache.match(k);
        if (!res) continue;
        if (new URL(k.url).pathname.endsWith("/text")) caption = await res.text();
        else {
          const blob = await res.blob();
          shared.push(new File([blob], `shared-${shared.length + 1}.jpg`, { type: blob.type || "image/jpeg" }));
        }
        await cache.delete(k);
      }
      window.history.replaceState(null, "", window.location.pathname);
      if (shared.length) {
        const m = caption.match(/(\d{2,5})/);
        await upload(shared, m ? m[1] : "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // While AI images are being made, move the jobs forward and refresh.
  useEffect(() => {
    if (!generating) return;
    const id = setInterval(async () => {
      await poll(token);
      router.refresh();
    }, 6000);
    return () => clearInterval(id);
  }, [generating, token, router]);

  const upload = useCallback(
    async (list: File[], rateText: string) => {
      setError(null);
      setResult(null);
      const chosen = list.slice(0, MAX_PHOTOS);
      const start = await startUpload(token, chosen.length);
      if (!start.ok) return setError(start.error);
      const db = browserDb();
      const done: string[] = [];
      const total = Math.min(chosen.length, start.uploads.length);
      for (let i = 0; i < total; i++) {
        setProgress(s.uploading(i, total));
        const blob = await resizeImage(chosen[i]);
        const u = start.uploads[i];
        const { error: upErr } = await db.storage.from("originals").uploadToSignedUrl(u.path, u.token, blob, { contentType: "image/jpeg" });
        if (!upErr) done.push(u.path);
      }
      setProgress(s.sorting);
      const price = Number.parseInt(rateText, 10);
      const res = await finishUpload(token, start.batchId, done, Number.isFinite(price) ? price : null);
      setProgress(null);
      setFiles([]);
      if (!res.ok) return setError(res.error);
      if (res.summary) setResult(summaryText(res.summary));
      router.refresh();
    },
    [token, router],
  );

  const [retrying, setRetrying] = useState<string | null>(null);
  const againBatch = async (batchId: string) => {
    setRetrying(batchId);
    setError(null);
    setResult(null);
    const res = await retryBatch(token, batchId);
    setRetrying(null);
    if (!res.ok) setError(res.error);
    else if (res.summary) setResult(summaryText(res.summary));
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 px-3 pt-4 pb-16">
      <header>
        <h1 className="text-2xl font-extrabold">
          RD <span className="text-accent">Fashion</span> · {s.title}
        </h1>
        <p className="text-sm text-muted">{s.subtitle}</p>
      </header>

      <section className="space-y-3 rounded-xl border-2 border-ink p-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {s.how.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
        <label className="flex min-h-16 cursor-pointer items-center justify-center rounded-xl bg-accent px-4 text-lg font-bold text-white">
          📷 {files.length ? s.picked(files.length) : s.pick}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {files.length > MAX_PHOTOS && <p className="text-sm font-semibold text-accent">{s.tooMany(MAX_PHOTOS)}</p>}
        {files.length > 0 && (
          <div className="flex gap-1 overflow-x-auto">
            {files.slice(0, MAX_PHOTOS).map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={URL.createObjectURL(f)} alt="" className="h-20 w-16 shrink-0 rounded object-cover" />
            ))}
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">{s.rateAll}</span>
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            className="block min-h-12 w-full rounded-lg border border-line px-3 text-lg"
            placeholder="300"
          />
        </label>
        <button
          onClick={() => upload(files, rate)}
          disabled={!files.length || busy}
          className="min-h-14 w-full rounded-xl bg-ink text-lg font-bold text-white disabled:opacity-40"
        >
          {progress ?? s.upload}
        </button>
        {result && <p className="rounded-lg bg-green-50 p-3 font-semibold text-ok">{result}</p>}
        {error && <p className="rounded-lg bg-red-50 p-3 font-semibold text-accent">{error}</p>}
        {token && <p className="text-xs text-muted">{s.shareHint}</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-extrabold">{s.review}</h2>
        {data.designs.length === 0 ? (
          <p className="text-muted">{s.nothing}</p>
        ) : (
          data.designs.map((d) => <DesignEditor key={d.id} token={token} design={d} aiReady={data.aiReady} />)
        )}
      </section>

      {data.batches.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">{s.batches}</h2>
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {data.batches.map((b) => (
              <li key={b.id} className="space-y-1 px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span>
                    {new Date(b.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" })} ·{" "}
                    {b.source === "whatsapp" ? s.fromWhatsapp : s.fromLink} · {b.photos} photo
                  </span>
                  <span className="font-semibold">
                    {s.batchStatus[b.status] ?? b.status}
                    {b.summary ? ` · ${b.summary.designs.length} design` : ""}
                  </span>
                </div>
                {b.retryable && (
                  <button
                    onClick={() => againBatch(b.id)}
                    disabled={retrying !== null || busy}
                    className="min-h-11 w-full rounded-lg border-2 border-ink font-bold disabled:opacity-40"
                  >
                    {retrying === b.id ? s.sorting : s.retryBatch}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DesignEditor({ token, design, aiReady }: { token: string | null; design: DesignCard; aiReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(design.name);
  const [category, setCategory] = useState<Category>(design.category);
  const [price, setPrice] = useState(design.price ? String(design.price) : "");
  const [moq, setMoq] = useState(String(design.moq));
  const [sizes, setSizes] = useState<string[]>(design.sizes);
  const [msg, setMsg] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>) =>
    start(async () => {
      const r = await fn();
      setMsg(r && r.ok === false ? (r.error ?? s.error) : null);
      router.refresh();
    });

  const isDraft = design.status === "draft";
  const allReady = design.colours.length > 0 && design.colours.every((c) => c.status !== "pending");
  const noAiYet = design.colours.every((c) => !c.candidate && !c.generating);

  return (
    <article className="space-y-3 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isDraft ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>
          {isDraft ? s.draft : s.live}
        </span>
        {!isDraft && (
          <a href={`/p/${design.slug}`} className="text-sm underline">
            /p/{design.slug}
          </a>
        )}
      </div>

      {isDraft && (
        <>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{s.name}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="block min-h-12 w-full rounded-lg border border-line px-3 text-lg font-bold" />
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`min-h-11 rounded-full border px-3 font-semibold ${category === c ? "border-ink bg-ink text-white" : "border-line"}`}
              >
                {adminStrings.categories[c]}
              </button>
            ))}
          </div>
        </>
      )}
      {!isDraft && <h3 className="text-lg font-bold">{design.name}</h3>}

      {design.flatlayUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={design.flatlayUrl} alt="" className="max-h-48 w-full rounded-lg bg-soft object-contain" />
      )}

      <div>
        <p className="mb-1 text-sm font-semibold">
          {s.colours} ({design.colours.length})
        </p>
        <div className="grid grid-cols-2 gap-2">
          {design.colours.map((c) => (
            <div key={c.id} className={`rounded-lg border p-2 ${c.status === "pending" ? "border-amber-400" : "border-line"}`}>
              <div className="relative aspect-[2/3] overflow-hidden rounded bg-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {(c.candidate?.url ?? c.imageUrl ?? c.shopPhotoUrl) && (
                  <img src={(c.candidate?.url ?? c.imageUrl ?? c.shopPhotoUrl) as string} alt={c.name} className="h-full w-full object-cover" />
                )}
                {c.candidate && <span className="absolute top-1 left-1 rounded bg-white px-1 text-xs font-bold">AI</span>}
              </div>
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
                <span className="h-3 w-3 shrink-0 rounded-full border border-line" style={{ background: c.hex ?? "#ccc" }} />
                {c.name}
              </p>
              <p className="text-xs text-muted">
                {c.generating ? s.generating : c.candidate ? s.waitingApproval : c.failed ? s.failed : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.candidate && (
                  <button onClick={() => run(() => approve(token, design.id, c.id, c.candidate!.id))} disabled={pending} className="min-h-10 rounded bg-ok px-2 text-sm font-bold text-white">
                    {s.okPhoto}
                  </button>
                )}
                {(c.candidate || c.failed || c.status === "pending") && !c.generating && (
                  <button onClick={() => run(() => applyShopPhoto(token, design.id, c.id))} disabled={pending} className="min-h-10 rounded border border-line px-2 text-sm">
                    {s.useShop}
                  </button>
                )}
                {aiReady && (c.candidate || c.failed) && !c.generating && (
                  <button onClick={() => run(() => retry(token, design.id, c.id))} disabled={pending} className="min-h-10 rounded border border-line px-2 text-sm">
                    {s.retryAi}
                  </button>
                )}
                {(isDraft || c.status === "pending") && (
                  <button onClick={() => run(() => removeColour(token, design.id, c.id))} disabled={pending} className="min-h-10 rounded px-2 text-sm text-muted underline">
                    {s.remove}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {aiReady && noAiYet && (
        <button onClick={() => run(() => makeAiPhotos(token, design.id))} disabled={pending} className="min-h-12 w-full rounded-lg border-2 border-ink font-bold">
          ✨ {s.makeAi}
        </button>
      )}

      {isDraft && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">{s.rate}</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 5))}
                inputMode="numeric"
                placeholder="₹"
                className="block min-h-12 w-full rounded-lg border-2 border-ink px-3 text-xl font-bold"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">{s.moq}</span>
              <input
                value={moq}
                onChange={(e) => setMoq(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                className="block min-h-12 w-full rounded-lg border border-line px-3 text-xl"
              />
            </label>
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">{s.sizes}</p>
            <div className="flex flex-wrap gap-2">
              {design.sizeOptions.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setSizes((cur) => (cur.includes(z) ? cur.filter((x) => x !== z) : [...cur, z]))}
                  className={`min-h-11 min-w-11 rounded-lg border px-2 font-bold ${sizes.includes(z) ? "border-ink bg-ink text-white" : "border-line"}`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() =>
              run(() =>
                publish(token, design.id, {
                  name,
                  category,
                  price: Number.parseInt(price, 10),
                  moq: Number.parseInt(moq, 10),
                  sizes: design.sizeOptions.filter((z) => sizes.includes(z)),
                }),
              )
            }
            disabled={pending || !allReady || !price}
            className="min-h-14 w-full rounded-xl bg-accent text-lg font-bold text-white disabled:opacity-40"
          >
            {s.publish}
          </button>
          <button onClick={() => run(() => deleteDraft(token, design.id))} disabled={pending} className="min-h-11 w-full text-sm text-muted underline">
            {s.deleteDraft}
          </button>
        </>
      )}
      {msg && <p className="font-semibold text-accent">{msg}</p>}
    </article>
  );
}
