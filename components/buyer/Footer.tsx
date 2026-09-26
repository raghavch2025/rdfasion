"use client";
import type { PublicSettings } from "@/lib/types";
import { useT } from "./LangProvider";

export function Footer({ settings }: { settings: PublicSettings }) {
  const { t } = useT();
  return (
    <footer className="mx-auto max-w-xl space-y-2 border-t border-line px-4 pt-6 pb-28 text-sm text-muted">
      <p className="font-semibold text-ink">{settings.shop_name}</p>
      <p>
        {t.address}: {settings.address}
      </p>
      {settings.hours && (
        <p>
          {t.hours}: {settings.hours}
        </p>
      )}
      {settings.rating && (
        <p>
          {t.rating}: {settings.rating}
        </p>
      )}
      <p>
        {t.callNow}:{" "}
        <a className="font-semibold text-ink underline" href={`tel:+91${settings.call_number}`}>
          {settings.call_number}
        </a>
        {settings.second_number ? (
          <>
            {" · "}
            <a className="font-semibold text-ink underline" href={`tel:+91${settings.second_number}`}>
              {settings.second_number}
            </a>
          </>
        ) : null}
      </p>
      <p>
        {t.instagram}:{" "}
        <a className="font-semibold text-ink underline" href={`https://www.instagram.com/${settings.instagram}`}>
          @{settings.instagram}
        </a>
      </p>
    </footer>
  );
}
