# CLAUDE.md — The Rooiberg Wander (Consolidated Build Bible)

> **Single source of truth.** This file merges the former `CLAUDE.md`, `DESIGN.md`, `TECHNICAL_SPEC.md`, `SECURITY.md`, `SEO.md`, and `KEYWORD_MAP.md` into one document, resolves the contradictions between them (see **Part 16 — Reconciliation Log**), and adds the **online booking system** (Astro + **Paystack** + Supabase). Claude Code reads this file automatically every session.
>
> Because it is one long document, **Part 0** is a map. Read the part relevant to your current task; the per-part precedence rules from the old multi-file setup are preserved inline.
>
> Authoritative source documents: `Memo_to_Francois_re_Rooiberg_Wander.pdf` (13 June 2026 — **governs the website**) and `RoiSan_Walking_Trails_Business_Plan.pdf` (20 May 2026 — internal context only).

---

## Part 0 — How to use this file

- This file is **binding**. When it conflicts with your instinct, it wins.
- **Internal precedence** (unchanged from the old docs): build mechanics → Parts 1–7, 13–14; anything visual → Part 5; exact content/keywords → Parts 8 & 10; **security always wins** → Part 11; booking architecture → Part 9.
- **Plan before building.** State a one-paragraph plan per page/component, then build.
- **Verify before claiming done.** Run `npm run verify` after every page/change and fix everything before moving on. Never report a task complete on an unverified build.
- **Stay faithful.** Don't invent facts, prices, dates, properties, amenities, testimonials, or imagery the brief doesn't contain. Missing detail → labelled placeholder + an "Open questions" note at the end of your turn. Never fabricate.
- **Small, reviewable steps.** One page/component per commit. Don't refactor unrelated code.

> **Note on referenced files (v2.1).** The former `TECHNICAL_SPEC.md`, `DESIGN.md`, `SECURITY.md`, `SEO.md`, and `KEYWORD_MAP.md` were **merged into this file** and no longer exist as build inputs. Their content now lives here: exact copy/data/acceptance criteria → **Part 8** (and per-page meta → **§8.8**); alt text → **§8.7/§5.8**; visual bible → **Part 5**; security → **Part 11**; SEO → **Part 10**; keywords → **§10.11**. Any standalone copies of those files kept in the repo for history are **non-authoritative**; where they conflict with this file, **this file wins** (each carries a "Superseded" banner). Do not treat their cross-references to `TECHNICAL_SPEC.md` as a missing dependency — that content is **§8** here.

**Map of this document**
1. Mission, non-negotiables &amp; scope · 2. Tech stack · 3. Commands, env &amp; Definition of Done · 4. Project structure · 5. Design system (visual bible) · 6. Build order · 7. Component contracts · 8. Content &amp; data (per-page) · 9. **Booking system (Paystack + Supabase)** · 10. SEO, AI visibility &amp; keyword map · 11. **Security (OWASP + payments + data)** · 12. Content fidelity guardrails · 13. Workflow &amp; git · 14. When to ask · 15. Consolidated pre-launch checklist · 16. Reconciliation log.

---

## Part 1 — Mission, non-negotiables &amp; scope

Build a **world-class, production-ready website with an integrated online booking system** for *The Rooiberg Wander* — a premium, exclusive, 3-night / 3-day guided slackpacking trail through ~8,000 ha of private Big 5 mountain terrain in RoiSan Reserve (Limpopo Waterberg).

Every output must be:
- **Premium and distinctive** — an organic extension of the rugged Rooiberg veld, not a template. Actively avoid "AI slop" (Part 5).
- **Mobile-first** — design for a 380px viewport first; touch targets ≥ 44px; flawless menu, timeline, pricing, and booking flow on iOS/Android.
- **Fast and accessible** — Lighthouse 95+ (Perf/A11y/Best Practices), SEO 100; WCAG 2.2 AA; Core Web Vitals targets in Part 10.
- **Faithful** — content, structure, and the page flow match the 13 June brief.
- **Secure and trustworthy** — it now takes money and stores personal data; Part 11 is mandatory.

**Hard constraints (do not violate):**
- The route is **conceptual**; the on-page route map is a **styled static SVG only** — no live GPS/Mapbox/Google Maps (Part 7 / Part 8).
- Safety messaging (Two-Man Rule, two armed guides) is mandatory and prominent.
- Public price is displayed **VAT-inclusive** (the entity is VAT-registered): **R62,100 per group** local / **R74,520** international (R54,000 / R64,800 net + 15% VAT; incl. conservation levies). R54,000 stays the ex-VAT net the operator retains. The internal R60k figure from the business plan is **never** shown publicly.
- Guests **do not walk on arrival day** and **depart immediately after the final walk on Day 4** — state explicitly on The Trail page.

**Scope change (this revision).** The product moves from "conceptual, inquiry-to-email" to **transactional**: visitors can **book and pay online**. This deliberately overrides the old "static-only / no backend / route to placeholder email" model. Marketing pages stay static; only the booking and API routes become dynamic. See Parts 2, 9, 11 and the Reconciliation Log (Part 16).

**Payment provider — Paystack (decided).** The processor is **Paystack** (Stripe-owned; the leading developer-first gateway in South Africa). It onboards South-Africa-registered businesses (business verification typically 1–3 business days) and supports ZAR + international cards — so it both fits the SA market and resolves the earlier Stripe-can't-onboard-SA blocker. The booking code is **processor-abstracted** (`lib/payments.ts`), so switching to **PayFast** (most ubiquitous SA gateway, widest local methods incl. Instant EFT), **Peach Payments** (enterprise/recurring), or **Adumo/Lesaka** (largest SA acquirer) later is a contained change. **Client decision to confirm:** whether to add **Instant EFT** (a very common SA preference) alongside cards — Paystack supports it as an option; PayFast/Ozow are stronger on EFT if it proves essential.

---

## Part 2 — Tech stack (strict — use current syntax)

- **Astro 5.2+** with TypeScript (`strict`).
- **Rendering:** `output: "static"` (default) — **marketing pages stay prerendered** for SEO/perf; **booking + API routes opt into SSR** with `export const prerender = false`. Requires a **server adapter** (`@astrojs/vercel` or `@astrojs/netlify`) once booking routes exist.
- **Tailwind CSS v4** via the **`@tailwindcss/vite`** plugin. **Do NOT** use `@astrojs/tailwind` or a `tailwind.config.mjs` (deprecated v3 path). Tokens live in CSS via `@theme {}` (Part 5).
- **Server logic:** **Astro Actions** (type-safe, zod-validated server functions) for booking mutations; a raw **API route** for the payment webhook (needs the raw request body for signature verification).
- **Database:** **Supabase** (Postgres). Server access via `@supabase/supabase-js` with the **service-role key (server only)**. Browser may read **only** a sanitised, RLS-protected availability view. Schema + RLS in `supabase/migrations/0001_init.sql`.
- **Payments:** **Paystack** — hosted checkout via redirect to the transaction `authorization_url` (card data never touches our servers → PCI **SAQ-A**). Call the Paystack REST API **server-side with `fetch`** (no heavyweight SDK dependency needed). Webhooks are verified with **HMAC-SHA512 of the raw body using the secret key** (`x-paystack-signature`). Processor-abstracted via `lib/payments.ts` (Part 9).
- **Islands (now three):** `MobileMenu`, `InquiryForm` (optional "enquire" path), and `BookingWidget`. Prefer Astro **View Transitions** + CSS/Tailwind transitions over a JS animation library; add Framer Motion only with justification. (Hosted-checkout redirect means little/no payment JS on our pages.)
- **Images:** `astro:assets` (`<Image>`/`<Picture>`), AVIF + WebP, explicit `width`/`height` (prevents CLS).
- **Fonts:** self-host with Fontsource — `@fontsource/playfair-display` (display) + `@fontsource-variable/inter` (body). No Google Fonts CDN link.
- **SEO:** `@astrojs/sitemap` (exclude api/booking-confirm routes), per-page metadata + OG/Twitter, JSON-LD, `robots.txt`, `llms.txt`.
- **Deploy:** static marketing output + SSR adapter for dynamic routes; `site` set in `astro.config.mjs`.

**Forbidden:** heavy JS frameworks; generic component libraries clashing with the earthy aesthetic; purple/blue corporate gradients; CDN webfont `<link>`s; storing PII in `localStorage`; using the Supabase **service-role key** or the **Paystack secret key** anywhere client-side; trusting any price/total sent from the browser.

---

## Part 3 — Commands, environment &amp; Definition of Done

Scaffold (run once in an empty root):

```bash
npm create astro@latest . -- --template minimal --typescript strict --yes
npm i tailwindcss @tailwindcss/vite   # Tailwind v4: then add tailwindcss() to `vite.plugins` in astro.config.mjs
                                      # ⚠ FIX (v2.1): do NOT run `npx astro add tailwind` — it installs the deprecated
                                      # @astrojs/tailwind v3 integration (a v3 pattern) which conflicts with Part 2's
                                      # "Do NOT use @astrojs/tailwind" rule and breaks the CSS-first @theme tokens.
npx astro add sitemap
npx astro add vercel              # OR: npx astro add netlify  (server adapter for booking)
npm i @fontsource/playfair-display @fontsource-variable/inter
npm i @supabase/supabase-js       # Paystack uses the REST API via fetch — no payment SDK needed
npm i -D @tailwindcss/typography prettier prettier-plugin-astro @lhci/cli @axe-core/cli
```

Enable native CSP and configure Paystack/Supabase origins in `astro.config.mjs` (done in the repo skeleton — Part 11). Pin Tailwind to an exact version. Copy `.env.example` → `.env` and fill secrets (Part 11). Apply the Supabase migration via the Supabase CLI or SQL editor.

`package.json` scripts:

```jsonc
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",                          // type + template errors
    "format": "prettier --write . --plugin=prettier-plugin-astro",
    "audit": "npm audit --audit-level=high",         // supply-chain gate (Part 11)
    "a11y": "axe http://localhost:4321 --exit",      // against `npm run preview`
    "lh": "lhci autorun",                            // Lighthouse CI
    "verify": "npm run check && npm run build && npm run audit"
  }
}
```

**Definition of Done (every page/component):**
1. `npm run verify` passes (no type errors, clean build, no high/critical audit findings).
2. Renders correctly at 380px, 768px, 1280px.
3. Keyboard-navigable; visible **ochre** focus states; correct landmarks/headings; images have meaningful `alt`.
4. Copy matches Part 8 verbatim where specified; keywords per Part 10; visual treatment per Part 5.
5. Page-level `<title>`, meta description, OG tags present; no CSP console violations.
6. **Booking/payment work:** also satisfies the Part 9 flow and the Part 11 payment/data checklist; test with Paystack **test** keys + a tunnelled webhook before claiming done.
7. Before declaring the whole site done: `npm run preview`, then `a11y` + `lh`; report scores; run the Part 15 checklist.

---

## Part 4 — Project structure

```
rooiberg-wander/
├── public/
│   ├── images/
│   │   ├── placeholders/        # documented aspect ratios; swap for real assets later
│   │   └── og-default.jpg       # social-card fallback (create or replace)
│   ├── _headers                 # edge security headers (Netlify/CF Pages) — Part 11
│   ├── robots.txt               # allows AI crawlers; points to sitemap — Part 10
│   ├── llms.txt                 # LLM-facing site summary (GEO/AEO)
│   └── favicon.svg
├── supabase/
│   └── migrations/
│       └── 0001_init.sql        # bookings/inquiries/blocked_dates + RLS (Part 9/11)
├── src/
│   ├── actions/
│   │   └── index.ts             # Astro Actions: createCheckout, createInquiry (Part 9)
│   ├── components/
│   │   ├── Nav.astro
│   │   ├── MobileMenu.{tsx|svelte}      # island
│   │   ├── Footer.astro
│   │   ├── Hero.astro
│   │   ├── StatsBar.astro
│   │   ├── ItineraryTimeline.astro
│   │   ├── DayCard.astro
│   │   ├── SanctuaryCard.astro
│   │   ├── RouteMap.astro               # conceptual SVG map (Part 7/8)
│   │   ├── FaqAccordion.astro
│   │   ├── RatesTable.astro
│   │   ├── BookingWidget.{tsx|svelte}   # island — dates, group, residency → checkout
│   │   ├── InquiryForm.{tsx|svelte}     # island — optional "enquire" path
│   │   ├── Section.astro                # layout primitive
│   │   └── Seo.astro                    # <head> meta + JSON-LD
│   ├── data/
│   │   ├── itinerary.ts · sanctuaries.ts · route.ts · schema.ts · site.ts
│   ├── lib/
│   │   ├── pricing.ts                   # SERVER-SIDE price authority (Part 9/11)
│   │   ├── supabase.ts                  # server client (service role) + anon client
│   │   └── payments.ts                  # Paystack (init txn, verify, webhook check) — abstracted
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   ├── index.astro          # Home
│   │   ├── the-trail.astro
│   │   ├── sanctuaries.astro
│   │   ├── logistics.astro
│   │   ├── rates.astro          # rates + BookingWidget
│   │   ├── booking/
│   │   │   ├── confirm.astro    # callback_url (prerender=false) — verifies txn, shows confirmation
│   │   │   └── cancel.astro     # user-abandoned — releases hold
│   │   ├── api/
│   │   │   └── payments/
│   │   │       └── webhook.ts   # prerender=false — verifies x-paystack-signature, confirms booking
│   │   └── 404.astro            # custom not-found
│   ├── styles/
│   │   └── global.css           # @import "tailwindcss"; + @theme tokens
│   └── env.d.ts
├── .env.example                 # documents all secrets/public vars (never commit .env)
├── astro.config.mjs             # Tailwind Vite plugin, sitemap, adapter, CSP
├── tsconfig.json · package.json · README.md
└── CLAUDE.md                    # THIS consolidated file (single source of truth)
```

Put **all** structured content in `src/data/*.ts` as typed objects and map over them — no hard-coded copy scattered through markup.

---

## Part 5 — Design system (the visual bible)

> Authority on all visual decisions. Implemented as CSS-first `@theme` tokens in `src/styles/global.css` — use the token variables, never hard-coded hexes.

### 5.1 Core aesthetic philosophy
Brand personality: raw yet refined · cinematic &amp; atmospheric · exclusive &amp; intimate (max 10) · grounded, powerful, timeless · South African veld elegance — wild and considered, not polished safari luxury. Visitors should feel the dramatic scale of the Rooiberg, the intimacy of a small group, and the confidence of a world-class guided experience. References for *tone and quality* (not copying): &amp;Beyond, Singita (cinematic restraint); Leopard Trail / Baviaans Canyon Trail (high-conversion wilderness storytelling); high-end editorial nature photography; premium adventure editorial.

### 5.2 Strict anti-slop rules (never violate)
- No generic system fonts as the **hero/display** face (avoid Inter, Roboto, Arial, SF Pro as headline faces). *(Inter is permitted for **body** only.)*
- No heavy drop shadows or "modern card" aesthetics (thick borders + big shadows).
- No centred-everything layouts or symmetrical grids as the default.
- No purple, blue, or corporate gradients.
- No timid, evenly distributed colour palettes.
- No overused Tailwind component patterns without strong justification.
- No decorative line icons / generic heroicons without personality.
- Always ask: "Could this exist on any generic travel site?" If yes → redesign.

### 5.3 Typography
- **Display/headings:** Playfair Display (or an equally characterful serif). Large sizes, generous tracking on hero headlines, strong weight/size contrast. Tight line-height (~1.05–1.08).
- **Body/UI:** Inter (variable, self-hosted) — body only; excellent rendering, pairs with the display face. Line-height 1.5–1.7.
- **Hierarchy:** rhythm and breathing room; use size, weight, **and colour** for hierarchy. Mobile: slightly tighter tracking/line-height.

### 5.4 Colour (CSS `@theme` tokens — use ONLY these)
- `--color-earth` `#3D2B1F` (dominant deep earth) · `--color-ochre` `#C19A6B` (sharp warm accent) · `--color-green` `#4A5D23` (muted veld green) · `--color-charcoal` `#2C2C2C` (text) · `--color-cream` `#F5F0E6` (backgrounds/cards) · `--color-hairline` `rgba(61,43,31,.10)`.
- Route-map day colours: `--color-day2` ochre · `--color-day3` green · `--color-day4` `#9C5B3B` terracotta.
- **Usage:** dominant earth + cream for a grounded feel; **ochre sparingly** as a sharp accent (CTAs, key highlights, dividers); green for secondary/nature elements. High-contrast text everywhere — WCAG AA minimum, prefer AAA. Verify ochre-on-cream and text-over-image combinations explicitly.

### 5.5 Spacing &amp; layout
- 4/8px base scale. Generous whitespace is a **feature** — luxurious, not empty. Prefer asymmetric/flowing layouts over rigid 12-column grids where it enhances the wilderness feel. Large breathing room around sections; tighter, intentional spacing inside components. Container ≈ `max-w-screen-2xl`. Organic radii (`rounded-2xl`/`rounded-3xl`). Hairline borders over heavy shadows.

### 5.6 Component guidelines (specific)
- **Hero:** full-bleed cinematic image (golden-hour quality), elegant text overlay with excellent contrast, poetic+grounded headline (large distinctive type), intimate secondary tagline (the hook). **Primary CTA in ochre, refined — not a big pill button; understated secondary CTA.** Light vignette/gradient only if needed for legibility. Mobile: maintain impact, large scaling type.
- **Navigation:** clean minimal top bar, considered logo, refined hover (subtle colour/underline). **Sticky; solid-cream or subtle-blur background once scrolled.** Mobile: elegant hamburger → full-screen overlay, generous spacing, focus-trap, `aria-expanded`, Esc to close.
- **Itinerary/Timeline:** **vertical on desktop *and* mobile.** Strong day markers; each day distinct and atmospheric; subtle per-day accent (`colorVar`); generous spacing. **Avoid the generic line+dot pattern — make it organic.** Highlight "No walking on Day 1" and "depart after final walk on Day 4" clearly but elegantly.
- **Sanctuary cards:** three distinct-but-cohesive treatments; high-quality imagery (even placeholders); hierarchy Name → role in journey → short evocative description; subtle per-card accent; very restrained desktop hover lift; excellent mobile tap targets. Avoid "three identical boxes."
- **Pricing/Rates:** clean transparent matrix/cards; clear local vs international distinction; strong type on the price; refined small-text note "incl. VAT (15%) and conservation levies" with the ex-VAT/VAT breakdown beneath; trustworthy and premium.
- **Booking widget:** calm, confidence-inspiring; clear date selection, group size, residency; transparent running total (server-computed); obvious primary action; reassuring, never pushy. Errors and unavailable dates communicated gently. (Behaviour: Part 9.)
- **Inquiry/Booking form fields:** clean minimal fields, excellent labels/spacing, high-quality ochre focus states, premium submit button, calm reassuring success state (not over-celebratory). A short plain-language **privacy note** near submit (POPIA — Part 11). Mobile: stack with large tap targets.
- **Buttons &amp; CTAs:** primary = ochre bg, refined hover/active; secondary = subtle (outline/text/cream). ≥44px touch targets. **Avoid generic pill shapes** — considered rounding (`.btn` primitives in `global.css`).
- **Cards &amp; blocks:** subtle borders / very light backgrounds over heavy shadows; generous internal padding; clear internal hierarchy.
- **Footer:** clean, minimal, good type/spacing; necessary legal/placeholder info without clutter; link to Privacy.

### 5.7 Interaction &amp; motion
Subtle and intentional — never flashy/trendy. Refined hover lifts/colour shifts; smooth natural easing; clear elegant ochre focus; grounded, confident motion. Always honour `prefers-reduced-motion` (in `global.css`).

### 5.8 Imagery direction
Atmospheric, high-quality, emotionally resonant; golden hour / dramatic natural light; authentic to the Rooiberg (rugged mountains, open terrain, small groups, guides); purposeful overlays for readability; mobile crops that still feel impactful. Don't fabricate photo credits or lodge features; real assets supplied separately.

### 5.9 Final quality filter
Before finalising any section: Does it belong specifically to The Rooiberg Wander? Would it look out of place next to &amp;Beyond? Is there emotional impact or is it generic? Is the type/spacing/treatment distinctive? Does it work exceptionally on mobile? **When in doubt, make it more restrained, more typographic, more atmospheric.**

---

## Part 6 — Build order

Foundations first, conversion + payments last. Verify (`npm run verify`) after each step.
1. **Scaffold + tokens** — Astro, Tailwind v4 `@theme`, fonts, base type, `global.css`.
2. **Layout + Seo** — shell, View Transitions, skip-link, sitemap/robots.
3. **Nav + MobileMenu** — sticky nav (cream-on-scroll), accessible overlay island.
4. **Home** — Hero · StatsBar · Promise (visual anchor; get it right first).
5. **Footer + Section** — shared chrome + layout primitive.
6. **The Trail** — ItineraryTimeline · DayCard.
7. **RouteMap** — conceptual SVG (parallel to 6).
8. **Sanctuaries** — SanctuaryCard ×3.
9. **Logistics &amp; FAQ** — accordion · safety · route-status notice.
10. **Rates** — RatesTable (display).
11. **Booking backend** — Supabase schema + RLS; `lib/supabase`, `lib/payments` (Paystack), `lib/pricing`; Astro Actions; webhook route; `booking/confirm` + `booking/cancel`. Test end-to-end with Paystack **test** keys + a tunnelled webhook.
12. **BookingWidget** — wire to the action; availability, holds, redirect to Paystack checkout.
13. **404 + edge headers + CSP** — custom not-found, `_headers`, CSP origins verified.
14. **Polish &amp; QA** — `npm run preview`, `a11y`, `lh`; Part 15 checklist.

---

## Part 7 — Component contracts

Reusable, typed (TS interfaces). Treatment per Part 5.
- **`Nav` + `MobileMenu`** — see 5.6. Driven by `site.ts`.
- **`Hero`** — full-bleed image, scrim, Playfair headline, hook tagline, **primary ochre + understated secondary CTA** (`.btn` primitives, not pills).
- **`StatsBar`** — four stats from `site.ts`: `3 Nights · 3 Days Walking · 3 Private Sanctuaries · Max 10 Guests (Exclusive Group Use)`.
- **`ItineraryTimeline`** — maps `itinerary.ts`; vertical desktop+mobile; organic markers; per-day accent; Day 1 "No walking"; Day 4 immediate departure.
- **`DayCard`** — props: `day`, `title`, `distanceKm` (null = no walking), `from?`, `to?`, `description`, `colorVar?`.
- **`SanctuaryCard`** — props: `name`, `role`, `description`, `image`, `alt`, `accentVar`. ×3 distinct-but-cohesive.
- **`RouteMap`** — styled static SVG from `route.ts`: loop Rotavi → Oukraal → VierVanAcht → Rotavi, three day-coloured segments, sanctuary pins, legend, "conceptual" caption, `role="img"` + `<title>`/`<desc>` + text equivalent. No mapping library.
- **`FaqAccordion`** — accessible native `<details>/<summary>`; keyboard + SR friendly.
- **`RatesTable`** — local vs international; strong price type showing the **VAT-inclusive** total (R62,100 local / R74,520 intl) with "incl. VAT (15%) + conservation levies" small text. Never the internal R60k figure.
- **`BookingWidget`** (island) — see Part 9.
- **`InquiryForm`** (island, optional) — fields Name, Group Size, Target Dates, Contact Details; validation + length caps + accessible errors + honeypot + calm success; POPIA note; submits via the `createInquiry` action (stores in Supabase or emails operator); **no PII in storage on the client**; never a raw HTML `<form>` submit in a React island.
- **`Seo`** — props `title`, `description`, `path`, `image`, `type`, `noindex`, `jsonLd[]`; emits meta + OG/Twitter + JSON-LD. **Only acceptable `set:html`** is our own serialized JSON-LD — never user input.

---

## Part 8 — Content &amp; data (per page)

Source of truth for the website = the 13 June memo. Reproduce given strings **verbatim**. Bulk data lives typed in `src/data/*.ts`.

**Global strings (`site.ts`):** name "The Rooiberg Wander"; operator "RoiSan Reserve NPC"; location "RoiSan Reserve, Limpopo Waterberg, South Africa"; terrain ~8,000 ha; hook **"Bring your own flavor; we take care of the rest."**; max 10 guests; operator notify email `hanlie@rooibergwander.co.za` *(corrected from original brief)*.
**Nav:** Home · The Trail · The Sanctuaries · Trail Logistics &amp; FAQ · Rates &amp; Booking.

### 8.1 Home (`/`)
Sections: Hero → Stats bar → Wilderness-promise/intro → teasers (Trail, Sanctuaries, Rates) → Footer.
- Hero: full-bleed landscape showing the **vertical drama** of the Rooiberg; earth-gradient scrim; headline conveys *a 3-night, 3-day slackpacking journey through a private Big 5 reserve*; subline = the hook; primary CTA → Rates &amp; Booking.
- Stats bar: the four items, directly below the hero.
- Promise: short evocative copy on the "unpack-and-walk" model — fully self-catered; luggage + provisions ported camp to camp; dedicated lodge staff for cleaning and to assist with cooking/braai/washing-up; exclusive use, max 10.
- **Acceptance:** hero is the LCP element (eager, `fetchpriority="high"`, optimised AVIF/WebP, explicit dims); stats legible at 380px; one `<h1>`; CTA keyboard-reachable.

### 8.2 The Trail (`/the-trail`)
Explicitly state: guests **do not walk on the arrival day**, and **depart immediately after the final walk on Day 4.** Premium vertical timeline from `itinerary.ts`:

| Day | Title | Distance | Detail |
|---|---|---|---|
| **1** | Arrival &amp; Acclimatization | **No walking** | Arrive at **Rotavi Lodge**. Parking, registration, full safety briefing by the two armed Lead Trails Guides, relaxed self-catered evening. |
| **2** | The Mountain Crossing | ~20 km | Trek **Rotavi Lodge over Groenkop to Oukraal.** Luggage and evening food moved ahead. |
| **3** | The High Ridge Traverse | ~20 km | Walk **Oukraal to VierVanAcht**, traversing Louis du Toit's land, stopping at the pristine **Welgedacht lookout point.** |
| **4** | The Plains &amp; Departure | ~20 km | Walk through the **Welgedacht donga** and across the open plains back to **Rotavi Lodge.** Collect vehicles and depart directly. |

- **Acceptance:** Day 1 flagged "No walking"; timeline clean on mobile; day colours match the route map; embedded `RouteMap` is conceptual-only.

### 8.3 The Sanctuaries (`/sanctuaries`)
Three distinct, high-quality nodes under one trail standard (visual assets supplied separately → documented placeholders, don't fabricate amenities):

| Name | Role | Notes |
|---|---|---|
| **Rotavi Lodge** | The Valley Basecamp · Start &amp; End Point | Arrival, registration, briefing; departure point. |
| **Oukraal** | The Bush Sanctuary | Night 2. |
| **VierVanAcht** | The Mountain Sanctuary | Night 3. |

Standardise spelling **VierVanAcht** (the website-brief form), even though the business plan writes "ViervanAcht". **Acceptance:** three cards, equal standard, distinct character; descriptive `alt`; editorial variety (avoid identical boxes).

### 8.4 Trail Logistics &amp; FAQ (`/logistics`)
Three mandatory blocks (accordion or clean sections):
1. **Catering style:** self-catered trail; provisions, drinks, and baggage are portered daily by support vehicles; each camp has dedicated staff to assist with kitchen prep, cooking, cleanup.
2. **Safety protocols (non-negotiable, prominent):** the **Two-Man Rule** — accompanied **at all times by two qualified, armed wilderness guides** for safe tracking in a Big 5 environment.
3. **Route status notice (explicit):** the route is **purely conceptual at this stage**, designed to maximise wilderness exposure and **entirely avoid game-viewer jeep tracks.**

Keep **visible** Q&A (LLMs cite it — Part 10). **Acceptance:** accordion keyboard/SR friendly; safety block emphasised.

### 8.5 Rates &amp; Booking (`/rates`)
Public pricing matrix — **VAT-inclusive display** (the entity is VAT-registered; SA rules require consumer prices to include VAT). R54,000 is the ex-VAT net; the headline is the VAT-inclusive total, with the breakdown shown as supporting detail:

| | Price (incl. VAT) | Breakdown |
|---|---|---|
| **Local Residents** | **R62,100 per group** | R54,000 net + R8,100 VAT (15%). Flat, exclusive use up to 10 participants. Includes all conservation levies. |
| **International Visitors** | **R74,520 per group** | +20% premium on net (R64,800) + R9,720 VAT (15%). |

Label "incl. VAT" clearly; the ex-VAT + VAT breakdown may be shown beneath. Do **not** display the internal R60k figure, per-person breakdowns, owner splits, or business-plan financials. This page now hosts the **BookingWidget** (Part 9) plus the inquiry/"enquire" option. **Acceptance:** widget + table fully usable by keyboard/SR; pricing footnotes present; on-brand; calm.

### 8.6 Route data (`route.ts`) — for the conceptual map
Loop **Rotavi Lodge → Oukraal → VierVanAcht → Rotavi Lodge**; three day-coloured segments. Optional landmark labels from the business-plan sketches (illustrative; no GPS needed):
- **Day 2** (`--color-day2`): Rotavi → Oukraal · Daskop dam · Groenkop summit · Exit of Groenkop climb · Scenic dam.
- **Day 3** (`--color-day3`): Oukraal → VierVanAcht · Entrance to L-Kloof · Wooden bridge · Kareedam · Welgedacht lookout · Scenic donga · Vista picnic.
- **Day 4** (`--color-day4`): VierVanAcht → Rotavi · Scenic riverbed walk · Scenic viewpoint · Welgedacht donga · Welgedacht plains · Daskop &amp; Daskop dam.
Three pins (Rotavi, Oukraal, VierVanAcht); legend Day 2/3/4; conceptual caption; text equivalent for a11y.

### 8.7 Placeholder image manifest (`public/images/placeholders/`)
Document subject, aspect, and alt. Suggested: `hero.jpg` (Rooiberg vista, 16:9/3:2), `rotavi.jpg`/`oukraal.jpg`/`viervanacht.jpg` (4:3), `trail-*.jpg` (3:2). No fabricated credits/features; list swap-ins under Open questions.

### 8.8 SEO metadata starters (tune in build; keyword-optimised titles in Part 10)
| Page | Title | Description (≤155 chars) |
|---|---|---|
| Home | The Rooiberg Wander — Exclusive Big 5 Slackpacking Trail | A 3-night, 3-day guided walking journey through 8,000 ha of private Big 5 mountain wilderness. Bring your own flavor; we take care of the rest. |
| The Trail | The Trail — 3-Night / 3-Day Rhythm | Day-by-day through the Rooiberg: arrival, two ~20 km mountain days, ridge traverse and plains. Fully ported, self-catered, exclusive. |
| Sanctuaries | The Sanctuaries — Three Wilderness Nodes | Rotavi Lodge, Oukraal and VierVanAcht — three distinct sanctuaries under one premium trail standard. |
| Logistics &amp; FAQ | Trail Logistics &amp; Safety | Self-catered with daily porterage, dedicated camp staff, and the Two-Man Rule: two armed wilderness guides at all times. |
| Rates &amp; Booking | Rates &amp; Booking — Book the Trail | R62,100 per exclusive group of up to 10 (local, incl. VAT &amp; conservation levies). Check dates and book online. |

JSON-LD via `Seo.astro` + `schema.ts`: `Organization` + `BreadcrumbList` + `WebPage` everywhere; `TouristTrip` on Home/Trail; `TouristAttraction` per sanctuary; `Offer` (ZAR, public rate) on Rates.

---

## Part 9 — The booking system (Astro + Paystack + Supabase)

> Converts Rates into a real booking flow. **Marketing pages stay static; only this is dynamic.** Processor-abstracted via `lib/payments.ts` — Paystack-first, swappable to PayFast/Peach/Adumo (Part 1).

### 9.1 Product model
The unit sold is the **whole trail for an exclusive group (up to 10), by a start date** (a 4-day window: Day 1 arrival → Day 4 departure). Pricing is **per group**, computed **server-side only** in `lib/pricing.ts`:
- Net (ex VAT): Local **R54,000**; International **+20% = R64,800**. Customer-facing **VAT-inclusive** totals: **R62,100** / **R74,520**.
- **VAT (resolved):** the entity is VAT-registered; all quoted and charged prices are **VAT-inclusive at 15%** (`VAT_REGISTERED=true`). R54,000 is the ex-VAT net the operator retains; send the VAT-inclusive `totalCents` to Paystack. The confirmation receipt **must be a valid tax invoice** (VAT number, VAT shown separately).
- **Deposit vs full** (decision pending): full payment by default; `BOOKING_DEPOSIT_PERCENT` < 100 takes a deposit and records the balance for later.
- **Amount unit:** Paystack expects the amount in the **currency subunit** (ZAR **cents**). `lib/pricing.ts` already works in cents — pass the cents value straight through.

### 9.2 Flow (Paystack hosted checkout + webhook)
1. **BookingWidget** (island) collects start date, group size, residency, lead-guest details → calls the **`createCheckout` Astro Action**.
2. **Server (Action):** zod-validate input; check availability against `unavailable_windows` (Supabase); **compute price server-side** (`computeQuote`); create a **`pending` booking** row with `hold_expires_at = now() + HOLD_MINUTES` (the `bookings_no_overlap` exclusion constraint prevents double-booking) and a unique `processor_reference`; **initialize a Paystack transaction** server-side (`POST https://api.paystack.co/transaction/initialize` with `email`, `amount` in cents, `currency: "ZAR"`, `reference`, `callback_url=/booking/confirm`, `metadata.booking_id`) using the **secret key**; return the `authorization_url`.
3. **Redirect** the browser to the Paystack-hosted `authorization_url` (card data never touches our server → PCI **SAQ-A**).
4. **Webhook** `POST /api/payments/webhook` (`prerender=false`): read the **raw body**, **verify `x-paystack-signature`** = HMAC-SHA512 of the raw body using the **secret key**; on `charge.success`, **independently call Verify Transaction** (`GET /transaction/verify/:reference`) to confirm status + amount, then **idempotently** (guard on booking status) set the booking `confirmed`, record `processor_txn_id`, set `amount_paid_cents`, clear the hold → trigger confirmation + operator-notification email.
5. **`/booking/confirm`** (callback) verifies the transaction server-side by `reference` and shows a calm confirmation; **`/booking/cancel`** (or an abandoned/expired hold) marks the pending booking `cancelled`/releases the hold. **Never** confirm a booking from the callback redirect alone — the webhook (verified) is the source of truth.
6. **Expiry:** pending holds past `hold_expires_at` are treated as not blocking (the availability view filters them) and swept by a scheduled job or on-read.

### 9.3 Data &amp; libs
- Schema + RLS: `supabase/migrations/0001_init.sql` (bookings, inquiries, blocked_dates, `unavailable_windows` view; **RLS default-deny**; overlap exclusion constraint; `processor`/`processor_reference`/`processor_txn_id` columns).
- `lib/supabase.ts`: a **server** client built with `SUPABASE_SERVICE_ROLE_KEY` (server only) + an optional **anon** client for reading `unavailable_windows`.
- `lib/payments.ts`: a small **processor interface** (`initCheckout`, `verifyTransaction`, `verifyWebhookSignature`) with a **Paystack** implementation using `fetch` + the secret key. Keep the interface clean so PayFast/Peach/Adumo can drop in.
- `lib/pricing.ts`: the single price authority (already in repo).

### 9.4 Edge cases &amp; UX
Concurrency (two users, same date) — the exclusion constraint + hold makes the second `pending` insert fail; surface "just taken, pick another date." Abandoned checkout → hold expires, date frees. Group size > 10 rejected. International toggle changes the server total (re-quoted server-side; the widget shows an estimate clearly labelled "final total confirmed at checkout"). Never act on a price from the client.

### 9.5 Emails
Confirmation (guest) + notification (operator `BOOKINGS_NOTIFY_TO`) via a transactional provider (Resend/Postmark/SendGrid — **decision**). Keep a `sendEmail()` seam; strip CR/LF from any user value placed in headers (Part 11). Paystack also emails a receipt on success.

---

## Part 10 — SEO, AI visibility &amp; keyword map

> Technical SEO is a **masterpiece from day one**; ranking is earned over time via content + authority. Two layers in 2026: classic search **and** being *cited* by generative engines (AI Overviews, ChatGPT, Perplexity, Gemini) — **GEO/AEO**, not optional.

### 10.1 Technical foundation
Static prerendered marketing pages (ideal for crawlers + LLMs that don't run JS); HTTPS + HSTS; clean lowercase hyphenated URLs matching nav; self-canonical (absolute) via `Seo.astro`; `@astrojs/sitemap` (include images; **exclude `/api/` + booking-confirm/cancel**) referenced in `robots.txt`; AI crawlers explicitly allowed (10.6); custom 404; no orphan pages; `lang="en-ZA"`; ZAR pricing. **Booking/confirm/api routes are `noindex` and excluded from the sitemap.**

### 10.2 On-page
Title ≤~60 chars, brand last; unique ~150-char meta description; exactly one `<h1>`; logical `<h2>/<h3>` phrased as real queries (10.5); semantic HTML; internal links toward `/rates` with descriptive anchors; descriptive image filenames + meaningful alt; no keyword stuffing.

### 10.3 Core Web Vitals (2026)
Google "good" thresholds (75th-pct **field** data, 28-day window) are **unchanged**: **LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1**. (Some 2026 blogs claim LCP tightened to 2.0s; Google's web.dev/Search-Central docs still list 2.5s as of June 2026 — treat 2.0s as an internal safety target, not the official bar.) **Our internal targets / alert lines:** LCP < 2.0s (alert > 2.0) · INP < 150ms (alert > 160) · CLS < 0.05 (alert > 0.08). We win INP easily (near-zero JS on marketing pages; Paystack **hosted checkout** redirect means no heavy payment JS on our site). LCP: preloaded self-hosted fonts (`font-display: swap`), hero eager + `fetchpriority="high"` AVIF, Astro-inlined critical CSS. CLS: explicit dimensions everywhere; reserve sticky-nav space. Measure with **field data (CrUX / Search Console)**, not just lab Lighthouse.

### 10.4 Structured data (2026 reality)
JSON-LD only (Part 8.8). Types that still earn rich results: `Organization`, `LocalBusiness`, `BreadcrumbList`, `Article`, `Event`, `Product`/`Offer`, image/video. `TouristTrip`/`TouristAttraction` = strong entity/AI signal (no special Google rich result). **FAQ:** Google **deprecated FAQ rich results 7 May 2026** (SC report June 2026, API Aug 2026). Keep **visible** Q&A on Logistics (LLMs extract it); `FAQPage` JSON-LD optional (Bing/AI parse it; harmless to rankings) — don't expect a Google rich result. Validate every type with the Rich Results Test.

### 10.5 GEO / AEO (the 2026 essential)
Be cited when someone asks an AI about Waterberg walking safaris. Write for extraction: **question-shaped `<h2>`s** matching real queries, each **answered in the first sentence**, then detail. Be specific and quotable (3 nights, ~20 km/day, max 10, Two-Man Rule, sanctuary names, Waterberg). Entity clarity &amp; consistency (identical naming; `Organization` schema; clear About). Earn mentions in already-ranking listicles ("best slackpacking trails in South Africa"). Ship `llms.txt`; allow AI crawlers. The same clarity serves humans, classic SEO, and AI.

### 10.6 Crawler &amp; AI-bot policy
`robots.txt` allows general crawling + **explicitly allows** `Googlebot`, `Bingbot`, `Google-Extended`, `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `anthropic-ai`; references the sitemap. (Opting out of AI use later = disallow per bot; client's call.) Ship `llms.txt`.

### 10.7 Local SEO
Google Business Profile (client action, post-conceptual — highest local lever); NAP consistency; `LocalBusiness`/geo schema (Rotavi basecamp geo, Waterberg/Limpopo region); locality terms in copy (Waterberg, Limpopo, D970, private Big 5 reserve); plan for reviews.

### 10.8 Internationalisation
Primary `en-ZA`, ZAR, state the +20% international rate. **Do NOT add `hreflang`** now (only correct with separate localized URLs; premature use creates errors). Revisit only if localized pages are built.

### 10.9 E-E-A-T &amp; content
Own the niche entities (be the definitive "Rooiberg Wander" page; strong for "Waterberg Big 5 walking trail," "slackpacking South Africa"). Demonstrate real experience (authentic photos, operator specifics, FGASA Lead Trails credentials, real logistics). Trust signals (operator identity, safety creds, transparent pricing, privacy notice, real contact). Post-conceptual content roadmap (small + excellent): "What is slackpacking?", "Walking safely in Big 5 terrain", "Best time to visit the Waterberg", "What to pack for a 3-day slackpacking trail", "Slackpacking vs walking safari". Keep the route-status notice fresh.

### 10.10 Measurement
Google Search Console + **Bing Webmaster Tools** (feeds Copilot/ChatGPT) verified, sitemap submitted; privacy-friendly, consent-aware analytics (async, don't hurt INP); field CWV monitoring with the 10.3 alert lines; monthly LLM-citation checks with the prompt set (10.12); validate schema/PSI/Lighthouse pre-launch.

### 10.11 Keyword map (per page)
**Strategy:** don't fight Kruger/&amp;Beyond for head terms ("walking safari South Africa", "Big Five safari"); own the **intersection** — *point-to-point multi-day slackpacking trail through Big 5 terrain, in the Waterberg, for an exclusive private group.*

| Tier | Terms | Strategy |
|---|---|---|
| **Brand** | the rooiberg wander · rooiberg wander trail | Rank #1; reinforce with `Organization` schema |
| **Winnable niche (primary battleground)** | waterberg slackpacking · big 5 walking trail limpopo · multi-day walking safari waterberg · self-catered guided walking trail · exclusive walking trail private reserve · point-to-point big 5 trail | Low competition, high intent |
| **Category (compete via specificity)** | slackpacking south africa · guided walking trail south africa · waterberg hiking trails · luxury walking safari | Be the Waterberg + Big-5-trail answer |
| **Head (don't chase; ride via listicles/GEO)** | walking safari south africa · big five safari | Third-party lists + AI citation only |

**Global entities** (use consistently in copy, schema, `llms.txt`, alt): brand *The Rooiberg Wander*; categories *slackpacking, guided walking trail, walking safari, Big 5 on foot, multi-day hiking trail, point-to-point, self-catered, luggage porterage*; places *RoiSan Reserve, Waterberg, Waterberg Biosphere, Limpopo, South Africa, private Big 5 reserve, D970*; trail *Rotavi Lodge, Oukraal, VierVanAcht, Groenkop, Welgedacht lookout/donga*; features *Two-Man Rule, two armed wilderness guides, FGASA Lead Trails Guide, ~20 km/day, 3 nights/3 days, max 10, exclusive group, conservation levies*; operator *RoiSan Reserve NPC*.

**Per-page (primary → owner; questions feed GEO H2s):**
- **Home** — primary `Big 5 slackpacking trail` (brand-led); secondary: walking safari Waterberg · exclusive guided walking trail · private game reserve walking trail. Q: What is the Rooiberg Wander? Where is it? How is it different from a normal walking safari?
- **The Trail** — primary `3 day walking trail itinerary`; secondary: point-to-point walking trail · Rooiberg Wander route · ~20 km per day · lodge-to-lodge. Q: How long is it? How far each day? Do you walk on arrival day? Where does it start/end?
- **Sanctuaries** — primary `Waterberg trail lodges`; secondary: Rotavi Lodge · Oukraal · VierVanAcht · walking trail overnight camps. Q: Where do you sleep? What are the three sanctuaries? Catered or self-catered?
- **Logistics &amp; FAQ** — primary `self-catered walking trail`; secondary: is a walking safari safe · armed guides walking safari · what is slackpacking · luggage transfer hiking trail. Q (answer-first): What is slackpacking? Is it safe in a Big 5 reserve? How many guides? What is the Two-Man Rule? Catered or self-catered? Who carries luggage/food? What to bring? Is the route finalised?
- **Rates &amp; Booking** — primary `Rooiberg Wander rates` / `Big 5 walking trail cost`; secondary: walking trail price South Africa · book guided walking trail Waterberg · private group walking trail rate. Q: How much? What's included? Per person or per group? Do international visitors pay more? How do I book?

**Anti-cannibalisation:** one owner page per cluster (Home=brand/category; Trail=itinerary/route; Sanctuaries=lodges; Logistics=safety/included/definitions; Rates=cost/book). If two pages rank for one term in GSC, strengthen the owner + add an internal link from the other. No new pages per keyword in this phase — fold into the owner.

### 10.12 GEO prompt set (monthly AI-citation test)
"Multi-day walking safari in the Waterberg" · "Slackpacking trail through a Big 5 reserve in South Africa" · "Point-to-point guided walking trail Limpopo" · "Self-catered walking trail with luggage transfer South Africa" · "Exclusive private walking trail for a group of 10" · "Where can I do a 3-day walking safari in the Waterberg?" · "Big 5 walking trail with armed guides" · "Walking safari that isn't in Kruger" · "Luxury slackpacking South Africa 2026" · "How much does a private group walking trail in South Africa cost?"

### 10.13 Honest expectation
Technically the site launches as a masterpiece. Top rankings come from the content/authority work (10.5, 10.9, listicle placements) compounding over weeks/months. The build removes every technical excuse not to rank; the rest is earned. (These keyword clusters are intent-grounded **hypotheses** from real market vocabulary — validate with GSC + a keyword tool after 4–8 weeks of live data.)

---

## Part 11 — Security (OWASP + payments + data)

**Binding. Security wins all conflicts.** The site now takes payments and stores personal data, so the former "[BACKEND] later" items are **ACTIVE now**.

### 11.1 Scope &amp; threat model
Static marketing pages + **dynamic booking** (Astro SSR routes), a **Supabase** database (bookings, inquiries — **personal data**, POPIA/GDPR), and **Paystack** payments. Card data is handled entirely by Paystack-hosted checkout (PCI **SAQ-A** — we never see or store card numbers). Primary risks: injection/XSS, broken access control on booking data, secrets leakage, webhook forgery, price tampering, double-booking, vulnerable deps, and mishandling personal/payment data.

### 11.2 Security headers + CSP
- **CSP via Astro native** (`experimental.csp`; `security.csp` on Astro 6) — hashes inline scripts/styles (no `'unsafe-inline'`) and emits a `<meta>` CSP. **Directives must allow Paystack + Supabase origins** (configured in `astro.config.mjs`): `script-src 'self' https://js.paystack.co`; `frame-src https://checkout.paystack.com https://js.paystack.co`; `connect-src 'self' https://api.paystack.co https://*.supabase.co`; `form-action 'self' https://checkout.paystack.com`; `object-src 'none'`; `frame-ancestors 'none'`. Don't enable `prefetch`/`clientPrerender` with CSP without testing.
  - ⚠ **CSP caveats (v2.1, verified Jun 2026):** (a) Astro's native CSP is emitted as a `<meta http-equiv>` element; the `frame-ancestors` and `report-uri`/`report-to` directives are **header-only and ignored in `<meta>` form** — clickjacking protection therefore relies on the edge `X-Frame-Options: DENY` (already set in 11.2) and/or `experimentalStaticHeaders` on the Vercel/Netlify adapter. (b) `experimental.csp` is **not yet fully compatible with View Transitions via `<ClientRouter />`** (Part 2). If View Transitions are enabled, either provide hashes for the injected scripts, gate transitions off where CSP violations appear, or defer the `<ClientRouter />` until CSP+VT compatibility lands. Test the rendered pages for CSP console violations before claiming done.
- **Edge headers** (`public/_headers`; Vercel → `vercel.json`): HSTS (2y + preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo denied), COOP `same-origin`. Verify with securityheaders.com / Observatory (target A).

### 11.3 OWASP Top 10 (2021) mapping
- **A01 Broken Access Control** — **RLS default-deny** on all tables; the browser never reads others' bookings. All writes server-side via the **service-role key** (server only). The public anon client may read **only** the sanitised `unavailable_windows` view. No admin route ships without auth.
- **A02 Cryptographic Failures** — HTTPS + HSTS; no PII in `localStorage`/cookies; never log card data (we never receive it) or full contact details in plaintext.
- **A03 Injection / XSS** — Astro auto-escapes; **never** `set:html` untrusted input (the only allowed use is our own serialized JSON-LD in `Seo.astro`); never inline remote SVG/HTML. All booking/inquiry input is zod-validated + length-capped in Actions; Supabase calls are parameterised.
- **A04 Insecure Design** — minimal surface: static marketing + a single well-scoped booking flow. **Server is the price authority** (`lib/pricing.ts`); the client never sends a price/total. Double-booking prevented by the DB **overlap exclusion constraint** + holds. New dependency/embed/route ⇒ a security entry here first.
- **A05 Security Misconfiguration** — headers + CSP (11.2); custom 404; `.env*` git-ignored (commit only `.env.example`); no verbose errors or stack traces to the client; no source maps with secrets.
- **A06 Vulnerable Components** — `npm audit` in `verify`; pin Tailwind exactly; commit the lockfile, `npm ci` in CI; Dependabot; vet new deps (log here). Paystack via `fetch` (no payment SDK) keeps the dependency surface small; keep `@supabase/supabase-js` current.
- **A07 Identification/Auth Failures** — no public accounts now; if a customer/operator portal is added later, strong auth + MFA, Supabase Auth + scoped RLS policies, never custom crypto.
- **A08 Software/Data Integrity** — **verify the Paystack webhook** (`x-paystack-signature` = HMAC-SHA512 of the **raw body** with the **secret key**) AND independently **Verify Transaction** server-side before confirming; process events **idempotently**; self-host fonts/assets (no third-party script-integrity gap); SRI if any external script is ever added.
- **A09 Logging/Monitoring** — never log PII or card data; log security-relevant events (booking attempts, webhook results, validation failures) **without** raw personal data; gate any dev payload logging behind `import.meta.env.DEV`; add uptime/error + webhook-failure monitoring.
- **A10 SSRF** — booking server functions never fetch user-supplied URLs (only the fixed Paystack API base).

### 11.4 Payments security (Paystack)
PCI **SAQ-A** via hosted checkout — card data never touches our servers. **Compute price server-side** from `lib/pricing.ts`; initialize the transaction with the **server** amount + a unique `reference`; pass `booking_id` in metadata. **Verify** every webhook via `x-paystack-signature` (HMAC-SHA512, secret key, raw body) **and** call Verify Transaction to confirm `status === "success"` and the amount matches; reconcile booking status only from these verified server checks (never from the callback redirect, which is user-controllable). Use Paystack **test** keys + a tunnelled webhook in dev. Refund/cancellation policy = product **decision** (e.g., deposit non-refundable) — flag, don't invent.

### 11.5 Database security (Supabase)
RLS enabled + **default-deny** on every table (migration `0001_init.sql`); service-role key **server only**; anon key (public) limited by RLS to the availability view; least-privilege; never expose the service-role key in `PUBLIC_*` or client code. Choose a Supabase **region** mindful of POPIA cross-border transfer (11.7).

### 11.6 Secrets &amp; config
No secrets in repo/bundle/`astro.config.mjs`. Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY` (also verifies webhooks), `EMAIL_API_KEY`. Public-safe: `PUBLIC_SUPABASE_URL/ANON_KEY`, `PUBLIC_PAYSTACK_PUBLIC_KEY`, `PUBLIC_SITE_URL`. `.env*` git-ignored; documented `.env.example` only. Rotate any leaked credential immediately.

### 11.7 Privacy / POPIA &amp; GDPR
Now storing personal data + payment metadata. **Data minimisation** (only the fields needed); **notice &amp; consent** near submit (what's collected, why = to take/fulfil a booking, who receives it) + a **Privacy page** (new — add to footer); **lawful basis** = performance of a contract; **retention** policy + a data-request contact (Open questions — don't invent); **processors** = Supabase, Paystack, the email provider (note DPAs); **cross-border transfer** — if Supabase/Paystack store data outside SA, address POPIA s72 (pick region, disclose). Transmit over HTTPS; restrict who can read submissions.

### 11.8 Transport &amp; deployment
HTTPS everywhere + HSTS preload; HTTP→HTTPS redirect; no mixed content; custom 404; strip dev-only logging from production builds.

### 11.9 Form/booking input rules
Validate type/format + length-cap every field (server-side is authoritative; client validation is UX). Honeypot on public forms; encode echoed values; no PII in browser storage. Strip CR/LF from any user value used in email headers; send only to the fixed configured recipient.

### 11.10 Pre-deploy security checklist
- [ ] CSP enabled, Paystack/Supabase origins allowed, no console violations; edge headers live; securityheaders.com grade A.
- [ ] HTTPS + HSTS; HTTP redirects.
- [ ] RLS default-deny verified; service-role key server-only; anon limited to availability view.
- [ ] Server is the sole price authority; client never sends price; double-booking constraint tested.
- [ ] Paystack webhook signature verified (HMAC-SHA512, raw body) AND Verify Transaction checked; idempotent; booking confirmed only from verified server checks; test-mode E2E passed.
- [ ] No secrets in repo/bundle; `.env*` ignored; `.env.example` documented; secrets in host env.
- [ ] No `set:html` of untrusted input; no remote SVG/HTML inlined.
- [ ] `npm audit` clean of high/critical; lockfile committed; Tailwind pinned; deps vetted.
- [ ] Privacy notice + consent near submit; Privacy page linked; retention + data-request contact resolved; processor/region noted.
- [ ] No PII/card data logged; security events logged without PII; webhook-failure monitoring on.
- [ ] Custom 404; no stack traces/framework internals exposed.

---

## Part 12 — Content fidelity guardrails
- Use the exact strings in Part 8 for hook, stats, itinerary, rates, and safety copy.
- Hook: **"Bring your own flavor; we take care of the rest."**
- Operator-notify email: `hanlie@rooibergwander.co.za` — corrected from original brief.
- Standardise **VierVanAcht** (website-brief form) over the business plan's "ViervanAcht".
- **VAT (operator decision):** the entity is VAT-registered and consumer prices are displayed **VAT-inclusive** at 15% (R62,100 local / R74,520 international). This **supersedes the brief's "excl. VAT" display wording**; R54,000 is retained as the ex-VAT net base. Confirmation receipts must be valid tax invoices (VAT number, VAT shown).
- Never surface internal-only data: the R60k figure, owner profit splits, staffing/salaries, conservation-levy projections, named individuals from the business plan.
- Don't add pages, change the flow, or introduce features not in the brief unless explicitly asked. (The booking system **was** explicitly requested.)

## Part 13 — Workflow &amp; git
Small logical commits, one page/component each; conventional messages (`feat: home hero + stats bar`). Run `npm run verify` before every commit. Don't push/open PRs unless asked. Don't touch lockfiles/CI/unrelated files without reason. End each turn with: what changed, verify/build result, and any "Open questions / placeholders" needing human input.

## Part 14 — When to ask vs. proceed
- **Proceed** (with a labelled placeholder) for: missing images, unspecified microcopy, exact pixel spacing, icon choices.
- **Ask** for: anything contradicting the brief; adding a page/feature beyond booking; changing pricing/email; adding a dependency/third-party embed (also a Part 11 entry); the flagged **decisions** (deposit vs full, Instant-EFT support, email provider, refund/cancellation policy, Supabase region, final payment provider if not Paystack); anything needing real banking/legal input.
- Attempt a complete section first, then list questions — don't block on minor ambiguity.

## Part 15 — Consolidated pre-launch checklist
**Build/UX:** all pages render 380/768/1280; one `<h1>`/page; Part 5 treatment; §5.9 filter passed; mobile-perfect nav/timeline/pricing/booking. **Content:** exact strings present (hook, stats, itinerary incl. "No walking" Day 1, rates, Two-Man Rule, route notice); no internal financials. **SEO:** `Seo.astro` on every page; question-shaped H2s; JSON-LD validated; sitemap (images, api/booking excluded) + AI-aware robots + llms.txt; CWV targets in lab + plan field monitoring; `en-ZA`/ZAR; no premature hreflang; GSC + Bing verified. **Booking:** Supabase schema + RLS applied; server price authority; holds + overlap constraint tested; Paystack test-mode E2E (initialize → hosted checkout → webhook verified + Verify Transaction → confirmed → email); confirm/cancel pages; Paystack account verified (business onboarding). **Security:** full Part 11.10 checklist. **Open questions resolved or listed:** email spelling, deposit, Instant-EFT, refund policy, email provider, Supabase region, privacy contact + retention.

---

## Part 16 — Reconciliation Log (contradictions found &amp; how they were resolved)

1. **Static-only vs a booking backend.** Old docs said "static output, no server, no database, route inquiries to a placeholder email, backend deferred." **Resolved:** `output: "static"` keeps **marketing pages prerendered** (SEO/perf preserved); **only** booking + API routes opt into SSR (`prerender = false`) via a server adapter. The "no backend / conceptual inquiry-to-email" model is explicitly superseded (Parts 1, 2, 9).
2. **"Near-zero JS / two islands" vs payments.** **Resolved:** three islands now (added `BookingWidget`); Paystack uses **hosted checkout** (redirect to `authorization_url`), so little/no heavy payment JS loads on our site — the lean-JS ethos and INP target survive (Parts 2, 10.3).
3. **Inquiry form "client-side only, no real network call, no PII stored" vs real bookings.** **Resolved:** booking is the primary path (real server calls + Supabase persistence); the inquiry form becomes an **optional "enquire" path** that also goes through a server Action. PII is now intentionally stored under POPIA controls (Parts 9, 11.7).
4. **SECURITY "[BACKEND] later" items.** **Resolved:** promoted to **ACTIVE** — webhook verification, server-side validation, rate limiting, idempotency, secret storage, RLS, PCI scope are now requirements (Part 11).
5. **CSP "works for static / no external origins" vs a payment gateway + Supabase.** **Resolved:** CSP directives extended to allow `js.paystack.co`, `checkout.paystack.com`, `api.paystack.co`, `*.supabase.co` (Part 11.2; configured in `astro.config.mjs`).
6. **LCP target mismatch** ("< 2.0s" vs "2.5s official / rumor of 2.0s"). **Resolved:** official "good" = **2.5s**, internal target **< 2.0s**; the 2.0s "tightening" is an unverified rumor (Part 10.3).
7. **INP target mismatch** (200ms vs 150ms). **Resolved:** official ≤ 200ms; **internal target < 150ms**, alert > 160ms (Part 10.3).
8. **Fonts** ("avoid Inter" vs Inter for body). **Resolved:** "avoid Inter" applies to the **hero/display** face only; **Inter is the body face** (Parts 2, 5.2, 5.3).
9. **Sanctuary spelling** (VierVanAcht vs ViervanAcht). **Resolved:** standardise **VierVanAcht** everywhere (Parts 8.3, 12).
10. **Placeholder email spelling.** The original brief's misspelled placeholder has been corrected to `hanlie@rooibergwander.co.za` (corrected from original brief; Parts 8, 12).
11. **"Conceptual route" vs taking real bookings.** **Flagged:** bookings can be taken for future dates; the route-status notice stays. Whether to open live availability while the route is conceptual is a **product decision** (Part 14).
12. **Privacy stance** ("form data not stored" → bookings stored). **Resolved:** explicit POPIA program — minimisation, consent, retention, processors, region, Privacy page (Part 11.7).
13. **Payment provider: Stripe → Paystack (this revision).** The prior draft used Stripe, but Stripe does **not** natively onboard South-Africa-registered businesses in 2026 (SA access only via its Paystack network). **Resolved:** switched to **Paystack** (Stripe-owned; SA's leading developer-first gateway; onboards SA businesses, ~1–3 day verification). This **also resolves** the earlier go-live blocker. The integration is **processor-abstracted** (`lib/payments.ts`) so PayFast (most ubiquitous SA gateway, widest local methods incl. Instant EFT), Peach Payments (enterprise/recurring), or Adumo/Lesaka (largest SA acquirer) can be swapped in. Changed throughout: stack (Part 2), commands (Part 3, dropped the Stripe SDK — Paystack via `fetch`), structure (`lib/payments.ts`, Part 4), booking flow (Part 9: initialize transaction → hosted `authorization_url` → webhook `x-paystack-signature` HMAC-SHA512 + Verify Transaction), security (Part 11.2/11.4/11.6), env (`PAYSTACK_SECRET_KEY`/`PUBLIC_PAYSTACK_PUBLIC_KEY`; no separate webhook secret), and the DB columns (`processor`/`processor_reference`/`processor_txn_id`, default `paystack`).

---

**This consolidated file supersedes the former six documents. Read the relevant Part, then build from Part 6 step 1.**