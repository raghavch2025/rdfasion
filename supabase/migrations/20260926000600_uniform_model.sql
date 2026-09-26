-- One model across the whole catalogue: AI try-on puts every garment on the
-- first photo in settings base_models. Default it to the model already in
-- the shop's catalogue photos (front-facing, plain background), so new AI
-- images match the designs listed so far. Replace it in /admin/settings.
-- Safe to run again.
update public.settings
   set value = '["/seed/raglan-tee-white-blue.webp"]'::jsonb
 where key = 'base_models' and value = '[]'::jsonb;
