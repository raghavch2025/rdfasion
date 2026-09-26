import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL, SUPABASE_ANON_KEY, SUPABASE_URL, serverEnv } from "@/lib/env";
import { uploadTokenStatus } from "@/lib/upload-auth";

export const dynamic = "force-dynamic";

// GET /api/health: which settings the deploy sees (names only, never values)
// and whether the database answers. Open it in a browser when the site errors.
export async function GET() {
  const secret = serverEnv("SUPABASE_SECRET_KEY");
  const settings = {
    deployed_commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    supabase_url: Boolean(SUPABASE_URL),
    publishable_or_anon_key: Boolean(SUPABASE_ANON_KEY),
    secret_or_service_role_key: Boolean(secret),
    site_url: SITE_URL,
    fal_key: Boolean(serverEnv("FAL_KEY")),
    anthropic_key: Boolean(serverEnv("ANTHROPIC_API_KEY")),
    push_keys: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && serverEnv("VAPID_PRIVATE_KEY")),
    upload_link: uploadTokenStatus(),
    whatsapp_uploads: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),
  };
  const check = async (key: string | undefined, table: string) => {
    if (!SUPABASE_URL || !key) return "missing settings";
    try {
      const db = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
      return error ? `error ${error.code ?? ""}: ${error.message}` : `ok (${count ?? 0} rows)`;
    } catch (err) {
      return `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
  const [publicRead, serverRead] = await Promise.all([check(SUPABASE_ANON_KEY, "products"), check(secret, "settings")]);
  const ok = publicRead.startsWith("ok") && serverRead.startsWith("ok");
  return NextResponse.json(
    { ok, settings, database: { public_catalogue: publicRead, server_settings: serverRead } },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
