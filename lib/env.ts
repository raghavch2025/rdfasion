export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
// Falls back to the Vercel production domain, so NEXT_PUBLIC_SITE_URL is only
// needed once a custom domain (rdfashion.in) is attached.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : "http://localhost:3000")
).replace(/\/$/, "");
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
export const DEFAULT_WHATSAPP = "919313877748";
export const DEFAULT_CALL = "9313877748";

export function serverEnv(name: "SUPABASE_SERVICE_ROLE_KEY" | "FAL_KEY" | "ANTHROPIC_API_KEY" | "CRON_SECRET" | "VAPID_PRIVATE_KEY"): string | undefined {
  return process.env[name] || undefined;
}
