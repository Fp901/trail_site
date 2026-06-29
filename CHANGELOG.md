# Changelog — The Rooiberg Wander

Build progress against the CLAUDE.md **Part 6 build order**. One entry per step; every step
passes `npm run verify` (astro check + build + `npm audit --audit-level=high`) before it is
marked done. Dates are the working dates.

> Standing placeholders (all steps): real photography (hero + 3 sanctuary images),
> verbatim privacy + refund/cancellation text, production domain, `og-default.jpg`,
> `llms.txt` (deferred to a content step). Resolved decisions live in CLAUDE.md / memory.

---

## Owner update: contact, max-12, launch offer, wildlife, seasons, kit list — 2026-06-29
- **Contact (Hanlie):** new email `hanlie@rooibergwander.co.za`; WhatsApp +27 82 905 8832 with
  click-to-chat; office hours 08h00 to 17h00. Added a header WhatsApp link, a footer contact block,
  a mobile-menu contact block, and a site-wide floating WhatsApp button. Data in `site.ts.contact`.
- **Header:** larger brand wordmark + tagline "A Luxury Slackpack Self-Catering Walking Safari".
- **Max 12 guests** (was 10) swept across copy, RatesTable, BookingWidget, the createCheckout action
  (`max(12)`), and the DB check constraint (`group_size between 1 and 12`).
- **Launch offer:** trail launches 1 October 2026 with a 50% Launch-Phase discount. Banner on Home +
  Rates; RatesTable shows the discounted price (with the standard price struck through). DISPLAY-only
  for now — server price authority (`lib/pricing.ts`) still computes the full total (flagged).
- **Wildlife & birding** section on The Trail (built from the owner's "Species on RoiSan.xlsx":
  168 birds, 66 mammals) — curated groups + birding highlights; full lists "on request".
- **When to walk** (Waterberg seasons) + **What to pack** (kit list) sections on Logistics.
- **Lodges:** amenities now include Ice, Wood, Bedding; FAQ "what are the camps like" updated
  (2-person suites, ice machine, wood). Home "sleep somewhere new" now reads "a camp fire".
- **Domain:** `public/CNAME` → www.rooibergwander.co.za (primary); removed placeholder comments.
- Files: data/{site,rates,logistics,sanctuaries,wildlife,schema}.ts; components/{Nav,Footer,
  MobileMenu,RatesTable,WhatsAppIcon}.astro; layouts/Layout.astro; pages/{index,the-trail,
  logistics,rates,sanctuaries}.astro; actions/index.ts; styles/global.css; public/{CNAME,llms.txt};
  supabase/migrations/0001_init.sql. `npm run check` 0 errors; build green.

## Copy edit: de-dash + de-AI across all user-facing text — 2026-06-21
- Removed every em-dash/en-dash from visible copy (rephrased, didn't just swap commas);
  page-title separators changed to "|". Cut AI tells (seamless, "premium trail standard",
  "Discover", purple phrasing like "enveloped by tranquillity"/"sweeping vistas"/"ultimate
  setting"). Marketing section headings turned from questions into statements (FAQ keeps real
  Q&A). Facts/prices/names/structure unchanged. Built HTML + llms.txt verified 0 dashes.
- Files: data/{site,itinerary,sanctuaries,logistics,policies}.ts; components/{RouteMap,
  BookingWidget}.astro; pages/{index,the-trail,sanctuaries,logistics,rates,404,privacy,
  booking/confirm,booking/cancel}.astro; public/llms.txt.

## Typography → Fraunces + Inter; hero mobile contrast — 2026-06-20
- **Fonts:** display face Playfair → **Fraunces** (self-hosted via Fontsource `full.css` = opsz +
  wght + SOFT + WONK axes); Inter kept for body/UI. Kept self-hosting (project already self-hosts
  + CLAUDE.md forbids CDN webfonts; user's instruction permitted self-host) — **no Google CDN
  link**. Updated `@theme` tokens (`--font-display`/`--font-body`); all components already use the
  tokens. Heading tuning: weight 600, line-height 1.1, letter-spacing -0.015em,
  `font-optical-sizing: auto`, `font-variation-settings: "SOFT" 25, "WONK" 0`. Body line-height
  1.55. Tabular figures on prices/stats/day numbers/dates. Removed `@fontsource/playfair-display`.
- **Hero mobile contrast:** stronger/taller bottom scrim on ≤640px, subtle text-shadow on hero
  text, and content nudged lower (pb-12 on mobile) so the H1 sits over the darker zone, not the sky.

## Client copy edits + elevation profiles — 2026-06-22
- Applied the edited-copy doc (round-tripped by `ref:` codes): terminology (wilderness guides →
  trail guides; sanctuaries/reserve → safari lodges/trail in several spots; braai → barbeque in
  a few); distances (Day 2 ~15 km, Day 3 ~20 km, Day 4 ~18 km; ~55 km total); richer Day 2/3
  wording; foreign-rate note expanded; removed 3 route landmarks. Two small fixes flagged to
  client (em-dash → comma in Day 2; "pro rated" → "pro-rated"). "The S" teaser title treated as
  an incomplete edit and left as "The Sanctuaries".
- **Elevation profiles:** added Day 2/3/4 route height profiles (client PNGs, cropped) into each
  DayCard with alt text + caption; removed the "coming soon" note.
- Flagged consistency gaps for client decision. **Sweep then done per client:** all visible
  "sanctuary/sanctuaries" → "safari lodges/lodges" (nav + mobile menu label, page meta + breadcrumb,
  role labels, image alts, FAQs, llms.txt; /sanctuaries URL kept); "wilderness guides" → "trail
  guides" everywhere; "braai" → "barbeque" everywhere; distances aligned to 15–20 km/day, ~55 km
  total in all spots (incl. FAQ + meta + schema); teaser logic fixed. verify green.

## StatsBar divider fix — 2026-06-20
- StatsBar dividers switched from the `gap:1px` + background trick (which dropped the first
  divider at some widths due to subpixel rounding) to reliable per-item borders.

## Content + SEO + pricing overhaul (2026 brief) — 2026-06-20
Client supplied richer copy + photos; applied throughout. Client confirmed 3 overrides of
CLAUDE.md: price, route status, spelling.
- **Pricing (override):** public rates now **R60,000 / R72,000 incl. VAT** (was R62,100/R74,520;
  reverses the old "never show R60k" rule). `rates.ts` is now inclusive-total-first; `pricing.ts`
  charges the inclusive total; `RatesTable` shows total + "incl. VAT" + VAT portion (no net split).
  Offer schema → 60000/72000.
- **Route status (override):** removed the "purely conceptual" notice everywhere (RouteMap
  title/desc/caption, Trail blurb, Logistics, llms.txt) — trail presented as operational.
- **Spelling (override):** VierVanAcht → **ViervanAcht** everywhere.
- **Facts:** terrain 8,000 → **15,000 ha**; added malaria-free, ~2.5 h from Joburg,
  Groenkop/Elandsberg/Marakele/L-Kloof/Welgedacht Donga/Sand River, ~60 km total, grading
  (moderate–challenging), amenities (pool/braai/WiFi/equipped kitchen/fridge/safe water);
  **corrected email** to ...rooibergwander...
- **Content/SEO:** richer day-by-day itinerary; Sanctuaries amenities + character; Logistics
  catering/safety + new **grading** block + **9-item FAQ** (malaria, fitness, location, camps…);
  Home expanded Promise + "how is it different" 3-up; new question-style H2s; per-page meta +
  llms.txt + schema refreshed. `site.ts` gained region/driveFromJoburg/quickFacts.
- One `<h1>`/page; verify green (42 files). See "decisions confirmed" below.

## Real photography (part 1) + content update incoming — 2026-06-20
- Client supplied 13 photos + richer copy. Processed photos → `src/assets/images/` (TIFFs
  converted, downscaled, SEO filenames) via sharp; generated `public/images/og-default.jpg`.
- Wired: Home **hero** (golden-hour mountains, eager LCP) + the **3 sanctuary** images
  (Rotavi valley / Oukraal kudu-bush / VierVanAcht giraffe-sunset). astro:assets emits
  responsive AVIF/WebP. verify green.
- Skipped: MTB-biker photo (off-message for a walking trail), camera-trap leopard (timestamp
  overlay), Picture6 (dup of Picture1). Remaining (lion, vista, storm, panorama, sunset-tree)
  queued for Trail/Logistics/Home bands in the content pass.
- PENDING DECISIONS before content/SEO expansion (see below) — client's new copy conflicts with
  CLAUDE.md on price (R60k vs R62,100 + the "never show R60k" rule), terrain (15,000 vs 8,000 ha),
  and the "conceptual route" notice. Awaiting confirmation.

## GitHub Pages static deploy — 2026-06-18
- `.github/workflows/deploy.yml`: builds the static marketing demo and publishes to Pages.
  GitHub Pages is static-only, so the workflow removes `src/actions`, `src/pages/api`,
  `src/pages/booking` before `BUILD_TARGET=static npm run build` (config drops the adapter →
  `dist/`). `actions/configure-pages` feeds `PAGES_BASE`/`SITE_URL` so user-page (/) and
  project-page (/repo) both work.
- `astro.config.mjs`: `BUILD_TARGET=static` ⇒ no adapter; `PAGES_BASE`/`SITE_URL` env → base/site.
- `withBase()` helper in `site.ts`; applied to all internal links (Nav, MobileMenu, Footer,
  Hero, Home teasers/CTAs, 404, Layout favicon) so subpath deploys don't break. No-op at root.
- Verified: static subpath build (7 pages, base-prefixed links/assets/sitemap) AND the Vercel
  SSR build (42 files, 0 errors) both pass. README "Deploying" section added.
- Booking backend does NOT run on Pages (static) — Rates shows "coming soon"; live booking = Vercel.

## Steps 11–13 — Booking infrastructure + 404 + headers — 2026-06-18
Built so only credentials/secrets remain (everything compiles + builds without them).
- **Adapter:** `@astrojs/vercel` (marketing pages stay prerendered; booking/API routes SSR via
  `prerender = false`). Swap to Netlify = one line. Pinned `path-to-regexp` 6.3.0 via npm
  override to clear a transitive high-severity ReDoS from the adapter (audit gate green).
- **DB:** `supabase/migrations/0001_init.sql` — bookings/inquiries/blocked_dates,
  `unavailable_windows` view, RLS default-deny, daterange overlap exclusion constraint.
- **Libs:** `lib/pricing.ts` (server price authority, cents, reuses rates.ts constants),
  `lib/supabase.ts` (lazy admin/anon clients), `lib/payments.ts` (Paystack via fetch:
  init/verify/HMAC-SHA512 webhook check; processor-abstracted), `lib/email.ts` (Resend seam,
  CRLF-stripped, no-ops without key).
- **Actions:** `src/actions/index.ts` — `createCheckout` (zod, server-recomputed price, hold +
  pending booking, Paystack init → authorization_url) and `createInquiry` (honeypot, store +
  notify). **Webhook:** `src/pages/api/payments/webhook.ts` (raw body, signature verify +
  independent Verify Transaction, idempotent confirm, emails). **Pages:** `booking/confirm` +
  `booking/cancel` (SSR, noindex).
- **UI:** `BookingWidget.astro` + `InquiryForm.astro` (vanilla islands → typed Actions). Rates
  page renders them only when `PUBLIC_SUPABASE_URL` + `PUBLIC_PAYSTACK_PUBLIC_KEY` are set;
  otherwise a calm "coming soon" + enquiry (clean credential-less demo).
- **Config/secrets:** `.env.example` (all vars + decided defaults), `env.d.ts` typed env,
  `.gitignore` (.vercel, .env.local), `README.md` go-live runbook.
- **Step 13:** custom `404.astro`; edge security headers in `vercel.json` (HSTS, nosniff,
  X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP); `public/llms.txt`.
- **Deferred:** strict CSP (origins not active until booking is live + inline-style-attr / View
  Transitions caveat) — directives ready in CLAUDE.md §11.2. Live Paystack/Supabase/Resend
  test pending credentials.
- Verified: 42 files, 0 errors; Vercel output = 6 static marketing pages + SSR function for
  booking/api; demo rates page lean (no action JS); sitemap excludes api/booking/privacy.

## Step 10 — Rates — 2026-06-18
- `src/data/rates.ts`: VAT-inclusive figures derived from shared constants (net 54,000 /
  +20% = 64,800 / 15% VAT) → R62,100 / R74,520; `formatRand` helper.
- `src/components/RatesTable.astro`: two cards (local/international), strong price, "incl. VAT
  (15%) & conservation levies", net/VAT breakdown as semantic `<dl>`. Never the R60k figure.
- `src/pages/rates.astro`: GEO H1 "How much does the trail cost?" (per-group answer); What's
  included / to-arrange lists (grounded); booking placeholder (BookingWidget → step 12) with
  mailto enquiry; refund policy (schedule table + clauses) from policies.ts; §8.8 meta.
- `src/data/schema.ts`: `offerSchema`; page emits WebPage + Breadcrumb + 2× Offer (ZAR).
- Verified: correct totals + breakdown; R60k absent (0); 2 Offers; `/rates/` in sitemap.

## Refund & cancellation policy (draft) — 2026-06-18
- `src/data/policies.ts`: researched, industry-standard SA tiered cancellation policy (4 tiers
  by days-before-arrival; full payment up front; refund method, date-change, operator-cancel,
  force-majeure, travel-insurance, safety/conduct, no-show, VAT, CPA-subject clauses).
- DRAFT — percentages/windows/timeframe are operator-confirmable; needs legal review.
  Renders on Rates (step 10) and is referenced at checkout. Type-checks clean.

## Step 9 — Trail Logistics & FAQ — 2026-06-18
- `src/pages/logistics.astro`: three mandatory blocks (catering, **safety emphasised**,
  route-status) + FAQ; §8.8 meta; one `<h1>`; question-shaped H2s.
- `src/data/logistics.ts`: `logisticsBlocks` (copy faithful to §8.4) + `faqs` (5 answer-first,
  GEO-grounded Q&A; no fabricated packing list).
- `src/components/FaqAccordion.astro`: native `<details>/<summary>`, exclusive via `name`,
  ochre focus, rotating chevron.
- `src/data/schema.ts`: `faqPageSchema` (FAQPage JSON-LD — harmless/AI-useful, §10.4).
- Verified: Two-Man Rule + two armed guides + route-conceptual notice verbatim; safety block
  emphasised; 5 accordion items; FAQPage + 5 Questions; `/logistics/` in sitemap.

## Steps 6 + 7 — The Trail + RouteMap — 2026-06-18
- `src/pages/the-trail.astro`: states no-walking-on-arrival + direct Day-4 departure;
  question H2s; §8.8 meta; WebPage + BreadcrumbList + TouristTrip JSON-LD.
- `src/data/itinerary.ts`: 4 days verbatim (Day 1 `null` = "No walking"; Days 2–4 `~20 km`).
- `src/components/{DayCard,ItineraryTimeline}.astro`: vertical organic timeline (Playfair
  numerals on a hairline rail, per-day accent).
- `src/data/route.ts` + `src/components/RouteMap.astro`: static SVG conceptual loop
  (`role="img"` + title/desc, dotted day-coloured segments, pins, legend, landmark key,
  "conceptual" caption; no mapping library).
- Verified: "Louis du Toit's land" kept verbatim (website-brief content); SVG a11y + 3 day
  colours; `/the-trail/` in sitemap.

## Step 8 — The Sanctuaries — 2026-06-18
- `src/pages/sanctuaries.astro`: GEO H1 "Where do you sleep on the trail?"; one premium
  standard noted; §8.8 meta; WebPage + BreadcrumbList + 3× TouristAttraction.
- `src/data/sanctuaries.ts`: Rotavi / Oukraal / VierVanAcht (roles verbatim; descriptions from
  brief+itinerary facts, no invented amenities; descriptive alt; accents ochre/green/day4).
- `src/components/SanctuaryCard.astro`: alternating editorial feature row (distinct-but-cohesive,
  not identical boxes); astro:assets `<Image>` when supplied, else labelled 4:3 placeholder.
- `src/data/schema.ts`: `touristAttractionSchema` helper.

## Step 5 — Footer + Section + Home teasers — 2026-06-18
- `src/components/Section.astro`: layout primitive (as/bg/space/labelledby/class/containerClass).
- `src/components/Footer.astro` (wired into Layout): brand + hook + location, Explore nav,
  Contact (operator + verbatim placeholder email), Privacy link, dynamic-year copyright.
- Home teasers (editorial 3-up) → Trail/Sanctuaries/Rates; Rates teaser shows R62,100.
- `src/pages/privacy.astro`: **noindex stub** (content pending); excluded from sitemap while noindex.

## Step 4 — Home (Hero · StatsBar · Promise) — 2026-06-18
- `src/pages/index.astro`: real Home, `navOverHero`; one `<h1>`; §8.8 meta; Organization +
  WebPage + BreadcrumbList + TouristTrip JSON-LD.
- `src/components/Hero.astro`: full-bleed; astro:assets `<Image>` (eager/fetchpriority/dims) when
  supplied, else labelled CSS placeholder; verbatim hook subline; ochre + ghost CTAs.
- `src/components/StatsBar.astro` + `stats` in site.ts: four verbatim stats.
- Promise: GEO H2 "What is The Rooiberg Wander?" answered first sentence; unpack-and-walk copy.
- `src/data/schema.ts`: Organization / WebPage / BreadcrumbList / TouristTrip builders.

## Step 3 — Nav + MobileMenu — 2026-06-17
- `src/components/Nav.astro`: sticky header; `overHero` (transparent/light over hero, solid
  cream on interior + on scroll); ochre underline on hover/active; full nav incl. Home.
- `src/components/MobileMenu.astro`: **vanilla-JS** overlay (no framework island) — focus-trap,
  aria-expanded/-controls, Esc, scroll-lock, restore-focus. Wired into Layout via `navOverHero`.

## Step 2 — Layout + Seo — 2026-06-17
- `src/layouts/Layout.astro`: en-ZA shell, fonts + global.css, `<ClientRouter />` View
  Transitions, skip-link, `<main>` slot.
- `src/components/Seo.astro`: canonical, meta, OG/Twitter, JSON-LD (set:html of own data only).
- `src/data/site.ts`: verbatim global strings + nav. `@astrojs/sitemap` (excludes /api/, /booking/,
  /privacy). `public/robots.txt` with AI-crawler allows.

## Step 1 — Scaffold + tokens — 2026-06-17
- Astro 6.4.7 (minimal, strict TS); **Tailwind v4 via `@tailwindcss/vite`** (pinned exact, no
  `@astrojs/tailwind`); self-hosted Fontsource fonts (Playfair + Inter).
- `src/styles/global.css`: `@theme` tokens (Part 5.4), base type, ochre focus, `.btn`
  primitives, reduced-motion.
- `package.json` verify scripts; `src/env.d.ts` ambient font decls.
