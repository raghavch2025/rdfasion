# RD Fashion Wholesale Ordering Website — PRD

Sep 26, 2026 · @Raghav

## Overview

A mobile-first wholesale catalogue and order-request website for RD Fashion (Instagram: @fashionlitigation). Retailers open a plain website link from an Instagram reel or the bio (nothing to download or install), browse the current collection on their phone, pick colours and sizes at the 6-piece minimum, and send the order to Papa's WhatsApp in one tap. Papa or Bhaiya publish a new design by uploading one photo; the app generates model images in every colour, and they only confirm sizes and price.

No online payment in v1. Every order lands as a structured WhatsApp message on the business number plus a row in an orders dashboard, and the deal is closed on a call, exactly as it is closed today.

Stack: Next.js on Vercel, Supabase (Postgres, Auth, Storage), a hosted image-generation API for model images, WhatsApp click-to-chat in v1 and WhatsApp Cloud API in v2.

## Business context

RD Fashion is a 25-year-old men's wholesale garment manufacturer and trader on Tank Road, Karol Bagh, with its own production. Categories today: t-shirts, lowers (track pants) and cargos.

| Item | Detail |
| --- | --- |
| Shop | 16/152, Upper Ground Floor, Madan Complex, Main Tank Road, Karol Bagh, Delhi 110005 |
| Business number (orders land here) | 9313877748 |
| Second number | 9643195625 |
| Instagram | [@fashionlitigation](https://www.instagram.com/fashionlitigation) — 22 posts, 419 followers on 26 Sep 2026; reels shot in the shop are getting traction |
| Who runs it | Papa and Bhaiya, full time, no technical staff; Raghav builds on the side |
| Customers | Small retailers from tier-2/3 towns; today they DM or call and the deal closes on the phone |
| Pricing | Wholesale ₹250–500 per piece; bulk MOQ 300+ pieces stays offline |
| What this app sells | The new small-lot tier: minimum 6 pieces per design-colour |
| Existing tech | AutoReel — WhatsApp photo → AI model image → Reel pipeline on Vercel/Supabase; its image step is reused here |

Today the only conversion path from a reel is the bio link or a DM, and every order is typed out by hand on WhatsApp. The website replaces that with a catalogue the customer can order from, and a structured message Papa can close on.

The Google Business listing link could not be opened (Google blocks automated access); shop hours and rating should be added to the site footer from the listing.

## Goals and success metrics

The website has one job: turn reel views into order requests on Papa's phone with as few taps as possible, without adding any work for Papa or Bhaiya.

| Goal | Metric | Target for the first 90 days |
| --- | --- | --- |
| Convert reel traction into orders | Order requests submitted per week | 25 per week by day 90 |
| Keep the buyer journey short | Taps from catalogue open to WhatsApp send | 6 or fewer |
| Keep the buyer journey fast | Catalogue open → order sent (median) | Under 3 minutes |
| No lost leads | Order requests that reach WhatsApp and the dashboard | 100% (order saved before the WhatsApp redirect) |
| Zero-effort cataloguing | Time from photo upload to published design | Under 5 minutes, one person, on a phone |
| Orders are real | Order requests Papa converts on the call | 40% or more |
| Reach the customer's device | Sessions on Android phones that load in under 3 s on 4G | 90% |

Non-goals for v1: online payment, courier integration, GST invoicing, buyer accounts, the 300+ piece bulk business, retail (single-piece) sales.

## Users

Two user types, both on phones, both non-technical. Design every screen for the weakest device and the busiest hands.

**Buyer — small retailer from a tier-2/3 town.** Arrives from a reel, often mid-day in his own shop. Android phone (₹8–15k range), Chrome, 4G that drops to 3G, Hindi or Hinglish. Lives on WhatsApp; will not install an app, create an account or read a form. Thinks in pieces, colours and sizes, and wants the per-piece price before anything else. Will call if confused, so a phone number must always be one tap away.

**Owner-admin — Papa and Bhaiya.** Papa closes deals on the phone; Bhaiya shoots the reels and handles the shop floor. Both use a phone, not a laptop. They will upload a photo from the gallery or camera, tap through a few choices, and expect the design to be live. Anything that takes more than three screens or needs typing beyond a name and a price will not get done. Raghav is a third admin for setup and fixes.

| Need | Buyer | Owner-admin |
| --- | --- | --- |
| Language | Hinglish labels, Hindi optional | Hinglish labels |
| Login | None to browse or order; phone number at checkout | Phone OTP via Supabase Auth |
| Device | Android, Chrome, opened from a link; nothing to install | Android/iPhone, mobile browser |
| Primary action | Send order on WhatsApp | Publish a design; call a buyer |
| Tolerance for typing | Name, shop, city, phone only | Name, price, and taps |

## Scope

v1 is a catalogue, a cart with a 6-piece rule, and a WhatsApp handoff. Everything that needs money, logistics or accounts waits.

**In scope (v1)**

- Public catalogue at a short domain (e.g. rdfashion.in), linked from the Instagram bio and every reel caption
- Product page with model images per colour, size grid, per-piece price, MOQ rule, and a size-wise quantity picker
- Cart that enforces minimum 6 pieces per design-colour and shows total pieces and total amount
- Checkout that asks only name, shop name, city, phone; then one tap opens WhatsApp with the order pre-filled to 9313877748
- Order saved in Supabase before the WhatsApp redirect, with a short order code (e.g. RD-1042) in the message
- Admin: upload photo → AI model images in all colours → approve → set sizes and price → publish; edit, hide, sold-out
- Admin: orders inbox with status, one-tap call and one-tap WhatsApp to the buyer
- Hinglish UI, Hindi toggle for buyer-facing text
- Basic analytics: reel/bio source, product views, add-to-cart, WhatsApp sends

**Out of scope (v1)**

- Online payment, advance collection, or price negotiation in-app
- Courier booking, tracking, or shipping charges
- Buyer accounts, saved carts across devices, order history for buyers
- GST invoice generation (a later phase)
- Bulk (300+ piece) pricing tiers
- Automated WhatsApp replies or chatbots
- Multi-seller or marketplace features
- Native apps and "add to home screen" prompts: it is a website opened from a link, nothing to download

## Buyer journey

Six taps from a reel to an order on Papa's phone: catalogue, product, cart, checkout, send. No login, no app install, no reading.

_Diagram: buyer journey · 6 steps, 1 decision, 1 loop (see the PRD doc)._

The cart will not let the buyer send until every design-colour line has 6 or more pieces; the order is saved first, so a lost WhatsApp redirect still leaves a lead in the inbox.

| Screen | What the buyer sees | Rules |
| --- | --- | --- |
| Catalogue `/` | Grid of live designs, 2 per row: model image, name, ₹ per piece, "Min 6 pcs" tag. Filter chips: T-shirts, Lowers, Cargos, New. Sticky bottom bar with Cart and "Call karein" | Newest first; hidden and sold-out designs excluded; thumbnails as WebP under 60 KB |
| Product `/p/[slug]` | Full-width model image, colour swatches (tap swaps the image), fabric and GSM line, ₹ per piece, size grid M/L/XL/XXL with + and − per size, running total "8 pcs · ₹2,400", "Cart mein daalein" | Button disabled under 6 pieces in the chosen colour, with the text "Kam se kam 6 piece chahiye"; sizes an admin marked out of stock are greyed |
| Cart `/cart` | One row per design-colour with its size breakdown and line total, inline + and −, total pieces and total ₹, "Order bhejein" | Send blocked while any line is under 6 pieces; no tax or shipping lines; cart kept in localStorage |
| Checkout `/checkout` | Four fields: naam, dukaan ka naam, sheher, mobile. Pre-filled from the last order on this phone | Mobile must be 10 digits; all four required; no OTP in v1 |
| Send | Order written to Supabase, code RD-1042 returned, WhatsApp opens on 9313877748 with the message pre-filled | If WhatsApp does not open (in-app browser, no WhatsApp), show the message with Copy and Call buttons |
| Order `/o/RD-1042` | Read-only order page linked from the WhatsApp message: items, sizes, totals, status | No login; anyone with the code can view; status updates as Papa changes it |

A "Call karein" button that dials 9313877748 sits on every buyer screen, because a confused retailer will call before he will read.

## Owner journey

Papa or Bhaiya publish a design in under 5 minutes from a phone: photo, three taps, price, publish. Everything else has a sensible default.

1. **Upload.** Open `/admin/new`, tap the camera or gallery, pick one photo of the garment (flat, on a hanger, or on a mannequin). Optional: more photos, one per colour if the colours already exist physically.
2. **Auto-detect.** The site names the item (e.g. "Boxy fit henley t-shirt"), guesses the category, detects the garment's colour in the photo, and suggests the shop's standard colour list. All of this is editable; none of it must be typed.
3. **Pick colours.** Tap the colours this design is available in from the standard palette (black, white, navy, grey melange, olive, maroon, mustard, and so on, maintained in `/admin/settings`). Add a custom colour by name if needed.
4. **Generate.** One tap starts model-image generation for every selected colour. Progress shows per colour; generation runs in the background, so the admin can leave the page.
5. **Approve.** Each colour shows the generated image next to the original photo with Approve, Retry and Use original photo. A design cannot go live with an unapproved colour.
6. **Sizes and price.** Size set defaults to M, L, XL, XXL (editable per category), price per piece in rupees, MOQ defaults to 6 pieces per colour, fabric and GSM as free text.
7. **Publish.** The design appears at the top of the catalogue. A share sheet offers the product link and a caption ready to paste under the reel.

| Admin screen | Purpose | Key actions |
| --- | --- | --- |
| `/admin` | Orders inbox, newest first, with unread count | Filter by status; tap a row to open |
| `/admin/orders/[code]` | One order: buyer, items, totals, status | Call, WhatsApp, change status, add a note (e.g. "final rate 240") |
| `/admin/new` | The 7-step publish flow above | Upload, generate, approve, publish |
| `/admin/products` | All designs with live, hidden and sold-out state | Edit price, mark colour or size sold out, hide, reorder |
| `/admin/settings` | Shop details, standard colour palette, size sets per category, WhatsApp number | Edit; Raghav only for the WhatsApp number |

Admin login is phone OTP through Supabase Auth, limited to three numbers: 9313877748, 9643195625 and Raghav's. Sessions last 90 days on a trusted phone.

## AI catalogue generation

Use virtual try-on (garment photo + a fixed base-model photo → composite), not text-to-image: the buyer must see the exact print, collar and fit he will receive. Run it on fal.ai, where every try-on model sits behind one SDK and switching models is a one-line endpoint change ([fal virtual try-on APIs](https://fal.ai/explore/virtual-try-on-apis)).

**Pipeline (runs server-side, per design)**

1. Original photo → client-side resize to 1600 px, upload to Supabase Storage `originals/{product_id}/`.
2. Claude vision call on the photo → JSON: suggested name, category (tshirt / lower / cargo), detected colour, fit words (boxy, regular), print type (solid / print / stripe). Pre-fills the form; admin edits.
3. Garment image per colour: a real photo of that colour if uploaded, else the original recoloured by an image-edit model with the prompt "same garment, same print, colour {colour}". Solids recolour reliably; multi-colour prints do not, so the site flags print designs and asks for a real photo per colour.
4. Try-on: garment image + base-model image → model image. Base models: two poses (front, three-quarter), Indian male, plain studio background, generated once by Raghav and stored in `models/`. Same models on every product, so the catalogue looks like one brand.
5. Output stored at `generated/{product_id}/{colour}.webp` (864×1296) plus a 400 px thumbnail; row status `pending_approval`.
6. Jobs run in a queue (Supabase table + Vercel cron or fal webhook); the admin page polls and shows per-colour progress. Retry re-runs with a new seed; "Use original photo" is always available.

| Endpoint on fal | Input | Output | Cost per image | Use |
| --- | --- | --- | --- | --- |
| [fal-ai/fashn/tryon/v1.6](https://fal.ai/models/fal-ai/fashn/tryon/v1.6) | model image + garment (flat-lay or on-model) | 864×1296 | about $0.075 | Default: renders prints and text accurately, accepts flat-lay shop photos |
| [fal-ai/kling/v1-5/kolors-virtual-try-on](https://fal.ai/models/fal-ai/kling/v1-5/kolors-virtual-try-on) | person + garment | one composite | $0.07 | Fallback when FASHN output fails approval; keeps pose and skin tone |
| [fal-ai/flux-pro/v1/vto](https://fal.ai/models/fal-ai/flux-pro/v1/vto) | person + garment + styling prompt | 768×1024 | per fal pricing | Only when a styling instruction is needed (tucked, sleeves rolled) |
| Image-edit model for recolour (FLUX Kontext or Gemini image edit on fal) | garment photo + prompt | edited photo | per fal pricing | Colour variants when no physical sample exists |

At six colours and two attempts each, a design costs under $1 in generation, so cost is not a constraint; approval time is. Every generated image needs one tap of approval before it is public, and the original shop photo is always kept as a second image on the product page so a retailer can see the real fabric.

AutoReel already does photo → model image → reel on the same stack; lift its upload, storage and fal-calling code rather than rebuilding it.

## Order handoff to WhatsApp

v1 uses WhatsApp click-to-chat (`https://wa.me/919313877748?text=...`): free, no Meta approval, no template review, and it puts the order in the same chat where Papa closes deals today. The order is written to Supabase before the redirect, so the dashboard has the lead even if the buyer never presses send.

**Message format (pre-filled, Hinglish, under 1,000 characters)**

```markdown
Order RD-1042 | RD Fashion
Dukaan: Sharma Garments, Rewari
Naam: Rakesh Sharma | 98xxxxxx12

1. Boxy fit henley tee - Olive
   M x2, L x2, XL x2 = 6 pcs @ 260 = 1,560
2. Cargo jogger - Black
   L x3, XL x3 = 6 pcs @ 480 = 2,880

Total: 12 pcs | Rs 4,440
Order dekhein: rdfashion.in/o/RD-1042
```

**Rules**

- Order code: `RD-` plus a sequence starting at 1001; short enough to read out on a call.
- Prices in the message are the catalogue price; Papa records the final negotiated rate on the order in the admin pages, so the dashboard reflects the real deal.
- The buyer's phone opens WhatsApp with the message ready; he presses send. If the page is inside Instagram's in-app browser and WhatsApp does not open, show the message with a Copy button and a Call button.
- The admin inbox also shows a browser notification (Web Push) and a badge on new orders, so Papa is not dependent on noticing a WhatsApp message.

**Order statuses**

| Status | Set by | Meaning |
| --- | --- | --- |
| New | App | Saved at checkout, not yet contacted |
| Contacted | Papa | Call made or reply sent |
| Confirmed | Papa | Rate and quantity agreed; final rate and advance noted |
| Dispatched | Papa or Bhaiya | Parcel sent; transport name and LR number optional |
| Cancelled | Papa | With a one-word reason (no reply, price, out of stock) |

**v2 (after 50 orders):** WhatsApp Cloud API so the order also reaches Papa's phone automatically as a business message with buttons (Call buyer, Mark confirmed), and buyers get a status update when Papa marks Dispatched. This needs a Meta Business verification for RD Fashion and approved message templates; start the verification in phase 2 because it takes weeks.

## Data model (Supabase Postgres)

Eight tables. A product has colours; a colour has images and per-size stock flags; an order has items keyed by product, colour and size.

| Table | Key columns | Notes |
| --- | --- | --- |
| `products` | id, slug, name, category (tshirt / lower / cargo), fabric, gsm, price\_per\_piece (int, ₹), moq\_pieces (default 6), size\_set (text\[\]), status (draft / live / hidden / sold\_out), sort\_order, created\_by, created\_at | One row per design |
| `product_colors` | id, product\_id, color\_name, color\_hex, source (photo / recolour), approved\_image\_path, thumb\_path, status (pending / approved / sold\_out), sold\_out\_sizes (text\[\]) | One row per design-colour |
| `product_images` | id, product\_id, color\_id (nullable), kind (original / recolour / tryon), storage\_path, provider, provider\_request\_id, seed, status (queued / running / pending\_approval / approved / rejected / failed), error, created\_at | Full history of every generated image |
| `generation_jobs` | id, product\_id, color\_id, step (recolour / tryon), status, attempts, payload (jsonb), started\_at, finished\_at | Queue for background generation |
| `buyers` | id, phone (unique), name, shop\_name, city, first\_seen\_at, last\_order\_at, order\_count | Upserted on every checkout by phone |
| `orders` | id, code (RD-1042, unique), buyer\_id, status, total\_pieces, total\_amount, final\_amount (nullable), advance\_amount (nullable), note, source (reel / bio / direct / share), utm (jsonb), whatsapp\_opened (bool), created\_at, updated\_at | Totals denormalised for the inbox |
| `order_items` | id, order\_id, product\_id, color\_id, size, qty, price\_per\_piece | Price copied at order time so later edits do not change history |
| `settings` | key, value (jsonb) | Shop name, WhatsApp number, colour palette, size sets per category, admin phone list |

**Access rules (Row Level Security)**

- Anonymous: read `products`, `product_colors`, `settings.public`; insert into `buyers`, `orders`, `order_items` through one server action that validates the MOQ; read `orders` only by code through an API route.
- Admin (phone in `settings.admin_phones`): full read and write on everything.
- Storage: bucket `catalog` public-read for approved images; bucket `originals` private, served through signed URLs on the admin side only.

**Indexes:** `orders(status, created_at desc)`, `orders(code)`, `buyers(phone)`, `products(status, sort_order)`, `product_images(product_id, color_id, status)`.

## Tech architecture

One Next.js site on Vercel serves both the buyer pages and `/admin`; Supabase holds data, auth and images; fal.ai and the Claude API are called only from server code.

| Layer | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js 15 (App Router, TypeScript), Server Actions for writes | One deploy, SSR for fast first paint on slow phones |
| Hosting | Vercel, Mumbai (bom1) region | Lowest latency for Indian buyers |
| Database | Supabase Postgres with RLS | Already used for AutoReel |
| Auth | Supabase Auth phone OTP, admin phones only | No passwords for Papa and Bhaiya |
| Storage | Supabase Storage, buckets `originals` (private) and `catalog` (public) | Signed URLs for originals |
| Images on the site | `next/image` with Supabase transform (WebP, 400 px and 900 px) | Keeps the catalogue under 300 KB per screen |
| AI images | fal.ai via `@fal-ai/client`, called from a Route Handler; results by webhook into `generation_jobs` | Async, no serverless timeout risk |
| Product auto-fill | Claude API vision call on the original photo, JSON output | Name, category, colour, print type |
| Styling | Tailwind CSS, shadcn/ui, 44 px minimum tap targets | Fast to build, consistent on Android |
| Analytics | Vercel Analytics plus a `events` table for funnel steps | Free tier is enough |
| Notifications | Web Push (VAPID) to admin phones on new order | Papa sees the badge even if WhatsApp is noisy |
| Cart state | localStorage on the buyer's phone | No account needed |

**Environment variables**

```markdown
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
FAL_KEY
ANTHROPIC_API_KEY
WHATSAPP_NUMBER=919313877748
NEXT_PUBLIC_SITE_URL=https://rdfashion.in
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
CRON_SECRET
```

**Route map**

- Buyer: `/`, `/p/[slug]`, `/cart`, `/checkout`, `/o/[code]`
- Admin: `/admin`, `/admin/orders/[code]`, `/admin/new`, `/admin/products`, `/admin/products/[id]`, `/admin/settings`, `/admin/login`
- API: `/api/orders` (POST, validates MOQ, returns code and wa.me URL), `/api/generate` (POST, admin), `/api/fal/webhook` (POST, verifies signature), `/api/cron/jobs` (GET, retries stuck jobs)

Secrets never reach the browser; all fal and Claude calls run in Route Handlers or Server Actions.

## Non-functional requirements

Build for a ₹10k Android phone on 3G in a shop with the shutter half down. If it works there, it works everywhere.

- **Speed:** catalogue first paint under 2 s on a throttled 4G profile; total page weight under 300 KB before images; images lazy-loaded; product page usable within 3 s.
- **Mobile-first:** single-column layout, 44 px tap targets, thumb-reachable primary button fixed at the bottom, no hover states, no modals that need a close-button hunt.
- **Language:** Hinglish by default ("Order bhejein", "Kam se kam 6 piece"), a Hindi (Devanagari) toggle for buyer screens, English for admin settings only. All strings in one `strings.ts` file.
- **Numbers:** rupees as ₹ with Indian grouping (₹4,440), pieces as "pcs", per-piece price always visible next to totals.
- **Offline tolerance:** cart survives refresh and app switch; a failed order submit retries silently twice, then shows Call and Copy buttons.
- **In-app browsers:** Instagram and Facebook webviews are the main entry; test wa.me, tel: and the PWA banner inside them on Android and iOS.
- **Accessibility:** contrast 4.5:1, font size 16 px minimum on buyer screens, no text in images.
- **Security:** RLS on every table; MOQ and price validated server-side; rate limit `/api/orders` to 10 per phone per hour; admin phone list is the only allow-list.
- **Reliability:** order write and WhatsApp redirect are two separate steps; the order row exists before the redirect is issued.
- **Cost:** Vercel Hobby or Pro, Supabase Free or Pro, fal pay-per-use; target under ₹3,000 per month at 100 orders and 20 new designs.

## Analytics and tracking from Instagram

Every reel caption and the bio carry a link with a source tag, so the inbox shows which reel produced which order.

- Links: `rdfashion.in/?s=reel&r=henley-olive` (bio: `?s=bio`). The share sheet on publish generates this for each design.
- Funnel events written to an `events` table: `catalogue_view`, `product_view`, `add_to_cart`, `checkout_start`, `order_saved`, `whatsapp_opened`, each with source, product slug, and an anonymous device id in localStorage.
- `/admin/stats`: last 7 and 30 days — visits by source, top 10 designs by views and by pieces ordered, funnel counts, orders by city. No charts library beyond simple bars.
- Vercel Analytics for page speed and device mix; check the Android share and slow-connection share monthly.
- Weekly WhatsApp summary to Raghav (cron, v2): orders, top design, drop-off step.

## Phased build plan

Four phases; each ships something Papa can use. Phase 1 is a working order path with hand-uploaded photos, so traction is captured before AI images exist. Durations are estimates for evenings-and-weekends building with Claude Code.

| Phase | Builds | Done when | Estimate |
| --- | --- | --- | --- |
| 1 · Order path | Supabase schema and RLS; catalogue, product, cart, checkout, order page; wa.me handoff; admin login; orders inbox with statuses; manual product create with uploaded photos | Papa receives a test order on WhatsApp from an Android phone via the Instagram bio link, opens it in the inbox and marks it Confirmed | 2 weeks |
| 2 · AI catalogue | fal try-on pipeline, base-model images, recolour step, approval screen, Claude auto-fill, background jobs and webhook, share sheet with reel caption | Bhaiya publishes a new design from one photo in under 5 minutes, all colours approved, and the design is live in the catalogue | 2 weeks |
| 3 · Polish and traction | Hindi toggle, Web Push to admins, analytics events and `/admin/stats`, source tags on links, sold-out per size, in-app-browser fallbacks tested | 25 real order requests received; catalogue paint under 2 s on throttled 4G; zero orders lost in the inbox | 2 weeks |
| 4 · WhatsApp Cloud API | Meta Business verification, message templates, automated order message to Papa with buttons, dispatch update to buyer, weekly summary | Orders arrive on Papa's phone without the buyer pressing send; buyer gets a Dispatched message | 3 to 6 weeks, mostly waiting on Meta |

Start the Meta Business verification during phase 2; it is the long pole for phase 4.

**Acceptance tests to run on a real phone before each phase closes**

- [ ] Instagram bio link → catalogue loads inside the Instagram in-app browser on Android and iPhone
- [ ] Product page blocks Add to cart at 5 pieces and allows it at 6
- [ ] Checkout with a 9-digit mobile is rejected; with 10 digits it saves and opens WhatsApp with the right message
- [ ] Killing WhatsApp mid-redirect still leaves the order in `/admin` as New
- [ ] Papa can open the inbox, tap Call, and mark Confirmed with a final rate
- [ ] A design with 4 colours generates, is approved, and shows the right image per swatch
- [ ] Marking a colour sold out removes it from the product page within one refresh

## Assumptions and open questions

The PRD assumes the answers in the left column; confirm or correct them before phase 1 starts.

| Assumed | Open question |
| --- | --- |
| MOQ is 6 pieces per design-colour, sizes chosen freely within those 6 | Or is it a fixed size set (e.g. M, L, XL, XXL in a 1-2-2-1 ratio), or 6 pieces per size? |
| Prices are shown publicly on the catalogue | Or shown only after the buyer enters a phone number, to keep rates away from walk-in retail customers and competitors on Tank Road? |
| Size set is M, L, XL, XXL for tees and cargos; lowers may differ | Are there S or 3XL sizes, and do lowers use waist sizes (30/32/34) instead? |
| Standard colour palette of about 10 colours | Send the list Bhaiya uses when he tells customers what is available |
| Orders go to 9313877748 only | Should 9643195625 also get them, or is that Bhaiya's number for a different purpose? |
| Domain: rdfashion.in or fashionlitigation.in | Which name goes on the site, the bio and the reels? |
| Buyers pay by UPI or bank transfer on the call, dispatch by transport | Any deposit rule to state on the order page (e.g. 50% advance)? |
| Base-model images: Indian male, two poses, neutral background | Any preference for age, look, or a real model photo the shop already has rights to? |
| Print designs need a real photo per colour | Roughly what share of new designs are prints vs solids? This sets how much the recolour step matters |
| One catalogue, no buyer login | Would repeat buyers want to reorder from history in v2? |

## Instructions for Claude Code

Export this doc as Markdown, save it as `PRD.md` in the repo root, and start Claude Code with the brief below. Build phase 1 completely before touching phase 2.

```markdown
Read PRD.md fully before writing code. Build the RD Fashion wholesale ordering website described there. It is a plain website opened from a link: no native app, no install prompt.

Stack: Next.js 15 App Router + TypeScript, Tailwind + shadcn/ui, Supabase (Postgres, Auth phone OTP, Storage), deployed on Vercel bom1. AI images via @fal-ai/client (fal-ai/fashn/tryon/v1.6 default), product auto-fill via the Anthropic SDK. Secrets only in server code.

Work in this order and stop for review after each step:
1. supabase/migrations: the 8 tables in "Data model", RLS policies, indexes, seed with 3 sample products.
2. Buyer routes /, /p/[slug], /cart, /checkout, /o/[code] - mobile-only layout, Hinglish strings in strings.ts, MOQ of 6 per design-colour enforced client- and server-side.
3. POST /api/orders: validate, upsert buyer by phone, write order + items, return code and the wa.me URL built from the message format in "Order handoff to WhatsApp".
4. /admin login (phone OTP, allow-list from settings), orders inbox, order detail with Call, WhatsApp, status, final rate.
5. /admin/new with manual photo upload and publish (no AI yet), /admin/products, /admin/settings.
6. Only then: generation_jobs queue, fal webhook, recolour + try-on, approval UI, Claude auto-fill.

Rules: no feature not in PRD.md; every buyer screen must work at 360 px width in Chrome on Android; run the acceptance tests in "Phased build plan" and report results; ask before adding any dependency beyond those named.
```

**Design direction for Claude Code:** keep the catalogue as plain as a WhatsApp catalogue with better photos — white background, large images, one accent colour matching the Fashion Litigation logo red, no carousels, no animations.

**Repo layout**

```markdown
app/            buyer routes, admin routes, api
components/     ui (shadcn), buyer, admin
lib/            supabase clients, fal, anthropic, whatsapp message builder, moq
supabase/       migrations, seed
strings.ts      all Hinglish / Hindi / English strings
PRD.md          this document
```
