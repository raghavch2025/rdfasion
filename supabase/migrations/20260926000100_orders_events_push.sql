-- Order placement, analytics events, admin push subscriptions and the extra
-- columns the order statuses and product page need (PRD › "Order statuses",
-- "AI catalogue generation", "Analytics and tracking from Instagram").

-- ---------------------------------------------------------------------------
-- Extra columns
-- ---------------------------------------------------------------------------

alter table public.orders
  add column transport_name text,
  add column lr_number      text,
  add column cancel_reason  text;

alter table public.products
  -- The real shop photo, copied to the public catalog bucket on publish and
  -- shown as a second image so retailers see the real fabric.
  add column original_image_path text,
  add column print_type text check (print_type in ('solid', 'print', 'stripe'));

-- ---------------------------------------------------------------------------
-- place_order: the only way an order is written. Validates availability,
-- sizes and the MOQ against the database, copies prices, upserts the buyer by
-- phone and writes order + items in one transaction. Called by POST
-- /api/orders with the service role; not callable by anon or signed-in users.
--
-- Input: {"buyer": {"name", "shop_name", "city", "phone"},
--         "lines": [{"color_id": uuid, "sizes": {"M": 2, "L": 4}}],
--         "source": "reel" | "bio" | "direct" | "share", "utm": {...}}
-- Errors are raised with a machine-readable message: invalid_buyer,
-- rate_limited, empty_cart, duplicate_line, unavailable:<color_id>,
-- bad_size:<color_id>:<size>, moq:<color_id>.
-- ---------------------------------------------------------------------------

create function public.place_order(p jsonb) returns jsonb
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
  if v_phone !~ '^[6-9][0-9]{9}$' or v_name = '' or v_shop = '' or v_city = ''
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
    set name = excluded.name, shop_name = excluded.shop_name, city = excluded.city,
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

revoke all on function public.place_order(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.place_order(jsonb) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funnel events (written by POST /api/events with the service role)
-- ---------------------------------------------------------------------------

create table public.events (
  id           bigint generated always as identity primary key,
  name         text not null check (name in ('catalogue_view', 'product_view', 'add_to_cart',
                                             'checkout_start', 'order_saved', 'whatsapp_opened')),
  source       text,
  ref          text,
  product_slug text,
  device_id    text,
  order_code   text,
  created_at   timestamptz not null default now()
);

create index events_created_at_idx on public.events (created_at desc);
create index events_name_created_at_idx on public.events (name, created_at desc);

alter table public.events enable row level security;
create policy "admin all" on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Web Push subscriptions for admin phones
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_id    uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create policy "admin all" on public.push_subscriptions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create index generation_jobs_product_id_idx on public.generation_jobs (product_id);
