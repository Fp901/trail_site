# The Rooiberg Wander — Go-Live Checklist & Build Backlog

Two lists:
- **Part A — Operational setup** (accounts, keys, config) in dependency order: do these to make the
  booking engine actually run.
- **Part B — Still to be built** (engineering work remaining).
- **Part C — Business inputs/decisions** needed (some block A and B).

Status today: the booking engine is **code-complete** (server pricing + 50% launch discount,
**split payment: 50% deposit + 50% balance for trips booked 30+ days out**, GiST double-booking
prevention, hold-sweep cron, availability calendar, hardened webhook handling both the deposit and
the balance transaction, pre-trip reminder/escalation on a **7-day** window, a **pre-trip form**, an
authed **operator dashboard**, and a **trip-info** page with the private gate coordinates). It is
**not live** — no Supabase/Paystack/Resend accounts exist yet, and the public site is the static
GitHub Pages demo with the backend stripped out. Migrations `0001`–`0008` exist but have not been
applied to a real database. Security hardening done: server-side **rate limiting** (in-DB), a
**payment_events** audit trail, and an enforced **CSP** (strict hashed script-src) — see Part B.

> **Working-tree state (not committed):** the four-part session (7-day pre-trip window, "max 10"
> copy, operator dashboard, trip-info page) and this **split-payment** session are all in the working
> tree, verified green (`astro check` + `build`), **not yet committed**.

---

## Part A — Operational setup (in order)

### ⏱️ Start these FIRST — they have external lead times
- [ ] **Paystack account + SA business verification.** Sign up, submit business docs. Verification
      typically takes **1–3 business days**, so start day one. (Until verified you can still build
      and test with **test keys**.) Decided: **cards only, no Instant EFT**.
- [ ] **Resend account + domain verification.** Add `rooibergwander.co.za`, publish the SPF/DKIM
      DNS records Resend gives you. DNS propagation can take hours. Needed before any email sends.

### Phase 1 — Hosting decision + Vercel (the booking engine only runs on a server host)
- [ ] **DECISION: where does the live site run?** The booking routes need SSR; GitHub Pages can't
      do that. **Recommended:** move the whole site to **Vercel** (it serves the static marketing
      pages *and* the SSR booking/API routes from one origin), point the domain there, and retire
      (or keep as a staging mirror) the GitHub Pages deploy. Alternative (more complex): marketing on
      Pages + a separate Vercel app for booking — two origins, extra CORS/domain work. Pick one.
- [ ] Create a **Vercel** account, import the GitHub repo `Fp901/trail_site`.
- [ ] Confirm the build works on Vercel (default build = SSR with the Vercel adapter; no
      `BUILD_TARGET=static`).
- [ ] **Vercel plan / cron limits.** `vercel.json` now schedules **two** daily crons
      (`pretrip-reminders` at 06:00, `balance-reminders` at 07:00). Vercel **Hobby allows 2 cron jobs,
      once-daily** — so this fits Hobby exactly, with **no room for a third**. Any additional cron, or
      sub-daily cadence, needs **Pro**.

### Phase 2 — Supabase (database)
- [ ] Create a **Supabase project**, region **eu-west-2 (London)** — already decided (POPIA-aware).
- [ ] Enable the **`pg_cron`** extension (Dashboard → Database → Extensions) — required by the
      hold-sweep job in `0002`.
- [ ] Apply migrations **in order: `0001` → `0002` → … → `0008`** (SQL editor or CLI).
      `0005` adds `rate_limits` + `payment_events` + `check_rate_limit()`; `0007` renames the
      pre-trip guard columns to the **7-day** window (`day3`/`day6`); `0008` adds the **split-payment**
      columns (`payment_plan`, `deposit_paid_cents`, `balance_due_cents`, `balance_due_date`,
      `balance_link_sent_at`, `balance_paid_at`, `balance_overdue_alert_sent`,
      `balance_processor_reference`, `balance_processor_txn_id`) + the balance-reference unique index.
- [ ] Verify: RLS is on + default-deny; anon can read **only** `unavailable_windows`; the
      `expire-stale-holds` cron is scheduled (`select * from cron.job;`).
- [ ] **Create the operator (Hanlie) user** in Supabase → Authentication → Users (email + password)
      — needed for the `/admin` dashboard. Nothing in the codebase can create this user.
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
- [ ] `PUBLIC_PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`
- [ ] `EMAIL_API_KEY` (Resend), `EMAIL_FROM` (a verified sender), `BOOKINGS_NOTIFY_TO`
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
   reminders). ⚠️ **Gap:** the waiver is only an `indemnityAccepted` boolean inside the `details`
   jsonb — there is **no `waiver_accepted_at` / `waiver_ip_address` / signature-name** captured. If a
   legally-robust waiver record is required, add those columns + capture them in the form/action.
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
- [ ] Real **`LAUNCH_DISCOUNT_END`** date.
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
      contacts, medical notes, vehicle reg, arrival time, and an indemnity tick. Confirm this is
      complete, and whether the **indemnity wording** + a legally-robust waiver record (see B1) are needed.
- [ ] **Trip-info gate coordinates** — confirm `-24.6740333, 27.8515837` / `///trademarked.actor.clambers`
      are the correct reserve gate before real guests receive them.
- [ ] Full **packing list** (the public page shows a short day-pack list + "full list sent on booking").
- [ ] **Privacy** contact + data-retention period (POPIA).
- [ ] Confirm **age/suitability policy**, and the **mailbox** for `hanlie@`.
- [ ] Hosting decision (Part A, Phase 1) and Vercel **plan** (2 daily crons = Hobby limit).

---

## Critical path (shortest route to a working live booking)
1. Start **Paystack verification** + **Resend domain** today (lead time).
2. **Vercel** project + hosting decision → **Supabase** project + apply `0001`–`0004` → set **env
   vars**.
3. Build the **pre-trip form page** (B1) and decide **tax invoice** (B2) — the two things that make
   a confirmed booking actually complete.
4. **Test-mode end-to-end**, then swap to **live keys** and run the security checklist.
