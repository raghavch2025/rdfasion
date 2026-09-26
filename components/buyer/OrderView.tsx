"use client";
import Image from "next/image";
import { rupees } from "@/lib/format";
import type { OrderLine } from "@/lib/orders";
import { BottomBar } from "./BottomBar";
import { useT } from "./LangProvider";

type Props = {
  code: string;
  callNumber: string;
  order: {
    status: string;
    createdAt: string;
    totalPieces: number;
    totalAmount: number;
    shop: string;
    buyer: string;
    lines: OrderLine[];
  } | null;
};

export function OrderView({ code, callNumber, order }: Props) {
  const { t } = useT();
  if (!order) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg">{t.orderNotFound}</p>
        <BottomBar callNumber={callNumber} />
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 pt-4">
      <div>
        <h1 className="text-xl font-extrabold">{t.orderTitle(code)}</h1>
        <p className="text-muted">
          {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
        </p>
        <p className="mt-1">{order.shop}</p>
        <p className="text-muted">{order.buyer}</p>
      </div>
      <p className="inline-block rounded-full bg-ink px-3 py-1 font-semibold text-white">
        {t.status}: {t.statuses[order.status] ?? order.status}
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {order.lines.map((l) => {
          const p = l.sizes.reduce((s, [, q]) => s + q, 0);
          return (
            <li key={l.colorId} className="flex gap-3 p-3">
              <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded bg-soft">
                {l.image && <Image src={l.image} alt="" fill sizes="56px" className="object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">
                  {l.productName} - {l.colorName}
                </p>
                <p className="text-muted">{l.sizes.map(([s, q]) => `${s} x${q}`).join(", ")}</p>
                <p className="font-bold">
                  {p} pcs @ {rupees(l.pricePerPiece)} = {rupees(p * l.pricePerPiece)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-between rounded-lg bg-soft p-3 text-lg">
        <span>{order.totalPieces} pcs</span>
        <span className="font-extrabold">{rupees(order.totalAmount)}</span>
      </div>
      <BottomBar callNumber={callNumber} />
    </main>
  );
}
