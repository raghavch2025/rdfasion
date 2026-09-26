import { after, NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { downloadMedia, parseWebhook, sendText, validSignature, whatsappConfigured, type IncomingMessage } from "@/lib/whatsapp-cloud";
import { addItems, MAX_BATCH_PHOTOS, parsePrice, processBatch } from "@/lib/autocatalog";
import { ORIGINALS } from "@/lib/storage";
import { toCatalogJpeg } from "@/lib/image-normalize";
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

// \b does not work for Devanagari, so end on a space, punctuation or the end.
const DONE = /^(done|ho ?gaya|ho gya|hogaya|bas|finish|ok done|publish|ready|हो गया|होगया|बस)(?=$|[\s.!,])/i;
const HELP = /^(help|madad|\?|hi|hello|namaste)$/i;
// "done" waits this long for photos that were sent just before it and are
// still downloading (each photo is its own webhook, handled in parallel).
const DONE_WAIT_MS = 15_000;

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
      for (const m of fresh) {
        await handle(m).catch(async (e) => {
          console.error("whatsapp message", m.id, e);
          // A photo that could not be saved no longer holds up "done".
          if (m.type === "image") await db.from("whatsapp_messages").update({ kind: "image-failed" }).eq("id", m.id);
        });
      }
    });
  }
  return NextResponse.json({ ok: true });
}

async function allowedPhones(): Promise<Set<string>> {
  const { data } = await adminDb().from("settings").select("key, value").in("key", ["admin_phones", "owner_phones"]);
  return new Set((data ?? []).flatMap((r) => (Array.isArray(r.value) ? (r.value as string[]) : [])).map(normalizePhone));
}

// The sender's one open batch (created if needed). A database function with
// a lock and a unique index, because photos sent together arrive as parallel
// webhooks and must land in the same batch.
async function openBatch(from: string): Promise<{ id: string; acked: boolean; count: number }> {
  const { data, error } = await adminDb().rpc("open_whatsapp_batch", { p_phone: from });
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; acked: boolean; items: number } | null;
  if (error || !row) throw new Error(error?.message ?? "no batch");
  return { id: row.id, acked: row.acked, count: row.items };
}

// Photos whose webhook arrived but whose download has not finished yet.
async function photosInFlight(from: string): Promise<number> {
  const db = adminDb();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: msgs } = await db
    .from("whatsapp_messages")
    .select("id")
    .eq("sender_phone", from)
    .in("kind", ["image", "image-failed", "image-skipped"])
    .gte("received_at", since);
  const ids = (msgs ?? []).map((m) => m.id);
  if (!ids.length) return 0;
  const { data: done } = await db.from("upload_items").select("wa_message_id").in("wa_message_id", ids);
  const { data: failed } = await db.from("whatsapp_messages").select("id").in("id", ids).in("kind", ["image-failed", "image-skipped"]);
  return ids.length - (done?.length ?? 0) - (failed?.length ?? 0);
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
      await db.from("whatsapp_messages").update({ kind: "image-skipped" }).eq("id", m.id);
      await sendText(m.phoneNumberId, from, `Ek baar mein ${MAX_BATCH_PHOTOS} photo tak. Pehle "done" likhein, phir baaki photos bhejein.`);
      return;
    }
    const { bytes } = await downloadMedia(m.mediaId, m.phoneNumberId);
    let jpeg: Buffer;
    try {
      jpeg = await toCatalogJpeg(bytes);
    } catch {
      await db.from("whatsapp_messages").update({ kind: "image-failed" }).eq("id", m.id);
      await sendText(m.phoneNumberId, from, "Yeh photo khul nahi paayi. Isse normal photo ki tarah (document nahi) dobara bhejiye.");
      return;
    }
    const path = `uploads/${batch.id}/wa-${m.id.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}.jpg`;
    const { error } = await db.storage.from(ORIGINALS).upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(error.message);
    await addItems(batch.id, [{ storage_path: path, caption: m.caption ?? null, wa_message_id: m.id }]);
    const price = parsePrice(m.caption);
    if (price) await db.from("upload_batches").update({ price_hint: price }).eq("id", batch.id);
    if (!batch.acked) {
      // Several photos arrive at once: only the one that flips "acked" replies.
      const { data: first } = await db.from("upload_batches").update({ acked: true }).eq("id", batch.id).eq("acked", false).select("id");
      if (first?.length) {
        await sendText(
          m.phoneNumberId,
          from,
          "✅ Photo mil gayi. Is design ke saare colour aur baaki designs bhi bhej dijiye.\nRate ho to likh dijiye (jaise: rate 300).\nSab bhejne ke baad *done* likhein.",
        );
      }
    }
    return;
  }

  if (m.type === "text" && m.text) {
    const text = m.text;
    if (DONE.test(text)) {
      // Let photos sent just before "done" finish downloading first.
      for (const t0 = Date.now(); Date.now() - t0 < DONE_WAIT_MS && (await photosInFlight(from)) > 0; ) {
        await new Promise((r) => setTimeout(r, 1500));
      }
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
        const review = summary.needs_review.length
          ? `\nIn colours ki photo link par dekh lijiye: ${summary.needs_review.join(", ")}. (Ek photo mein kai colour hon to har colour ki alag photo bhejiye, tab AI model photo banegi.)`
          : "";
        await sendText(
          m.phoneNumberId,
          from,
          `✅ ${summary.designs.length} design taiyaar:\n${lines.join("\n")}\n${ai}${review}\n\nRate daal ke publish karein:\n${reviewLink()}`,
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
