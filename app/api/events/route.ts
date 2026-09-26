import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { isOrderCode } from "@/lib/orders";

const NAMES = ["catalogue_view", "product_view", "add_to_cart", "checkout_start", "whatsapp_opened"];
const str = (v: unknown, max: number) => (typeof v === "string" && v ? v.slice(0, max) : null);

// Funnel events from buyer pages (sendBeacon). order_saved is written by
// /api/orders itself. whatsapp_opened also flags the order.
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(await req.text());
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const name = str(b.name, 40);
  if (!name || !NAMES.includes(name)) return new NextResponse(null, { status: 400 });
  const orderCode = str(b.order_code, 16);
  const db = adminDb();
  await db.from("events").insert({
    name,
    source: str(b.source, 10),
    ref: str(b.ref, 80),
    product_slug: str(b.product_slug, 120),
    device_id: str(b.device_id, 40),
    order_code: orderCode && isOrderCode(orderCode) ? orderCode : null,
  });
  if (name === "whatsapp_opened" && orderCode && isOrderCode(orderCode)) {
    await db.from("orders").update({ whatsapp_opened: true }).eq("code", orderCode);
  }
  return new NextResponse(null, { status: 204 });
}
