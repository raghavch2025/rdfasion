"use client";
import type { ReactNode } from "react";
import { useT } from "./LangProvider";

// Thumb-reachable bar fixed at the bottom of every buyer screen, with the
// "Call karein" button always one tap away.
export function BottomBar({ callNumber, children }: { callNumber: string; children?: ReactNode }) {
  const { t } = useT();
  return (
    <>
      <div className="h-20" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl gap-2">
          <a
            href={`tel:+91${callNumber.replace(/\D/g, "").slice(-10)}`}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-1 rounded-lg border border-ink px-4 font-semibold"
          >
            <PhoneIcon />
            {t.callNow}
          </a>
          <div className="flex min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}
