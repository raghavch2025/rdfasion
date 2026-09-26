-- Fixes from the pre-production review. Safe to run again.

-- 1. Storage buckets take images only, so nothing but photos can ever be
--    published through them.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('catalog', 'originals');

-- 2. The jacket was listed with flat photos of the floor. To keep one model
--    across the catalogue, each colour needs its AI model photo (or a
--    deliberate "Asli photo" tap) before the design can be published.
update public.product_colors c
   set status = 'pending'
  from public.products p
 where p.id = c.product_id
   and p.slug = 'chenille-zip-jacket'
   and p.status = 'draft'
   and c.status = 'approved'
   and c.approved_image_path like '/seed/chenille-jacket-%';

-- 3. One open WhatsApp upload per sender: photos sent together arrive as
--    separate webhooks at the same moment, and must land in the same batch.
update public.upload_batches b
   set status = 'failed', error = 'superseded'
 where source = 'whatsapp' and status = 'collecting'
   and exists (select 1 from public.upload_batches n
                where n.source = 'whatsapp' and n.status = 'collecting'
                  and n.sender_phone = b.sender_phone and n.created_at > b.created_at);
create unique index if not exists upload_batches_one_collecting
  on public.upload_batches (sender_phone) where source = 'whatsapp' and status = 'collecting';

create or replace function public.open_whatsapp_batch(p_phone text)
returns table (id uuid, acked boolean, items integer)
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('wa-batch:' || p_phone));
  insert into public.upload_batches (source, sender_phone)
  values ('whatsapp', p_phone)
  on conflict (sender_phone) where source = 'whatsapp' and status = 'collecting' do nothing;
  return query
    select b.id, b.acked, (select count(*)::integer from public.upload_items i where i.batch_id = b.id)
      from public.upload_batches b
     where b.source = 'whatsapp' and b.status = 'collecting' and b.sender_phone = p_phone
     limit 1;
end;
$$;
revoke all on function public.open_whatsapp_batch(text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.open_whatsapp_batch(text) to service_role;
  end if;
end $$;
