-- Seed data: settings plus 3 sample products (PRD.md › "Business context").
-- Image paths point into the public `catalog` bucket; upload matching files
-- under catalog/seed/ (or replace them from /admin once it exists).

insert into public.settings (key, value) values
  ('public', jsonb_build_object(
     'shop_name', 'RD Fashion',
     'instagram', 'fashionlitigation',
     'whatsapp_number', '919313877748',
     'call_number', '9313877748',
     'second_number', '9643195625',
     'address', '16/152, Upper Ground Floor, Madan Complex, Main Tank Road, Karol Bagh, Delhi 110005',
     'hours', null,
     'rating', null)),
  -- 10-digit numbers allowed to sign in to /admin.
  -- TODO: add Raghav's number before going live.
  ('admin_phones', '["9313877748", "9643195625"]'),
  ('colour_palette', '[
     {"name": "Black",        "hex": "#111111"},
     {"name": "White",        "hex": "#FFFFFF"},
     {"name": "Navy",         "hex": "#1F2A44"},
     {"name": "Grey melange", "hex": "#9A9A9A"},
     {"name": "Olive",        "hex": "#5B5B2E"},
     {"name": "Maroon",       "hex": "#6B1E2A"},
     {"name": "Mustard",      "hex": "#D4A017"},
     {"name": "Beige",        "hex": "#D9C7A7"},
     {"name": "Bottle green", "hex": "#1E4D2B"},
     {"name": "Sky blue",     "hex": "#8EC5E8"}
   ]'),
  ('size_sets', '{
     "tshirt": ["M", "L", "XL", "XXL"],
     "lower":  ["M", "L", "XL", "XXL"],
     "cargo":  ["M", "L", "XL", "XXL"]
   }')
on conflict (key) do update set value = excluded.value;

with p as (
  insert into public.products
    (slug, name, category, fabric, gsm, price_per_piece, status, sort_order)
  values
    ('boxy-henley-tee', 'Boxy fit henley tee', 'tshirt', 'Cotton',       '220', 260, 'live', 3),
    ('cargo-jogger',    'Cargo jogger',        'cargo',  'Cotton twill', '280', 480, 'live', 2),
    ('track-lower',     'Track lower',         'lower',  'Lycra',        '240', 290, 'live', 1)
  on conflict (slug) do nothing
  returning id, slug
)
insert into public.product_colors
  (product_id, color_name, color_hex, source, approved_image_path, thumb_path, status, sold_out_sizes)
select p.id, c.color_name, c.color_hex, 'photo',
       'seed/' || p.slug || '-' || c.file || '.webp',
       'seed/' || p.slug || '-' || c.file || '-400.webp',
       'approved', c.sold_out_sizes
from p
join (values
  ('boxy-henley-tee', 'Olive',        '#5B5B2E', 'olive',        '{}'::text[]),
  ('boxy-henley-tee', 'Black',        '#111111', 'black',        '{}'),
  ('boxy-henley-tee', 'White',        '#FFFFFF', 'white',        '{XXL}'),
  ('cargo-jogger',    'Black',        '#111111', 'black',        '{}'),
  ('cargo-jogger',    'Olive',        '#5B5B2E', 'olive',        '{}'),
  ('track-lower',     'Navy',         '#1F2A44', 'navy',         '{}'),
  ('track-lower',     'Grey melange', '#9A9A9A', 'grey-melange', '{}'),
  ('track-lower',     'Black',        '#111111', 'black',        '{}')
) as c (slug, color_name, color_hex, file, sold_out_sizes) on c.slug = p.slug;
