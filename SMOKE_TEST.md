# Smoke Test — full system

Run this after `scripts/db-cleardown.sql`, on a known-clean database. Re-run the clear-down
afterwards to remove the rows this test creates.

**Context:** the operator is changing the Paystack account and bank account. §§2–8 cover
everything reachable without a working payment path (the comp-booking route). §9 covers the
real checkout + webhook, usable **if** the old account's test keys still authenticate — check
first, it's one curl command. §10 lists what's left regardless, and must be re-tested once the
new account is live.

> ⚠️ **`npm run dev` on localhost writes to the production database and sends real email.**
> There is one Supabase project and no staging copy. Every row you create below is production
> data, and every email is a real send through a live Resend key.

---

## 0. Setup

Edit `.env`, then **restart `npm run dev`** — Astro reads `import.meta.env` at server start, and
hot reload will not pick these up. **Do not commit `.env`.**

| Var | Set to | Why |
|---|---|---|
| `CRON_SECRET` | `openssl rand -hex 32` | Currently **empty**, so both cron routes fail closed with 401. |
| `ADMIN_EMAILS` | your test admin, comma-separated | Currently **absent**. `auth.ts:56-62` returns `true` when unset, so *any* Supabase Auth user can sign into `/admin` right now. |
| `BOOKINGS_NOTIFY_TO` | **your** inbox | Currently `hanlie@rooibergwander.co.za` with a live Resend key. Without this change she receives every test alert. |
| `PUBLIC_PAYSTACK_PUBLIC_KEY` | **leave the `pk_test_` value alone** | `rates.astro:33` gates the whole booking widget on it. Blank it and there is nothing to test. |
| `PAYSTACK_SECRET_KEY` | leave the `sk_test_` value alone | Only reached by `/booking/confirm`, whose throw is caught. |

Create a test admin: Supabase → Authentication → Users → Add user (auto-confirm). It must be in
`ADMIN_EMAILS`, or login fails with the same generic message as a wrong password.

**Test data plan.** Comp bookings are Wednesday/Thursday only, exactly 8 guests.

| | Start date | Used for |
|---|---|---|
| Booking **A** | Wed 2026-08-05 | golden path + admin mutations; cancelled last |
| Booking **B** | Thu 2026-08-06 | cron stages + the balance nudge |
| Move target | Wed 2026-08-12 | |
| Block window | 2026-09-02 → 2026-09-03 | |

---

## 1. Static checks

- [ ] `npm run check` → 0 errors, 0 warnings
- [ ] `npm run build` → succeeds
- [ ] All 11 verify suites pass (612 assertions):
      `for f in scripts/verify-*.mjs; do npx tsx "$f" >/dev/null || echo "FAIL $f"; done`

---

## 2. Booking widget — the rebuilt 5-step accordion (`/rates`)

- [ ] Widget renders (not the "booking coming soon" panel). Step 1 open, 2–5 visible but locked
- [ ] Step 1: pick 6 walkers → Continue → step 1 collapses to a summary with an **Edit** link
- [ ] **Edit** reopens step 1 in place; later steps re-lock; no state lost
- [ ] "Travelling solo?" panel expands (`aria-expanded` flips)
- [ ] Step 2: choose Self-catered → Continue → summary shows the choice
- [ ] Step 3: calendar **opens on January 2027** and cannot page earlier — this is correct, not a
      bug (`earliest = 2027-01-15`)
- [ ] Month heading `<select>` jumps months; self-catered ceiling ~2027-09, catered ~2028-07
- [ ] Tapping a date opens the preview **inline beneath the grid**; Esc closes it and leaves
      focus on the cell
- [ ] Select a valid date → Continue → step 3 summary shows the date
- [ ] Step 4: fill name/email/phone → Continue
- [ ] **Step 5 trip summary** shows **Night 1 / Night 2 / Night 3**, each with its date and
      lodge, then a **Depart** row
- [ ] Lodge names match `/the-trail` exactly (they are derived from `itinerary.ts`, so a
      mismatch means the derivation broke)
- [ ] Price breakdown shows named lines, not one unexplained figure
- [ ] Deposit split note appears for a date 45+ days out
- [ ] "view the cancellation policy" opens the `<dialog>`; Esc closes; focus returns

**🛑 Do not press "Continue to secure payment."** It calls `createCheckout` → Paystack and leaves
a `pending` row to clean up.

- [ ] **No-JS fallback:** DevTools → Disable JavaScript → reload `/rates`. **All five steps
      render open** as a plain long scroll, every input reachable. Re-enable JS.

---

## 3. Enquiry path

- [ ] Submit the enquiry form (message ≥20 chars)
- [ ] `select * from public.inquiries order by created_at desc limit 1;` — email lowercased,
      name whitespace-collapsed, `handled_at` NULL
- [ ] Operator notification arrives; **Reply-To is the enquirer's address**
- [ ] `/admin/inquiries` lists it, open count correct
- [ ] **Mark handled** → `handled_at` + `handled_by` set
- [ ] `admin_audit` gains a row with `action='inquiry_handled'`
- [ ] Reopen, then handle again → **two more rows appended**, never an update
- [ ] 4 submissions inside a minute → 4th rejected (`inquiry:min` is 3/60s)

---

## 4. Comp booking golden path

Negative cases first:

- [ ] Friday date → rejected: "Exclusive departures run Wednesday or Thursday only"
- [ ] 6 guests → rejected: "exactly 8 guests"
- [ ] 5-character reason → rejected (≥10 required)

Then create **Booking A** (2026-08-05, 8 guests, self-catered, guest email ON):

- [ ] Created. Check the row:
      `status='confirmed'`, `processor='comp'`, reference `comp_%`, **all money columns 0**,
      `payment_plan='full'`, `hold_expires_at` NULL, `pretrip_token` populated
- [ ] **Comp booking admin alert** email arrives (sends regardless of the guest-email toggle)
- [ ] **Guest confirmation** email arrives, complimentary variant, no payment amounts
- [ ] `/pretrip/<token>` renders with the guest name and group size
- [ ] `/trip-info/<token>` renders gate coordinates + what3words, and carries **`noindex`**
- [ ] `/trip-info/<random-uuid>` → generic not-found (no distinction between "no booking" and
      "not confirmed" — anti-enumeration)
- [ ] **`/booking/confirm?reference=<the comp_ ref>` renders the confirmed state.** This is the
      proof the callback page degrades correctly with no working Paystack: verify throws → is
      caught → falls through to the DB lookup
- [ ] Submit the pre-trip form → `pretrip_details` row, `details.guests` capped at 8,
      `submitted_at` set
- [ ] Reload `/pretrip/<token>` → "already submitted" state
- [ ] `/admin/bookings/<id>` timeline shows *"Complimentary booking created (payment bypassed)"*
      attributed to your admin email, with the reason as its note

---

## 5. Admin mutations — every one must append to `admin_audit`

Run in order; **cancel last** (it locks editing). Pace at ~1 action per 3 seconds — see §8.
After each, check:

```sql
select created_at, admin_email, action, booking_id, note
from public.admin_audit order by created_at desc limit 3;
```

- [ ] **Edit contact** → `update_contact`; timeline diff names only the changed fields
- [ ] **Move dates** A → 2026-08-12 → `move_dates`; `end_date` = start + 3 = 2026-08-15
- [ ] Move to a **Friday** → rejected by the trigger, **no audit row written**
- [ ] Move to a past date → rejected
- [ ] **Add note** → `note`
- [ ] **Block dates** 2026-09-02→03 → row with `created_by`; `block_dates`; alert email
- [ ] Comp booking starting inside the blocked window → rejected
- [ ] `select * from public.departure_inventory` → those dates show `is_blocked=true`,
      `seats_left=0`
- [ ] **Unblock** → row **kept** with `removed_at` set, never deleted; `unblock_dates`; second
      alert email; dates vanish from `departure_inventory`
- [ ] **Resend confirmation** → email arrives; `resend_email`, note `confirmation`
- [ ] **Resend pre-trip reminder** → email arrives
- [ ] Resend **receipt** on a comp booking → rejected ("no payment receipt")
- [ ] Resend **balance_link** → rejected *before Paystack is touched* ("no outstanding balance")
- [ ] **Mark balance paid** on Booking B (needs the nudge below) → `mark_balance_paid`, a
      `payment_events` row `event_type='manual_balance_paid'`, `balance_processor_txn_id` =
      `manual:<your email>`, and the timeline shows **both** a System and an Admin line
- [ ] **Cancel** Booking A → `status='cancelled'`, row never deleted, date frees
- [ ] Post-cancel: edit-contact and move-dates both rejected

**The nudge.** Comp bookings are `payment_plan='full'` with zero balance, so mark-balance-paid is
unreachable without this. Booking B only:

```sql
update public.bookings
   set payment_plan='deposit_balance', total_cents=4000000,
       amount_due_cents=2000000, amount_paid_cents=2000000, deposit_paid_cents=2000000,
       balance_due_cents=2000000, balance_due_date=now()+interval '10 days',
       balance_link_sent_at=now()      -- pre-set so the cron NEVER tries to build a Paystack link
 where processor='comp' and start_date=date '2026-08-06';
```

Keep `processor='comp'` and the `comp_` reference so the row stays unmistakably test data. Note
it now has `amount_paid_cents > 0` — exactly the shape the clear-down's guard aborts on, which
is intended.

---

## 6. Cron routes

- [ ] No auth header → **401**
- [ ] Wrong bearer token → **401**

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:4321/api/cron/pretrip-reminders | jq .
```

- [ ] Baseline → `scanned:0` (thresholds are relative to `confirmed_at`, and the booking is
      minutes old)

Back-date **Booking B** to reach each stage, re-running the curl after each:

| Set `confirmed_at` to | Expect |
|---|---|
| `now() - interval '73 hours'` | `sentDay3:1` + guest day-3 email |
| *(re-run immediately, no change)* | `sentDay3:0`, **no second email** — CAS idempotency |
| `now() - interval '145 hours'` | `sentDay6:1` |
| `now() - interval '169 hours'` | `overdue:1` + operator alert |
| submit the pre-trip form, reset the 3 flags, re-run | `scanned:1`, **all counters 0** |

Balance cron:

- [ ] Baseline → `scanned:0` (comp bookings are `payment_plan='full'`)
- [ ] After the §5 nudge → `scanned:1, linksSent:0, overdue:1` + overdue email.
      **`linksSent` must be 0** — anything else means Paystack was called and the test is void
- [ ] Re-run → `overdue:0`, no second email

**Production check, independent of the above:** confirm `CRON_SECRET` exists in the Vercel
project env, then check Functions logs around 06:00 / 07:00 UTC. **If they show 401s, the daily
crons have never run in production.**

---

## 7. Mobile — 380 × 800

Both surfaces were reworked recently. Touch targets ≥44px, inputs ≥16px.

**Admin:**
- [ ] `/admin` bookings table renders as **stacked labelled cards** (each value prefixed by its
      column name); `<thead>` hidden
- [ ] The whole stat card is the tap target, not just the label
- [ ] `document.documentElement.scrollWidth === 380` on every admin page (no horizontal scroll)
- [ ] `/admin/bookings/<id>`, `/admin/dates`, `/admin/inquiries` all readable, nothing clipped
- [ ] Long email in the admin nav wraps instead of forcing the row wide

**Widget:**
- [ ] Walker chips wrap rather than shrink below 44px
- [ ] Style cards stack to one column
- [ ] Calendar fits 7 columns with no horizontal scroll
- [ ] Date preview opens inline beneath the grid
- [ ] Collapsed step bars (number + summary + Edit) fit or wrap cleanly
- [ ] Trip summary uses the stacked 2-column layout below 560px; Night 1/2/3 + Depart legible

---

## 8. Rate limits

Local dev has no `x-forwarded-for`, so every request shares one `'unknown'` bucket and limits
trip far sooner than in production.

| Key | Limit | Bites when |
|---|---|---|
| `adminact:min:<email>` | 30 / 60s | §5 has ~16 actions — pace them |
| `inquiry:min` / `:hr` | 3 / 60s, 10 / hour | §3 repeats; the hourly cap is the painful one |
| `pretrip:min` | 5 / 60s | repeated pre-trip submits |
| `adminlogin:email:hr` | 10 / hour | **mistyping the admin password is the likeliest disruption** |

Inspect: `select key, window_start, count from public.rate_limits order by window_start desc;`
Clear: `delete from public.rate_limits where key like 'adminact:%';` (safe — the daily cron
already deletes from this table).

Note the limiter **fails open** on a DB error, so an absence of throttling is not proof it works.

---

## 9. The real checkout + webhook (test keys, on the Vercel deployment)

This is the one thing a comp booking cannot exercise: `createCheckout`, the hosted checkout
page, and the webhook that is the *sole* writer of `status='confirmed'` for a real guest.

**This section runs against the deployed Vercel URL, not localhost.** The webhook is
`POST /api/payments/webhook`, called server-to-server by Paystack — `localhost:4321` is
unreachable from there. No tunnel needed: Vercel already gives you a public HTTPS URL.

- **Test deployment:** `https://trail-site-three.vercel.app`
- **Webhook route:** `https://trail-site-three.vercel.app/api/payments/webhook`
- **Production (do not use for this):** `https://www.rooibergwander.co.za`

### 9.0 Point Paystack at the deployment, and confirm it's actually live

- [ ] Vercel dashboard → confirm `PAYSTACK_SECRET_KEY` / `PUBLIC_PAYSTACK_PUBLIC_KEY` (test
      values) are set for the environment `trail-site-three.vercel.app` deploys from, **and
      that a deployment has happened since you set them** — env var edits only take effect on
      the next build, not retroactively on what's already running
- [ ] Confirm it took: open `https://trail-site-three.vercel.app/rates` — the real booking
      widget must render, not the "coming soon" panel (that panel means
      `PUBLIC_PAYSTACK_PUBLIC_KEY` isn't actually live yet, `rates.astro:33`)
- [ ] Paystack dashboard → **Test mode** → Settings → API Keys & Webhooks → **Webhook URL** →
      `https://trail-site-three.vercel.app/api/payments/webhook`
- [ ] **Write down the webhook URL that was there before**, so you can put it back afterwards
- [ ] `CRON_SECRET` and `ADMIN_EMAILS` also need to be set **in Vercel**, not just local `.env`,
      if you intend to exercise §6 (crons) or `/admin` against this same deployment

### 9.1 Full guest checkout

- [ ] `/rates` → complete all 5 widget steps for a **real** (non-comp) booking, a date well past
      the 45-day deposit threshold (e.g. Feb 2027) → **now press "Continue to secure payment"**
- [ ] Redirects to a real Paystack **hosted checkout** page (test mode banner visible)
- [ ] `select status, hold_expires_at, processor_reference from public.bookings order by created_at desc limit 1;`
      → a new `pending` row, reference `rw_%`, `hold_expires_at` ~`HOLD_MINUTES` from now
- [ ] Pay with a [Paystack test card](https://paystack.com/docs/payments/test-payments/) (e.g.
      `4084 0840 8408 4081`, any future expiry, CVV `408`, OTP `123456`)
- [ ] Redirects to `/booking/confirm?reference=rw_...` — **confirmed** state (this time the
      Paystack verify call genuinely succeeds, not just falls through)
- [ ] Within a few seconds, the webhook fires: `select * from public.payment_events order by created_at desc limit 1;`
      → `event_type='confirmed'`
- [ ] The booking row flips to `status='confirmed'`, `amount_paid_cents` set,
      `processor_txn_id` populated
- [ ] Guest gets the **real** (non-complimentary) confirmation email; operator gets
      `sendBookingOperatorNotification` — the one email nothing else in this test can reach
- [ ] Paystack dashboard → Settings → API Keys & Webhooks → **Webhook logs** (or the event's own
      detail page) shows the delivery to `trail-site-three.vercel.app`, response `200`. Vercel's
      own **Deployments → Functions logs** for `/api/payments/webhook` is the other place to
      confirm the same delivery from this end.

### 9.2 Webhook signature is actually checked

- [ ] `curl -X POST https://trail-site-three.vercel.app/api/payments/webhook -d '{"event":"charge.success","data":{"reference":"fake"}}'`
      with no `x-paystack-signature` header → **401 Invalid signature**. Confirms
      `verifyWebhookSignature` isn't a no-op.

### 9.3 Abandoned checkout → hold expiry

- [ ] Start a second checkout, reach the hosted Paystack page, **close the tab** without paying
- [ ] The booking stays `pending` with a real `hold_expires_at`
- [ ] Either wait for it to lapse and confirm `expire-stale-holds` flips it to `cancelled`, or
      visit `/booking/cancel?reference=<that ref>` and confirm it cancels immediately, releasing
      the date

### 9.4 Afterwards

- [ ] Restore the original webhook URL in Paystack (the one you wrote down in 9.0)
- [ ] These are now **real bookings in the database**, not comp — they need the same clear-down
      pass as everything else before go-live
- [ ] If `BOOKINGS_NOTIFY_TO` was left pointed at the operator's real address in Vercel, the
      operator-notification email in 9.1 went to her, not you — worth knowing before she sees
      an unexplained "New booking" alert

---

## 10. What this still does NOT cover

If you ran §9 with working test keys, the core checkout/webhook/hold path is now genuinely
covered — not just the comp-booking fallback. What's left, regardless:

- `resumeCheckout` and the abandoned-checkout **resume prompt** (§9.3 tests the hold expiring
  and manual cancel, not resuming an existing pending checkout)
- Webhook edge cases beyond the happy path: `amount_mismatch`, `paid_but_cancelled`,
  `reference_not_found`, `duplicate_ignored` — §9 only exercises `confirmed`
- Balance link generation (`lib/balance.ts`, `sendBalanceLinkEmail`, `adminResendEmail`
  kind=`balance_link`, the balance cron's link branch) — needs a deposit-plan booking whose
  balance actually falls due; a comp nudge sidesteps this deliberately (§6)
- The balance-payment webhook branch (`rwb_` references)

And regardless of whether §9 ran, once the **new** Paystack account and bank account are live:

- **Everything in §9, re-run against the new test keys** — a different account can have
  different settings, different webhook secret, different currency/settlement config
- **Key + webhook rotation:** set the webhook URL on the new account, update **both** Paystack
  keys in Vercel, and **redeploy** — the public key is baked in at build time
- **One live R10 transaction settling into the new bank account** — the only thing that proves
  money actually arrives where it should

---

## Findings to action regardless of this test

1. **`ADMIN_EMAILS` is unset**, so any Supabase Auth user in the project can sign into `/admin`
   today. Set it locally **and in Vercel**.
2. **`CRON_SECRET` is empty.** If it is also unset in Vercel, both daily crons have been
   returning 401 since deploy — no pre-trip reminders and no balance reminders have ever fired
   in production.
3. **The webhook never records Paystack's `data.domain`.** That is the sole reason the database
   cannot tell a test charge from a real one, and the reason the clear-down needs a manual
   Paystack reconciliation. A one-line addition to the `payment_events.detail` jsonb would stop
   this recurring on the new account.
