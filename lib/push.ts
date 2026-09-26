import "server-only";
import webpush from "web-push";
import { adminDb } from "./supabase/admin.ts";
import { serverEnv } from "./env.ts";

// Web Push (VAPID) to admin phones on every new order.
export async function notifyAdminsOfOrder(o: { code: string; shop: string; pieces: number; amount: number }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = serverEnv("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@rdfashion.in", publicKey, privateKey);

  const db = adminDb();
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  const payload = JSON.stringify({
    title: `Naya order ${o.code}`,
    body: `${o.shop} · ${o.pieces} pcs · ₹${o.amount.toLocaleString("en-IN")}`,
    url: `/admin/orders/${o.code}`,
  });
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 60 * 60 * 24,
          urgency: "high",
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("push failed", status);
      }
    }),
  );
}
