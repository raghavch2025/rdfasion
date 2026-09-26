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

1. **Supabase project**: `npx supabase link` then `npx supabase db push`, and run `supabase/seed.sql` once (it upserts settings and 3 sample designs; delete the samples from `/admin/products` or leave them hidden).
2. **Phone login**: enable the Phone provider in Supabase Auth with an SMS provider (Twilio, MessageBird or Textlocal work for India). Leave "time-box user sessions" off so admin phones stay signed in; cookies last 90 days.
3. **Settings to fill** (in `/admin/settings` or the `settings` table):
   - `owner_phones`: Raghav's number. Only owner numbers can change the WhatsApp number and the admin list.
   - `admin_phones`: already 9313877748 and 9643195625.
   - Shop hours and Google rating (the PRD could not read the Google listing).
   - Base-model photos: two poses, used for every try-on.
4. **Vercel**: region `bom1` is set in `vercel.json`. Add the env vars from `.env.example`.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: create them with `npx web-push generate-vapid-keys`. The public key needs the `NEXT_PUBLIC_` prefix because the browser subscribes with it.
   - Image resizing uses Supabase image transformation (Pro plan). On the free plan, set `NEXT_PUBLIC_IMAGE_TRANSFORM=off`.
   - The cron runs daily, the most Vercel Hobby allows. That is enough because fal webhooks and the admin page's polling finish jobs; on Pro you can make it every 5 minutes.
5. **Links**: bio `https://rdfashion.in/?s=bio`; reels use the link from the design's share box (`/p/<slug>?s=reel&r=<slug>`).

## How orders stay safe

- `place_order` (Postgres function, service role only) re-checks availability, sizes, sold-out flags and the 6-piece MOQ, copies prices, upserts the buyer by phone and writes order + items in one transaction. It also enforces 10 orders per phone per hour.
- The order row exists before the browser is sent to `wa.me`. If WhatsApp does not open (Instagram webview), the buyer sees the message with Copy and Call.
- A failed submit retries silently twice, then shows the message with Copy, Call and WhatsApp.
- Anonymous users can read only live designs, their approved colours and the public settings row. Orders are read by code on the server only.

## Test results (local Supabase stack, Chromium at 360 px, Instagram in-app user agent)

All PRD acceptance tests that can run without a real phone passed (34 checks), including:
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
