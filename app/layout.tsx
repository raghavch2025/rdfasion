import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "RD Fashion · Wholesale t-shirts, lowers, cargos",
  description: "RD Fashion, Karol Bagh: wholesale menswear from 6 pieces per colour. Order on WhatsApp.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get("lang")?.value === "hindi" ? "hi" : "en-IN";
  return (
    <html lang={lang}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
