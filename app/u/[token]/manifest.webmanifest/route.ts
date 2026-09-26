import { NextResponse } from "next/server";
import { uploadTokenOk } from "@/lib/upload-auth";

// Home-screen app for Papa's upload link. Its share_target puts "RD Upload"
// in Android's share sheet (WhatsApp → photo → Share), posting the photos to
// /u/<token>/share, which the service worker (public/sw.js) picks up.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!uploadTokenOk(token)) return new NextResponse(null, { status: 404 });
  // No trailing slash: Next.js redirects /u/<token>/ to /u/<token>, and the
  // app's start page must stay inside its scope (a plain prefix match).
  const base = `/u/${token}`;
  return NextResponse.json(
    {
      name: "RD Fashion Upload",
      short_name: "RD Upload",
      description: "Naye design ki photos upload karein",
      id: base,
      start_url: base,
      scope: base,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#c8102e",
      icons: [
        { src: "/icons/rd-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/rd-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/rd-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      share_target: {
        action: `${base}/share`,
        method: "POST",
        enctype: "multipart/form-data",
        params: { title: "title", text: "text", files: [{ name: "photos", accept: ["image/*"] }] },
      },
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } },
  );
}
