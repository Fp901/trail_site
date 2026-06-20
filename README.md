# The Rooiberg Wander

Marketing website + online booking for *The Rooiberg Wander* — an exclusive 3-night / 3-day
guided slackpacking trail in the Waterberg. Built per [CLAUDE.md](./CLAUDE.md) (the single
source of truth). Astro 6 · Tailwind v4 · Supabase · Paystack · Resend.

## Stack

- **Astro** (static marketing pages; booking + API routes are SSR via `prerender = false`).
- **Tailwind v4** through `@tailwindcss/vite` (tokens in `src/styles/global.css`).
- **Supabase** (Postgres) for bookings/inquiries; **Paystack** hosted checkout; **Resend** email.
- Adapter: **@astrojs/vercel** (swap to `@astrojs/netlify` in one line in `astro.config.mjs`).

## Scripts

```bash
npm run dev       # local dev server (full SSR, incl. booking routes)
npm run verify    # astro check + build + npm audit (run before every commit)
npm run build     # production build
npm run format    # prettier
```

## Going live — add credentials, then it works

The site builds and runs **without** any secrets (the Rates page shows a "booking coming soon"
state). To switch booking on:

1. **Copy env:** `cp .env.example .env` and fill it in (see `.env.example` for every var).
   Set the same vars in your Vercel project. Decided defaults: full payment up front
   (`BOOKING_DEPOSIT_PERCENT=100`), cards only, Resend email, Supabase region **eu-west-2**.
2. **Supabase:** create the project (region eu-west-2) and run `supabase/migrations/0001_init.sql`
   (SQL editor or Supabase CLI). It creates `bookings`, `inquiries`, `blocked_dates`, the
   `unavailable_windows` view, RLS (default-deny) and the double-booking exclusion constraint.
3. **Paystack:** add **test** keys first; set the webhook URL to
   `https://<your-domain>/api/payments/webhook`. Test the flow end-to-end (initialize → hosted
   checkout → webhook verified + Verify Transaction → confirmed → email) before going live.
4. **Resend:** verify the sending domain; set `EMAIL_API_KEY` and `EMAIL_FROM`.

Once `PUBLIC_SUPABASE_URL` + `PUBLIC_PAYSTACK_PUBLIC_KEY` are present at build time, the live
`BookingWidget` + `InquiryForm` render automatically.

## Security & price authority

- Price is computed **server-side** only (`src/lib/pricing.ts`, reusing `src/data/rates.ts`); the
  client never sends a price.
- Webhook verifies `x-paystack-signature` (HMAC-SHA512) **and** independently calls Verify
  Transaction before confirming, idempotently.
- Edge security headers are in `vercel.json`. **Outstanding:** enable the strict CSP per
  CLAUDE.md §11.2 (deferred — see CHANGELOG / Open questions).

## Deploying

### GitHub Pages (static marketing demo)

GitHub Pages is **static-only**, so the booking backend (Actions, webhook, SSR booking pages)
**does not run there** — the Rates page shows its "booking coming soon" state. The included
workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds a static export
(removing the server-only code) and publishes it.

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main` (or run the workflow manually). It deploys automatically and prints the URL.

The workflow auto-detects whether it's a user/org page (served at `/`) or a project page
(served at `/<repo>`) and sets Astro's `base` accordingly — internal links use a `withBase()`
helper, so both work. (Canonical URLs and `robots.txt` still point at the production domain in
`src/data/site.ts` / `public/robots.txt` — update those for production.)

A static export can also be produced locally:

```bash
rm -rf src/actions src/pages/api src/pages/booking   # what the CI does
BUILD_TARGET=static PAGES_BASE=/your-repo npm run build   # → dist/
```

### Vercel (full site, with booking)

Import the repo in Vercel, set the env vars from `.env.example`, and deploy. The Vercel adapter
keeps marketing pages static and runs the booking routes as serverless functions. This is the
target for live booking.

## Progress

See [CHANGELOG.md](./CHANGELOG.md). Marketing pages + full booking infrastructure are built;
remaining: real credentials + live test, real photography, verbatim privacy text, strict CSP.
