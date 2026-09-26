"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  applyOriginalPhoto,
  approveImage,
  deleteDraft,
  pollGeneration,
  publishProduct,
  retryImage,
  setProductStatus,
  toggleColourSoldOut,
  toggleSizeSoldOut,
  updateProduct,
} from "@/app/admin/actions";
import { Button, Field, inputClass } from "@/components/ui/Button";
import type { ProductStatus } from "@/lib/types";
import { admin as s } from "@/strings";

export type ColourView = {
  id: string;
  name: string;
  hex: string | null;
  status: "pending" | "approved" | "sold_out";
  soldOutSizes: string[];
  approvedUrl: string | null;
  originalUrl: string | null;
  candidate: { id: string; url: string | null } | null;
  generation: "running" | "failed" | null;
  error: string | null;
};

type P = {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  price: number;
  moq: number;
  sizes: string[];
  fabric: string | null;
  gsm: string | null;
};

export function ProductEditor({ product, colours, aiReady, siteUrl }: { product: P; colours: ColourView[]; aiReady: boolean; siteUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const generating = colours.some((c) => c.generation === "running");
  const allApproved = colours.length > 0 && colours.every((c) => c.status !== "pending");

  // While generation runs, poll fal and refresh so progress shows per colour.
  useEffect(() => {
    if (!generating) return;
    const id = setInterval(async () => {
      await pollGeneration(product.id);
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [generating, product.id, router]);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      const res = (await fn()) as { ok?: boolean; error?: string } | undefined;
      setMsg(res && res.ok === false ? res.error ?? "error" : null);
      router.refresh();
    });

  const link = `${siteUrl}/p/${product.slug}?s=reel&r=${product.slug}`;
  const caption = `${product.name} · ₹${product.price}/piece wholesale · min ${product.moq} pcs per colour. Order: ${link}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">{product.name}</h1>
        <p className="text-sm text-muted">
          {product.status} · /p/{product.slug}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-bold">{s.pickColours}</h2>
        {colours.map((c) => (
          <div key={c.id} className="rounded-lg border border-line p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-6 w-6 rounded-full border border-line" style={{ background: c.hex ?? "#ccc" }} />
              <b className="flex-1">{c.name}</b>
              <span className="text-sm font-semibold">
                {c.status === "approved" ? `✓ ${s.approved}` : c.status === "sold_out" ? s.soldOut : c.generation === "running" ? s.generating : c.generation === "failed" ? s.failed : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Figure label={c.candidate ? "AI" : c.approvedUrl ? s.approved : "—"} url={c.candidate?.url ?? c.approvedUrl} />
              <Figure label={s.useOriginal} url={c.originalUrl} />
            </div>
            {c.error && <p className="mt-1 text-sm text-accent">{c.error}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {c.candidate && (
                <Button disabled={pending} onClick={() => run(() => approveImage(product.id, c.id, c.candidate!.id))}>
                  {s.approve}
                </Button>
              )}
              {aiReady && c.generation !== "running" && (
                <Button variant="outline" disabled={pending} onClick={() => run(() => retryImage(product.id, c.id))}>
                  {s.retry}
                </Button>
              )}
              <Button variant="ghost" disabled={pending} onClick={() => run(() => applyOriginalPhoto(product.id, c.id))}>
                {s.useOriginal}
              </Button>
            </div>
            {product.status !== "draft" && c.status !== "pending" && (
              <div className="mt-3 space-y-2 border-t border-line pt-2">
                <p className="text-sm font-semibold">{s.sizeSoldOut}</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((sz) => (
                    <button
                      key={sz}
                      disabled={pending}
                      onClick={() => run(() => toggleSizeSoldOut(product.id, c.id, sz))}
                      className={`min-h-11 min-w-11 rounded-lg border px-2 font-bold ${c.soldOutSizes.includes(sz) ? "border-accent bg-accent text-white line-through" : "border-line"}`}
                    >
                      {sz}
                    </button>
                  ))}
                  <button
                    disabled={pending}
                    onClick={() => run(() => toggleColourSoldOut(product.id, c.id))}
                    className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${c.status === "sold_out" ? "border-accent bg-accent text-white" : "border-line"}`}
                  >
                    {s.colourSoldOut}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      {product.status === "draft" ? (
        <section className="space-y-2">
          <Button className="w-full" disabled={pending || !allApproved} onClick={() => run(() => publishProduct(product.id))}>
            {s.publish}
          </Button>
          {!allApproved && <p className="text-center text-sm text-muted">{s.publishBlocked}</p>}
          <form action={() => deleteDraft(product.id)}>
            <button className="min-h-11 w-full text-sm text-muted underline">Draft delete karein</button>
          </form>
        </section>
      ) : (
        <>
          <Share link={link} caption={caption} />
          <section className="flex flex-wrap gap-2">
            {(["live", "hidden", "sold_out"] as const).map((st) => (
              <Button
                key={st}
                variant={product.status === st ? "primary" : "outline"}
                disabled={pending}
                onClick={() => run(() => setProductStatus(product.id, st))}
              >
                {st === "live" ? s.live : st === "hidden" ? s.hidden : s.soldOut}
              </Button>
            ))}
          </section>
          <form
            action={(fd) =>
              start(async () => {
                const res = await updateProduct(product.id, fd);
                setMsg(res.ok ? s.saved : res.error);
                router.refresh();
              })
            }
            className="space-y-3 rounded-lg border border-line p-3"
          >
            <h2 className="font-bold">{s.edit}</h2>
            <Field label={s.designName}>
              <input name="name" defaultValue={product.name} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={s.price}>
                <input name="price" defaultValue={product.price} inputMode="numeric" className={inputClass} />
              </Field>
              <Field label={s.moq}>
                <input name="moq" defaultValue={product.moq} inputMode="numeric" className={inputClass} />
              </Field>
            </div>
            <Field label={s.sizeSet}>
              <input name="sizes" defaultValue={product.sizes.join(", ")} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={s.fabric}>
                <input name="fabric" defaultValue={product.fabric ?? ""} className={inputClass} />
              </Field>
              <Field label={s.gsm}>
                <input name="gsm" defaultValue={product.gsm ?? ""} className={inputClass} />
              </Field>
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {s.save}
            </Button>
          </form>
        </>
      )}
      {msg && <p className="text-center font-semibold">{msg}</p>}
    </div>
  );
}

function Figure({ label, url }: { label: string; url: string | null }) {
  return (
    <figure>
      <div className="aspect-[2/3] overflow-hidden rounded bg-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt={label} className="h-full w-full object-cover" />}
      </div>
      <figcaption className="mt-1 text-center text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

function Share({ link, caption }: { link: string; caption: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (what: string, value: string) => {
    try {
      if (navigator.share && what === "share") await navigator.share({ text: caption });
      else await navigator.clipboard.writeText(value);
      setCopied(what);
    } catch {
      // share sheet dismissed
    }
  };
  return (
    <section className="space-y-2 rounded-lg bg-soft p-3">
      <p className="font-bold">{s.published}</p>
      <p className="text-sm break-all">{link}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => copy("link", link)}>
          {copied === "link" ? "✓" : s.copy} {s.shareLink}
        </Button>
        <Button variant="outline" onClick={() => copy("caption", caption)}>
          {copied === "caption" ? "✓" : s.copy} {s.shareCaption}
        </Button>
      </div>
    </section>
  );
}
