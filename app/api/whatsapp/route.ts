import { after, NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { downloadMedia, parseWebhook, sendText, validSignature, whatsappConfigured, type IncomingMessage } from "@/lib/whatsapp-cloud";
import { addItems, createBatch, MAX_BATCH_PHOTOS, parsePrice, processBatch } from "@/lib/autocatalog";
import { ORIGINALS, extFromType } from "@/lib/storage";
import { normalizePhone } from "@/lib/format";
import { SITE_URL } from "@/lib/env";
import { uploadLinkPath } from "@/lib/upload-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Papa sends design photos to the business WhatsApp number, then "done".
// Photos are collected into a batch; "done" catalogues them (designs,
// colours, AI images) and the reply says what was made, with the link to set
// rates and publish. Only admin/owner numbers are accepted.

const DONE = /^(done|ho ?gaya|ho gya|hogaya|bas|finish|ok done|publish|ready|हो गया|बस)\b/i;
const HELP = /^(help|madad|\?|hi|hello|namaste)$/i;
const OPEN_BATCH_MINUTES = 120;

// Webhook verification: echo hub.challenge as plain text.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  if (verify && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === verify) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  if (!whatsappConfigured()) return new Response("not configured", { status: 503 });
  const raw = Buffer.from(await req.arrayBuffer());
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("bad signature", { status: 401 });
  let messages: IncomingMessage[];
  try {
    messages = parseWebhook(JSON.parse(raw.toString("utf8")));
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!messages.length) return NextResponse.json({ ok: true });

  const db = adminDb();
  const allowed = await allowedPhones();
  const fresh: IncomingMessage[] = [];
  for (const m of messages) {
    if (!m.from || !allowed.has(normalizePhone(m.from))) continue;
    // Record the message id first: Meta re-sends and does not de-duplicate.
    const { data } = await db
      .from("whatsapp_messages")
      .upsert({ id: m.id, sender_phone: m.from, kind: m.type }, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (data?.length) fresh.push(m);
  }
  if (fresh.length) {
    after(async () => {
      for (const m of fresh) await handle(m).catch((e) => console.error("whatsapp message", m.id, e));
    });
  }
  return NextResponse.json({ ok: true });
}

async function allowedPhones(): Promise<Set<string>> {
  const { data } = await adminDb().from("settings").select("key, value").in("key", ["admin_phones", "owner_phones"]);
  return new Set((data ?? []).flatMap((r) => (Array.isArray(r.value) ? (r.value as string[]) : [])).map(normalizePhone));
}

async function openBatch(from: string): Promise<{ id: string; acked: boolean; count: number }> {
  const db = adminDb();
  const since = new Date(Date.now() - OPEN_BATCH_MINUTES * 60_000).toISOString();
  const { data } = await db
    .from("upload_batches")
    .select("id, acked, upload_items (count)")
    .eq("source", "whatsapp")
    .eq("sender_phone", from)
    .eq("status", "collecting")
    .gte("last_item_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return { id: data.id, acked: data.acked, count: (data.upload_items as unknown as { count: number }[])?.[0]?.count ?? 0 };
  return { id: await createBatch("whatsapp", from), acked: false, count: 0 };
}

function reviewLink(): string {
  const path = uploadLinkPath();
  return path ? `${SITE_URL}${path}` : `${SITE_URL}/admin/upload`;
}

async function handle(m: IncomingMessage): Promise<void> {
  const db = adminDb();
  const from = m.from!;
  if (m.type === "image" && m.mediaId) {
    const batch = await openBatch(from);
    if (batch.count >= MAX_BATCH_PHOTOS) {
      await sendText(m.phoneNumberId, from, `Ek baar mein ${MAX_BATCH_PHOTOS} photo tak. Pehle "done" likhein, phir baaki photos bhejein.`);
      return;
    }
    const { bytes, mimeType } = await downloadMedia(m.mediaId, m.phoneNumberId);
    const path = `uploads/${batch.id}/wa-${m.id.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}.${extFromType(mimeType)}`;
    const { error } = await db.storage.from(ORIGINALS).upload(path, bytes, { contentType: mimeType, upsert: true });
    if (error) throw new Error(error.message);
    await addItems(batch.id, [{ storage_path: path, caption: m.caption ?? null, wa_message_id: m.id }]);
    const price = parsePrice(m.caption);
    if (price) await db.from("upload_batches").update({ price_hint: price }).eq("id", batch.id);
    if (!batch.acked) {
      await db.from("upload_batches").update({ acked: true }).eq("id", batch.id);
      await sendText(
        m.phoneNumberId,
        from,
        "✅ Photo mil gayi. Is design ke saare colour aur baaki designs bhi bhej dijiye.\nRate ho to likh dijiye (jaise: rate 300).\nSab bhejne ke baad *done* likhein.",
      );
    }
    return;
  }

  if (m.type === "text" && m.text) {
    const text = m.text;
    if (DONE.test(text)) {
      const batch = await openBatch(from);
      if (batch.count === 0) {
        await db.from("upload_batches").delete().eq("id", batch.id);
        await sendText(m.phoneNumberId, from, "Koi nayi photo nahi mili. Pehle design ki photos bhejiye, phir *done* likhiye.");
        return;
      }
      const price = parsePrice(text);
      if (price) await db.from("upload_batches").update({ price_hint: price }).eq("id", batch.id);
      await sendText(m.phoneNumberId, from, `⏳ ${batch.count} photo se design bana rahe hain…`);
      try {
        const summary = await processBatch(batch.id);
        if (!summary) return;
        const lines = summary.designs.map(
          (d, i) => `${i + 1}. ${d.name}${d.is_new ? "" : " (purana design, naye colour)"}: ${d.colours.join(", ")}`,
        );
        const ai =
          summary.ai_images === "queued"
            ? "AI model photo ban rahi hai (2-3 minute)."
            : summary.ai_images === "not-configured"
              ? "AI photo abhi set nahi hai, asli photo lagi hai."
              : "";
        await sendText(
          m.phoneNumberId,
          from,
          `✅ ${summary.designs.length} design taiyaar:\n${lines.join("\n")}\n${ai}\n\nRate daal ke publish karein:\n${reviewLink()}`,
        );
      } catch (err) {
        await sendText(m.phoneNumberId, from, `❌ Design nahi ban paaye: ${err instanceof Error ? err.message : "error"}. Link se try karein: ${reviewLink()}`);
      }
      return;
    }
    const price = parsePrice(text);
    if (price) {
      const batch = await openBatch(from);
      await db.from("upload_batches").update({ price_hint: price }).eq("id", batch.id);
      await sendText(m.phoneNumberId, from, `Rate ₹${price} note kar liya. Photos bhej kar *done* likhein.`);
      return;
    }
    if (HELP.test(text)) {
      await sendText(
        m.phoneNumberId,
        from,
        "Naya maal daalne ke liye:\n1. Design ki photos bhejiye (saare colour)\n2. Rate likhiye (jaise: rate 300)\n3. *done* likhiye\nDesign aur colour apne aap ban jayenge.",
      );
    }
  }
}
