# Step-by-step fix plan

Companion to [`site-audit-2026-09.md`](./site-audit-2026-09.md), which holds the findings and the
measurements behind them. This file is the execution order: every step is a single commit with a
stated acceptance test.

**Standing gate for every step.** `npm run check` → `npm run build` → the eight
`scripts/verify-*.mjs` → axe-core on the five public pages at 1440 and 390. Anything visual also
gets a screenshot pass at 1920 / 1440 / 768 / 390. Only the booking widget's locked-step contrast
(2.87:1, an inactive component, WCAG-exempt) is an accepted axe result; anything else is a
regression.

---

## STEP 0 — Deploy what is already fixed · **blocking, do before anything else**

`rooibergwander.co.za` is serving a build from `de6e162` (18 September). The branch tip is
`18bdb7d`. Everything below has been reported from the live site and is **already fixed in git**:

| Reported | Fixed in | How to confirm |
|---|---|---|
| Photos in the day-by-day cards | `27787a0` | live HTML contains `daycard__photo`; the repo does not |
| Dark inset panel behind the `/logistics` and `/the-trail` headings | `b156799` | live CSS contains `.page-hero__content{…margin-top:-110px…}`; the repo has `.page-hero__copy` |
| Lodge jump-row thumbs too narrow | `b156799`, then `18bdb7d` | live CSS has `.jumpnav__thumb{height:6rem}` |
| Lodge gallery photos butted together | `18bdb7d` | live gap is 2px |

The dark-panel bug also has a root cause worth recording, because it will bite again: the old
`PageHero` repainted the slotted copy with `.page-hero__content :is(h1, .font-display){color:cream}`
in `@layer components`, but the headings carry Tailwind's `text-earth` utility, and **`@layer
utilities` wins over `@layer components` regardless of specificity**. So the override never
applied and the live site renders dark text on a dark panel. The rebuilt `PageHero` is immune by
construction: the copy sits on cream, which is what `text-earth` is for, so nothing needs
overriding.

**Action.** Establish what Vercel treats as the production branch. `.github/workflows/deploy.yml`
only fires on `main` (and only publishes the static GitHub Pages demo, not the live site), so the
live host is Vercel and its production branch is the thing to check. Then either merge
`redesign/photo-plan-and-elevation-charts` into `main`, or promote the branch deployment.

**Acceptance.** `curl -s https://rooibergwander.co.za/logistics | grep -c page-hero__copy` returns 1.

---

## STEP 1 — Canonical host · S1, S2 · ~30 min

`schema.ts` builds every `@id`, `url`, `WebSite.url` and breadcrumb `item` from `site.url`
(**www**), while the canonical, `og:url` and the whole sitemap use `site.canonicalUrl`
(**non-www**). `/the-trail` currently declares `"@id": "https://www.rooibergwander.co.za/the-trail#webpage"`
on a page whose canonical is the non-www URL.

1. In `src/data/schema.ts`, replace all five `site.url` references with `site.canonicalUrl`.
   Leave `site.url` itself alone — `lib/` still uses it for server-side URL construction.
2. In `public/robots.txt`, change the `Sitemap:` line to the non-www host and delete the
   `# PLACEHOLDER domain` comment.
3. Add to `scripts/verify-surfaces.mjs`: no built page may contain `www.rooibergwander.co.za`
   inside a `<script type="application/ld+json">` block.

**Acceptance.** `grep -o '"@id":"[^"]*"' dist/client/the-trail/index.html` shows no `www.`;
`verify-surfaces` green.

---

## STEP 2 — Meta descriptions and one title · S3, S6 · ~1 h

Six of nine descriptions blow the 155-character budget in Part 8.8 and get truncated: `/` **236**,
`/the-trail` 197, `/accommodation` 194, `/how-pricing-works` 192, `/rates` 170,
`/sadc-slackpacking` 167.

1. Rewrite each to ≤155, leading with the distinguishing fact from the Part 10.11 keyword map.
   `/rates` builds its description from a template literal in the frontmatter — shorten the
   template, do not hard-code the rand figure.
2. Give `/how-pricing-works` a branded title: `How pricing works | Rooiberg Wander`.
3. Extend the STEP 1 verify check: every built page's meta description ≤155 characters. This is
   exactly the constraint that drifts on every copy edit.

**Acceptance.** The length audit reports ≤155 on all nine pages; `verify-surfaces` green.

---

## STEP 3 — `/the-trail` LCP · P1, P2 · ~1 h

LCP measures **4,072 ms** on a 1.6 Mbps / 150 ms profile against a 2,500 ms bar. The page-hero
image is the cause: `walking-route-2.jpg` is a 3120×2080 dense-bushveld photo, and at 1440 px the
browser takes the 1600w WebP at **426 KB**. The home hero is a smooth sunset gradient and comes to
212 KB at the same width, which is why only this page is slow.

1. Add an explicit encoder quality to `astro.config.mjs` (`image.service.config.quality`), start
   at 72. Measured on this file: 426 KB → ~333 KB at 1600w.
2. Trim `PageHero`'s `widths` — drop 3120 and 2560. A band that is never taller than 480 px does
   not earn a 1 MB candidate.
3. Re-measure with the same harness before and after. If 72 is visibly soft on the bushveld
   detail, step to 75 and take the smaller win.

**Acceptance.** `/the-trail` LCP under 2,500 ms on the same throttled profile, and a side-by-side
of the hero at 1440 shows no visible degradation.

---

## STEP 4 — Delete the dead CSS · C2 · ~1 h

46 classes, ~248 lines, all commercial-model-v3 leftovers: `.bstyle*` (8), `.boption*` (8),
`.bcatchoice*` (4), `.bcal__cell--exclusive`/`--locked` and their legend keys (4),
`.ratetable__sadcnote`, `.rate-example`, `.amenity-grid`/`-item`, six `.routemap__*` variants,
`.teaser__index`, `.bstep__size`, `.bstep__deposit-note`, four `.bpreview__*`.

**Do not** delete `bcal__cell--open/started/unavailable` or `bpreview__row--credit/rate/total` or
`bpreview__tag--lm/excl` — those are built from template literals in `BookingWidget.astro` and are
live. The audit's count already excludes them.

Keep this as a pure deletion in its own commit so the diff is reviewable at a glance.

**Acceptance.** Built CSS shrinks; screenshot pass shows zero visual difference at all four
viewports. (This step is exactly where a silent breakage hides — `18bdb7d` had to restore a
`.sanctuary` grid declaration that a neighbouring rewrite had swallowed. Screenshot before/after,
do not eyeball the diff.)

---

## STEP 5 — The eyebrow primitive · C1 · ~3 h · biggest consistency win

The same small uppercase letterspaced label is written **50 times** — 25 rules in `global.css`
and 25 inline Tailwind strings across 17 files — spanning nine letter-spacings (0.03 / 0.04 /
0.05 / 0.06 / 0.08 / 0.1 / 0.12 / 0.14 / 0.18em), three weights and four sizes. `/the-trail` alone
ships `text-2xs`, `text-xs` *and* `text-sm` versions of it.

1. Add one `.eyebrow` class: `--text-2xs` / 600 / 0.14em — already the plurality, 13 of 25 CSS
   uses — with `--eyebrow-color` as the only knob, defaulting to `var(--color-green)`.
2. Add exactly two modifiers for the genuine second scales: `.eyebrow--lead` for the hero overline
   (0.18em) and `.eyebrow--table` for column heads (0.06em). Two, not a spectrum.
3. Replace all 50 sites. Work page by page, screenshotting each as you go — this touches every
   route.

**Acceptance.** `grep -c "uppercase tracking-\[" src/pages src/components` returns 0; the nine
letter-spacings are down to three; screenshot pass clean.

---

## STEP 6 — Heading primitives · C3, N2 · ~2 h

56 inline heading ramps across ten near-identical variants (`font-display text-2xl text-earth
sm:text-3xl` ×18, `font-display text-4xl text-earth sm:text-5xl` ×14, `…md:text-6xl` ×7, plus seven
one-offs).

1. Add `.page-title` (the h1 ramp) and `.section-title` (the h2 ramp). Keep the hero's bespoke
   clamp — it is documented as deliberate and sits above every ramp at every width.
2. Replace the 56 sites.
3. While in `/rates`: promote "How booking works" from `h3` to `h2`. The booking steps are not a
   subsection of the rate table.

**Acceptance.** Heading sizes unchanged in the screenshot pass; `/rates` heading order is
h1 → h2 → h2 → h2.

---

## STEP 7 — Schema coverage · S4, S7 · ~1 h

`Organization` ships on the home page only; Part 8.8 requires it everywhere. `/privacy` has no
JSON-LD at all — not even `WebPage` or a breadcrumb.

1. Move `organizationSchema` into `Seo.astro` so it is emitted on every page and cannot be
   forgotten, rather than adding it to nine `jsonLd` arrays by hand.
2. Give `/privacy` a `WebPage` + `BreadcrumbList`.
3. Retitle the `/logistics` "Every lodge, one standard" heading — `/accommodation` owns the lodge
   cluster under the Part 10.11 anti-cannibalisation rule and currently ships the identical h2.

**Acceptance.** Every built page contains exactly one `"Organization"` node; no `<h2>` string
appears on two pages.

---

## STEP 8 — GEO headings · S5 · ~3 h · **needs operator sign-off**

Part 10.5 makes question-shaped H2s answered in the first sentence the core GEO/AEO requirement,
and Part 10.11 lists the exact questions per page. Measured across the five public pages, the only
question-shaped headings anywhere are inside the `/logistics` FAQ accordion.

This is copy work and it changes customer-facing wording on every route, so it goes past the
operator before it ships. Draft first, review, then implement. Highest long-term SEO value on the
list, and the slowest to pay back — it compounds over weeks, it does not switch on.

**Acceptance.** Every page's H2s match the Part 10.11 question set, each answered in its first
sentence; operator has signed off the wording.

---

## STEP 9 — Split `global.css` · C4, C5, P4 · ~3 h

One 4,336-line file covering marketing, the booking widget, the pre-trip form and the route map.
About 40% of it (~1,775 lines) is booking/checkout-only and ships on every marketing page — 20 KB
gzipped total, so this is a maintenance win more than a speed one.

1. Split into `tokens.css`, `base.css`, `marketing.css`, `booking.css`, imported in that order
   from `global.css`. Nothing about the cascade changes.
2. Fold the eight exact duplicate declaration blocks into shared classes while the code is in
   hand — `.boption__name`/`.bstyle__name`/`.bcatchoice__lead`, `.daycard__daylabel`/
   `.sanctuary__role`, `.bwalkers__opt input`/`.ratetable__curbtn input`, and the rest.
3. Optionally import `booking.css` only from `/rates` and `/sadc-slackpacking`.

Do this **after** steps 4, 5 and 6 — they delete and consolidate enough that splitting first would
mean moving code twice.

**Acceptance.** Pure refactor: byte-identical rendering in the screenshot pass at all four
viewports.

---

## STEP 10 — Logo as SVG · P5 · ~1 h · **needs an asset**

The nav ships two raster PNG lockups (700×361, rendered at 40–44 px) toggled with `display:none`.
Fetch cost is near zero because hidden images are not fetched — but that is also the problem: on
the home page the dark variant is only requested *when you scroll*, so the swap can arrive late.
One SVG using `currentColor` removes the variant entirely and sharpens the mark at every DPR.

Blocked on the operator supplying the logo in vector form.

---

## Not scheduled, deliberately

- **Locked-step contrast** (2.87:1) — `pointer-events: none`, so it is an inactive component and
  WCAG 1.4.3 exempts it. Raising the opacity to clear AA would weaken the "not yet available"
  cue. Design decision, not a defect.
- **Cream mobile menu** — the current earth overlay is 11.8:1. Brand decision.
- **`LocalBusiness`/geo schema** — blocked on real coordinates from the operator. Not invented.
- **`npm audit` criticals** in Astro / sharp / esbuild — a breaking dependency upgrade with its own
  regression pass. It is why `npm run verify` cannot currently go green, and it does not belong in
  a visual or SEO cycle.

---

## Blocked on the operator

1. **Interior and lodge photography for Temminck's and Oukraal**, in warm light. Temminck's is a
   blown-out sky with the building behind a tree; Oukraal is a driveway with a parked vehicle and
   a signboard; Blackwood is genuinely good. The cards have been rebuilt twice now and present
   these as well as they can be presented — this is the ceiling, and Part 8.7 already lists it.
2. **Geo coordinates for Temminck's Lodge** — unblocks `LocalBusiness`/geo (S8).
3. **The logo in vector form** — unblocks STEP 10.
4. **Sign-off on the GEO heading rewrite** — unblocks STEP 8.
