"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { rupees } from "@/lib/format";
import type { Category } from "@/lib/types";
import { BottomBar } from "./BottomBar";
import { useCart } from "./cart-store";
import { useT } from "./LangProvider";
import { track } from "./track";

export type CatalogueItem = {
  slug: string;
  name: string;
  category: Category;
  price: number;
  moq: number;
  createdAt: string;
  thumb: string | null;
  swatches: string[];
};

type Filter = "all" | Category | "new";
const NEW_DAYS = 14;

export function Catalogue({ items, callNumber }: { items: CatalogueItem[]; callNumber: string }) {
  const { t } = useT();
  const cart = useCart();
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => track("catalogue_view"), []);

  const now = Date.now();
  const shown = items.filter((i) =>
    filter === "all"
      ? true
      : filter === "new"
        ? now - new Date(i.createdAt).getTime() < NEW_DAYS * 86400_000
        : i.category === filter,
  );
  const chips: [Filter, string][] = [
    ["all", t.filterAll],
    ["tshirt", t.filterTshirt],
    ["lower", t.filterLower],
    ["cargo", t.filterCargo],
    ["jacket", t.filterJacket],
    ["new", t.filterNew],
  ];

  return (
    <main className="mx-auto max-w-xl">
      <p className="mx-3 mt-3 rounded-lg bg-accent px-3 py-2 text-center text-sm font-bold text-white">{t.wholesaleOnly}</p>
      <div className="flex gap-2 overflow-x-auto px-3 py-3">
        {chips.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`min-h-11 shrink-0 rounded-full border px-4 font-semibold ${
              filter === key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-16 text-center text-muted">{t.noProducts}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-2 gap-y-4 px-2">
          {shown.map((p, i) => (
            <li key={p.slug}>
              <Link href={`/p/${p.slug}`} className="block">
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-soft">
                  {p.thumb && (
                    <Image
                      src={p.thumb}
                      alt={p.name}
                      fill
                      sizes="50vw"
                      priority={i < 4}
                      className="object-cover"
                    />
                  )}
                  <span className="absolute top-2 left-2 rounded bg-white px-1.5 py-0.5 text-xs font-bold">
                    {t.minTag(p.moq)}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 leading-snug font-semibold">{p.name}</p>
                <p className="text-xs font-bold tracking-wide text-muted uppercase">{t.wholesaleRate}</p>
                <p className="text-lg leading-tight font-extrabold">
                  {rupees(p.price)} <span className="text-sm font-normal text-muted">{t.perPiece}</span>
                </p>
                <div className="mt-1 flex gap-1" aria-hidden>
                  {p.swatches.slice(0, 8).map((hex, k) => (
                    <span key={k} className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: hex }} />
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BottomBar callNumber={callNumber}>
        <Link
          href="/cart"
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-accent font-semibold text-white"
        >
          {t.cart}
          {cart.length > 0 ? ` (${cart.length})` : ""}
        </Link>
      </BottomBar>
    </main>
  );
}
