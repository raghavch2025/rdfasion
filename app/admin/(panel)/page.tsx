import Link from "next/link";
import { adminDb } from "@/lib/supabase/admin";
import { rupees } from "@/lib/format";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { PushToggle } from "@/components/admin/PushToggle";
import { admin as s } from "@/strings";

type Row = {
  code: string;
  status: OrderStatus;
  total_pieces: number;
  total_amount: number;
  final_amount: number | null;
  source: string;
  created_at: string;
  buyer: { name: string; shop_name: string; city: string } | null;
};

const statusColour: Record<OrderStatus, string> = {
  new: "bg-accent text-white",
  contacted: "bg-amber-100 text-amber-900",
  confirmed: "bg-green-100 text-green-900",
  dispatched: "bg-soft text-ink",
  cancelled: "bg-soft text-muted line-through",
};

export default async function Inbox({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status as OrderStatus | undefined;
  const db = adminDb();
  let q = db
    .from("orders")
    .select("code, status, total_pieces, total_amount, final_amount, source, created_at, buyer:buyers (name, shop_name, city)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && ORDER_STATUSES.includes(status)) q = q.eq("status", status);
  const [{ data }, { count: unread }] = await Promise.all([
    q,
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-3">
      <AutoRefresh seconds={30} badge={unread ?? 0} />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">
          {s.inbox}{" "}
          {unread ? <span className="rounded-full bg-accent px-2 py-0.5 text-sm text-white">{s.unread(unread)}</span> : null}
        </h1>
      </div>
      <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
      <div className="flex gap-1 overflow-x-auto">
        {[undefined, ...ORDER_STATUSES].map((st) => (
          <Link
            key={st ?? "all"}
            href={st ? `/admin?status=${st}` : "/admin"}
            className={`min-h-10 shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${
              status === st ? "border-ink bg-ink text-white" : "border-line"
            }`}
          >
            {st ? s.statuses[st] : s.all}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-muted">{s.noOrders}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map((o) => (
            <li key={o.code}>
              <Link href={`/admin/orders/${o.code}`} className="flex items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {o.code} · {o.buyer?.shop_name || o.buyer?.name || o.buyer?.city}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {[o.buyer?.name, o.buyer?.city].filter(Boolean).join(", ")} · {o.source} · {timeAgo(o.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{rupees(o.final_amount ?? o.total_amount)}</p>
                  <p className="text-sm text-muted">{o.total_pieces} pcs</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusColour[o.status]}`}>{s.statuses[o.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} ghante`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
