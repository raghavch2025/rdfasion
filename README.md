# RD Fashion wholesale ordering website

Mobile-first wholesale catalogue that sends orders to WhatsApp. The full spec is in [PRD.md](PRD.md).

## Build progress (PRD › "Instructions for Claude Code")

- [x] 1. `supabase/migrations`: the 8 tables, RLS, indexes, storage buckets; `supabase/seed.sql` with settings and 3 sample products
- [ ] 2. Buyer routes `/`, `/p/[slug]`, `/cart`, `/checkout`, `/o/[code]`
- [ ] 3. `POST /api/orders`
- [ ] 4. Admin login, orders inbox, order detail
- [ ] 5. `/admin/new` (manual upload), `/admin/products`, `/admin/settings`
- [ ] 6. AI catalogue generation

## Database

Apply with the Supabase CLI (`supabase db reset` locally, or `supabase db push` to the project).
Before going live, add Raghav's number to the `admin_phones` setting and upload the seed images under `catalog/seed/`, or replace them from the admin pages.
