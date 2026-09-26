import { after, NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { getPublicSettings } from "@/lib/catalog";
import { isValidPhone, normalizePhone } from "@/lib/format";
import { buildOrderMessage, waUrl } from "@/lib/whatsapp";
import { SITE_HOST } from "@/lib/env";
import { notifyAdminsOfOrder } from "@/lib/push";

type Body = {
  buyer?: { name?: unknown; shop_name?: unknown; city?: unknown; phone?: unknown };
  lines?: { color_id?: unknown; sizes?: unknown }[];
  source?: unknown;
  utm?: unknown;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// POST /api/orders: validate, save the order (buyer upsert + order + items in
// one transaction via place_order, which re-checks MOQ, sizes and prices),
// then return the code and the pre-filled wa.me URL. The order row exists
// before the browser is sent to WhatsApp.
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const phone = normalizePhone(str(body.buyer?.phone, 20));
  const buyer = {
    name: str(body.buyer?.name, 80),
    shop_name: str(body.buyer?.shop_name, 80),
    city: str(body.buyer?.city, 60),
    phone,
  };
  if (!buyer.name || !buyer.shop_name || !buyer.city || !isValidPhone(phone)) {
    return NextResponse.json({ error: "invalid_buyer" }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 50) {
    return NextResponse.json({ error: "empty_cart" }, { status: 400 });
  }
  const lines = body.lines.map((l) => ({
    color_id: typeof l.color_id === "string" ? l.color_id : "",
    sizes:
      l.sizes && typeof l.sizes === "object" && !Array.isArray(l.sizes)
        ? Object.fromEntries(
            Object.entries(l.sizes as Record<string, unknown>)
              .filter(([k, v]) => k.length <= 10 && Number.isInteger(v))
              .map(([k, v]) => [k, v as number]),
          )
        : {},
  }));
  const source = ["reel", "bio", "direct", "share"].includes(str(body.source, 10)) ? str(body.source, 10) : "direct";
  const utm =
    body.utm && typeof body.utm === "object" && !Array.isArray(body.utm)
      ? Object.fromEntries(
          Object.entries(body.utm as Record<string, unknown>)
            .slice(0, 5)
            .map(([k, v]) => [k.slice(0, 20), str(v, 80)]),
        )
      : {};

  const db = adminDb();
  const { data, error } = await db.rpc("place_order", { p: { buyer, lines, source, utm } });
  if (error) {
    const code = error.message.split(":")[0];
    const known = ["invalid_buyer", "rate_limited", "empty_cart", "duplicate_line", "unavailable", "bad_size", "moq"];
    if (known.includes(code)) {
      return NextResponse.json({ error: error.message }, { status: code === "rate_limited" ? 429 : 422 });
    }
    console.error("place_order failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }

  const order = data as {
    code: string;
    total_pieces: number;
    total_amount: number;
    lines: { name: string; color_name: string; price_per_piece: number; sizes: [string, number][] }[];
  };
  const settings = await getPublicSettings();
  const message = buildOrderMessage({
    code: order.code,
    shopName: buyer.shop_name,
    city: buyer.city,
    name: buyer.name,
    phone: buyer.phone,
    siteHost: SITE_HOST,
    lines: order.lines.map((l) => ({ name: l.name, colorName: l.color_name, pricePerPiece: l.price_per_piece, sizes: l.sizes })),
  });

  after(async () => {
    await db.from("events").insert({ name: "order_saved", source, ref: utm.r ?? null, order_code: order.code });
    await notifyAdminsOfOrder({ code: order.code, shop: `${buyer.shop_name}, ${buyer.city}`, pieces: order.total_pieces, amount: order.total_amount });
  });

  return NextResponse.json({
    code: order.code,
    message,
    waUrl: waUrl(settings.whatsapp_number || process.env.WHATSAPP_NUMBER || "919313877748", message),
  });
}
