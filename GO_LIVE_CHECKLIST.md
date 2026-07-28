# The Rooiberg Wander — Go-Live Checklist & Build Backlog

Two lists:
- **Part A — Operational setup** (accounts, keys, config) in dependency order: do these to make the
  booking engine actually run.
- **Part B — Still to be built** (engineering work remaining).
- **Part C — Business inputs/decisions** needed (some block A and B).

Status today (2026-07-02): the booking engine is **code-complete** and all commits are on `main`.
External accounts now live: **Paystack** (SA business verification submitted, test keys available),
**Resend** (domain verified, EMAIL_API_KEY + EMAIL_FROM + BOOKINGS_NOTIFY_TO set in Vercel),
**Supabase** project created (eu-west-2), migrations `0001`–`0009` applied, pg_cron enabled, Hanlie's
auth user created, **Vercel** project live with SSR adapter. **Next:** fill remaining Vercel env vars
(Supabase keys, Paystack test keys, CRON_SECRET, ADMIN_EMAIL), then run the E2E test (Phase 6).

---

## Part A — Operational setup (in order)

### ⏱️ Start these FIRST — they have external lead times
- [x] **Paystack account + SA business verification.** Submitted 2026-07-02. Test keys available now;
      live keys released once verified (1–3 business days). Decided: **cards only, no Instant EFT**.
- [x] **Resend account + domain verification.** `rooibergwander.co.za` verified; EMAIL_API_KEY +
      EMAIL_FROM + BOOKINGS_NOTIFY_TO set in Vercel.

### Phase 1 — Hosting decision + Vercel (the booking engine only runs on a server host)
- [x] **Decision:** Vercel (SSR + static marketing from one origin). GitHub Pages retained as static
      demo only.
- [x] Vercel account created; `Fp901/trail_site` imported; SSR adapter build confirmed working.
- [x] **Vercel plan / cron limits.** Two daily crons (06:00 pretrip-reminders, 07:00 balance-reminders)
      = Hobby limit exactly. No room for a third cron without upgrading to Pro.

### Phase 2 — Supabase (database)
- [x] Supabase project created, region **eu-west-2 (London)**.
- [x] `pg_cron` extension enabled.
- [x] Migrations `0001`–`0009` applied in order.
- [ ] **Verify:** RLS is on + default-deny; anon can read **only** `unavailable_windows`; the
      `expire-stale-holds` cron is scheduled (`select * from cron.job;`).
- [x] Hanlie's operator user created in Supabase → Authentication → Users.
- [ ] Copy the **Project URL**, **anon key**, and **service-role key**.

### Phase 3 — Paystack (payments)
- [ ] Grab **test** keys (`pk_test_…`, `sk_test_…`) to start.
- [ ] Set the **webhook URL** in the Paystack dashboard →
      `https://www.rooibergwander.co.za/api/payments/webhook`.
- [ ] After business verification: get **live** keys (`pk_live_…`, `sk_live_…`) and set the live
      webhook URL.

### Phase 4 — Domain & DNS
- [ ] Point **`www.rooibergwander.co.za`** at the chosen host (Vercel custom domain, or keep the
      GitHub Pages `CNAME` if marketing stays there).
- [ ] Apex `rooibergwander.co.za` → redirect to `www`; **`.com` → redirect to `.co.za`**.
- [ ] Enforce **HTTPS** (auto on Vercel). Confirm HSTS (already in `vercel.json`).
- [ ] **Create the mailbox `hanlie@rooibergwander.co.za`** at your email host (separate from Resend
      *sending* — this is the inbox that receives enquiries/alerts and is the reply-to).

### Phase 5 — Environment variables (set ALL in the Vercel project, per `.env.example`)
- [ ] `PUBLIC_SITE_URL` = `https://www.rooibergwander.co.za`
- [ ] `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `PUBLIC_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY` (test keys to start; swap to live after verification)
- [x] `EMAIL_API_KEY`, `EMAIL_FROM`, `BOOKINGS_NOTIFY_TO` — set 2026-07-02 via Resend.
- [ ] `HOLD_MINUTES=30`. (`BOOKING_DEPOSIT_PERCENT` is **no longer read** — deposit vs full is now
      automatic by lead time in `lib/pricing.ts`; leave it or drop it.)
- [ ] `CRON_SECRET` = long random value (Vercel sends it as `Authorization: Bearer …` to **both**
      cron routes; each rejects anything else).
- [ ] `ADMIN_EMAIL` = `hanlie@rooibergwander.co.za` — locks the `/admin` dashboard to that address
      (defence-in-depth; if unset, any Supabase Auth user may sign in).

### Phase 6 — End-to-end test (TEST mode, before going live)
- [ ] Full happy path: open the calendar → pick a date → checkout → pay with a Paystack **test card**
      → webhook fires → booking flips to `confirmed` → confirmation email arrives with the pre-trip
      link → operator notify email arrives.
- [ ] Availability: a confirmed/blocked date shows as **taken** on the calendar.
- [ ] Double-booking: two overlapping attempts → second is refused.
- [ ] Hold expiry: abandon checkout → after `HOLD_MINUTES` the `expire-stale-holds` cron frees the
      dates.
- [ ] Pre-trip cron: hit `/api/cron/pretrip-reminders` with the `CRON_SECRET` header → confirm it
      requires the header (401 without) and sends the right stage (day 3 / day 6 / day 7).
- [ ] Confirm the **launch discount** is actually charged (amount = 50% while before
      `LAUNCH_DISCOUNT_END`).
- [ ] **Split payment — full second-payment path (money-critical).**
      - Booking **< 30 days** out → charged **100%**, `payment_plan = full`, no balance rows touched.
      - Booking **60 days** out → charged **50% deposit**, `payment_plan = deposit_balance`,
        `balance_due_date = start − 45d`; confirmation email states the deposit paid + balance due.
      - Booking **30–45 days** out (edge) → deposit charged **and the balance link emails immediately**
        at confirmation (not waiting for cron).
      - `balance-reminders` cron with the `CRON_SECRET` header → 401 without; on/after
        `balance_due_date` it emails a **fresh Paystack checkout** for the balance and sets
        `balance_link_sent_at`; **re-run same day does not re-send**.
      - Pay the balance with a **test card** → webhook matches `balance_processor_reference` (not the
        deposit ref), sets `balance_paid_at`, bumps `amount_paid_cents` to the full total, emails the
        "paid in full" confirmation. Re-deliver the webhook → no double-processing.
      - Leave a balance unpaid until the trip is within **30 days** → operator gets the
        **"ACTION REQUIRED: balance payment overdue"** flag once (booking NOT cancelled).

### Phase 7 — Go live
- [ ] Swap Paystack to **live** keys + live webhook URL; flip Resend to the live domain sender.
- [ ] Walk the **Part 11.10 security checklist** in `CLAUDE.md` (CSP, headers, secrets, RLS, webhook
      verification, no PII in logs).
- [ ] Set up **monitoring**: webhook-failure / cron-failure alerts, uptime, error tracking.
- [ ] Register **Google Search Console + Bing Webmaster Tools**, submit the sitemap.

---

## Part B — Still to be built (engineering)

### 🔴 Blocks a clean go-live
1. ~~**Pre-trip form page `/pretrip/[token]` + submission action.**~~ ✅ DONE — `/pretrip/[token]`
   + `PretripForm` + the `submitPretrip` action write `pretrip_details.submitted_at` (stops the
   reminders). **Indemnity/waiver: NOT collected online** — per the solicitor, guests sign the
   indemnity **in person on arrival** (the form shows a note to that effect). No online waiver record,
   no `waiver_*` columns; migration `0010` was removed before ever being applied.
2. **Valid SA tax invoice generation.** The confirmation email *says* a tax invoice accompanies the
   receipt, but none is produced. Needs the **VAT number** + an invoice template (VAT shown
   separately, invoice number, etc.). **Now also applies to the balance payment** (its receipt must
   be a valid tax invoice too).
3. **Privacy Policy page.** Currently a `noindex` stub. Needs real POPIA-compliant copy + a
   data-request contact, then re-include it in the sitemap.
4. **Split-payment live test (money-critical).** The full deposit→balance→paid-in-full path has
   **never run against real Paystack test keys + a live webhook** — only the pricing arithmetic and
   the code branches are verified. Walk Phase 6's split-payment block before go-live.

### 🟠 Strongly recommended before scale
4. ~~**Audit/events table.**~~ ✅ DONE — `payment_events` (migration 0005) records every webhook
   outcome (confirmed / amount_mismatch / paid_but_cancelled / reference_not_found /
   duplicate_ignored), PII-free. (A separate email-send log is still a possible future add.)
5. **Confirm `LAUNCH_DISCOUNT_END`** (placeholder `2026-12-31`) — one-line change in `pricing.ts`
   once the real date is known.
6. ~~**CSP enablement.**~~ ✅ DONE — Astro `security.csp` emits a `<meta>` CSP with a **strict
   hashed `script-src`** (no `unsafe-inline`), `object-src 'none'`, `base-uri/form-action 'self'`,
   and `connect-src` allowlisted to self + Supabase. ⚠️ **One manual step:** browser-smoke-test a
   deploy (home + rates + a Paystack test checkout + a View-Transitions navigation) with the console
   open and confirm **no CSP violations**. If the `<ClientRouter />` trips a violation, the fallback
   options are in `CLAUDE.md` Part 11.2 (hash the injected script, or gate transitions). Rollback =
   `security.csp: false` in `astro.config.mjs`.
7. ~~**Rate limiting.**~~ ✅ DONE — per-IP limits on `createCheckout` (3/min, 10/hr) and
   `createInquiry` via the in-DB `check_rate_limit()` (migration 0005), fail-open.

### 🟡 Nice-to-have / later
7. ~~**Operator dashboard**~~ ✅ DONE (view-only) — authed `/admin` (Supabase Auth, `ADMIN_EMAIL`
   allowlist) lists bookings with pre-trip + overdue flags; `/admin/bookings/[id]` shows the full
   record + pre-trip manifest. **Near-term follow-up (not built):** booking **cancellation / refund
   trigger / edit** from the dashboard, and surfacing **balance status** (deposit vs paid-in-full)
   in the list/detail views.
8. **Split-payment automated tests** — none yet. Highest-value coverage: the gap rule (29/30/44/45-day
   boundaries), discount-before-split, the webhook deposit-vs-balance routing + idempotency, and the
   balance-cron CAS guards.
9. **Availability lag fix** — calendar can show a date free for up to ~10 min before the hold-sweep
   runs (degrades gracefully via the CONFLICT message). Could sweep-on-read.
9. **Calendar keyboard navigation** — arrow-key roving tabindex (currently each day is a tab stop).
10. **Booking confirmation extras** — ICS/calendar attachment, "what happens next" detail.
11. **Automated tests** — none exist yet (pricing math, date rules, webhook branches, cron stages).

### 🖼️ Content/assets (marketing, not booking)
12. **VierVanAcht photo** (never arrived) + real **lodge/room photos**, **guide bios + FGASA creds**,
    **testimonials**, and a proper **`og-default.jpg`** social card.

---

## Part C — Business inputs / decisions needed
- [x] ~~Real `LAUNCH_DISCOUNT_END` date.~~ **Superseded by Part D** — the soft-launch discount
      (`LAUNCH_DISCOUNT`/`LAUNCH_OFFER`) was removed entirely on branch `feature/booking-v2`;
      early-date discounts now happen offline only (enquiry/WhatsApp), per the beta banner.
- [ ] **VAT registration number** (for tax invoices — deposit **and** balance receipts).
- [ ] Final **refund/cancellation percentages** (confirm the draft in `policies.ts`).
- [ ] **Split-payment policy — RECONFIRM before go-live** (all money rules, currently hard-coded):
      **50% deposit / 50% balance**; deposit triggers at a **30-day** lead; balance link sent
      **45 days** before start; overdue alert when the trip is within **30 days**. Change points:
      `SPLIT_THRESHOLD_DAYS` / `DEPOSIT_FRACTION` / `BALANCE_LEAD_DAYS` in `lib/pricing.ts`.
- [ ] **Balance-overdue behaviour — CONFIRM** it is a **manual-follow-up FLAG only** (operator email;
      the booking is **NOT** auto-cancelled and the date is **NOT** released). This is how it is built,
      mirroring the pre-trip overdue alert. If instead the booking/date should be released on non-payment,
      that is a **different design** and must be specced.
- [ ] **Pre-trip form fields** — the current form collects guest names, ID/passport, emergency
      contacts, medical notes, vehicle reg, arrival time, and a self-catering acknowledgment. Confirm
      this is complete. (Indemnity is signed **in person on arrival** — not collected online.)
- [ ] **Trip-info gate coordinates** — confirm `-24.6740333, 27.8515837` / `///trademarked.actor.clambers`
      are the correct reserve gate before real guests receive them.
- [ ] Full **packing list** (the public page shows a short day-pack list + "full list sent on booking").
- [ ] **Privacy** contact + data-retention period (POPIA).
- [ ] Confirm **age/suitability policy**, and the **mailbox** for `hanlie@`.
- [ ] Hosting decision (Part A, Phase 1) and Vercel **plan** (2 daily crons = Hobby limit).

---

## Part D — Booking v2 (merged to `main` 2026-07-08, commit `83f7cdc`; pricing/day model
## revised to v2.2 on 2026-07-11, NOT yet committed/pushed)

Catered/uncatered pricing, shared/mixed departures, and 2027 go-live gating. See the CHANGELOG
entries "Booking v2", "VAT/Franili removal" and "Booking v2.2" for the full design. Code is
written; these are the remaining go-live steps:

- [ ] **Apply migration `0013_booking_v2.sql`** in Supabase (adds `booking_type`/`catering`
      columns, the `bookings_slot_guard` trigger, redefines `unavailable_windows`, adds
      `shared_slot_availability`). Not yet applied anywhere. The trigger now enforces Tuesday to
      Saturday for exclusive bookings, Sunday/Monday for shared, and the catered-max-8/
      uncatered-max-10 group-size caps (2026-07-11 revision).
- [ ] **Confirm the pricing (2026-07-11 revision)**: private self-catered **R54,000/group** (up
      to 10 guests), private catered **R105,000/group** (up to 8 guests, flat, not per-person),
      shared/mixed **R5,000 pp/night** (R15,000 pp for the trail, 2 to 8 people). All in
      `src/data/rates.ts` (`GROUP_RATE_UNCATERED`, `GROUP_RATE_CATERED`, `SHARED_PP_NIGHT`,
      `UNCATERED_MAX_PEOPLE`, `CATERED_MAX_PEOPLE`). These supersede the earlier R52,174/
      R112,174/R3,435 figures — confirm none of these are still quoted verbally to guests.
- [ ] **Confirm the day-of-week split**: private bookings run **Tuesday to Saturday** only;
      shared/mixed departures run **Sunday or Monday** only (previously Monday-only). The old
      "10 guests + 2 by special arrangement" ceiling is retired — capacity is now a hard 10
      (self-catered) or 8 (catered) with no exception.
- [ ] **Confirm the payment model (2026-07-11 revision)**: full payment is due **45 days**
      before arrival (was 30) and is non-refundable from that point; a booking made 45+ days out
      pays a 50% deposit now with the balance auto-collected at the 45-day mark
      (`SPLIT_THRESHOLD_DAYS`/`BALANCE_LEAD_DAYS` in `lib/pricing.ts`, both 45). The refund
      schedule collapsed from 4 tiers to 2 (45+ days = full refund less 5%; inside 45 days /
      no-show = no refund), and the "re-book your dates, get more back" clause was **dropped**
      (`src/data/policies.ts`) — confirm the operator is comfortable losing that goodwill clause.
- [ ] **No VAT is charged** (operator confirmed not VAT-registered, 2026-07-08) — all the figures
      above are the full charged amount, not VAT-inclusive totals. Guest documents are payment
      receipts, not tax invoices. If VAT registration happens later, this needs re-adding
      (`lib/pricing.ts`, `lib/email.ts`), not just a rate tweak.
- [ ] **Confirm the new operating company name and registration number** once formed (Franili
      Investments was removed as the registered entity, 2026-07-08 — a new company is pending).
      Update `site.ts` `operator`, `schema.ts` `legalName`, `email.ts` receipt "From" block, and
      `privacy.astro` "who we are" clause together once known.
- [ ] **Sign off the "Temminck's Lodge" rename** (2026-07-11, was "Rotavi Lodge") — applied
      site-wide (homepage, trail page, accommodation, logistics, rates, route map data, emails,
      privacy policy, pre-trip form) and to all alt text. Confirm this is the operator's intended
      final name and that the apostrophe is acceptable everywhere it renders (incl. emails).
- [ ] **Sign off "experienced trail guides"** (2026-07-11, replaces all "armed guides"/"armed
      trail guides" wording site-wide, including one exception at `logistics.ts`'s "Is it safe?"
      FAQ which now reads "qualified trail guides" per the operator's literal wording for that
      answer) — confirm the guides are in fact still armed operationally; only the *public copy*
      changed, nothing about the actual safety protocol.
- [ ] **Confirm the new FAQs** added 2026-07-11: "What are the conservation levies?" (R380 to
      R760 pp/day, "up to approximately 20%" of the booking fee — confirm the range and that
      "up to" is the right qualifier) and "Where can I stay before or after my visit?" (links to
      babirwa.com and the Newmark "Letamo at Qwabi" booking page — confirm both are still the
      recommended partners).
- [ ] **Sign off the sitewide tagline**: "A luxury walking safari in the Waterberg" (`site.ts
      hook`, footer + hero + llms.txt). The nav shows no text tagline — it renders the full logo
      lockup (same artwork as the footer); `headerTagline` was removed.
- [ ] **Confirm the beta banner wording** (`BetaBanner.astro`): booking opens 15 January 2027;
      family-and-friends discount via enquiry/WhatsApp only, no promo-code gate. The beta phase
      has **no fixed end date** (the earlier 15 July 2027 date was incorrect and was removed).
      The homepage banner now also states the trail is "currently in beta testing" — confirm
      this framing is accurate and desired.
- [ ] **Confirm `BOOKING_OPEN_DATE` (15 Jan 2027)** is still correct closer to go-live — a
      single constant in `src/data/rates.ts`.
- [ ] **Test the slot-guard trigger** in Supabase SQL editor before relying on it: exclusive
      insert on a Sunday/Monday rejected; shared insert on a Tue-Sat date rejected; catered
      exclusive insert with group_size 9+ rejected; uncatered exclusive with group_size 11+
      rejected; shared 6+4 on one date rejected (exceeds 8), 6+2 accepted; a shared date with 7
      seats taken (1 remaining) shows as unavailable in `unavailable_windows` (protects the
      2-person minimum).
- [ ] **Paystack test-mode E2E** for all three products once the migration is applied: a shared
      Sunday or Monday booking (2 people, confirm the R15,000 pp total), a private self-catered
      booking on a Tue-Sat date (confirm the flat R54,000 total, not per-person), and a private
      catered booking with 8 guests (confirm the flat R105,000 total and that 9+ guests is
      rejected client- and server-side).
- [ ] **Elevation profile images** (`src/assets/images/elevation-day{2,3,4}.png`) are low-
      resolution source files (~400-410px wide) now displayed up to 42rem (~672px) wide on
      desktop per the responsive-layout fix (2026-07-11) — consider supplying higher-resolution
      source images so they don't look soft at the larger display size.
- [ ] **Route map illustration** — the Trail page's conceptual SVG map is unchanged pending a
      real illustration asset from the operator (flagged 2026-07-11, asset not yet supplied).
- [ ] Decide whether to **merge to `main`** once the above are confirmed, or keep iterating on
      the branch.

---

## Critical path (shortest route to a working live booking)
1. Start **Paystack verification** + **Resend domain** today (lead time).
2. **Vercel** project + hosting decision → **Supabase** project + apply `0001`–`0004` → set **env
   vars**.
3. Build the **pre-trip form page** (B1) and decide **tax invoice** (B2) — the two things that make
   a confirmed booking actually complete.
4. **Test-mode end-to-end**, then swap to **live keys** and run the security checklist.
