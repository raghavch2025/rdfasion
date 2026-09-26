-- Checkout asks only for the mobile number and a city picked from buttons;
-- name and shop name are optional. Plus the tables behind uploading new
-- designs from WhatsApp or the private upload link (lib/autocatalog.ts).
-- Safe to run again.

-- ---------------------------------------------------------------------------
-- Optional buyer name and shop name
-- ---------------------------------------------------------------------------

alter table public.buyers alter column name set default '';
alter table public.buyers alter column shop_name set default '';

create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name   text := trim(coalesce(p #>> '{buyer,name}', ''));
  v_shop   text := trim(coalesce(p #>> '{buyer,shop_name}', ''));
  v_city   text := trim(coalesce(p #>> '{buyer,city}', ''));
  v_phone  text := coalesce(p #>> '{buyer,phone}', '');
  v_source text := coalesce(nullif(p ->> 'source', ''), 'direct');
  v_line   jsonb;
  v_size   record;
  v_prod   record;
  v_pieces integer;
  v_total_pieces integer := 0;
  v_total_amount integer := 0;
  v_buyer_id uuid;
  v_order  record;
  v_seen   uuid[] := '{}';
  v_items  jsonb := '[]';
  v_out_lines jsonb := '[]';
begin
  -- Only the mobile number and city are required: many buyers cannot type
  -- a name or shop name easily.
  if v_phone !~ '^[6-9][0-9]{9}$' or v_city = ''
     or length(v_name) > 80 or length(v_shop) > 80 or length(v_city) > 60 then
    raise exception 'invalid_buyer';
  end if;
  if v_source not in ('reel', 'bio', 'direct', 'share') then
    v_source := 'direct';
  end if;

  -- 10 orders per phone per hour.
  if (select count(*) from public.orders o join public.buyers b on b.id = o.buyer_id
      where b.phone = v_phone and o.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  if jsonb_typeof(p -> 'lines') <> 'array' or jsonb_array_length(p -> 'lines') = 0 then
    raise exception 'empty_cart';
  end if;
  if jsonb_array_length(p -> 'lines') > 50 then
    raise exception 'empty_cart';
  end if;

  for v_line in select * from jsonb_array_elements(p -> 'lines') loop
    select c.id as color_id, c.color_name, c.sold_out_sizes,
           pr.id as product_id, pr.name, pr.price_per_piece, pr.moq_pieces, pr.size_set
      into v_prod
      from public.product_colors c
      join public.products pr on pr.id = c.product_id
     where c.id = (case when (v_line ->> 'color_id') ~* '^[0-9a-f-]{36}$'
                        then (v_line ->> 'color_id')::uuid end)
       and c.status = 'approved' and pr.status = 'live';
    if not found then
      raise exception 'unavailable:%', v_line ->> 'color_id';
    end if;
    if v_prod.color_id = any (v_seen) then
      raise exception 'duplicate_line';
    end if;
    v_seen := v_seen || v_prod.color_id;

    if jsonb_typeof(v_line -> 'sizes') <> 'object' then
      raise exception 'moq:%', v_prod.color_id;
    end if;

    v_pieces := 0;
    for v_size in
      select s.key as size, s.value as qty
        from jsonb_each(v_line -> 'sizes') s
    loop
      if jsonb_typeof(v_size.qty) <> 'number' or (v_size.qty #>> '{}') !~ '^[0-9]+$'
         or (v_size.qty #>> '{}')::integer > 999 then
        raise exception 'bad_size:%:%', v_prod.color_id, v_size.size;
      end if;
      continue when (v_size.qty #>> '{}')::integer = 0;
      if not (v_size.size = any (v_prod.size_set)) or v_size.size = any (v_prod.sold_out_sizes) then
        raise exception 'bad_size:%:%', v_prod.color_id, v_size.size;
      end if;
      v_pieces := v_pieces + (v_size.qty #>> '{}')::integer;
      v_items := v_items || jsonb_build_object(
        'product_id', v_prod.product_id, 'color_id', v_prod.color_id, 'size', v_size.size,
        'qty', (v_size.qty #>> '{}')::integer, 'price_per_piece', v_prod.price_per_piece);
    end loop;

    if v_pieces < v_prod.moq_pieces then
      raise exception 'moq:%', v_prod.color_id;
    end if;

    v_total_pieces := v_total_pieces + v_pieces;
    v_total_amount := v_total_amount + v_pieces * v_prod.price_per_piece;
    v_out_lines := v_out_lines || jsonb_build_object(
      'color_id', v_prod.color_id, 'name', v_prod.name, 'color_name', v_prod.color_name,
      'price_per_piece', v_prod.price_per_piece,
      'sizes', (select coalesce(jsonb_agg(jsonb_build_array(sz, (v_line #>> array['sizes', sz])::integer)
                                          order by ord), '[]')
                  from unnest(v_prod.size_set) with ordinality as u(sz, ord)
                 where coalesce((v_line #>> array['sizes', sz])::integer, 0) > 0));
  end loop;

  insert into public.buyers as b (phone, name, shop_name, city, last_order_at, order_count)
  values (v_phone, v_name, v_shop, v_city, now(), 1)
  on conflict (phone) do update
    -- A later order without a name keeps the name given before.
    set name = coalesce(nullif(excluded.name, ''), b.name),
        shop_name = coalesce(nullif(excluded.shop_name, ''), b.shop_name),
        city = excluded.city,
        last_order_at = now(), order_count = b.order_count + 1
  returning id into v_buyer_id;

  insert into public.orders (buyer_id, total_pieces, total_amount, source, utm)
  values (v_buyer_id, v_total_pieces, v_total_amount, v_source,
          case when jsonb_typeof(p -> 'utm') = 'object' then p -> 'utm' else '{}' end)
  returning id, code into v_order;

  insert into public.order_items (order_id, product_id, color_id, size, qty, price_per_piece)
  select v_order.id, (i ->> 'product_id')::uuid, (i ->> 'color_id')::uuid, i ->> 'size',
         (i ->> 'qty')::integer, (i ->> 'price_per_piece')::integer
    from jsonb_array_elements(v_items) i;

  return jsonb_build_object(
    'id', v_order.id, 'code', v_order.code,
    'total_pieces', v_total_pieces, 'total_amount', v_total_amount,
    'lines', v_out_lines);
end;
$$;


-- Default one-tap city buttons at checkout (editable in /admin/settings).
update public.settings
   set value = value || jsonb_build_object('popular_cities', jsonb_build_array(
     'Delhi', 'Gurugram', 'Faridabad', 'Noida', 'Ghaziabad', 'Meerut',
     'Sonipat', 'Panipat', 'Rohtak', 'Rewari', 'Karnal', 'Hisar'))
 where key = 'public' and not (value ? 'popular_cities');

-- ---------------------------------------------------------------------------
-- Uploads: photos Papa sends (upload link or WhatsApp), grouped by Claude
-- into designs and colours, then turned into draft products.
-- ---------------------------------------------------------------------------

create table if not exists public.upload_batches (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('link', 'whatsapp', 'admin')),
  sender_phone text,
  status       text not null default 'collecting'
                 check (status in ('collecting', 'processing', 'ready', 'failed')),
  price_hint   integer check (price_hint > 0),
  summary      jsonb not null default '{}',
  error        text,
  acked        boolean not null default false,
  created_at   timestamptz not null default now(),
  last_item_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.upload_items (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.upload_batches (id) on delete cascade,
  storage_path  text not null,
  caption       text,
  wa_message_id text unique,
  status        text not null default 'pending' check (status in ('pending', 'grouped', 'skipped', 'failed')),
  note          text,
  product_id    uuid references public.products (id) on delete set null,
  color_id      uuid references public.product_colors (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists upload_batches_status_idx on public.upload_batches (status, created_at desc);
create index if not exists upload_items_batch_idx on public.upload_items (batch_id);
create index if not exists upload_items_product_idx on public.upload_items (product_id);

alter table public.upload_batches enable row level security;
alter table public.upload_items enable row level security;
drop policy if exists "admin all" on public.upload_batches;
create policy "admin all" on public.upload_batches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all" on public.upload_items;
create policy "admin all" on public.upload_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.upload_batches, public.upload_items to authenticated, service_role;
