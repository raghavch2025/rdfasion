import { adminDb } from "@/lib/supabase/admin";
import { baseModelPath, falConfigured } from "@/lib/generation";
import { NewDesign } from "@/components/admin/NewDesign";
import type { PaletteColour } from "@/lib/types";

export default async function NewDesignPage() {
  const { data } = await adminDb().from("settings").select("key, value").in("key", ["colour_palette", "size_sets"]);
  const get = (k: string) => data?.find((r) => r.key === k)?.value;
  return (
    <NewDesign
      palette={(get("colour_palette") as PaletteColour[]) ?? []}
      sizeSets={(get("size_sets") as Record<string, string[]>) ?? {}}
      aiReady={falConfigured() && Boolean(await baseModelPath())}
      autofillReady={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
