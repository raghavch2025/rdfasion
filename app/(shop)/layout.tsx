import { cookies } from "next/headers";
import { LangProvider } from "@/components/buyer/LangProvider";
import { Footer } from "@/components/buyer/Footer";
import { getPublicSettings } from "@/lib/catalog";
import type { Lang } from "@/strings";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const lang: Lang = (await cookies()).get("lang")?.value === "hindi" ? "hindi" : "hinglish";
  const settings = await getPublicSettings();
  return (
    <LangProvider initial={lang}>
      <div className="min-h-dvh">{children}</div>
      <Footer settings={settings} />
    </LangProvider>
  );
}
