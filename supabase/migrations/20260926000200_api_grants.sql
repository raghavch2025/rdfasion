-- Table privileges for the API roles, granted explicitly. Supabase projects
-- created after 30 May 2026 no longer grant them on new public tables by
-- default (and existing projects follow from 30 Oct 2026). Row Level Security
-- still decides which rows each role sees; these grants only let it ask.
--
--   anon           reads the public catalogue and the public settings row
--   authenticated  admin phones (RLS "admin all" policies gate everything)
--   service_role   server code: /api/orders, /api/events, admin actions
-- Safe to run again.

grant usage on schema public to anon, authenticated, service_role;

grant select on public.settings, public.products, public.product_colors to anon;

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.place_order(jsonb) to service_role;
