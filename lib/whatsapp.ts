// WhatsApp click-to-chat handoff (PRD › "Order handoff to WhatsApp").
import { groupIndian } from "./format.ts";

export type MessageOrder = {
  code: string | null;
  shopName: string;
  city: string;
  name: string;
  phone: string;
  lines: {
    name: string;
    colorName: string;
    pricePerPiece: number;
    sizes: [string, number][];
  }[];
  siteHost: string;
};

export function buildOrderMessage(o: MessageOrder): string {
  const out: string[] = [];
  out.push(o.code ? `Order ${o.code} | RD Fashion` : "Order | RD Fashion");
  out.push(`Dukaan: ${o.shopName}, ${o.city}`);
  out.push(`Naam: ${o.name} | ${o.phone}`);
  out.push("");
  let totalPcs = 0;
  let totalAmt = 0;
  o.lines.forEach((l, i) => {
    const p = l.sizes.reduce((s, [, q]) => s + q, 0);
    const amt = p * l.pricePerPiece;
    totalPcs += p;
    totalAmt += amt;
    out.push(`${i + 1}. ${l.name} - ${l.colorName}`);
    out.push(
      `   ${l.sizes.map(([s, q]) => `${s} x${q}`).join(", ")} = ${p} pcs @ ${l.pricePerPiece} = ${groupIndian(amt)}`,
    );
  });
  out.push("");
  out.push(`Total: ${totalPcs} pcs | Rs ${groupIndian(totalAmt)}`);
  if (o.code) out.push(`Order dekhein: ${o.siteHost}/o/${o.code}`);
  return out.join("\n");
}

export function waUrl(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

// Chat with a buyer from the admin pages (10-digit Indian mobile).
export function waChatUrl(phone10: string, text?: string): string {
  const base = `https://wa.me/91${phone10}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function telUrl(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `tel:+91${d.slice(-10)}`;
}
