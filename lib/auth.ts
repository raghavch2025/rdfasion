import "server-only";
import { redirect } from "next/navigation";
import { sessionDb } from "./supabase/server.ts";
import { adminDb } from "./supabase/admin.ts";
import { normalizePhone } from "./format.ts";

export type Admin = { userId: string; phone: string; isOwner: boolean };

async function phoneList(key: "admin_phones" | "owner_phones"): Promise<string[]> {
  const { data } = await adminDb().from("settings").select("value").eq("key", key).maybeSingle();
  return Array.isArray(data?.value) ? (data.value as string[]).map(normalizePhone) : [];
}

export async function isAllowedAdminPhone(phone: string): Promise<boolean> {
  return (await phoneList("admin_phones")).includes(normalizePhone(phone));
}

export async function getAdmin(): Promise<Admin | null> {
  const db = await sessionDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user?.phone) return null;
  const phone = normalizePhone(user.phone);
  const [admins, owners] = await Promise.all([phoneList("admin_phones"), phoneList("owner_phones")]);
  if (!admins.includes(phone) && !owners.includes(phone)) return null;
  return { userId: user.id, phone, isOwner: owners.includes(phone) };
}

export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
