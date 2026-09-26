import { NextResponse } from "next/server";
import type { WebHookResponse } from "@fal-ai/client";
import { checkWebhookToken, handleWebhook } from "@/lib/generation";
import { verifyFalSignature } from "@/lib/fal-webhook";

// fal calls this when a generation finishes. Two checks: our per-job HMAC
// token in the URL, and fal's own ED25519 signature on the body.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("job") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(jobId) || !checkWebhookToken(jobId, token)) {
    return new NextResponse(null, { status: 401 });
  }
  const raw = Buffer.from(await req.arrayBuffer());
  if (!(await verifyFalSignature(req.headers, raw))) {
    return new NextResponse(null, { status: 401 });
  }
  let body: WebHookResponse;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  await handleWebhook(jobId, body);
  return NextResponse.json({ ok: true });
}
