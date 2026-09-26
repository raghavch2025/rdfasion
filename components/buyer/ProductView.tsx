"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { rupees } from "@/lib/format";
import { linePieces, upsertLine, type CartLine } from "@/lib/moq";
import type { ProductWithColors } from "@/lib/types";
import { BottomBar } from "./BottomBar";
import { getCart, setCart } from "./cart-store";
import { useT } from "./LangProvider";
import { QtyStepper } from "./QtyStepper";
import { track } from "./track";

export function ProductView({ product, callNumber }: { product: ProductWithColors; callNumber: string }) {
  const { t } = useT();
  const router = useRouter();
  const colors = product.product_colors;
  const [colorIdx, setColorIdx] = useState(0);
  // Quantities per colour, pre-filled from the cart so edits are not lost.
  const [qty, setQtyState] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    const fromCart: Record<string, Record<string, number>> = {};
    getCart().forEach((l) => {
      if (l.productId === product.id) fromCart[l.colorId] = l.sizes;
    });
    setQtyState(fromCart);
    track("product_view", { product_slug: product.slug });
  }, [product.id, product.slug]);

  const color = colors[colorIdx];
  const sizes = qty[color.id] ?? {};
  const pieces = linePieces({ sizes });
  const soldOut = product.status === "sold_out";
  const canAdd = !soldOut && pieces >= product.moq_pieces;

  function setQty(size: string, n: number) {
    setQtyState((q) => ({ ...q, [color.id]: { ...(q[color.id] ?? {}), [size]: Math.max(0, Math.min(999, n)) } }));
  }

  function add() {
    if (!canAdd) return;
    const line: CartLine = {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      colorId: color.id,
      colorName: color.color_name,
      pricePerPiece: product.price_per_piece,
      moq: product.moq_pieces,
      sizeSet: product.size_set,
      image: color.thumb_path ?? color.approved_image_path,
      sizes: Object.fromEntries(Object.entries(sizes).filter(([, n]) => n > 0)),
    };
    setCart(upsertLine(getCart(), line));
    track("add_to_cart", { product_slug: product.slug });
    router.push("/cart");
  }

  const image = color.approved_image_path;
  return (
    <main className="mx-auto max-w-xl">
      <div className="relative aspect-[2/3] w-full bg-soft">
        {image && (
          <Image src={image} alt={`${product.name} - ${color.color_name}`} fill priority sizes="100vw" className="object-cover" />
        )}
      </div>

      <div className="space-y-4 px-4 pt-3">
        <div>
          <h1 className="text-xl leading-tight font-extrabold">{product.name}</h1>
          <p className="mt-1 text-2xl font-extrabold">
            {rupees(product.price_per_piece)} <span className="text-base font-normal text-muted">{t.perPiece}</span>
          </p>
          <p className="text-sm font-semibold text-accent">{t.minTag(product.moq_pieces)}</p>
          {(product.fabric || product.gsm) && (
            <p className="mt-1 text-muted">
              {t.fabric}: {[product.fabric, product.gsm && `${product.gsm} GSM`].filter(Boolean).join(" · ")}
            </p>
          )}
          {soldOut && <p className="mt-2 font-bold text-accent">{t.soldOut}</p>}
        </div>

        <section>
          <h2 className="mb-2 font-semibold">
            {t.colour}: {color.color_name}
          </h2>
          <div className="flex flex-wrap gap-2">
            {colors.map((c, i) => {
              const inCart = linePieces({ sizes: qty[c.id] ?? {} }) > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setColorIdx(i)}
                  aria-pressed={i === colorIdx}
                  className={`flex min-h-11 items-center gap-2 rounded-full border-2 py-1 pr-3 pl-1 ${
                    i === colorIdx ? "border-ink" : "border-line"
                  }`}
                >
                  <span className="h-8 w-8 rounded-full border border-line" style={{ background: c.color_hex ?? "#ccc" }} />
                  <span className="text-sm font-semibold">{c.color_name}</span>
                  {inCart && <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">{t.sizes}</h2>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {product.size_set.map((size) => {
              const out = color.sold_out_sizes.includes(size);
              return (
                <li key={size} className={`flex items-center justify-between px-3 py-1.5 ${out ? "bg-soft text-muted" : ""}`}>
                  <span className="text-lg font-bold">{size}</span>
                  {out ? (
                    <span className="py-2.5 text-sm font-semibold">{t.soldOutSize}</span>
                  ) : (
                    <QtyStepper value={sizes[size] ?? 0} onChange={(n) => setQty(size, n)} disabled={soldOut} label={size} />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-lg font-bold">{t.running(pieces, rupees(pieces * product.price_per_piece))}</p>
        </section>

        {product.original_image_path && (
          <section>
            <h2 className="mb-2 font-semibold">{t.realPhoto}</h2>
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-soft">
              <Image
                src={product.original_image_path}
                alt={`${product.name} - ${t.realPhoto}`}
                fill
                sizes="100vw"
                loading="lazy"
                className="object-contain"
              />
            </div>
          </section>
        )}
      </div>

      <BottomBar callNumber={callNumber}>
        <button
          onClick={add}
          disabled={!canAdd}
          className="min-h-12 flex-1 rounded-lg bg-accent px-2 leading-tight font-semibold text-white disabled:bg-line disabled:text-muted"
        >
          {canAdd ? t.addToCart : soldOut ? t.soldOut : t.minNeeded(product.moq_pieces)}
        </button>
      </BottomBar>
    </main>
  );
}
