import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env.ts";

// Admin sessions last 90 days on a trusted phone.
const SESSION_MAX_AGE = 60 * 60 * 24 * 90;

// Cookie-bound client for signed-in admin pages and server actions.
export async function sessionDb() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: { maxAge: SESSION_MAX_AGE, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component; the middleware refreshes cookies.
        }
      },
    },
  });
}

// Anonymous client for public catalogue reads (RLS: live products only).
export function publicDb() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export { SESSION_MAX_AGE };
