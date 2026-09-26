"use client";
import Image from "next/image";
import Link from "next/link";
import { cartCanSend, cartTotals, lineAmount, linePieces, meetsMoq, removeLine, setQty } from "@/lib/moq";
import { rupees } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { BottomBar } from "./BottomBar";
import { setCart, useCart } from "./cart-store";
import { useT } from "./LangProvider";
import { QtyStepper } from "./QtyStepper";

export function CartView({ callNumber }: { callNumber: string }) {
  const { t } = useT();
  const lines = useCart();
  const totals = cartTotals(lines);
  const canSend = cartCanSend(lines);

  if (lines.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="mb-4 text-lg">{t.cartEmpty}</p>
        <ButtonLink href="/">{t.browse}</ButtonLink>
        <BottomBar callNumber={callNumber} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-3 pt-3">
      <h1 className="mb-3 text-xl font-extrabold">{t.cart}</h1>
      <ul className="space-y-3">
        {lines.map((line) => {
          const p = linePieces(line);
          const short = p < line.moq;
          return (
            <li key={line.colorId} className={`rounded-lg border p-3 ${short ? "border-accent" : "border-line"}`}>
              <div className="flex gap-3">
                <Link href={`/p/${line.slug}`} className="relative h-24 w-16 shrink-0 overflow-hidden rounded bg-soft">
                  {line.image && <Image src={line.image} alt="" fill sizes="64px" className="object-cover" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="leading-snug font-semibold">{line.name}</p>
                  <p className="text-muted">
                    {line.colorName} · {rupees(line.pricePerPiece)} {t.perPiece}
                  </p>
                  <p className="font-bold">{t.running(p, rupees(lineAmount(line)))}</p>
                </div>
              </div>
              <ul className="mt-2 space-y-1">
                {line.sizeSet.map((size) => (
                  <li key={size} className="flex items-center justify-between">
                    <span className="w-12 font-bold">{size}</span>
                    <QtyStepper
                      value={line.sizes[size] ?? 0}
                      onChange={(n) => setCart(setQty(lines, line.colorId, size, n))}
                      label={`${line.name} ${line.colorName} ${size}`}
                    />
                  </li>
                ))}
              </ul>
              {short && <p className="mt-2 text-sm font-semibold text-accent">{t.lineShort(line.moq, line.moq - p)}</p>}
              <button
                onClick={() => setCart(removeLine(lines, line.colorId))}
                className="mt-1 min-h-11 text-sm font-semibold text-muted underline"
              >
                {t.remove}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-1 rounded-lg bg-soft p-3 text-lg">
        <p className="flex justify-between">
          <span>{t.totalPieces}</span>
          <span className="font-bold">{totals.pieces} pcs</span>
        </p>
        <p className="flex justify-between">
          <span>{t.totalAmount}</span>
          <span className="font-extrabold">{rupees(totals.amount)}</span>
        </p>
      </div>
      <Link href="/" className="mt-3 inline-flex min-h-11 items-center font-semibold underline">
        + {t.addMore}
      </Link>

      <BottomBar callNumber={callNumber}>
        {canSend ? (
          <Link
            href="/checkout"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-accent font-semibold text-white"
          >
            {t.sendOrder}
          </Link>
        ) : (
          <button disabled className="min-h-12 flex-1 rounded-lg bg-line px-2 leading-tight font-semibold text-muted">
            {t.minNeeded(lines.find((l) => !meetsMoq(l))?.moq ?? 6)}
          </button>
        )}
      </BottomBar>
    </main>
  );
}
