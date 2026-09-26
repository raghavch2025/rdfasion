import { adminDb } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { uploadLinkPath } from "@/lib/upload-auth";
import { whatsappConfigured } from "@/lib/whatsapp-cloud";
import { baseModelPath, falConfigured } from "@/lib/generation";
import { SITE_URL } from "@/lib/env";
import { admin as s } from "@/strings";
import type { PaletteColour, PublicSettings } from "@/lib/types";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const { data } = await adminDb().from("settings").select("key, value");
  const get = <T,>(k: string, fallback: T): T => (data?.find((r) => r.key === k)?.value as T) ?? fallback;
  const link = uploadLinkPath();
  const status: [string, boolean, string][] = [
    ["Upload link", Boolean(link), "UPLOAD_TOKEN"],
    ["WhatsApp uploads", whatsappConfigured(), "WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN; webhook " + SITE_URL + "/api/whatsapp"],
    ["Auto-grouping (Claude)", Boolean(process.env.ANTHROPIC_API_KEY), "ANTHROPIC_API_KEY"],
    ["AI model photos (fal.ai)", falConfigured() && Boolean(await baseModelPath()), "FAL_KEY + a base model photo below"],
  ];
  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-lg border border-line p-3">
        <h2 className="font-bold">{s.uploadLink}</h2>
        {link ? (
          <a href={link} className="block rounded bg-soft p-2 text-sm break-all underline">
            {SITE_URL}
            {link}
          </a>
        ) : (
          <p className="text-sm text-muted">{s.uploadLinkOff}</p>
        )}
        <h2 className="pt-2 font-bold">{s.integrations}</h2>
        <ul className="space-y-1 text-sm">
          {status.map(([name, on, how]) => (
            <li key={name}>
              {on ? "✅" : "⚪"} <b>{name}</b>
              {!on && <span className="text-muted"> · needs {how}</span>}
            </li>
          ))}
        </ul>
      </section>
    <SettingsForm
      isOwner={admin.isOwner}
      shop={get<PublicSettings>("public", {} as PublicSettings)}
      palette={get<PaletteColour[]>("colour_palette", [])}
      sizeSets={get<Record<string, string[]>>("size_sets", {})}
      adminPhones={get<string[]>("admin_phones", [])}
      ownerPhones={get<string[]>("owner_phones", [])}
      baseModels={get<string[]>("base_models", [])}
      catalogBase={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/catalog/`}
    />
    </div>
  );
}
