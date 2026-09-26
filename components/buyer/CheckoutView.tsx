"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { cartCanSend, cartTotals, orderedSizes } from "@/lib/moq";
import { isValidPhone, normalizePhone, rupees } from "@/lib/format";
import { buildOrderMessage, waUrl } from "@/lib/whatsapp";
import { Button, ButtonLink, Field, inputClass } from "@/components/ui/Button";
import { BottomBar } from "./BottomBar";
import { setCart, useCart } from "./cart-store";
import { useT } from "./LangProvider";
import { readJson, writeJson } from "./storage";
import { getSource, track } from "./track";

type Buyer = { name: string; shop_name: string; city: string; phone: string };
type Result =
  | { kind: "sent"; code: string; message: string; waUrl: string }
  | { kind: "failed"; message: string; waUrl: string; error: string | null };

const EMPTY: Buyer = { name: "", shop_name: "", city: "", phone: "" };

export function CheckoutView({ callNumber, whatsappNumber }: { callNumber: string; whatsappNumber: string }) {
  const { t } = useT();
  const lines = useCart();
  const [buyer, setBuyer] = useState<Buyer>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Buyer, string>>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    // Pre-filled from the last order on this phone.
    setBuyer({ ...EMPTY, ...readJson<Partial<Buyer>>("rd-buyer", {}) });
    track("checkout_start");
  }, []);

  if (result) return <Handoff result={result} callNumber={callNumber} onRetry={() => setResult(null)} />;

  const totals = cartTotals(lines);
  if (!cartCanSend(lines)) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="mb-4 text-lg">{lines.length === 0 ? t.cartEmpty : t.errors.moq}</p>
        <ButtonLink href={lines.length === 0 ? "/" : "/cart"}>{lines.length === 0 ? t.browse : t.cart}</ButtonLink>
        <BottomBar callNumber={callNumber} />
      </main>
    );
  }

  function validate(b: Buyer) {
    const e: Partial<Record<keyof Buyer, string>> = {};
    if (!b.name.trim()) e.name = t.required;
    if (!b.shop_name.trim()) e.shop_name = t.required;
    if (!b.city.trim()) e.city = t.required;
    if (!isValidPhone(b.phone)) e.phone = t.mobileInvalid;
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate(buyer);
    setErrors(e);
    if (Object.keys(e).length > 0 || busy) return;
    setBusy(true);
    const clean: Buyer = {
      name: buyer.name.trim(),
      shop_name: buyer.shop_name.trim(),
      city: buyer.city.trim(),
      phone: normalizePhone(buyer.phone),
    };
    writeJson("rd-buyer", clean);
    const src = getSource();
    const payload = {
      buyer: clean,
      source: src.s,
      utm: src.r ? { r: src.r } : {},
      lines: lines.map((l) => ({ color_id: l.colorId, sizes: l.sizes })),
    };

    // A failed submit retries silently twice, then shows Call and Copy.
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.code) {
          setCart([]);
          track("whatsapp_opened", { order_code: data.code });
          setResult({ kind: "sent", code: data.code, message: data.message, waUrl: data.waUrl });
          setBusy(false);
          window.location.href = data.waUrl;
          return;
        }
        if (res.status >= 400 && res.status < 500) {
          lastError = typeof data.error === "string" ? data.error : "generic";
          break;
        }
      } catch {
        // network error: retry
      }
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }

    const message = buildOrderMessage({
      code: null,
      shopName: clean.shop_name,
      city: clean.city,
      name: clean.name,
      phone: clean.phone,
      siteHost: window.location.host,
      lines: lines.map((l) => ({ name: l.name, colorName: l.colorName, pricePerPiece: l.pricePerPiece, sizes: orderedSizes(l) })),
    });
    setResult({ kind: "failed", message, waUrl: waUrl(whatsappNumber, message), error: lastError });
    setBusy(false);
  }

  const set = (k: keyof Buyer) => (e: React.ChangeEvent<HTMLInputElement>) => setBuyer({ ...buyer, [k]: e.target.value });

  return (
    <main className="mx-auto max-w-xl px-4 pt-3">
      <h1 className="text-xl font-extrabold">{t.checkoutTitle}</h1>
      <p className="mb-4 text-muted">
        {totals.pieces} pcs · {rupees(totals.amount)}
      </p>
      <form id="checkout" onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t.name} error={errors.name}>
          <input className={inputClass} value={buyer.name} onChange={set("name")} autoComplete="name" maxLength={80} />
        </Field>
        <Field label={t.shop} error={errors.shop_name}>
          <input className={inputClass} value={buyer.shop_name} onChange={set("shop_name")} autoComplete="organization" maxLength={80} />
        </Field>
        <Field label={t.city} error={errors.city}>
          <input className={inputClass} value={buyer.city} onChange={set("city")} autoComplete="address-level2" maxLength={60} />
        </Field>
        <Field label={t.mobile} error={errors.phone} hint={t.mobileHint}>
          <input
            className={inputClass}
            value={buyer.phone}
            onChange={set("phone")}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={14}
          />
        </Field>
      </form>
      <BottomBar callNumber={callNumber}>
        <button
          type="submit"
          form="checkout"
          disabled={busy}
          className="min-h-12 flex-1 rounded-lg bg-accent px-2 leading-tight font-semibold text-white disabled:opacity-60"
        >
          {busy ? t.sending : t.sendOnWhatsapp}
        </button>
      </BottomBar>
    </main>
  );
}

function Handoff({ result, callNumber, onRetry }: { result: Result; callNumber: string; onRetry: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(result.message);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result.message;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
  }
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 pt-6">
      {result.kind === "sent" ? (
        <>
          <h1 className="text-xl font-extrabold text-ok">{t.sentTitle(result.code)}</h1>
          <p>{t.sentBody}</p>
          <ButtonLink href={result.waUrl} className="w-full">
            {t.openWhatsapp}
          </ButtonLink>
          <p className="text-sm text-muted">{t.notOpening}</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-extrabold text-accent">{t.failedTitle}</h1>
          <p>{result.error ? (t.errors[result.error.split(":")[0]] ?? t.errors.generic) : t.failedBody}</p>
          {!result.error && (
            <ButtonLink href={result.waUrl} className="w-full">
              {t.openWhatsapp}
            </ButtonLink>
          )}
        </>
      )}
      <pre className="rounded-lg bg-soft p-3 text-sm whitespace-pre-wrap">{result.message}</pre>
      <div className="flex gap-2">
        <Button variant="outline" onClick={copy} className="flex-1">
          {copied ? t.copied : t.copy}
        </Button>
        {result.kind === "failed" &&
          (result.error ? (
            <ButtonLink href="/cart" variant="ghost" className="flex-1">
              {t.cart}
            </ButtonLink>
          ) : (
            <Button variant="ghost" onClick={onRetry} className="flex-1">
              {t.retry}
            </Button>
          ))}
      </div>
      {result.kind === "sent" && (
        <Link href={`/o/${result.code}`} className="inline-flex min-h-11 items-center font-semibold underline">
          {t.viewOrder}
        </Link>
      )}
      <BottomBar callNumber={callNumber} />
    </main>
  );
}
