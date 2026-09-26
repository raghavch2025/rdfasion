import { adminDb } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { SettingsForm } from "@/components/admin/SettingsForm";
import type { PaletteColour, PublicSettings } from "@/lib/types";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const { data } = await adminDb().from("settings").select("key, value");
  const get = <T,>(k: string, fallback: T): T => (data?.find((r) => r.key === k)?.value as T) ?? fallback;
  return (
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
  );
}
