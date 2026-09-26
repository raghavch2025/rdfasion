"use client";
import { useEffect } from "react";

// Shown instead of a blank "Application error" if a shop page fails: the buyer
// can still call or retry. Hinglish only; the language context may be the
// thing that failed.
export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16 text-center">
      <p className="text-xl font-extrabold">
        RD <span className="text-accent">Fashion</span>
      </p>
      <p className="text-lg">Catalogue abhi load nahi hua. Thodi der mein try karein ya call karein.</p>
      <div className="flex justify-center gap-2">
        <a href="tel:+919313877748" className="inline-flex min-h-12 items-center rounded-lg bg-accent px-5 font-semibold text-white">
          Call karein
        </a>
        <button onClick={reset} className="min-h-12 rounded-lg border border-ink px-5 font-semibold">
          Phir se try karein
        </button>
      </div>
      {error.digest && <p className="text-xs text-muted">Code: {error.digest}</p>}
    </main>
  );
}
