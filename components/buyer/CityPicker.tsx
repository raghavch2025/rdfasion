"use client";
import { useState } from "react";
import { hindiName, searchCities } from "@/lib/cities";
import { useT } from "./LangProvider";

// One tap for the common towns (Hindi and English on every button), a search
// that matches either script, and free text as the last resort.
export function CityPicker({
  value,
  onChange,
  popular,
  error,
}: {
  value: string;
  onChange: (city: string) => void;
  popular: string[];
  error?: string | null;
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const matches = searchCities(query);
  const typed = query.trim();

  if (value) {
    return (
      <div>
        <p className="mb-1 font-semibold">{t.city}</p>
        <div className="flex items-center justify-between rounded-lg border-2 border-ink px-3 py-2">
          <span className="text-lg font-bold">
            {value} {hindiName(value) ? <span className="font-normal text-muted">· {hindiName(value)}</span> : null}
          </span>
          <button type="button" onClick={() => onChange("")} className="min-h-11 px-2 font-semibold underline">
            {t.cityChange}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 font-semibold">{t.cityPick}</p>
      <div className="grid grid-cols-2 gap-2">
        {popular.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className="flex min-h-14 flex-col items-center justify-center rounded-lg border border-line bg-white px-2 leading-tight"
          >
            <span className="text-base font-bold">{hindiName(c) ?? c}</span>
            {hindiName(c) && <span className="text-sm text-muted">{c}</span>}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.citySearch}
        aria-label={t.citySearch}
        maxLength={60}
        className="mt-3 block min-h-12 w-full rounded-lg border border-line px-3 text-base focus:border-ink focus:outline-none"
      />
      {typed && (
        <ul className="mt-2 space-y-2">
          {matches.map((c) => (
            <li key={c.en}>
              <button
                type="button"
                onClick={() => onChange(c.en)}
                className="flex min-h-12 w-full items-center justify-between rounded-lg border border-line px-3 text-left"
              >
                <span className="font-bold">{c.hi}</span>
                <span className="text-muted">{c.en}</span>
              </button>
            </li>
          ))}
          {!matches.some((c) => c.en.toLowerCase() === typed.toLowerCase() || c.hi === typed) && (
            <li>
              <button
                type="button"
                onClick={() => onChange(typed.slice(0, 60))}
                className="flex min-h-12 w-full items-center rounded-lg border border-dashed border-ink px-3 text-left font-semibold"
              >
                {t.cityUse(typed.slice(0, 60))}
              </button>
              <p className="mt-1 text-sm text-muted">{t.cityOther}</p>
            </li>
          )}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
