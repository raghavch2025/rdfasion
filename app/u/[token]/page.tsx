import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { uploadTokenOk } from "@/lib/upload-auth";
import { loadDesk } from "@/lib/upload-view";
import { UploadDesk } from "@/components/upload/UploadDesk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!uploadTokenOk(token)) return { robots: { index: false } };
  return {
    title: "RD Fashion · Naya maal upload",
    robots: { index: false, follow: false },
    manifest: `/u/${token}/manifest.webmanifest`,
    referrer: "no-referrer",
  };
}

// Papa's private link: upload photos (or share them from WhatsApp once the
// link is added to the home screen), then set the rate and publish.
export default async function UploadPage({ params }: Props) {
  const { token } = await params;
  if (!uploadTokenOk(token)) notFound();
  const data = await loadDesk();
  return <UploadDesk token={token} data={data} />;
}
