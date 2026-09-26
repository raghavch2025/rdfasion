"use client";
import { useSyncExternalStore } from "react";
import type { CartLine } from "@/lib/moq";
import { readJson, writeJson } from "./storage";

// Cart kept in localStorage on the buyer's phone; survives refresh and app switch.
const KEY = "rd-cart-v1";
const listeners = new Set<() => void>();
let snapshot: CartLine[] | null = null;
const EMPTY: CartLine[] = [];

function load(): CartLine[] {
  if (snapshot === null) {
    const v = readJson<CartLine[]>(KEY, []);
    snapshot = Array.isArray(v) ? v : [];
  }
  return snapshot;
}

export function setCart(next: CartLine[]): void {
  snapshot = next;
  writeJson(KEY, next);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

export function getCart(): CartLine[] {
  return load();
}
