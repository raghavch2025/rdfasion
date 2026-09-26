-- RD Fashion wholesale ordering: initial schema (PRD.md › "Data model").
-- Eight tables, RLS on every table, indexes, storage buckets.
--
-- Access model
--   * Anonymous buyers read live products, their approved colours and the
--     public settings row. Nothing else.
--   * Buyers, orders and order items are written only by the server
--     (POST /api/orders, service role) after it validates MOQ and price, and
--     orders are read by code only through that server. So anon gets no
--     policies on those tables at all.
--   * Admins (phone in settings 'admin_phones') read and write everything.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name            text not null check (length(trim(name)) > 0),
  category        text not null check (category in ('tshirt', 'lower', 'cargo')),
  fabric          text,
  gsm             text,
  price_per_piece integer not null check (price_per_piece > 0),
  moq_pieces      integer not null default 6 check (moq_pieces > 0),
  size_set        text[] not null default array['M', 'L', 'XL', 'XXL']
                    check (cardinality(size_set) > 0),
  status          text not null default 'draft'
                    check (status in ('draft', 'live', 'hidden', 'sold_out')),
  sort_order      integer not null default 0,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create table public.product_colors (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products (id) on delete cascade,
  color_name          text not null check (length(trim(color_name)) > 0),
  color_hex           text check (color_hex ~ '^#[0-9a-fA-F]{6}$'),
  source              text not null default 'photo' check (source in ('photo', 'recolour')),
  approved_image_path text,
  thumb_path          text,
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'sold_out')),
  sold_out_sizes      text[] not null default '{}',
  unique (product_id, color_name)
);

create table public.product_images (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products (id) on delete cascade,
  color_id            uuid references public.product_colors (id) on delete cascade,
  kind                text not null check (kind in ('original', 'recolour', 'tryon')),
  storage_path        text not null,
  provider            text,
  provider_request_id text,
  seed                bigint,
  status              text not null default 'queued'
                        check (status in ('queued', 'running', 'pending_approval',
                                          'approved', 'rejected', 'failed')),
  error               text,
  created_at          timestamptz not null default now()
);

create table public.generation_jobs (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  color_id    uuid references public.product_colors (id) on delete cascade,
  step        text not null check (step in ('recolour', 'tryon')),
  status      text not null default 'queued'
                check (status in ('queued', 'running', 'done', 'failed')),
  attempts    integer not null default 0,
  payload     jsonb not null default '{}',
  started_at  timestamptz,
  finished_at timestamptz
);

create table public.buyers (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null unique check (phone ~ '^[0-9]{10}$'),
  name          text not null,
  shop_name     text not null,
  city          text not null,
  first_seen_at timestamptz not null default now(),
  last_order_at timestamptz,
  order_count   integer not null default 0
);

-- Order codes: RD- plus a sequence starting at 1001.
create sequence public.order_code_seq start with 1001;

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default ('RD-' || nextval('public.order_code_seq')),
  buyer_id        uuid not null references public.buyers (id) on delete restrict,
  status          text not null default 'new'
                    check (status in ('new', 'contacted', 'confirmed', 'dispatched', 'cancelled')),
  total_pieces    integer not null check (total_pieces > 0),
  total_amount    integer not null check (total_amount >= 0),
  final_amount    integer check (final_amount >= 0),
  advance_amount  integer check (advance_amount >= 0),
  note            text,
  source          text not null default 'direct'
                    check (source in ('reel', 'bio', 'direct', 'share')),
  utm             jsonb not null default '{}',
  whatsapp_opened boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter sequence public.order_code_seq owned by public.orders.code;

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  product_id      uuid not null references public.products (id) on delete restrict,
  color_id        uuid not null references public.product_colors (id) on delete restrict,
  size            text not null,
  qty             integer not null check (qty > 0),
  -- Copied at order time so later price edits do not change history.
  price_per_piece integer not null check (price_per_piece > 0)
);

-- ---------------------------------------------------------------------------
-- Indexes (orders.code and buyers.phone are covered by their unique constraints)
-- ---------------------------------------------------------------------------

create index orders_status_created_at_idx on public.orders (status, created_at desc);
create index products_status_sort_order_idx on public.products (status, sort_order);
create index product_images_product_color_status_idx
  on public.product_images (product_id, color_id, status);
create index product_colors_product_id_idx on public.product_colors (product_id);
create index order_items_order_id_idx on public.order_items (order_id);
create index generation_jobs_status_idx on public.generation_jobs (status);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Admin check
-- ---------------------------------------------------------------------------

-- True when the signed-in user's phone (last 10 digits; Supabase stores it as
-- 919313877748) is in settings 'admin_phones', a JSON array of 10-digit strings.
-- security definer so it can read the admin list, which RLS hides from others.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.settings s,
         jsonb_array_elements_text(s.value) as admin_phone
    where s.key = 'admin_phones'
      and admin_phone = right(regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g'), 10)
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.settings        enable row level security;
alter table public.products        enable row level security;
alter table public.product_colors  enable row level security;
alter table public.product_images  enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.buyers          enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;

-- Public reads
create policy "public reads public settings" on public.settings
  for select to anon, authenticated
  using (key = 'public');

create policy "public reads live products" on public.products
  for select to anon, authenticated
  using (status in ('live', 'sold_out'));

create policy "public reads approved colours of live products" on public.product_colors
  for select to anon, authenticated
  using (
    status in ('approved', 'sold_out')
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.status in ('live', 'sold_out')
    )
  );

-- Admin: full read and write on everything
create policy "admin all" on public.settings        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.products        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.product_colors  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.product_images  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.generation_jobs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.buyers          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.orders          for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.order_items     for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: catalog (public read, approved images) and originals (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true),
       ('originals', 'originals', false)
on conflict (id) do nothing;

create policy "admin manages catalog and originals" on storage.objects
  for all to authenticated
  using (bucket_id in ('catalog', 'originals') and public.is_admin())
  with check (bucket_id in ('catalog', 'originals') and public.is_admin());
