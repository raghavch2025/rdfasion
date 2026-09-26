"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-fetches the inbox every few seconds and shows the new-order count on the
// tab title and the app badge (where the browser supports it).
export function AutoRefresh({ seconds, badge }: { seconds: number; badge?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  useEffect(() => {
    if (badge === undefined) return;
    document.title = badge > 0 ? `(${badge}) Orders · RD Admin` : "Orders · RD Admin";
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (badge > 0) nav.setAppBadge?.(badge).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [badge]);
  return null;
}
