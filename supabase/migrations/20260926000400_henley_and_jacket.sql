-- Two new designs from the shop's posts, plus a jacket category.
-- Runs on every database through scripts/migrate.mjs, so the live site gets
-- them on its next deploy. Safe to run again.

alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check
  check (category in ('tshirt', 'lower', 'cargo', 'jacket'));

update public.settings
   set value = value || '{"jacket": ["M", "L", "XL", "XXL"]}'::jsonb
 where key = 'size_sets' and not (value ? 'jacket');

-- Boxy fit henley, from the Instagram story: Rate 300, Size M-XL, MOQ 12 pcs.
with p as (
  insert into public.products (slug, name, category, price_per_piece, moq_pieces, size_set, status, sort_order)
  select 'boxy-fit-henley', 'Boxy fit henley', 'tshirt', 300, 12, array['M', 'L', 'XL'], 'live',
         coalesce(max(sort_order), 0) + 1
    from public.products
  on conflict (slug) do nothing
  returning id
)
insert into public.product_colors (product_id, color_name, color_hex, source, approved_image_path, thumb_path, status)
select p.id, c.color_name, c.color_hex, 'photo', c.path, c.path, 'approved'
  from p
 cross join (values
   ('Beige',      '#D3C3A5', '/seed/henley-beige.webp'),
   ('Dusty pink', '#C58A86', '/seed/henley-pink.webp'),
   ('Grey',       '#8F9090', '/seed/henley-grey.webp'),
   ('Sage green', '#8DAE88', '/seed/henley-green.webp')
 ) as c (color_name, color_hex, path);

-- Chenille zip jacket ("Shinail"), from a flat-lay photo of five colours.
-- A draft: the rate, sizes and MOQ were not in the post. Set the rate and
-- publish from the upload link or /admin. The placeholder price is never
-- shown while the design is a draft.
with p as (
  insert into public.products (slug, name, category, price_per_piece, size_set, status, sort_order, original_image_path)
  select 'chenille-zip-jacket', 'Chenille zip jacket', 'jacket', 1, array['M', 'L', 'XL', 'XXL'], 'draft',
         coalesce(max(sort_order), 0) + 1, '/seed/chenille-jacket-flatlay.webp'
    from public.products
  on conflict (slug) do nothing
  returning id
)
insert into public.product_colors (product_id, color_name, color_hex, source, approved_image_path, thumb_path, status)
select p.id, c.color_name, c.color_hex, 'photo', c.path, c.path, 'approved'
  from p
 cross join (values
   ('Olive',        '#6B6440', '/seed/chenille-jacket-olive.webp'),
   ('Bottle green', '#3F4641', '/seed/chenille-jacket-green.webp'),
   ('Black',        '#151515', '/seed/chenille-jacket-black.webp'),
   ('Brown',        '#4B3B2D', '/seed/chenille-jacket-brown.webp'),
   ('Beige',        '#B7A98B', '/seed/chenille-jacket-beige.webp')
 ) as c (color_name, color_hex, path);
