import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/admin/actions";
import { admin as s } from "@/strings";

export const metadata = { title: "Admin · RD Fashion", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const nav: [string, string][] = [
    ["/admin", s.nav.orders],
    ["/admin/new", s.nav.new],
    ["/admin/products", s.nav.products],
    ["/admin/stats", s.nav.stats],
    ["/admin/settings", s.nav.settings],
  ];
  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-10">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="flex h-12 items-center justify-between px-3">
          <Link href="/admin" className="font-extrabold">
            RD <span className="text-accent">Admin</span>
          </Link>
          <form action={logout}>
            <button className="min-h-11 px-2 text-sm text-muted">{s.logout}</button>
          </form>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="min-h-10 shrink-0 rounded-full bg-soft px-3 py-2 text-sm font-semibold">
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="px-3 pt-3">{children}</main>
    </div>
  );
}
