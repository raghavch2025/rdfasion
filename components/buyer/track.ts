"use client";
import { readJson, writeJson } from "./storage";

export type EventName =
  | "catalogue_view"
  | "product_view"
  | "add_to_cart"
  | "checkout_start"
  | "order_saved"
  | "whatsapp_opened";

type Source = { s: string; r: string | null };

function deviceId(): string {
  let id = readJson<string | null>("rd-device", null);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    writeJson("rd-device", id);
  }
  return id;
}

// Links carry ?s=reel&r=henley-olive (bio: ?s=bio); remember the latest one.
export function captureSource(search: URLSearchParams): void {
  const s = search.get("s");
  if (s && ["reel", "bio", "share", "direct"].includes(s)) {
    writeJson("rd-src", { s, r: search.get("r")?.slice(0, 80) ?? null } satisfies Source);
  }
}

export function getSource(): Source {
  return readJson<Source>("rd-src", { s: "direct", r: null });
}

export function track(name: EventName, extra: { product_slug?: string; order_code?: string } = {}): void {
  try {
    const src = getSource();
    const body = JSON.stringify({ name, source: src.s, ref: src.r, device_id: deviceId(), ...extra });
    if (navigator.sendBeacon?.(`/api/events`, new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
  } catch {
    // analytics never blocks the buyer
  }
}
