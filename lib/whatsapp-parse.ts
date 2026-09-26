import { createHmac, timingSafeEqual } from "node:crypto";

// Pure parts of the WhatsApp Cloud API webhook (no network), shared with tests.

// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body bytes).
// Always hash the raw bytes: Meta signs its escaped-unicode payload, so a
// re-serialised JSON body would not match once a caption has Hindi or emoji.
export function validSignature(raw: Buffer, header: string | null, secret = process.env.WHATSAPP_APP_SECRET): boolean {
  if (!secret || !header) return false;
  const want = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

export type IncomingMessage = {
  id: string;
  from: string | null;
  phoneNumberId: string;
  type: "image" | "text" | "other";
  mediaId?: string;
  mimeType?: string;
  caption?: string;
  text?: string;
  timestamp: number;
};

type WebhookBody = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string }[];
        messages?: {
          id: string;
          from?: string;
          timestamp?: string;
          type?: string;
          image?: { id: string; mime_type?: string; caption?: string };
          document?: { id: string; mime_type?: string; caption?: string; filename?: string };
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
};

// Only incoming messages; delivery statuses of our own replies are ignored.
export function parseWebhook(body: WebhookBody): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  if (body.object !== "whatsapp_business_account") return out;
  for (const entry of body.entry ?? [])
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value?.messages) continue;
      const v = change.value;
      for (const m of v.messages ?? []) {
        const base = {
          id: m.id,
          from: (m.from ?? v.contacts?.[0]?.wa_id ?? null)?.replace(/\D/g, "") || null,
          phoneNumberId: v.metadata?.phone_number_id ?? "",
          timestamp: Number(m.timestamp ?? 0),
        };
        if (m.type === "image" && m.image?.id) {
          out.push({ ...base, type: "image", mediaId: m.image.id, mimeType: m.image.mime_type, caption: m.image.caption });
        } else if (m.type === "document" && m.document?.id && (m.document.mime_type ?? "").startsWith("image/")) {
          // A photo sent "as document" keeps full quality.
          out.push({ ...base, type: "image", mediaId: m.document.id, mimeType: m.document.mime_type, caption: m.document.caption });
        } else if (m.type === "text") {
          out.push({ ...base, type: "text", text: (m.text?.body ?? "").trim() });
        } else {
          out.push({ ...base, type: "other" });
        }
      }
    }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}
