import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByCode } from "@/lib/orders";
import { rupees } from "@/lib/format";
import { telUrl, waChatUrl } from "@/lib/whatsapp";
import { ButtonLink } from "@/components/ui/Button";
import { OrderForm } from "@/components/admin/OrderForm";
import { admin as s } from "@/strings";

export default async function AdminOrder({ params }: { params: Promise<{ code: string }> }) {
  const order = await getOrderByCode(decodeURIComponent((await params).code).toUpperCase());
  if (!order) notFound();
  const b = order.buyer;
  const greeting = `Namaste ${b.name} ji, RD Fashion se. Aapka order ${order.code} mila (${order.total_pieces} pcs, ${rupees(order.total_amount)}).`;
  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm underline">
        ← {s.inbox}
      </Link>
      <div>
        <h1 className="text-xl font-extrabold">{order.code}</h1>
        <p className="text-sm text-muted">
          {new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
          {" · "}
          {s.source}: {order.source}
          {order.utm?.r ? ` (${order.utm.r})` : ""}
          {order.whatsapp_opened ? " · WhatsApp opened" : ""}
        </p>
      </div>
      <section className="rounded-lg border border-line p-3">
        <p className="text-lg font-bold">{b.shop_name}</p>
        <p>
          {b.name}, {b.city}
        </p>
        <p className="text-muted">
          {b.phone} · {b.order_count} order{b.order_count === 1 ? "" : "s"}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ButtonLink href={telUrl(b.phone)}>{s.call}</ButtonLink>
          <ButtonLink href={waChatUrl(b.phone, greeting)} variant="outline">
            {s.whatsapp}
          </ButtonLink>
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-bold">{s.items}</h2>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {order.lines.map((l) => {
            const p = l.sizes.reduce((sum, [, q]) => sum + q, 0);
            return (
              <li key={l.colorId} className="p-3">
                <p className="font-semibold">
                  {l.productName} - {l.colorName}
                </p>
                <p className="text-muted">{l.sizes.map(([sz, q]) => `${sz} x${q}`).join(", ")}</p>
                <p>
                  {p} pcs @ {rupees(l.pricePerPiece)} = <b>{rupees(p * l.pricePerPiece)}</b>
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 flex justify-between rounded-lg bg-soft p-3">
          <span>
            {s.catalogueTotal}: {order.total_pieces} pcs
          </span>
          <b>{rupees(order.total_amount)}</b>
        </p>
      </section>
      <OrderForm
        code={order.code}
        initial={{
          status: order.status,
          final_amount: order.final_amount,
          advance_amount: order.advance_amount,
          note: order.note,
          transport_name: order.transport_name,
          lr_number: order.lr_number,
          cancel_reason: order.cancel_reason,
        }}
      />
    </div>
  );
}
