// Applies supabase/migrations/*.sql (and supabase/seed.sql the first time)
// straight to Postgres. Runs before every build, so a Vercel deploy
// sets up the database without pasting SQL into the Supabase editor.
//
// Connection string, first one set wins:
//   DATABASE_URL                 any Postgres URL (Supabase → Connect → Session pooler)
//   POSTGRES_URL_NON_POOLING     set by the Vercel ↔ Supabase integration
//   POSTGRES_URL                 same integration (transaction pooler)
// With none set (local builds), it does nothing.
//
// Applied versions are recorded in supabase_migrations.schema_migrations, the
// table the Supabase CLI uses, so `supabase db push` agrees with this script.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.log("[migrate] no DATABASE_URL / POSTGRES_URL set, skipping database setup");
  process.exit(0);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const host = new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname;
const local = ["localhost", "127.0.0.1", "::1"].includes(host);
// Transaction poolers (Supabase port 6543) cannot use prepared statements.
const sql = postgres(url, {
  ssl: local ? false : "require",
  prepare: false,
  max: 1,
  onnotice: () => {},
  connect_timeout: 20,
});

try {
  const files = (await readdir(migrationsDir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

  await sql.begin(async (tx) => {
    // One build at a time: a production and a preview build may start together.
    await tx`select pg_advisory_xact_lock(7271801)`;
    await tx.unsafe(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text not null primary key,
        statements text[],
        name text
      );
    `);
    const applied = new Set((await tx`select version from supabase_migrations.schema_migrations`).map((r) => r.version));

    for (const file of files) {
      const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
      if (applied.has(version)) continue;
      console.log(`[migrate] applying ${file}`);
      // Sent as one simple-protocol query, so dollar-quoted function bodies stay intact.
      await tx.unsafe(await readFile(path.join(migrationsDir, file), "utf8"));
      await tx`insert into supabase_migrations.schema_migrations (version, name) values (${version}, ${rest.join("_")})`;
    }

    // Seed once: the seed overwrites shop settings, so it only runs while the
    // admin list is missing (a new database, or one set up by hand without it).
    const [{ seeded }] = await tx`select exists (select 1 from public.settings where key = 'admin_phones') as seeded`;
    if (!seeded) {
      console.log("[migrate] no shop settings yet: loading supabase/seed.sql");
      await tx.unsafe(await readFile(path.join(root, "supabase", "seed.sql"), "utf8"));
    }
  });
  console.log("[migrate] database is up to date");
} catch (err) {
  console.error("[migrate] failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
