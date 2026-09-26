// Supabase settings. The current key names (publishable / secret, which the
// Vercel ↔ Supabase integration sets and new Supabase projects use) come
// first; the legacy anon / service_role names are the fallback.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

// Falls back to the Vercel production domain, so NEXT_PUBLIC_SITE_URL is only
// needed once a custom domain (rdfashion.in) is attached. "rdfashion.in"
// without a scheme is accepted too.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
const siteSetting = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
export const SITE_URL = (
  siteSetting
    ? /^https?:\/\//i.test(siteSetting)
      ? siteSetting
      : `https://${siteSetting}`
    : vercelHost
      ? `https://${vercelHost}`
      : "http://localhost:3000"
).replace(/\/+$/, "");
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
export const DEFAULT_WHATSAPP = "919313877748";
export const DEFAULT_CALL = "9313877748";

type ServerSecret = "SUPABASE_SECRET_KEY" | "FAL_KEY" | "ANTHROPIC_API_KEY" | "CRON_SECRET" | "VAPID_PRIVATE_KEY";

export function serverEnv(name: ServerSecret): string | undefined {
  if (name === "SUPABASE_SECRET_KEY") return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
  return process.env[name] || undefined;
}
