# RD Fashion wholesale ordering website

Mobile-first wholesale catalogue for RD Fashion (@fashionlitigation). Retailers open a link from a reel or the Instagram bio, pick colours and sizes at the 6-piece minimum, and send the order to WhatsApp in one tap. Papa and Bhaiya publish designs from one photo and work orders from `/admin`. The full spec is in [PRD.md](PRD.md).

## What's built

| PRD phase | Status |
| --- | --- |
| 1 · Order path | Done: schema + RLS, catalogue, product, cart, checkout, order page, wa.me handoff, admin OTP login, orders inbox with statuses, manual publish from photos |
| 2 · AI catalogue | Done in code: fal try-on (FASHN v1.6, Kling fallback), recolour (FLUX Kontext), Claude auto-fill, job queue + webhook + polling, approval screen, share sheet. Needs `FAL_KEY`, `ANTHROPIC_API_KEY` and base-model photos to run |
| 3 · Polish and traction | Done: Hindi toggle, Web Push to admins, funnel events and `/admin/stats`, `?s=reel&r=…` source tags, sold-out per size, in-app-browser fallback (Copy + Call) |
| 4 · WhatsApp Cloud API | Not started: needs Meta Business verification first |

Buyer routes: `/`, `/p/[slug]`, `/cart`, `/checkout`, `/o/[code]`.
Admin routes: `/admin`, `/admin/orders/[code]`, `/admin/new`, `/admin/products`, `/admin/products/[id]`, `/admin/settings`, `/admin/stats`, `/admin/login`.
API: `POST /api/orders`, `POST /api/events`, `POST /api/generate`, `POST /api/fal/webhook`, `GET /api/cron/jobs`.

## Layout

```
app/            buyer routes in (shop)/, admin routes in admin/, api/
components/     ui/, buyer/, admin/
lib/            supabase clients, catalog, orders, moq, whatsapp message, fal generation, anthropic, push
supabase/       config.toml, migrations/, seed.sql
strings.ts      all Hinglish / Hindi / English strings
PRD.md          the spec
```

## Run locally

```bash
npm install
npx supabase start          # local Postgres/Auth/Storage (Docker); applies migrations + seed
# or against any Postgres/Supabase: DATABASE_URL=postgres://... npm run db:migrate
cp .env.example .env.local  # fill from `npx supabase status`
npm run dev
```

For local admin login without an SMS provider, add a test OTP to `supabase/config.toml` (do not commit it):

```toml
[auth.sms.test_otp]
919313877748 = "123456"
```

Checks: `npm test` (MOQ, totals, Indian number format, WhatsApp message format), `npm run lint` (TypeScript), `npm run build`.

## Going live

The database sets itself up: `npm run build` first runs `scripts/migrate.mjs`, which applies `supabase/migrations/*.sql` (and `supabase/seed.sql` the first time) straight to Postgres. So a Vercel deploy needs no SQL editor.

1. **Vercel**: Add New → Project → import `raghavch2025/rdfasion` → Deploy. This first deploy has no database yet; that's expected.
2. **Database**, pick one:
   - **From Vercel (easiest):** in the Vercel project, **Storage → Create Database → Supabase**, choose region **Mumbai (ap-south-1)**, and connect it to the project. This creates the Supabase project and sets `POSTGRES_URL_NON_POOLING`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`, which the site reads directly. Do every later Supabase setting (phone login) in this project, opened from Vercel's Storage tab.
   - **An existing supabase.com project:** add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API keys; older projects' `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` work too) and `DATABASE_URL` (Supabase → **Connect** → **Session pooler**, password filled in) under Vercel → Settings → Environment Variables.
3. **Redeploy** (Deployments → ⋯ → Redeploy). The build log shows `[migrate] ... database is up to date`, and the site is live at the project's `.vercel.app` link.
4. **Check** `https://<site>/api/health`: it lists which settings the deploy sees (names only, never values) and whether the database answers. `"ok": true` means the shop is ready.

Optional variables:
- `NEXT_PUBLIC_SITE_URL`: only once a custom domain such as rdfashion.in is attached. Until then, the Vercel production domain is used.
- `NEXT_PUBLIC_IMAGE_TRANSFORM=on`: on Supabase Pro, serves resized WebP images. Without it, images are served as uploaded.
- `CRON_SECRET`: turns on the daily retry of stuck AI image jobs.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`): new-order notifications on admin phones.
- `FAL_KEY` and `ANTHROPIC_API_KEY`: AI model images and photo auto-fill.

After the first deploy:
- **Admin login** needs the Phone provider on in Supabase Auth with an SMS provider (Twilio, MessageBird or Textlocal work for India). Leave "time-box user sessions" off so admin phones stay signed in; cookies last 90 days.
- **Settings** (`/admin/settings`): put Raghav's number in `owner_phones` (only owners can change the WhatsApp number and the admin list). Add shop hours and the Google rating, and base-model photos for try-on.
- **The first design** (raglan full sleeve tee, 5 colours, photos in `public/seed/`) has a placeholder price of ₹300; set the real price in `/admin/products`.
- **Links**: bio `https://<site>/?s=bio`; reels use the link from each design's share box.

Running the SQL by hand instead (Supabase SQL editor): paste each migration file whole (about 250 and 200 lines), click once in the editor so nothing is highlighted (the button must say **Run**, not **Run selected**), then run. The files are safe to run again, and `scripts/migrate.mjs` also finishes a half-done manual setup.

## New designs from WhatsApp (Papa)

Papa never needs to log in. Two ways in; both end in the same place.

**1. Upload link** — `https://<site>/u/<UPLOAD_TOKEN>` (set `UPLOAD_TOKEN` in Vercel to 16+ random characters; admins see the link in `/admin/settings`).
- Tap **Photos chunein**, pick the photos from WhatsApp or the gallery (all colours of a design, several designs at once), optionally type one rate, tap **Upload**.
- Add it to the home screen once (Chrome menu → Add to Home screen). After that, in WhatsApp: select photos → Share → **RD Upload**. The photos go straight in. (Android + Chrome only; iPhone uses the button.)

**2. WhatsApp number** — Papa sends the photos to the shop's WhatsApp Business number, optionally "rate 300", then **done**. He gets a reply listing the designs made and the link to publish. Setup (once):
1. developers.facebook.com → create an app → add **WhatsApp**. The free test number works right away for up to 5 numbers: add Papa's and Bhaiya's numbers as recipients.
2. WhatsApp → Configuration → Callback URL `https://<site>/api/whatsapp`, Verify token = your `WHATSAPP_VERIFY_TOKEN` → Verify and save → Webhook fields → subscribe **messages**.
3. Business Settings → System users → create one, give it the app and the WhatsApp account, generate a token that **never expires** with `whatsapp_business_messaging` → `WHATSAPP_TOKEN`. (The token on the API Setup page dies within 24 hours.)
4. App settings → Basic → App secret → `WHATSAPP_APP_SECRET`. Switch the app to **Live** mode.
5. Only numbers in `admin_phones` / `owner_phones` are accepted.

**What happens to the photos**
- Claude (`ANTHROPIC_API_KEY`) looks at the new photos next to the current catalogue: the same design in different colours becomes one design with colour options; a new colour of an existing design is added to it; different designs become separate drafts. Without the key, each photo becomes its own draft to rename.
- **One model everywhere:** with `FAL_KEY` set, every photo is redone by virtual try-on on the same base model (the first photo under Base model in `/admin/settings`; by default the model already in the shop's catalogue photos). That includes photos that already show a different model, so the whole catalogue looks like one shoot. Without `FAL_KEY` the shop's photos are used as they are. A single photo showing many colours (flat-lay) cannot go through try-on; upload one photo per colour to get model images for it.
- On the upload link Papa checks each colour's photo (**Theek hai** / **Asli photo** / **Dobara AI**), types the **wholesale rate**, minimum pieces and sizes, and taps **Publish**. Designs already listed with shop photos get an **AI model photo banayein** button once AI is set up.

## How orders stay safe

- `place_order` (Postgres function, service role only) re-checks availability, sizes, sold-out flags and the 6-piece MOQ, copies prices, upserts the buyer by phone and writes order + items in one transaction. It also enforces 10 orders per phone per hour.
- The order row exists before the browser is sent to `wa.me`. If WhatsApp does not open (Instagram webview), the buyer sees the message with Copy and Call.
- A failed submit retries silently twice, then shows the message with Copy, Call and WhatsApp.
- Anonymous users can read only live designs, their approved colours and the public settings row. Orders are read by code on the server only.

## Test results (local Supabase stack, Chromium at 360 px, Instagram in-app user agent)

All PRD acceptance tests that can run without a real phone passed, including:
- catalogue loads in the Instagram UA with no horizontal scroll
- Add to cart blocked at 5 pieces, allowed at 6
- 9-digit mobile rejected; 10 digits saves and opens `wa.me/919313877748` with the exact PRD message
- a killed WhatsApp redirect still leaves the order in `/admin` as New
- admin OTP login, inbox with unread badge, Call (`tel:`), mark Confirmed with a final rate
- publishing a design from one photo puts it at the top of the catalogue
- marking a colour sold out removes it from the product page on refresh
- server-side MOQ, rate limit, Hindi toggle, checkout prefill, cart surviving refresh

Not tested here: real phones and the real Instagram app, SMS delivery, fal and Claude calls (no API keys in this environment; that code is type-checked and falls back to "Use original photo"), Web Push delivery.

## Open questions from the PRD (current assumptions)

MOQ is 6 per design-colour with free size mix; prices are public; sizes default to M–XXL for every category (editable per category in settings); orders go to 9313877748 only; no advance rule on the order page.
