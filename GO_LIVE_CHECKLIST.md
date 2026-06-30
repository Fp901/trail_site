# The Rooiberg Wander — Go-Live Checklist & Build Backlog

Two lists:
- **Part A — Operational setup** (accounts, keys, config) in dependency order: do these to make the
  booking engine actually run.
- **Part B — Still to be built** (engineering work remaining).
- **Part C — Business inputs/decisions** needed (some block A and B).

Status today: the booking engine is **code-complete** (server pricing + 50% launch discount,
GiST double-booking prevention, hold-sweep cron, availability calendar, hardened webhook, pre-trip
reminder/escalation). It is **not live** — no Supabase/Paystack/Resend accounts exist yet, and the
public site is the static GitHub Pages demo with the backend stripped out. Migrations `0001`–`0005`
exist but have not been applied to a real database. Security hardening done: server-side **rate
limiting** (in-DB), a **payment_events** audit trail, and an enforced **CSP** (strict hashed
script-src) — see Part B.

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
- [ ] **Vercel Pro plan** if you want the 30-min pre-trip cron — Hobby allows **once-daily** cron
      only. (Adjust `vercel.json` schedule if staying on Hobby.)

### Phase 2 — Supabase (database)
- [ ] Create a **Supabase project**, region **eu-west-2 (London)** — already decided (POPIA-aware).
- [ ] Enable the **`pg_cron`** extension (Dashboard → Database → Extensions) — required by the
      hold-sweep job in `0002`.
- [ ] Apply migrations **in order: `0001` → `0002` → `0003` → `0004` → `0005`** (SQL editor or CLI).
      `0005` adds the `rate_limits` + `payment_events` tables, the `check_rate_limit()` function, and
      a daily `cleanup-rate-limits` cron.
- [ ] Verify: RLS is on + default-deny; anon can read **only** `unavailable_windows`; the
      `expire-stale-holds` cron is scheduled (`select * from cron.job;`).
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
- [ ] `BOOKING_DEPOSIT_PERCENT=100`, `HOLD_MINUTES=30`
- [ ] `CRON_SECRET` = long random value (Vercel sends it as `Authorization: Bearer …` to the cron
      route; the route rejects anything else).

### Phase 6 — End-to-end test (TEST mode, before going live)
- [ ] Full happy path: open the calendar → pick a date → checkout → pay with a Paystack **test card**
      → webhook fires → booking flips to `confirmed` → confirmation email arrives with the pre-trip
      link → operator notify email arrives.
- [ ] Availability: a confirmed/blocked date shows as **taken** on the calendar.
- [ ] Double-booking: two overlapping attempts → second is refused.
- [ ] Hold expiry: abandon checkout → after `HOLD_MINUTES` the `expire-stale-holds` cron frees the
      dates.
- [ ] Pre-trip cron: hit `/api/cron/pretrip-reminders` with the `CRON_SECRET` header → confirm it
      requires the header (401 without) and sends the right stage.
- [ ] Confirm the **launch discount** is actually charged (amount = 50% while before
      `LAUNCH_DISCOUNT_END`).

### Phase 7 — Go live
- [ ] Swap Paystack to **live** keys + live webhook URL; flip Resend to the live domain sender.
- [ ] Walk the **Part 11.10 security checklist** in `CLAUDE.md` (CSP, headers, secrets, RLS, webhook
      verification, no PII in logs).
- [ ] Set up **monitoring**: webhook-failure / cron-failure alerts, uptime, error tracking.
- [ ] Register **Google Search Console + Bing Webmaster Tools**, submit the sitemap.

---

## Part B — Still to be built (engineering)

### 🔴 Blocks a clean go-live
1. **Pre-trip form page `/pretrip/[token]` + submission action.** The reminder/escalation system is
   built, but nothing yet *writes* `pretrip_details.submitted_at`. Until this exists, every confirmed
   booking runs through all reminders and the 72h overdue alert with no way to stop them. Needs the
   field list (guest names, ID/passport, dietary, emergency contact, vehicle reg, etc. — business
   input) + a server action that writes `pretrip_details` looked up by token.
2. **Valid SA tax invoice generation.** The confirmation email *says* a tax invoice accompanies the
   receipt, but none is produced. Needs the **VAT number** + an invoice template (VAT shown
   separately, invoice number, etc.).
3. **Privacy Policy page.** Currently a `noindex` stub. Needs real POPIA-compliant copy + a
   data-request contact, then re-include it in the sitemap.

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
7. **Operator dashboard** — a simple authed view of bookings + pre-trip status (today the operator
   only gets emails). Lets Hanlie see/manage without the Supabase console.
8. **Availability lag fix** — calendar can show a date free for up to ~10 min before the hold-sweep
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
- [ ] **VAT registration number** (for tax invoices).
- [ ] Final **refund/cancellation percentages** (confirm the draft in `policies.ts`).
- [ ] **Pre-trip form fields** (what to collect from guests).
- [ ] **Privacy** contact + data-retention period (POPIA).
- [ ] Confirm **age/suitability policy**, and the **mailbox** for `hanlie@`.
- [ ] Hosting decision (Part A, Phase 1) and Vercel **plan** (cron cadence).

---

## Critical path (shortest route to a working live booking)
1. Start **Paystack verification** + **Resend domain** today (lead time).
2. **Vercel** project + hosting decision → **Supabase** project + apply `0001`–`0004` → set **env
   vars**.
3. Build the **pre-trip form page** (B1) and decide **tax invoice** (B2) — the two things that make
   a confirmed booking actually complete.
4. **Test-mode end-to-end**, then swap to **live keys** and run the security checklist.
