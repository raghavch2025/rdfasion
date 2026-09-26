import Link from "next/link";
import { adminDb } from "@/lib/supabase/admin";
import { admin as s } from "@/strings";

type Bar = { label: string; value: number };

// Last 7 / 30 days: visits by source, top designs by views and by pieces,
// funnel counts, orders by city. Plain bars, no chart library.
export default async function StatsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = (await searchParams).days === "30" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const db = adminDb();
  const [{ data: events }, { data: orders }, { data: items }] = await Promise.all([
    db.from("events").select("name, source, product_slug, device_id").gte("created_at", since).limit(50000),
    db.from("orders").select("id, status, buyer:buyers (city)").gte("created_at", since).neq("status", "cancelled"),
    db
      .from("order_items")
      .select("qty, products (name), orders!inner (created_at, status)")
      .gte("orders.created_at", since)
      .neq("orders.status", "cancelled"),
  ]);
  const ev = events ?? [];

  const count = <T,>(rows: T[], key: (r: T) => string | null | undefined, weight: (r: T) => number = () => 1): Bar[] => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + weight(r));
    });
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };

  const visits = count(
    // one visit per device per source
    [...new Map(ev.filter((e) => e.name === "catalogue_view" || e.name === "product_view").map((e) => [`${e.device_id}|${e.source}`, e])).values()],
    (e) => e.source ?? "direct",
  );
  const topViews = count(ev.filter((e) => e.name === "product_view"), (e) => e.product_slug).slice(0, 10);
  const topPieces = count(
    (items ?? []) as unknown as { qty: number; products: { name: string } | null }[],
    (i) => i.products?.name,
    (i) => i.qty,
  ).slice(0, 10);
  const funnelNames = ["catalogue_view", "product_view", "add_to_cart", "checkout_start", "order_saved", "whatsapp_opened"];
  const funnel = funnelNames.map((n) => ({ label: n, value: ev.filter((e) => e.name === n).length }));
  const cities = count((orders ?? []) as unknown as { buyer: { city: string } | null }[], (o) => o.buyer?.city?.trim()).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">{s.stats}</h1>
        <div className="flex gap-1">
          {[7, 30].map((d) => (
            <Link
              key={d}
              href={`/admin/stats?days=${d}`}
              className={`min-h-10 rounded-full border px-3 py-2 text-sm font-semibold ${days === d ? "border-ink bg-ink text-white" : "border-line"}`}
            >
              {d === 7 ? s.last7 : s.last30}
            </Link>
          ))}
        </div>
      </div>
      <Bars title={s.funnel} bars={funnel} />
      <Bars title={s.visitsBySource} bars={visits} />
      <Bars title={s.topByViews} bars={topViews} />
      <Bars title={s.topByPieces} bars={topPieces} unit="pcs" />
      <Bars title={s.ordersByCity} bars={cities} />
    </div>
  );
}

function Bars({ title, bars, unit }: { title: string; bars: Bar[]; unit?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <section>
      <h2 className="mb-2 font-bold">{title}</h2>
      {bars.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <ul className="space-y-1.5">
          {bars.map((b) => (
            <li key={b.label} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2 text-sm">
              <span className="truncate">{b.label}</span>
              <span className="h-4 rounded-sm bg-accent" style={{ width: `${(b.value / max) * 100}%` }} />
              <span className="text-right font-semibold tabular-nums">
                {b.value}
                {unit ? ` ${unit}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
