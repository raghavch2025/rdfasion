import "server-only";

// WhatsApp Cloud API (Meta). Env: WHATSAPP_TOKEN (a System User token that
// never expires), WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, optional
// WHATSAPP_GRAPH_VERSION (default v23.0). WHATSAPP_GRAPH_BASE exists only so
// tests can point at a local stand-in for graph.facebook.com.
const UA = "rdfashion-bot/1.0.0";
const graphBase = () => (process.env.WHATSAPP_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "");
const version = () => process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
}

export { validSignature, parseWebhook, type IncomingMessage } from "./whatsapp-parse.ts";

// Media id → short-lived URL (5 minutes) → bytes; both calls need the token.
export async function downloadMedia(mediaId: string, phoneNumberId: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const headers = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "User-Agent": UA };
  const q = phoneNumberId ? `?phone_number_id=${encodeURIComponent(phoneNumberId)}` : "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const meta = await fetch(`${graphBase()}/${version()}/${encodeURIComponent(mediaId)}${q}`, { headers, cache: "no-store" });
    if (!meta.ok) throw new Error(`media lookup ${meta.status}`);
    const { url, mime_type } = (await meta.json()) as { url?: string; mime_type?: string };
    if (!url) throw new Error("media lookup: no url");
    const file = await fetch(url, { headers, cache: "no-store" });
    if (file.status === 404 && attempt === 0) continue; // URL expired: fetch a fresh one
    if (!file.ok) throw new Error(`media download ${file.status}`);
    return { bytes: await file.arrayBuffer(), mimeType: mime_type ?? file.headers.get("content-type") ?? "image/jpeg" };
  }
  throw new Error("media download failed");
}

// Free-form text is allowed within 24 hours of the sender's last message.
export async function sendText(phoneNumberId: string, to: string, body: string): Promise<void> {
  if (!phoneNumberId || !process.env.WHATSAPP_TOKEN) return;
  const res = await fetch(`${graphBase()}/${version()}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: body.slice(0, 4000) },
    }),
  });
  if (!res.ok) console.error("whatsapp send failed", res.status, (await res.text()).slice(0, 300));
}
