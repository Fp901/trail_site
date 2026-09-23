# CLAUDE.md — The Rooiberg Wander (Consolidated Build Bible)

> **Single source of truth.** This file merges the former `CLAUDE.md`, `DESIGN.md`, `TECHNICAL_SPEC.md`, `SECURITY.md`, `SEO.md`, and `KEYWORD_MAP.md` into one document, resolves the contradictions between them (see **Part 16 — Reconciliation Log**), and adds the **online booking system** (Astro + **Paystack** + Supabase). Claude Code reads this file automatically every session.
>
> Because it is one long document, **Part 0** is a map. Read the part relevant to your current task; the per-part precedence rules from the old multi-file setup are preserved inline.
>
> **Authoritative source documents (current):** `Memorandum to Francois 16 September.pdf` (15 September 2026 — **governs the website**) and `RoiSan Walking Trails Business Plan 10 September 2026.pdf` (5 September 2026 — internal context only). The June 2026 memo and May 2026 business plan they replace are historical.
>
> ⚠ **Commercial model v4 (15 September 2026) supersedes the product, pricing and availability rules stated in Parts 1, 7, 8, 9, 10 and 12 below.** Those parts have been updated in place where they were wrong, but **Part 17 is the canonical specification** of what the site now sells, how it is priced and how a departure forms. Where anything earlier in this file disagrees with Part 17, Part 17 wins.

---

## Part 0 — How to use this file

- This file is **binding**. When it conflicts with your instinct, it wins.
- **Internal precedence**: build mechanics → Parts 1–7, 13–14; anything visual → Part 5; exact content/keywords → Parts 8 & 10; **security always wins** → Part 11; booking architecture → Part 9; **anything commercial (product, price, availability) → Part 17, which overrides every other Part**.
- **Plan before building.** State a one-paragraph plan per page/component, then build.
- **Verify before claiming done.** Run `npm run verify` after every page/change and fix everything before moving on. Never report a task complete on an unverified build.
- **Stay faithful.** Don't invent facts, prices, dates, properties, amenities, testimonials, or imagery the brief doesn't contain. Missing detail → labelled placeholder + an "Open questions" note at the end of your turn. Never fabricate.
- **Small, reviewable steps.** One page/component per commit. Don't refactor unrelated code.

> **Note on referenced files (v2.1).** The former `TECHNICAL_SPEC.md`, `DESIGN.md`, `SECURITY.md`, `SEO.md`, and `KEYWORD_MAP.md` were **merged into this file** and no longer exist as build inputs. Their content now lives here: exact copy/data/acceptance criteria → **Part 8** (and per-page meta → **§8.8**); alt text → **§8.7/§5.8**; visual bible → **Part 5**; security → **Part 11**; SEO → **Part 10**; keywords → **§10.11**. Any standalone copies of those files kept in the repo for history are **non-authoritative**; where they conflict with this file, **this file wins** (each carries a "Superseded" banner). Do not treat their cross-references to `TECHNICAL_SPEC.md` as a missing dependency — that content is **§8** here.

**Map of this document**
1. Mission, non-negotiables &amp; scope · 2. Tech stack · 3. Commands, env &amp; Definition of Done · 4. Project structure · 5. Design system (visual bible) · 6. Build order · 7. Component contracts · 8. Content &amp; data (per-page) · 9. **Booking system (Paystack + Supabase)** · 10. SEO, AI visibility &amp; keyword map · 11. **Security (OWASP + payments + data)** · 12. Content fidelity guardrails · 13. Workflow &amp; git · 14. When to ask · 15. Consolidated pre-launch checklist · 16. Reconciliation log · **17. Commercial model v4 (canonical: what is sold, what it costs, how a departure forms)**.

---

## Part 1 — Mission, non-negotiables &amp; scope

Build a **world-class, production-ready website with an integrated online booking system** for *The Rooiberg Wander* — a premium, all-inclusive, 3-night / 3-day guided walking safari through ~15,000 ha of private Big 5 mountain terrain in RoiSan Reserve (Limpopo Waterberg), connecting three private safari lodges.

Every output must be:
- **Premium and distinctive** — an organic extension of the rugged Rooiberg veld, not a template. Actively avoid "AI slop" (Part 5).
- **Mobile-first** — design for a 380px viewport first; touch targets ≥ 44px; flawless menu, timeline, pricing, and booking flow on iOS/Android.
- **Fast and accessible** — Lighthouse 95+ (Perf/A11y/Best Practices), SEO 100; WCAG 2.2 AA; Core Web Vitals targets in Part 10.
- **Faithful** — content, structure, and the page flow match the 15 September memo.
- **Secure and trustworthy** — it now takes money and stores personal data; Part 11 is mandatory.

**Hard constraints (do not violate):**
- The on-page route map is a **styled static SVG only** — no live GPS/Mapbox/Google Maps (Part 7 / Part 8). (The route itself is operational, not conceptual; the "conceptual route" notice of earlier revisions is retired.)
- Safety messaging (Two-Man Rule, two armed guides) is mandatory and prominent.
- **The public site sells ONE product: the all-inclusive catered walking safari.** The self-catered product exists in the booking engine but appears nowhere in the navigation, the sitemap or `llms.txt` — only on the unlisted `/sadc-slackpacking` page. Never link it from the main site (business plan §5.3: a mixed offer confuses the DMCs the inbound bookings depend on).
- Public prices are **per person, sharing, for the whole trail**, VAT and conservation levies included. Never quote a per-night figure: the trail has no shorter option, so a nightly rate implies a choice that does not exist. Full rate table and the discount chain: **Part 17**.
- Never surface internal-only data: owner splits, margins, staffing costs, conservation-levy projections, or named individuals from the business plan.
- Guests **do not walk on arrival day** and **depart immediately after the final walk on Day 4** — state explicitly on The Trail page.

**Scope (established).** The site is **transactional**: visitors book and pay online. Marketing pages stay static; only the booking and API routes are dynamic. See Parts 2, 9, 11 and the Reconciliation Log (Part 16).

**Scope change (September 2026 revision).** The product is repositioned onto the all-inclusive catered safari as the public flagship, with a 30% SADC-resident rate and a hidden self-catered option, a tapered set of start days, published annual increases, and online booking opening 1 April 2027. **Part 17 specifies all of it.**

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
Brand personality: raw yet refined · cinematic &amp; atmospheric · exclusive &amp; intimate (max 8) · grounded, powerful, timeless · South African veld elegance — wild and considered, not polished safari luxury. Visitors should feel the dramatic scale of the Rooiberg, the intimacy of a small group, and the confidence of a world-class guided experience. References for *tone and quality* (not copying): &amp;Beyond, Singita (cinematic restraint); Leopard Trail / Baviaans Canyon Trail (high-conversion wilderness storytelling); high-end editorial nature photography; premium adventure editorial.

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
- **`StatsBar`** — four stats from `site.ts`: `3 Nights · 3 Days Walking · 3 Private Dedicated Lodges · Max 8 Guests per Departure`.
- **`ItineraryTimeline`** — maps `itinerary.ts`; vertical desktop+mobile; organic markers; per-day accent; Day 1 "No walking"; Day 4 immediate departure.
- **`DayCard`** — props: `day`, `title`, `distanceKm` (null = no walking), `from?`, `to?`, `description`, `colorVar?`.
- **`SanctuaryCard`** — props: `name`, `role`, `description`, `image`, `alt`, `accentVar`. ×3 distinct-but-cohesive. The lodges are **Temminck's Lodge, Oukraal and Rustwood** (page: `/accommodation`, nav label "The Safari Lodges").
- **`RouteMap`** — styled static SVG from `route.ts`: loop Temminck's Lodge → Oukraal → Rustwood → Temminck's Lodge, three day-coloured segments, lodge pins, legend, `role="img"` + `<title>`/`<desc>` + text equivalent. No mapping library.
- **`FaqAccordion`** — accessible native `<details>/<summary>`; keyboard + SR friendly.
- **`RatesTable`** — the flagship matrix only: **rate year × season**, per person sharing for the whole trail, every figure derived from `data/rates.ts` (Part 17). Each rate year has two rows: the flagship rate, then the derived SADC resident rate (`sadcRateRows`), whose label links to the FAQ at `/logistics#sadc-resident` (operator decision, 23 September 2026). Only the first rate year shows by default; later years sit behind a native `<details>` toggle ("Show 2028 rates") beneath it. Currency tabs (ZAR/EUR/GBP/USD) are an indicative display conversion; ZAR is the only charged currency.
- **`BookingWidget`** (island) — see Part 9 and Part 17. Takes a `catering` **prop** (`'catered'` on `/rates`, `'uncatered'` on the unlisted page): catering is never asked of the guest. Five steps: group size, with a required tick confirming every guest will be at least **16** on the start date (`MIN_GUEST_AGE` in `data/policies.ts`; `createCheckout` refuses without it) → **country of residence** (a native `<select>` over the ISO list; the self-catered mount offers only the 16 SADC states) → start date → details → review and pay. The price breakdown shows the rate for the guest's own band and the last-minute reduction only: it must never show a rack rate with a resident reduction beneath it. **Each mount sells exactly one product and must never name the other**: a date held by the other product's departure is drawn and announced as plain "unavailable", and the calendar legend carries three keys (open, guaranteed departure, unavailable), not four.
- **`InquiryForm`** (island, optional) — fields Name, Group Size, Target Dates, Contact Details; validation + length caps + accessible errors + honeypot + calm success; POPIA note; submits via the `createInquiry` action (stores in Supabase or emails operator); **no PII in storage on the client**; never a raw HTML `<form>` submit in a React island.
- **`Seo`** — props `title`, `description`, `path`, `image`, `type`, `noindex`, `jsonLd[]`; emits meta + OG/Twitter + JSON-LD. **Only acceptable `set:html`** is our own serialized JSON-LD — never user input.

---

## Part 8 — Content &amp; data (per page)

Source of truth for the website = the **15 September 2026 memo**. Reproduce given strings **verbatim**. Bulk data lives typed in `src/data/*.ts`. Where this Part still describes the retired product (per-group pricing, self-catering as a public option, the Rotavi/VierVanAcht lodge names), **Part 17 governs**.

**Global strings (`site.ts`):** name "Rooiberg Wander"; operator "Rooiberg Wander" (the new operating company is not yet registered — Part 14); location "Rooiberg, Limpopo, South Africa"; terrain ~15,000 ha; hook **"An all-inclusive, point-to-point walking expedition with private trail guides connecting three private safari lodges."**; max 8 guests per departure; operator notify email `hanlie@rooibergwander.co.za`.
**Nav:** Home · The Trail · The Safari Lodges · Trail Logistics &amp; FAQ · Rates &amp; Booking. (`/sadc-slackpacking` is **never** in the nav.)

### 8.1 Home (`/`)
Sections: Hero → Stats bar → Wilderness-promise/intro → teasers (Trail, Sanctuaries, Rates) → Footer.
- Hero: full-bleed landscape showing the **vertical drama** of the Rooiberg; earth-gradient scrim; headline conveys *three days on foot through a private Big 5 wilderness*; eyebrow **"Malaria-free · Luggage portage · Hearty bush hospitality · Rooiberg, Limpopo"**; subline = the hook; primary CTA → Rates &amp; Booking.
- Stats bar: the four items, directly below the hero.
- Intro (memo, verbatim): a 3-night, 3-day **all-inclusive authentic wilderness walking trail, rather than a sedentary vehicle safari**, across 15,000 ha near Rooiberg, 2.5 hours from OR Tambo; characterful, established private bush lodges, minimum booking size 2; hearty, wholesome bushveld fare served family-style around the boma fire with selected South African estate wines and local beers; you walk 15 to 20 km per day while luggage and provisions move ahead; and the exclusivity line — book out all 8 spots and the trail and each lodge are reserved solely for your group.
- The old "Why walk the Rooiberg Wander" four-column section is **deleted** (memo p.5) and must not return: its Exclusive and Shared-departure columns described the retired day-of-week model.
- **Acceptance:** hero is the LCP element (eager, `fetchpriority="high"`, optimised AVIF/WebP, explicit dims); stats legible at 380px; one `<h1>`; CTA keyboard-reachable.

### 8.2 The Trail (`/the-trail`)
Explicitly state: guests **do not walk on the arrival day**, and **depart immediately after the final walk on Day 4.** Premium vertical timeline from `itinerary.ts`:

| Day | Title | Distance | Detail |
|---|---|---|---|
| **1** | Arrival &amp; Briefing | **No walking** | Arrive and register at **Temminck's Lodge**. Secure parking, full safety and route briefing by the two armed trail guides, dinner around the boma fire. |
| **2** | The Mountain Crossing | ~15 km | Trek **Temminck's Lodge over Groenkop to Oukraal.** Luggage and provisions moved ahead. |
| **3** | The High Ridge Traverse | ~20 km | Walk **Oukraal to Rustwood** through the Elandsberg L-Kloof, by way of the **Welgedacht lookout** over the Marakele range. |
| **4** | The Plains &amp; Departure | ~18 km | Cross the open plains along the Sand River back to **Temminck's Lodge.** Shower, share a final meal, collect vehicles and depart. |

- **Acceptance:** Day 1 flagged "No walking"; timeline clean on mobile; day colours match the route map.

### 8.3 The Safari Lodges (`/accommodation`)
Three characterful, established private bush lodges under one standard (don't fabricate amenities):

| Name | Role | Notes |
|---|---|---|
| **Temminck's Lodge** | The Valley Basecamp · Start &amp; End Point | Arrival, registration, briefing; departure point. |
| **Oukraal** | The Bush Lodge · Night 2 | Reached on Day 2 after the crossing over Groenkop, with a pool, fire-side and dinner waiting. |
| **Rustwood** | The Mountain Lodge · Night 3 | Highest lodge on the trail, long views across the Waterberg. |

**Lodge naming is settled:** Temminck's Lodge (was Rotavi) and Rustwood (was VierVanAcht/ViervanAcht, then Blackwood; renamed September 2026). The old names must not reappear in copy.

**Intro sentence (memo, verbatim):** "Each of the three private lodges is fully equipped to the same premium standard including a pool and WiFi. Everything you need is waiting when you arrive." The self-catering kit (equipped kitchen, fridge, ice, firewood) is deliberately **not** listed: the flagship guest does not cook. **Acceptance:** three cards, equal standard, distinct character; descriptive `alt`; editorial variety.

### 8.4 Trail Logistics &amp; FAQ (`/logistics`)
Mandatory blocks (accordion or clean sections):
1. **Dining (all-inclusive):** breakfast at the lodge, a bush brunch on the trail, refreshments on arrival, dinner family-style around the boma fire with selected South African estate wines and local beers. A fixed, wholesome menu built without high-risk allergens (nuts, shellfish); enough variety for straightforward vegetarian preferences, but not for extensive or highly specific diets. Spirits excluded apart from gin for sundowners; wine and beer served as a curated daily selection, because guests walk 15 to 20 km the next morning in Big 5 terrain. *(Drawn from business plan §6.2/6.3 — operator to confirm the exact wording.)*
2. **Luggage:** bags and provisions move ahead between lodges daily; a chef travels with the group.
3. **Safety protocols (non-negotiable, prominent):** the **Two-Man Rule** — accompanied **at all times by two qualified, armed wilderness guides** for safe tracking in a Big 5 environment. The reserve is 100% malaria-free.

Keep **visible** Q&A (LLMs cite it — Part 10). Two FAQ items carry anchors the site links to: `#sadc-resident` (who counts as an SADC resident: the 16 member states by name, derived from `data/countries.ts`, with a valid ID or passport shown at registration) and `#minimum-age` (the child policy: every guest at least 16 on the start date, for safety; an under-16 guest is refused entry with no refund, also stated as a clause in `refundPolicy`). **Acceptance:** accordion keyboard/SR friendly; safety block emphasised.

### 8.5 Rates &amp; Booking (`/rates`)
Sells the **flagship only**. The full rate table, the discount chain and the availability rules are in **Part 17**; this page renders them, never restates them as literals.

- Intro: one price per person for the whole 3-night trail, VAT and levies included, from 2 guests up, varying by season. Plain, one fact per sentence: a child should be able to follow how to book.
- `RatesTable` = rate year × season, a flagship row and an SADC resident row per year, with a "Who qualifies?" link to the FAQ definition. The rest of the page stays international-only.
- **No forward-looking operational copy** (when more start days open, how far ahead each band books). Those rules hold; the calendar enforces them by not offering the date.
- "Every rate includes" line: two trail guides · all meals, with selected South African estate wines and local beers · daily baggage transport · all conservation levies and VAT.
- The old **"Two ways to book"** block is deleted (memo p.11); one "How a departure works" block states who a departure takes and which days run.
- Hosts the **BookingWidget** (Part 9/17) plus the enquiry path, and the cancellation policy.
- **Acceptance:** widget + table fully usable by keyboard/SR; no per-night figure anywhere; on-brand; calm.

### 8.6 Route data (`route.ts`) — for the styled static map
Loop **Temminck's Lodge → Oukraal → Rustwood → Temminck's Lodge**; three day-coloured segments, with landmark labels from the business-plan route sketches (illustrative; no GPS needed):
- **Day 2** (`--color-day2`): Temminck's → Oukraal · Daskop dam · Groenkop summit · Exit of Groenkop climb · Scenic dam.
- **Day 3** (`--color-day3`): Oukraal → Rustwood · Entrance to L-Kloof · Wooden bridge · Welgedacht lookout · Scenic ravine.
- **Day 4** (`--color-day4`): Rustwood → Temminck's · Scenic riverbed walk · Scenic viewpoint · Welgedacht plains · Matopo Point · Picnic at dam.
Three pins (Temminck's Lodge, Oukraal, Rustwood); legend Day 2/3/4; text equivalent for a11y.

### 8.7 Imagery
Real client photography now lives in `src/assets/images/` and is served through `astro:assets`. Outstanding gaps (chase, do not fabricate): interior/lodge photography for all three lodges (the current images are landscape and wildlife), and hi-res replacements for the low-resolution panorama and sunset files.

### 8.8 SEO metadata starters (tune in build; keyword-optimised titles in Part 10)
| Page | Title | Description (≤155 chars) |
|---|---|---|
| Home | Rooiberg Wander — All-inclusive Big 5 Walking Safari | An all-inclusive walking safari in the Waterberg. 3 nights and 3 days through 15,000 ha of malaria-free Big 5 reserve, 2.5 hours from OR Tambo. |
| The Trail | The Trail — Day-by-day walking safari itinerary | Day by day through the Rooiberg: arrival, then three 15 to 20 km mountain days over Groenkop, the high ridge to Rustwood and the open plains. |
| The Safari Lodges | The Safari Lodges — Three private trail lodges | Temminck's Lodge, Oukraal and Rustwood: three characterful private safari lodges, each with a pool and free WiFi, reserved for your group. |
| Logistics &amp; FAQ | Trail Logistics, Safety &amp; FAQ | All-inclusive dining, daily luggage portage, two experienced trail guides under the Two-Man Rule, moderate-to-challenging grading, 100% malaria-free. |
| Rates &amp; Booking | Rates &amp; Booking — Book the trail | An all-inclusive walking safari from R12,720 per person sharing, VAT and conservation levies included. A 30% discount applies to SADC residents. |
| SADC option (unlisted) | SADC Self-catered Slackpacking Option | `noindex`. Never in the sitemap, the nav or llms.txt. |

"Slackpacking" is retired from the flagship's titles and descriptions: it now names the hidden product. One FAQ ("Is this a slackpacking trail?") is kept on Logistics, answered in flagship terms, because the query still has search volume.

JSON-LD via `Seo.astro` + `schema.ts`: `Organization` + `BreadcrumbList` + `WebPage` everywhere; `TouristTrip` on Home/Trail; `TouristAttraction` per lodge; **one** `Offer` (ZAR, the flagship low-season rate) on Rates.

### 8.9 SADC self-catered option (`/sadc-slackpacking`) — UNLISTED
The memo's four paragraphs verbatim, the derived rate line, what is and is not included, and the BookingWidget mounted `catering="uncatered"`. `noindex`; excluded from the sitemap in `astro.config.mjs`; absent from the nav and `llms.txt`. **Not** listed in `robots.txt` — a `Disallow` line would publish the URL to anyone who reads it. Reached only by the QR code on the direct-marketing PDF.

## Part 9 — The booking system (Astro + Paystack + Supabase)

> Converts Rates into a real booking flow. **Marketing pages stay static; only this is dynamic.** Processor-abstracted via `lib/payments.ts` — Paystack-first, swappable to PayFast/Peach/Adumo (Part 1).

### 9.1 Product model
**See Part 17 for the canonical rules.** In summary: the unit sold is **a place on a departure**, priced **per person for the whole trail** (a 4-day window: Day 1 arrival → Day 4 departure), computed **server-side only** in `lib/pricing.ts` from the constants in `data/rates.ts`. A departure takes 8 places; the first booking opens a date and locks its catering, later bookings join in 2s; a party that takes all 8 places has the trail to itself, which is what `booking_type = 'exclusive'` now means (derived by the DB trigger, never asserted by the caller).
- **Deposit vs full (resolved):** 45+ days out pays a 50% deposit with the balance collected by emailed link 45 days before arrival; inside 45 days pays in full. `BOOKING_DEPOSIT_PERCENT` is no longer read.
- **VAT:** prices are quoted and charged VAT-inclusive. The guest document is a **payment receipt, not a tax invoice**, until the operating company's VAT number is supplied (Part 14). Do not invent one.
- **Amount unit:** Paystack expects the amount in the **currency subunit** (ZAR **cents**). `lib/pricing.ts` works in cents — pass the value straight through.

### 9.2 Flow (Paystack hosted checkout + webhook)
1. **BookingWidget** (island) collects group size, **country of residence** (with the residency confirmation where it applies), start date and lead-guest details → calls the **`createCheckout` Astro Action**. Catering comes from the widget's `catering` prop, not the guest; the rate band is derived server-side from the country, never sent.
2. **Server (Action):** zod-validate input; refuse an invalid product/residency pairing, a taper day, or a date outside the product's window; read the date's current seats + catering lock for a friendly message; **compute price server-side** (`computeQuote`); create a **`pending` booking** row with `hold_expires_at = now() + HOLD_MINUTES` (the `bookings_slot_guard` trigger serialises concurrent seat-grabs under an advisory lock and is the authority) and a unique `processor_reference`; **initialize a Paystack transaction** server-side (`POST https://api.paystack.co/transaction/initialize` with `email`, `amount` in cents, `currency: "ZAR"`, `reference`, `callback_url=/booking/confirm`, `metadata.booking_id`) using the **secret key**; return the `authorization_url`.
3. **Redirect** the browser to the Paystack-hosted `authorization_url` (card data never touches our server → PCI **SAQ-A**).
4. **Webhook** `POST /api/payments/webhook` (`prerender=false`): read the **raw body**, **verify `x-paystack-signature`** = HMAC-SHA512 of the raw body using the **secret key**; on `charge.success`, **independently call Verify Transaction** (`GET /transaction/verify/:reference`) to confirm status + amount, then **idempotently** (guard on booking status) set the booking `confirmed`, record `processor_txn_id`, set `amount_paid_cents`, clear the hold → trigger confirmation + operator-notification email.
5. **`/booking/confirm`** (callback) verifies the transaction server-side by `reference` and shows a calm confirmation; **`/booking/cancel`** (or an abandoned/expired hold) marks the pending booking `cancelled`/releases the hold. **Never** confirm a booking from the callback redirect alone — the webhook (verified) is the source of truth.
6. **Expiry:** pending holds past `hold_expires_at` are treated as not blocking (the availability view filters them) and swept by a scheduled job or on-read.

### 9.3 Data &amp; libs
- Schema + RLS: `supabase/migrations/` applied in filename order (bookings, inquiries, blocked_dates, pretrip_details, payment_events, admin_audit, rate_limits; the anon-readable `departure_inventory` view; **RLS default-deny**; the `bookings_slot_guard`/`bookings_window_guard` triggers). **0016 is the current head** and drops the `bookings_unique_start_date` index — capacity is enforced entirely by the slot guard now.
- `lib/supabase.ts`: a **server** client built with `SUPABASE_SERVICE_ROLE_KEY` (server only) + an optional **anon** client for reading `departure_inventory`.
- `lib/db.types.ts`: the **single source of truth for row shapes** — one hand-written mirror of the migrations, as runtime column tuples plus row types. `scripts/verify-admin.mjs` parses the migration SQL and asserts they match, so a drifted schema fails the build rather than failing silently at runtime.
- `lib/payments.ts`: a small **processor interface** (`initCheckout`, `verifyTransaction`, `verifyWebhookSignature`) with a **Paystack** implementation using `fetch` + the secret key. Keep the interface clean so PayFast/Peach/Adumo can drop in.
- `lib/pricing.ts`: the single price authority (already in repo).

### 9.4 Edge cases &amp; UX
Concurrency (two parties, same date) — the advisory lock in `bookings_slot_guard` serialises them and the loser's insert fails; surface "only N place(s) left" rather than a generic error. Abandoned checkout → the hold expires and the places free. A party below the product minimum, above capacity, on a taper day, or outside its window is refused with the reason **and the route out**. A date already locked to the other catering is shown and explained, never silently greyed. The residency choice changes the server total (re-quoted server-side; the widget's figure is an estimate). Never act on a price from the client.

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
Be cited when someone asks an AI about Waterberg walking safaris. Write for extraction: **question-shaped `<h2>`s** matching real queries, each **answered in the first sentence**, then detail. Be specific and quotable (3 nights, 15 to 20 km/day, max 8, Two-Man Rule, lodge names, Waterberg, all-inclusive, malaria-free). Entity clarity &amp; consistency (identical naming; `Organization` schema; clear About). Earn mentions in already-ranking listicles ("best slackpacking trails in South Africa"). Ship `llms.txt`; allow AI crawlers. The same clarity serves humans, classic SEO, and AI.

### 10.6 Crawler &amp; AI-bot policy
`robots.txt` allows general crawling + **explicitly allows** `Googlebot`, `Bingbot`, `Google-Extended`, `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `anthropic-ai`; references the sitemap. (Opting out of AI use later = disallow per bot; client's call.) Ship `llms.txt`.

### 10.7 Local SEO
Google Business Profile (client action — highest local lever); NAP consistency; `LocalBusiness`/geo schema (Temminck's Lodge basecamp geo, Waterberg/Limpopo region); locality terms in copy (Waterberg, Limpopo, D970, private Big 5 reserve); plan for reviews.

### 10.8 Internationalisation
Primary `en-ZA`, ZAR. The international rate is the rack rate; the SADC rate is the discount off it (Part 17), so there is no separate "international premium" to state. **Do NOT add `hreflang`** now (only correct with separate localized URLs; premature use creates errors). Revisit only if localized pages are built.

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
| **Category (compete via specificity)** | guided walking safari south africa · waterberg hiking trails · luxury walking safari · all-inclusive walking safari | Be the Waterberg + Big-5-trail answer. "Slackpacking" now belongs to the hidden product and is not a flagship target, though the Logistics FAQ still answers the query. |
| **Head (don't chase; ride via listicles/GEO)** | walking safari south africa · big five safari | Third-party lists + AI citation only |

**Global entities** (use consistently in copy, schema, `llms.txt`, alt): brand *The Rooiberg Wander*; categories *all-inclusive walking safari, guided walking trail, Big 5 on foot, multi-day hiking trail, point-to-point, luggage portage, malaria-free*; places *RoiSan Reserve, Waterberg, Waterberg Biosphere, Limpopo, South Africa, private Big 5 reserve, D970*; trail *Temminck's Lodge, Oukraal, Rustwood, Groenkop, Elandsberg L-Kloof, Welgedacht lookout*; features *Two-Man Rule, two armed wilderness guides, FGASA Lead Trails Guide, 15 to 20 km/day, 3 nights/3 days, max 8, conservation levies included, VAT included*; operator *Rooiberg Wander* (the operating company is being re-registered — Part 14).

**Per-page (primary → owner; questions feed GEO H2s):**
- **Home** — primary `Big 5 slackpacking trail` (brand-led); secondary: walking safari Waterberg · exclusive guided walking trail · private game reserve walking trail. Q: What is the Rooiberg Wander? Where is it? How is it different from a normal walking safari?
- **The Trail** — primary `3 day walking trail itinerary`; secondary: point-to-point walking trail · Rooiberg Wander route · ~20 km per day · lodge-to-lodge. Q: How long is it? How far each day? Do you walk on arrival day? Where does it start/end?
- **The Safari Lodges** — primary `Waterberg trail lodges`; secondary: Temminck's Lodge · Oukraal · Rustwood · walking safari lodges. Q: Where do you sleep? What are the three lodges? What is included?
- **Logistics &amp; FAQ** — primary `all-inclusive walking safari`; secondary: is a walking safari safe · armed guides walking safari · is this slackpacking · luggage transfer hiking trail · malaria-free Big 5. Q (answer-first): What is slackpacking? Is it safe in a Big 5 reserve? How many guides? What is the Two-Man Rule? Catered or self-catered? Who carries luggage/food? What to bring? Is the route finalised?
- **Rates &amp; Booking** — primary `Rooiberg Wander rates` / `Big 5 walking safari cost`; secondary: walking safari price South Africa · book guided walking safari Waterberg · SADC resident rate. Q: How much? What's included? Per person or per group? Is there a local rate? How do I book?

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
- **A01 Broken Access Control** — **RLS default-deny** on all tables; the browser never reads others' bookings. All writes server-side via the **service-role key** (server only). The public anon client may read **only** the sanitised, PII-free `departure_inventory` view. No admin route ships without auth.
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
- Use the exact strings in Parts 8 and 17 for hook, stats, itinerary, rates, and safety copy.
- Hook: **"An all-inclusive, point-to-point walking expedition with private trail guides connecting three private safari lodges."** (`site.hook`, rendered in both the hero and the footer.)
- Operator-notify email: `hanlie@rooibergwander.co.za`.
- Lodge names are **Temminck's Lodge, Oukraal, Rustwood**. "Rotavi", "VierVanAcht", "ViervanAcht" and "Blackwood" must not appear in copy.
- **No em-dashes or en-dashes in user-facing text.** Use a colon, a comma or a full stop. Write "barbeque", not "braai". Plain international English; classy and informative, never salesy.
- **Prices are per person, sharing, for the whole trail, VAT-inclusive.** Never publish a per-night figure, an owner split, a margin, or the business plan's cost assumptions.
- **VAT:** prices include VAT at 15% and all conservation levies. The guest document is a **payment receipt**; it becomes a tax invoice only when the operator supplies a VAT registration number. Never invent one.
- **The hidden product stays hidden.** Never link `/sadc-slackpacking` from the nav, the footer, the sitemap, `llms.txt` or any public page.
- Don't add pages, change the flow, or introduce features not in the memo unless explicitly asked.

## Part 13 — Workflow &amp; git
Small logical commits, one page/component each; conventional messages (`feat: home hero + stats bar`). Run `npm run verify` before every commit. Don't push/open PRs unless asked. Don't touch lockfiles/CI/unrelated files without reason. End each turn with: what changed, verify/build result, and any "Open questions / placeholders" needing human input.

## Part 14 — When to ask vs. proceed
- **Proceed** (with a labelled placeholder) for: missing images, unspecified microcopy, exact pixel spacing, icon choices.
- **Ask** for: anything contradicting the memo; adding a page/feature beyond what it specifies; changing pricing or the operator email; adding a dependency or third-party embed (also a Part 11 entry); anything needing real banking or legal input.
- **Resolved, do not re-ask:** payment provider (Paystack, cards only, no Instant EFT), email provider (Resend), Supabase region (eu-west-2), deposit rule (50% at 45+ days), refund policy (2-tier, in `data/policies.ts`).
- **Open with the operator (September 2026):** the VAT registration number and the new operating company's registered name and number (both block turning receipts into tax invoices and completing the privacy page); whether to publish a 2029 row in the rate table; what happens to rates after 2029; who produces the two marketing PDFs and hosts the QR target; and confirmation of the all-inclusive dining copy drawn from business plan §6.2/6.3.
- Attempt a complete section first, then list questions — don't block on minor ambiguity.

## Part 15 — Consolidated pre-launch checklist
**Build/UX:** all pages render 380/768/1280; one `<h1>`/page; Part 5 treatment; §5.9 filter passed; mobile-perfect nav/timeline/pricing/booking. **Content:** exact strings present (hook, stats, itinerary incl. "No walking" Day 1, rates, Two-Man Rule); the flagship rate table matches Part 17 exactly; no internal financials; no per-night figure anywhere; the hidden page is unlinked, noindexed and absent from the sitemap. **SEO:** `Seo.astro` on every page; question-shaped H2s; JSON-LD validated; sitemap (images, api/booking excluded) + AI-aware robots + llms.txt; CWV targets in lab + plan field monitoring; `en-ZA`/ZAR; no premature hreflang; GSC + Bing verified. **Booking:** Supabase schema + RLS applied through **migration 0016**; server price authority; holds, product minimums, catering lock, capacity, taper and per-product windows tested (`scripts/verify-*.mjs` and both SQL harnesses); Paystack test-mode E2E (initialize → hosted checkout → webhook verified + Verify Transaction → confirmed → email); confirm/cancel pages; Paystack account verified (business onboarding). **Security:** full Part 11.10 checklist. **Open questions resolved or listed:** the Part 14 list (VAT number, company registration, 2029 rates, the marketing PDFs, the dining copy).

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
9. **Sanctuary spelling** (VierVanAcht vs ViervanAcht). **Superseded by v4:** the lodges were renamed to **Temminck's Lodge** and **Blackwood**, and Blackwood was later renamed **Rustwood** (September 2026); none of the old names survive (Parts 8.3, 12, 17).
10. **Placeholder email spelling.** The original brief's misspelled placeholder has been corrected to `hanlie@rooibergwander.co.za` (corrected from original brief; Parts 8, 12).
11. **"Conceptual route" vs taking real bookings.** **Flagged:** bookings can be taken for future dates; the route-status notice stays. Whether to open live availability while the route is conceptual is a **product decision** (Part 14).
12. **Privacy stance** ("form data not stored" → bookings stored). **Resolved:** explicit POPIA program — minimisation, consent, retention, processors, region, Privacy page (Part 11.7).
13. **Payment provider: Stripe → Paystack (this revision).** The prior draft used Stripe, but Stripe does **not** natively onboard South-Africa-registered businesses in 2026 (SA access only via its Paystack network). **Resolved:** switched to **Paystack** (Stripe-owned; SA's leading developer-first gateway; onboards SA businesses, ~1–3 day verification). This **also resolves** the earlier go-live blocker. The integration is **processor-abstracted** (`lib/payments.ts`) so PayFast (most ubiquitous SA gateway, widest local methods incl. Instant EFT), Peach Payments (enterprise/recurring), or Adumo/Lesaka (largest SA acquirer) can be swapped in. Changed throughout: stack (Part 2), commands (Part 3, dropped the Stripe SDK — Paystack via `fetch`), structure (`lib/payments.ts`, Part 4), booking flow (Part 9: initialize transaction → hosted `authorization_url` → webhook `x-paystack-signature` HMAC-SHA512 + Verify Transaction), security (Part 11.2/11.4/11.6), env (`PAYSTACK_SECRET_KEY`/`PUBLIC_PAYSTACK_PUBLIC_KEY`; no separate webhook secret), and the DB columns (`processor`/`processor_reference`/`processor_txn_id`, default `paystack`).

---

**This consolidated file supersedes the former six documents. Read the relevant Part, then build from Part 6 step 1.**

14. **Commercial model v2 → v3 (July 2026), recorded for history.** Between the June brief and this revision the product went through two intermediate models that are no longer live: **v2** (catered/uncatered flat group rates, VAT removed after the operator confirmed no VAT registration, lodges renamed to Temminck's/Blackwood (now Rustwood), booking opening 15 January 2027) and **v3.1** (per-person-per-night pricing, Wednesday/Thursday exclusive buyouts of exactly 8, shared departures every other day, 18/8-month booking windows). Both are superseded by Part 17. The CHANGELOG carries the detail.

15. **Commercial model v4 (15 September 2026 memo) — the current model.** The public site sells the **all-inclusive catered safari only**, at a per-person-per-trip rate with a 30% SADC resident discount; the self-catered product moves to the unlisted `/sadc-slackpacking` page; the day-of-week exclusivity rule is replaced by a **tapered start** (Sun/Mon/Thu/Fri until 31 December 2028); booking opens **1 April 2027**; rates rise 8% in 2028 and a further 5% in 2029; booking windows become 24 months (international catered) and 12 months (every SADC product). **Full specification: Part 17.** Changed throughout: Parts 1, 5.1, 7, 8.1–8.9, 9.1–9.4, 10.5/10.7/10.8/10.11, 12, 14, 15.

16. **VAT: "no VAT charged" → VAT-inclusive.** v2 removed all VAT language after the operator confirmed the entity was not VAT-registered. The 15 September memo prices everything "VAT and Conservation Levy included" and adds VAT to the rates-page includes line. **Resolved:** customer-facing copy and the payment receipt now state that prices include VAT at 15%. **Deliberately NOT resolved:** the guest document remains a *receipt*, not a SARS tax invoice, because that requires the supplier's VAT registration number and the operating company is being re-registered. Flagged in Part 14; `lib/email.ts` carries a comment naming exactly what to add when the number arrives.

17. **"Exclusive" stops being a product.** v3.1 sold an exclusive buyout on Wednesdays and Thursdays for exactly 8 guests. v4 has one kind of departure: 8 places, opened by the first booking and joined by later ones. Exclusivity is simply what a party of 8 gets by taking every place, so `booking_type` is now **derived by the `bookings_slot_guard` trigger** rather than asserted by the application. The `bookings_unique_start_date` index that enforced "one exclusive booking per date" is dropped: it could no longer reject anything the seat count does not already reject.

18. **Resident rate: hidden → shown in the table (23 September 2026).** Part 17.1 recorded the operator's 16 September decision never to disclose the SADC resident rate. The operator reversed it one week later: the `/rates` table now shows an SADC resident row per year, and the Logistics FAQ defines who qualifies. The disclosure is deliberately narrow (table and FAQ only); meta, JSON-LD, `llms.txt` and the booking widget are unchanged. Same day: a **child policy** (minimum age 16 on the start date) was added to the booking form's step 1 as a required tick, enforced in `createCheckout`, and to the FAQ.

---

## Part 17 — Commercial model v4 (canonical specification)

> **This Part is authoritative.** Where any earlier Part disagrees about what is sold, what it costs, who may book it or when, Part 17 wins. Source: the 15 September 2026 memo to Francois, with internal context from the 5 September 2026 business plan.

### 17.1 What the site sells

| Product | Public? | Catering | Residency | Min | Max | Booking window | Where it is sold |
|---|---|---|---|---|---|---|---|
| **All-inclusive catered safari** (the flagship) | Yes | catered | international | 2 | 8 | 24 months | `/rates` |
| **The same trail, SADC resident rate** | **No, never disclosed** | catered | sadc | 2 | 8 | 12 months | applied automatically at `/rates` |
| **SADC self-catered slackpacking option** | **No** | uncatered | sadc | 8 | 8 | 12 months | `/sadc-slackpacking` only |

**The resident rate is disclosed in the rates table and the FAQ only** (operator decision, 23 September 2026, reversing the 16 September decision to keep it off the site). The `/rates` table shows an SADC resident row for each year, linked to the FAQ definition at `/logistics#sadc-resident`. Everywhere else stays international-only: no "SADC" in the rest of `/rates`, the home page, `how-pricing-works`, meta descriptions, JSON-LD or `llms.txt`, and the booking widget still never names the band. The booking form asks **one plain question, country of residence**, from a full ISO country list, and the band is **derived from the answer server-side** (`data/countries.ts` → `residencyForCountry()`); the browser never sends a band, so a tampered payload cannot buy the resident rate. A guest who names a SADC country is additionally asked to confirm they can show ID at registration. `scripts/verify-surfaces.mjs` fails the build if any of those surfaces or `llms.txt` names the band, and checks that the table's resident rows are derived and linked.

**No rate data ships with the booking page at all** — not the base rate, not the resident factor, not the list of countries it applies to. Once a guest names a country, the **`getRateContext` action** returns the base rate for *that band only*, plus whether to ask for the ID confirmation and how far ahead they may book; the widget computes its estimate from that one figure. What stays client-side is the season, rate-year and last-minute arithmetic: public rules that apply to everyone and are already in the copy. A reader of the page source finds nothing, and a guest never receives the other band's numbers. This also removes the estimate-versus-charge drift risk: both now resolve from the same constants through the same code path.

A product is `catering × residency`; there are no other columns. **International self-catered is not sold**: the hidden page states that a guest who cannot show SADC proof at check-in pays a 100% premium, which is an on-the-day operator matter, not something the engine prices.

Why the split: the business plan (§5.3) is explicit that a mixed offer confuses the DMCs the inbound bookings depend on. The self-catered product is marketed directly to South African walking clubs via a PDF carrying a QR code that opens the unlisted page.

### 17.2 Rates: per person, per trip

The unit is **one person, for the whole 3-night trail**, VAT and conservation levies included. There is no shorter stay, so **no per-night figure may appear anywhere on the site**, even though the operator's internal model is nightly.

2027 base rates (`BASE_PP_TRIP` in `src/data/rates.ts`):
- Catered: **R15,900**
- Self-catered: **R4,950**

The published table, which the engine must reproduce exactly:

| | High season | Low season |
|---|---|---|
| **All inclusive 2027** | R15,900 | R12,720 |
| **All inclusive 2028** | R17,172 | R13,737 |

Beneath each year, an **SADC residents** row at 30% off (2027: R11,130 / R8,904; 2028: R12,020 / R9,616), derived through the same chain as the charge, never typed.

### 17.3 The discount chain

Resolved in this order, per person, then multiplied by party size:

```
base(catering)
  → × rate-year multiplier      2027: 1.0   2028: 1.08   2029: 1.134  (8%, then a further 5%)
  → × 0.8 if low season         high = 1 Apr–31 Oct and 15 Dec–15 Jan
  → × 0.7 if SADC and catered   (the self-catered rate is already a resident rate)
  → × 0.78 if 8–21 days out     the last-minute discount, all products
  → FLOOR to the whole rand     once, at the end
  → × group size
```

**The flooring is load-bearing.** 12,720 × 1.08 = 13,737.60, and the operator's published table reads R13,737. Round-half-up would put a figure on the site the operator never published. It also always rounds in the guest's favour. `roundRateRand()` in `data/rates.ts` is the single definition; `scripts/verify-pricing.mjs` §A guards it.

A start date is priced by **the calendar year it begins in**. A date beyond the last published year holds the last multiplier — flagged for the operator (Part 14), not invented.

### 17.4 How a departure forms

Every open start day works identically. There is no day-of-week product rule any more.

- A departure has **8 places** (the FGASA cap: two armed guides to eight walkers).
- The **first booking opens the date** and must meet the product minimum: **2 catered, 8 self-catered**. Its catering choice **locks the date**.
- **Later bookings join** with at least **2** people, matching the locked catering, while places last.
- Once a date carries a booking, the site shows the memo's exact line: **"Guaranteed Departure: 2 of 8 spots booked. 6 spots available."**
- A party taking all 8 places has the trail and each lodge to itself. That is what `booking_type = 'exclusive'` means, and it is **derived by the `bookings_slot_guard` trigger**, never sent by the client.

### 17.5 When a departure may start

- **Online booking opens 1 April 2027** (`BOOKING_OPEN_DATE`). Earlier dates are family-and-friends-by-enquiry only; walks before that date are invoiced manually.
- **Tapered start:** Tuesday, Wednesday and Saturday are **not** start days for any date up to and including **31 December 2028**, so departures run **Sunday, Monday, Thursday and Friday**. Every weekday opens from 1 January 2029. This caps the reserve at two groups a day while guiding capacity is built up.
- **Rolling windows**, anchored to the later of today and the opening date so each opens at full length on launch day: **24 months** for international catered, **12 months** for every SADC product.
- **T-7 close:** the last seven days before a departure are not bookable online; that week is reserved for staffing.

### 17.6 Payment (unchanged from v3)

45+ days out: **50% deposit** now, balance collected by emailed Paystack link 45 days before arrival. Inside 45 days: **pay in full**, non-refundable thereafter. Refunds: full refund less a 5% administration fee at 45+ days; nothing inside 45 days or for a no-show (`data/policies.ts`).

### 17.7 Where each rule lives

| Rule | Display / client | Server authority | Database |
|---|---|---|---|
| Rates, discounts, rate years | `data/rates.ts` | `lib/pricing.ts` | — |
| Country list, country → rate band | `data/countries.ts` (renders the options only) | `getRateContext` + `createCheckout`, both via `residencyForCountry()` | `bookings.lead_country` (0016) |
| Product minimums, capacity | `data/rates.ts` | `actions/index.ts` | `bookings_slot_guard` (0016) |
| Catering lock | widget calendar | `actions/index.ts` | `bookings_slot_guard` (0016) |
| Taper, booking windows, T-7 | widget calendar | `lib/pricing.ts` + `actions/index.ts` | `bookings_window_guard` (0016) |
| Availability | `departure_inventory` view (anon) | — | `departure_inventory` (0016) |
| `booking_type` | not sent | derived, advisory only | **derived authoritatively** (0016) |

The DB triggers cannot import from `src/`, so they restate the numbers in SQL. That duplication is policed, not tolerated: `scripts/verify-minimums.mjs` and `scripts/verify-window.mjs` parse the constants back out of migration 0016 and fail if they drift from the TypeScript. **Any change to a rate, a minimum, a window or the taper must change both sides and keep those scripts green.**

### 17.8 Verification

```
npx tsx scripts/verify-pricing.mjs    # the published rate table, the flooring edge, the whole chain
npx tsx scripts/verify-minimums.mjs   # group rules: TypeScript vs the 0016 trigger
npx tsx scripts/verify-window.mjs     # windows, taper and launch gate: TypeScript vs 0016
npx tsx scripts/verify-surfaces.mjs   # no page hardcodes a rate the engine computes
npx tsx scripts/verify-admin.mjs      # db.types.ts mirrors the migrations
npx tsx scripts/verify-inventory.mjs  # the availability view's shape and its one client
npx tsx scripts/verify-calendar-states.mjs  # calendar a11y: colour is never the only cue
npx tsx scripts/verify-currency.mjs   # the FX tabs stay display-only
```

Trigger *behaviour* needs a live database: apply `0016`, then run `scripts/verify-trigger.sql` and `scripts/verify-window-trigger.sql` in the Supabase SQL editor (both roll back).

### 17.9 Open with the operator

See Part 14. The two that block work: the **VAT registration number** (turns receipts into tax invoices) and the **new operating company's registered name and number** (needed by `site.ts`, the receipt, the privacy page and `schema.ts`).
