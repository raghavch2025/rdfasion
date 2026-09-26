"use client";
import { useTransition } from "react";
import { moveProduct, setProductStatus } from "@/app/admin/actions";
import type { ProductStatus } from "@/lib/types";
import { admin as s } from "@/strings";

export function ProductRowActions({ id, status }: { id: string; status: ProductStatus }) {
  const [pending, start] = useTransition();
  const btn = "min-h-11 min-w-11 rounded-lg border border-line px-2 text-sm font-semibold disabled:opacity-40";
  return (
    <div className="flex shrink-0 gap-1">
      <button className={btn} disabled={pending} onClick={() => start(() => moveProduct(id, "up"))} aria-label={s.up}>
        ↑
      </button>
      <button className={btn} disabled={pending} onClick={() => start(() => moveProduct(id, "down"))} aria-label={s.down}>
        ↓
      </button>
      <button
        className={btn}
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setProductStatus(id, status === "live" ? "hidden" : "live");
          })
        }
      >
        {status === "live" ? s.hide : s.show}
      </button>
    </div>
  );
}
