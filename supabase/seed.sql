-- Seed data: shop settings plus the first design (PRD.md › "Business context").
-- scripts/migrate.mjs loads this file once, while settings has no admin list.

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
  -- Only these numbers may change the WhatsApp number and the admin list
  -- (PRD: "Raghav only"). TODO: put Raghav's number here.
  ('owner_phones', '[]'),
  -- Base-model photos for try-on, paths in the catalog bucket (models/).
  ('base_models', '[]'),
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

-- One real design from the shop: raglan full sleeve tee in 5 colourways
-- (body / sleeves). Photos in public/seed/. Price is a placeholder to set in
-- /admin/products; fabric and GSM are left for the shop to fill in.
with p as (
  insert into public.products
    (slug, name, category, price_per_piece, status, sort_order)
  values
    ('raglan-full-sleeve-tee', 'Raglan full sleeve tee', 'tshirt', 300, 'live', 1)
  on conflict (slug) do nothing
  returning id, slug
)
insert into public.product_colors
  (product_id, color_name, color_hex, source, approved_image_path, thumb_path, status)
select p.id, c.color_name, c.color_hex, 'photo',
       '/seed/raglan-tee-' || c.file || '.webp',
       '/seed/raglan-tee-' || c.file || '.webp',
       'approved'
from p
cross join (values
  ('Grey / Black',  '#9E9E9E', 'grey-black'),
  ('Blue / White',  '#1F4FB5', 'blue-white'),
  ('White / Blue',  '#F2F2F2', 'white-blue'),
  ('Grey / White',  '#8C8C8C', 'grey-white'),
  ('Brown / White', '#7A5540', 'brown-white')
) as c (color_name, color_hex, file);
