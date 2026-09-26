-- WhatsApp Cloud API: every incoming message id (wamid) is recorded before any
-- work, because Meta re-sends webhooks (for up to 7 days) and does not
-- de-duplicate. Safe to run again.
create table if not exists public.whatsapp_messages (
  id           text primary key,
  sender_phone text,
  kind         text,
  received_at  timestamptz not null default now()
);
alter table public.whatsapp_messages enable row level security;
drop policy if exists "admin all" on public.whatsapp_messages;
create policy "admin all" on public.whatsapp_messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.whatsapp_messages to authenticated, service_role;
