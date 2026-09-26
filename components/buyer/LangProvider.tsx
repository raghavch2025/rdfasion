"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { buyerStrings, type BuyerStrings, type Lang } from "@/strings";

type Ctx = { lang: Lang; t: BuyerStrings; toggle: () => void };
const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initial);
  const toggle = useCallback(() => {
    setLang((cur) => {
      const next: Lang = cur === "hinglish" ? "hindi" : "hinglish";
      document.cookie = `lang=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      document.documentElement.lang = next === "hindi" ? "hi" : "en-IN";
      return next;
    });
  }, []);
  return <LangContext.Provider value={{ lang, t: buyerStrings[lang], toggle }}>{children}</LangContext.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT outside LangProvider");
  return ctx;
}
