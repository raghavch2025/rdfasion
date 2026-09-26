"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useCart } from "./cart-store";
import { useT } from "./LangProvider";
import { captureSource } from "./track";

export function Header({ back }: { back?: string }) {
  const { t, toggle } = useT();
  const cart = useCart();
  useEffect(() => {
    captureSource(new URLSearchParams(window.location.search));
  }, []);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
        {back ? (
          <Link href={back} className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={t.back}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
        ) : null}
        <Link href="/" className="min-w-0 flex-1">
          <span className="block text-lg leading-tight font-extrabold tracking-tight">
            RD <span className="text-accent">Fashion</span>
          </span>
          <span className="block truncate text-xs text-muted">{t.tagline}</span>
        </Link>
        <button onClick={toggle} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-muted">
          {t.langToggle}
        </button>
        <Link href="/cart" className="relative inline-flex min-h-11 min-w-11 items-center justify-center" aria-label={t.cart}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6h15l-1.5 9h-12z" />
            <path d="M6 6 5 3H2" />
            <circle cx="9" cy="20" r="1.5" />
            <circle cx="18" cy="20" r="1.5" />
          </svg>
          {cart.length > 0 && (
            <span className="absolute top-1 right-0 min-w-5 rounded-full bg-accent px-1 text-center text-xs font-bold text-white">
              {cart.length}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
