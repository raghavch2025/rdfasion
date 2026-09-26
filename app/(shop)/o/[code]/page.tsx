import { Header } from "@/components/buyer/Header";
import { OrderView } from "@/components/buyer/OrderView";
import { getPublicSettings } from "@/lib/catalog";
import { maskPhone } from "@/lib/format";
import { getOrderByCode } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order · RD Fashion", robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).toUpperCase();
  const [order, settings] = await Promise.all([getOrderByCode(code), getPublicSettings()]);
  return (
    <>
      <Header back="/" />
      <OrderView
        code={code}
        callNumber={settings.call_number}
        order={
          order && {
            status: order.status,
            createdAt: order.created_at,
            totalPieces: order.total_pieces,
            totalAmount: order.total_amount,
            shop: `${order.buyer.shop_name}, ${order.buyer.city}`,
            buyer: `${order.buyer.name} · ${maskPhone(order.buyer.phone)}`,
            lines: order.lines,
          }
        }
      />
    </>
  );
}
