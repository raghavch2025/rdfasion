import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, serverEnv } from "../env.ts";

let client: SupabaseClient | null = null;

// Service-role client: bypasses RLS. Server code only, after its own checks.
export function adminDb(): SupabaseClient {
  if (!client) {
    const key = serverEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !key) throw new Error("Supabase service role is not configured");
    client = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
