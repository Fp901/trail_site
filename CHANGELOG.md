# Changelog — The Rooiberg Wander

Build progress against the CLAUDE.md **Part 6 build order**. One entry per step; every step
passes `npm run verify` (astro check + build + `npm audit --audit-level=high`) before it is
marked done. Dates are the working dates.

> Standing placeholders (all steps): real photography (hero + 3 sanctuary images),
> verbatim privacy + refund/cancellation text, production domain, `og-default.jpg`,
> `llms.txt` (deferred to a content step). Resolved decisions live in CLAUDE.md / memory.

---

## Rates-page layout, beta-date removal, nav logo, sitewide wording pass — 2026-07-11

Presentation and copy only (plus one guest-facing form fix); no pricing/booking-logic changes.

1. **Enquiry section moved to the bottom of /rates** (after Cancellations & refunds). Keeps the
   beta-aware behaviour: open/prominent before `BOOKING_OPEN_DATE`, collapsed behind "Prefer to
   talk to us first?" after; `#enquire-heading` anchor unchanged.
2. **15 July 2027 beta-end date removed everywhere** (operator: the date was incorrect; the beta
   phase has no fixed end). `BETA_END_DATE`/`BETA_END_DISPLAY` deleted from `rates.ts`; the beta
   banner and `llms.txt` no longer name an end date. `BOOKING_OPEN_DATE` (15 Jan 2027) still
   gates the calendar and the server guard, unchanged.
3. **Navbar branding = footer branding.** The nav now renders the same full logo lockup as the
   footer (`logo-full-cream.png` over the dark hero, `logo-full.png` on cream headers), replacing
   the ridge-strip mark + text wordmark + tagline. `site.headerTagline` removed (nav-only);
   the logo alt text is `site.brandName`. Nav bar height maths kept inside `--nav-h`.
4. **Sitewide wording pass** (from a full copy audit):
   - Tagline standardised to **"A luxury walking safari in the Waterberg"** (`site.ts hook` →
     footer + hero; `llms.txt`) — the old "Self-catering walking safari" overclaimed now that
     catering is optional. Meta descriptions on The Trail and Logistics likewise now say
     "self-catered or catered".
   - **Pre-trip form fix (guest-facing defect):** catered bookings were forced to tick "I
     understand the trail is fully self-catered". The acknowledgment (and its validation
     message) is now conditional on the booking's catering, and catered bookings are prompted
     for dietary requirements in the special-requests field.
   - Capacity phrasing standardised: **"up to 10 guests, with two more by special arrangement"**
     (was a mix of "ten"/"optional two extra"/"by arrangement").
   - Overnight stops standardised as **lodges** in visible copy ("between camps" → "between
     lodges", "camp assistants/staff" → "lodge staff", "What are the camps like?" → lodges;
     "basecamp" for Rotavi is kept deliberately).
   - Email money format aligned with the site: "R52,174" (no space; receipt keeps 2 decimals).
   - Small fixes: `llms.txt` lodge-page URL `/sanctuaries` → `/accommodation`, em-dash removed
     from the contact line; "RoiSan reserve" → "RoiSan Reserve" (the-trail H1); dead
     `quickFacts` export deleted from `site.ts` (unused, and its copy contradicted the flat
     per-group catered rate).

## VAT and legal-entity removal — 2026-07-08 (merged to main, commit `83f7cdc`)

Two operator-driven corrections on top of Booking v2, merged and pushed to `main` in the same
session.

1. **No VAT charged.** The operator confirmed the business is not VAT-registered, so the 15%
   VAT component was mathematically divided out of every price (new price = old VAT-inclusive
   price ÷ 1.15, rounded to the nearest Rand — confirmed with the operator before touching any
   figure, since this is a real pricing decision). `GROUP_RATE_UNCATERED` R60,000 → **R52,174**;
   the catered basis R2,300 pp/night → **R2,000 pp/night** (feeds the fixed `GROUP_RATE_CATERED`,
   see below); `SHARED_PP_NIGHT` R3,950 → **R3,435**. `VAT_RATE`/`vatPortion` removed from
   `rates.ts`; `Quote.netCents`/`vatCents` removed from `pricing.ts`. Every "incl. VAT" label,
   VAT breakdown, and VAT Act citation removed from `rates.astro`, `RatesTable.astro`,
   `policies.ts`, `privacy.astro`, `schema.ts` offer descriptions, and `llms.txt`.
2. **Tax invoice → payment receipt.** Since the operator is not VAT-registered, calling the
   guest document a "tax invoice" would be legally incorrect. `sendTaxInvoice` renamed to
   `sendPaymentReceipt` in `src/lib/email.ts` (single "Amount" line, no VAT breakdown table, no
   VAT Act s20 wording); admin resend `kind` renamed `tax_invoice` → `receipt` across
   `actions/index.ts`, `webhook.ts`, and `admin/bookings/[id].astro`.
3. **Franili Investments removed.** The previously-recorded registered entity, Franili
   Investments (Pty) Ltd, is being wound down; a new company will be formed and its name is not
   yet known. Per the "never invent facts" rule, no new entity name/registration number was
   fabricated — `site.ts` now carries only the trading name `'The Rooiberg Wander'` with a
   comment flagging the pending formal registration; `companyReg`/`vatNo` fields removed;
   `schema.ts` `legalName` omitted from `Organization` JSON-LD (not guessed); `privacy.astro`
   states the entity is "being formalised." Update these together once the new company is known.
4. **Fixed catered pricing (from a prior same-day change, folded in here for the record).** The
   catered exclusive rate is a **flat per-group price regardless of group size**
   (`GROUP_RATE_CATERED`, R112,174), not a per-person-per-night addon — derived once from a
   10-person basis and locked in. Only the shared Monday rate stays per-person.

`npm run verify` clean; pricing spot-check re-run against the live TypeScript source with the new
figures. `feature/booking-v2` merged into `main` with `--no-ff` and pushed
(`4306e3b..83f7cdc main`). Migration `0013_booking_v2.sql` still awaits manual application to
Supabase — see `GO_LIVE_CHECKLIST.md` Part D.

---

## Booking v2: catered/uncatered pricing, shared Monday departures, 2027 go-live gating — 2026-07-08

Four operator user stories, built and pushed to a dedicated branch for review before merging.
`npm run verify` clean; pricing spot-check passed against the live TypeScript source
(exclusive uncatered any size = R60,000; exclusive catered 4 = R87,600; exclusive catered 10 =
R129,000; shared 2 people = R23,700; shared 8 people = R94,800; deposit splits reconcile exactly).

1. **Pricing axis: local/foreign → catered/uncatered.** The international +20% premium is
   removed entirely; the widget no longer asks residency. Private (exclusive) trail: flat
   **R60,000/group incl. VAT**, self-catered as standard; catered option adds **R2,300 pp/night**
   (operator-confirmed). `src/data/rates.ts` + `src/lib/pricing.ts` rewritten around this;
   `computeQuote` now takes `{ bookingType, catering, groupSize, startDate? }`.
2. **New shared Monday departures.** Every Monday is one shared, catered-only slot taking
   MULTIPLE bookings: each booking 2 to 8 people, 8 places total across bookings, priced
   **R3,950 pp/night (PLACEHOLDER — operator to confirm; one constant to edit:
   `SHARED_PP_NIGHT` in `src/data/rates.ts`)**. Enforced server-side (booking type is derived
   from the date, never trusted from the client) AND at the database layer via a new
   `bookings_slot_guard` trigger (migration `0013_booking_v2.sql`) that serializes concurrent
   seat-grabs with an advisory lock and rejects over-capacity inserts/updates — the DB remains
   the last line of defence even if the app-level check races.
3. **Calendar UX.** Mondays render in a new distinct colour (terracotta, `--color-day4`, matching
   the existing route-map day-colour language) with their own legend key "Shared Monday".
   Clicking a Monday switches the booking widget into shared mode: group size caps to the
   seats actually remaining, catering is forced on with a note, and the estimate shows
   `Rx pp/night · Ry pp for the 3-night trail · total for N people`. Any other day stays
   exclusive mode (group rate + optional catering line).
4. **Go-live gating.** Online bookings are accepted for start dates from **15 January 2027**
   only (`BOOKING_OPEN_DATE`, the sole gating date — enforced in the calendar, the
   `createCheckout` action, AND indirectly by the `unavailable_windows` view's date range); every
   earlier date renders unavailable and is rejected server-side with a message pointing to the
   enquiry form / WhatsApp. A new dismissible **beta popup** (`BetaBanner.astro`, mounted in
   `Layout.astro`, once per browser session via `sessionStorage`) explains: booking opens
   15 January 2027; the trail is in beta until **15 July 2027** (`BETA_END_DATE` — this date
   gates nothing, it is copy-only); earlier dates are family-and-friends by enquiry or WhatsApp
   only, at a significant discount. The previous automatic online 75% soft-launch discount
   (`LAUNCH_DISCOUNT`/`LAUNCH_OFFER`) is **removed** — discounts for early dates now happen
   entirely offline, matching the beta banner's own copy.

**Database** (migration `0013_booking_v2.sql`, NOT yet applied to any Supabase project —
apply before testing/merging): `bookings.booking_type` (`exclusive`/`shared`, default
`exclusive`), `bookings.catering` (`catered`/`uncatered`, default `uncatered` — correctly maps
legacy self-catered rows), `residency` made nullable (legacy data preserved, no longer written
by new bookings); `bookings_unique_start_date` now scoped to `booking_type = 'exclusive'`;
`unavailable_windows` redefined to also list Mondays with 7+ of 8 seats taken (fewer than the
2-person minimum remaining) as unavailable; new `shared_slot_availability` view (PII-free:
`start_date, seats_left`) for the calendar's per-Monday seat count.

**Server** (`src/actions/index.ts`): `createCheckout` derives `bookingType` from the date
server-side (Monday → shared) and enforces the 2-8 shared group-size bound + catered-only rule;
catches the trigger's `RW_SHARED_FULL`/`RW_MONDAY_SHARED_ONLY` errors into friendly messages.
`adminCreateCompBooking` swapped residency for catering (comp bookings stay exclusive; Mondays
rejected with a clear message). `adminMoveDates` catches the same trigger errors. Webhook and all
transactional emails (`src/lib/email.ts`) updated to show Type/Catering instead of Residency;
tax invoices describe the product correctly (private self/fully-catered vs shared catered).
Admin dashboard/detail pages show booking type + catering, with a `shared` badge and a
legacy-only "Residency (legacy)" row for pre-v2 bookings.

**Copy sweep** (no em-dashes; plain international English; classy, informative tone):
`site.ts` quickFacts + meta description updated; **`headerTagline` changed from "A Luxury
Slackpack Self-Catering Walking Safari" to "A Luxury Slackpack Walking Safari"** because
catering is now optional — **flagged for explicit operator sign-off before go-live**, it is
the one visible brand-copy change in this batch. `logistics.ts` catering block rewritten;
`inclusions`/`exclusions` in `rates.ts` updated; `public/llms.txt` rates/pricing/launch section
rewritten (also fixed pre-existing stale content: wrong operator name "RoiSan Reserve NPC" →
Franili Investments (Pty) Ltd, and a stale "50% Launch Phase discount" claim); `schema.ts`
`TouristTrip` description updated.

**Open items for the operator** (also in `GO_LIVE_CHECKLIST.md`): confirm `SHARED_PP_NIGHT`
(R3,950 is an industry-standard placeholder, not a quoted rate); confirm the catered pp/night
rate (R2,300) is final; sign off the tagline change; confirm the beta-banner wording and CTAs;
apply migration `0013` before any further testing.

---

## Online indemnity/waiver removed — signed in person on arrival — 2026-07-01  (NOT committed)

Per the solicitor, guests sign the trail indemnity **in person on arrival**, so all online indemnity
collection was removed (the never-applied waiver-record work + the older `indemnityAccepted` checkbox).
Migration `0010` was never run in Supabase, so this is a clean removal with no schema to unwind.
- **Deleted `0010_waiver_record.sql`** (never applied) — `pretrip_details` keeps only `submitted_at`
  + `details` jsonb; no `waiver_*` columns exist.
- **`PretripForm.astro`** — removed the entire indemnity/waiver fieldset (indemnity text, "read and
  understood" checkbox, "type your full name to sign" field) + its client validation/payload. Replaced
  with a short note: *the indemnity is signed in person on arrival at Rotavi Lodge*.
- **`submitPretrip` action** — dropped `indemnityAccepted` + `waiverSignatureName` from the zod input,
  the acceptance check, and the `details`/waiver columns from the upsert. Still writes guest manifest,
  contact, medical, vehicle, arrival, special requests, self-catering ack + `submitted_at`.
- **`/admin/bookings/[id]`** — removed the waiver + indemnity display rows and columns.
- **`global.css`** — removed the now-unused `.pretrip-indemnity` style.

## Staggered-groups availability + callback-URL audit — 2026-07-01  (NOT committed)

Two targeted fixes to the core availability model. Verified green (`astro check` + `build`), not committed.
- **Availability model → staggered groups (Option A).** The reserve runs concurrent groups across
  the three lodges; the ONLY real conflict is two groups sharing a **start_date** (both at Lodge 1,
  night 1). Overlapping date ranges are now allowed.
  - **Migration `0009_startdate_unique.sql`** — drops the `bookings_no_overlap` GiST daterange
    exclusion; adds `create unique index bookings_unique_start_date on bookings(start_date) where
    status in ('pending','confirmed')`. Redefines `unavailable_windows` to expose **only start_date**
    (single dates, not ranges): bookings' start_date + operator `blocked_dates` **expanded to one row
    per day** via `generate_series`. View dropped+recreated (can't drop a column via replace), grant +
    advisory comment re-applied.
  - **`BookingWidget.astro`** — calendar now marks a day `taken` **only if it exactly matches a
    blocked start_date** (`Set<string>` membership) instead of the old 4-day overlap test; fetches
    `?select=start_date`. A day inside another trip's range but not a start date stays selectable.
  - **`actions/index.ts`** — comments updated; `createCheckout` already relies on the DB (insert
    fails → `CONFLICT`), so the new unique index catches same-start-date races with no logic change.
  - **Hold-sweep (`0002`) unaffected** — cancelling a pending row drops it from the partial unique
    index, freeing the start_date (same as before). Verified, not changed.
  - **Data safety:** the old constraint forbade overlapping active ranges (stricter than
    same-start-date), so any permitted data already has distinct active start_dates → the new index
    applies cleanly. (No live DB exists yet regardless.)
- **Callback URL audit — no change needed.** Confirmed `initCheckout` passes `callback_url`, built
  as `${PUBLIC_SITE_URL ?? site.url}/booking/confirm` in both callers (`actions`, `lib/balance`) —
  correctly from `PUBLIC_SITE_URL`, not hardcoded to a wrong host. Paystack auto-appends
  `?reference=&trxref=`; `confirm.astro` reads `reference` and calls `verifyTransaction` **display-only
  (never writes booking status)** — the webhook remains the sole writer. (Appending `?reference=`
  ourselves was rejected: it would collide with Paystack's own appended query string.)

## Split payment: deposit + balance — 2026-07-01  (NOT committed)

Money-touching. **In the working tree, verified green (`astro check` + `build`), not committed.** No
live Paystack test has run yet. Did **not** touch the GiST constraint, hold-sweep, pre-trip reminders,
or the discount-window logic (the split is taken from the already-discounted total).
- **Rule (server-authoritative).** Gap today→`start_date`: **< 30 days → 100% up front** (`payment_plan
  = full`, unchanged behaviour); **≥ 30 days → 50% deposit now + 50% balance later** (`deposit_balance`).
  Balance link sent **45 days before `start_date`** (anchored to `start_date`, not `confirmed_at`).
- **Edge case.** Booked 30–45 days out (deposit applies but the 45-day point has passed) → the balance
  link is emailed **immediately at confirmation** in the webhook, not left for a cron that would never
  fire correctly.
- **`lib/pricing.ts`** — `computeQuote` takes optional `startDate`; adds `paymentPlan` / `depositCents`
  / `balanceCents` (deposit + balance reconcile to `totalCents` exactly, no rounding drift). New
  constants `SPLIT_THRESHOLD_DAYS` (30) / `DEPOSIT_FRACTION` (0.5) / `BALANCE_LEAD_DAYS` (45).
  `BOOKING_DEPOSIT_PERCENT` env is no longer read.
- **`actions/index.ts`** — `createCheckout` passes `startDate` to the quote, charges `amountDueCents`
  (deposit or full), and persists `payment_plan` / `deposit_paid_cents` / `balance_due_cents`.
- **`lib/balance.ts`** (new) — `sendBalancePaymentLink()`: creates the **second** Paystack checkout via
  the **same `PaymentProcessor` interface** (no parallel path), CAS-guards `balance_link_sent_at`,
  rolls back on email failure so the cron retries. Reference prefixed `rwb_`.
- **`api/payments/webhook.ts`** — dual lookup: `processor_reference` (deposit) first, else
  `balance_processor_reference` (balance). New **balance branch**: verify amount == `balance_due_cents`,
  idempotent CAS on `balance_paid_at`, bump `amount_paid_cents` to the total, email "paid in full";
  inconsistencies (non-confirmed booking / amount mismatch) raise the existing **ACTION REQUIRED**
  alert. Deposit branch now computes `balance_due_date` and fires the edge-case immediate link. The
  existing pending→confirmed confirm/race logic is unchanged.
- **`api/cron/balance-reminders.ts`** (new) + second `vercel.json` cron (07:00 daily) — sends the
  balance link at `balance_due_date`, and a **one-time** operator "balance overdue" alert once the trip
  is within 30 days and still unpaid (**flag only — no auto-cancel, date not released**; reconfirm as
  policy). Same `CRON_SECRET` gate + CAS discipline as the pre-trip cron. **2 crons now = Hobby limit.**
- **`lib/email.ts`** — deposit variant of the confirmation email + 3 new templates (balance link,
  balance paid-in-full, balance overdue). **`lib/audit.ts`** — 3 new event types (`balance_confirmed`
  / `balance_amount_mismatch` / `balance_inconsistent`).
- **Migration `0008_split_payment.sql`** — additive columns (`payment_plan`, `deposit_paid_cents`,
  `balance_due_cents`, `balance_due_date`, `balance_link_sent_at`, `balance_paid_at`,
  `balance_overdue_alert_sent`, `balance_processor_reference`, `balance_processor_txn_id`) + a partial
  unique index on the balance reference. Existing `processor_reference` unique constraint untouched.

## Booking-engine session: 7-day pre-trip window · "max 10" copy · operator dashboard · trip-info — 2026-06-30  (NOT committed)

Four changes, verified green, not committed.
- **7-day pre-trip window.** Migration `0007_pretrip_7day_window.sql` renames the guard columns
  (`…_24h_sent`→`…_day3_sent`, `…_60h_sent`→`…_day6_sent`); cron thresholds now **72h / 144h / 168h**
  (day 3 / 6 / 7); confirmation + reminder + overdue email copy say "7 days". Daily cron unchanged.
- **"Max 10" copy sweep.** All public "up to 12 / twelve / Max 12" display copy → **10** with the
  "optional two extra by special arrangement" nuance (site/index/sanctuaries/rates/logistics data +
  pages, `RatesTable`, `llms.txt`, booking dropdown relabelled 10=recommended, 11–12=by arrangement).
  **Validation max stays 12** (zod + `maxGuests`) — the special-arrangement case must stay bookable.
- **Operator dashboard (view-only).** `lib/auth.ts` (Supabase Auth email+pw, httpOnly cookies,
  server-side `getAdminUser` gate, optional `ADMIN_EMAIL` allowlist — no new dependency);
  `adminLogin`/`adminLogout` actions; `/admin/login`, `/admin` (bookings list + overdue flag),
  `/admin/bookings/[id]` (record + pre-trip manifest). Sitemap + static-build strip updated.
- **Trip-info page.** `/trip-info/[token]` (confirmed-only, same anti-enumeration as `/pretrip`):
  links out to `/the-trail` + `/logistics`, shows the **private gate coordinates** + what3words +
  season-for-`start_date`; linked from the confirmation email (`tripInfoUrl`).

## Security hardening: rate limiting, payment audit trail, CSP — 2026-06-30  (NOT committed)

OWASP gap-closing on the booking engine. **In the working tree, verified green, not committed.**
- **Rate limiting (A04/A09)** — per-IP limits on `createCheckout` (3/min, 10/hr) and `createInquiry`
  via an in-Postgres fixed-window counter (`check_rate_limit()` in migration `0005`). `lib/ratelimit.ts`
  (fail-open) + IP from `x-forwarded-for`. Closes the scripted hold-spam / availability-DoS vector.
- **Payment audit trail (A09)** — `payment_events` table (migration `0005`) + `lib/audit.ts`. The
  webhook now records every outcome (confirmed / amount_mismatch / paid_but_cancelled /
  reference_not_found / duplicate_ignored), PII-free, additively (no control-flow change).
- **CSP (A05)** — enabled Astro `security.csp` (`astro.config.mjs`). Emits a `<meta>` CSP with a
  **strict hashed `script-src`** (no `unsafe-inline`), `style-src 'self' 'unsafe-inline'` (inline
  style attrs can't be hashed; style injection can't run JS), `object-src 'none'`, `base-uri`/
  `form-action 'self'`, `connect-src 'self' https://*.supabase.co`. Framing still via
  `X-Frame-Options: DENY`. ⚠️ Needs a browser smoke-test (View Transitions + Paystack redirect) to
  confirm zero console violations before fully trusting; rollback = `security.csp: false`.
- Migration `0005_security_ratelimit_audit.sql` (also adds a daily `cleanup-rate-limits` cron).
- Decision recorded: **stay on Paystack** for now (verify SA onboarding pre-launch); swap path to
  PayFast/Peach stays open via `lib/payments.ts`.

> ⚠️ Also uncommitted (previous session): the **pre-trip reminder/escalation system** — migrations
> `0003`/`0004`, `api/cron/pretrip-reminders.ts`, the `lib/email.ts` templates, the webhook
> confirmation-email swap, `vercel.json` crons, and `CRON_SECRET`. Commit both batches together.

## Booking engine: pricing, hold sweep, webhook safety, date rules, availability calendar — 2026-06-29

Two batches of booking-engine work. **Batch A (Fixes 1–4) is committed as `1ea4974`. Batch B
(Fixes 5–7 + the 365-day window) is NOT yet committed — it is in the working tree, verified green.**

**Batch A — committed `1ea4974`:**
- **Fix 1 — launch discount now charged, not just displayed** (`lib/pricing.ts`): `computeQuote`
  applies the 50% launch discount (`LAUNCH_DISCOUNT` from `data/rates.ts`) to the amount sent to
  Paystack while `now <= LAUNCH_DISCOUNT_END`. Added `launchDiscountApplied` + `discountEndDate` to
  the quote. Full-rate constants untouched, so it auto-reverts. ⚠ `LAUNCH_DISCOUNT_END = '2026-12-31'`
  is a PLACEHOLDER — confirm the real Launch-Phase end date before production.
- **Fix 2 — expired-hold sweep** (`supabase/migrations/0002_hold_sweep.sql`): pg_cron job
  `expire-stale-holds` runs every 10 min, cancels `pending` rows past `hold_expires_at` so the
  exclusion constraint releases their dates. Webhook idempotency guard (status='pending') already
  prevents a swept row being revived — confirmed, no change.
- **Fix 3 — notify email**: every old `placeholder-roobergwander` / `bookings@example.com` reference
  replaced with `hanlie@rooibergwander.co.za` (`.env.example`, `lib/email.ts` From fallback,
  `scripts/generate-copy-doc.mjs`, and the 3 CLAUDE.md spots, marked "corrected from original brief").
- **Fix 4 — paid-but-cancelled race** (`api/payments/webhook.ts`): if a payment verifies but the
  booking row is missing or already `cancelled`, the webhook now logs + emails `BOOKINGS_NOTIFY_TO`
  an "ACTION REQUIRED" alert (manual confirm/refund) instead of a silent 200. Happy path + the
  already-confirmed idempotency path are byte-for-byte unchanged.

**Batch B — NOT YET COMMITTED (working tree, verified green):**
- **365-day booking window** (`actions/index.ts` + `BookingWidget.astro`): start dates capped at
  today..+365 (server-authoritative; client date bounds mirror it).
- **Fix 5 — 7-day minimum lead time** (`actions/index.ts`): rejects `< today+7` with
  "Bookings require at least 7 days notice. The earliest available start date is [date]."; keeps the
  365-day ceiling with its own message. No day-of-week restriction. Verified +6 reject / +7 accept /
  +365 accept / +366 reject.
- **Fix 6 — availability calendar** (`BookingWidget.astro` + `global.css`): replaced the native date
  input with a vanilla month-grid calendar (hidden `#bf-start` keeps the payload identical). Reads
  `unavailable_windows` client-side with the ANON key only (dates only, no PII). Three visual states:
  available (selectable) / taken (greyed, a day where a 4-day trip would overlap) / unavailable
  (outside 7–365). Shows "Next available: [date]" and jumps to the first bookable month. No library.
- **Fix 7 — flat-pricing line** on the widget: "Exclusive use. One group at a time. Priced per trip
  regardless of group size."

**Open items / next session:**
- Commit Batch B (Fixes 5–7 + 365-day window); then optionally push (`1ea4974` also unpushed).
- Confirm real `LAUNCH_DISCOUNT_END`.
- Known minor: ~10-min availability lag (calendar vs unschept holds) — degrades gracefully via the
  CONFLICT message; could sweep on-read. Calendar keyboard nav is tab-only (no arrow-key roving).
  Paid-but-cancelled still needs an audit-log/events table (interim = email alert). Tax invoice
  (VAT number) still not generated. CSP `connect-src` must allow `*.supabase.co` when CSP is enabled.

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
