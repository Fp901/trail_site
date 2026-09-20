# Site audit & improvement plan — 20 September 2026

Branch audited: `redesign/photo-plan-and-elevation-charts` at `2f3eac0` (the branch the live
site deploys from; `main` is six commits behind it).

**Method.** Everything below is measured, not inferred. Pages were built (`npm run build`),
served from `dist/client`, and driven in headless Chromium at 1920 / 1440 / 768 / 390 px:
axe-core 4.x (wcag2a, wcag2aa, wcag21aa, wcag22aa), Core Web Vitals via `PerformanceObserver`
on a throttled 1.6 Mbps / 150 ms link, per-element contrast sampled from the rendered pixels
with the text hidden, plus static analysis of `global.css` and the built HTML. Numbers in
parentheses are the measurement.

Severity: **P1** = shipping defect, fix before the next deploy. **P2** = real cost, schedule it.
**P3** = worth doing, no deadline.

---

## 1. Findings

### 1.1 SEO

| # | Sev | Finding |
|---|-----|---------|
| S1 | **P1** | **Every JSON-LD URL uses the wrong host.** `schema.ts` builds `@id`, `url`, `WebSite.url` and all breadcrumb `item` URLs from `site.url` (`https://www.rooibergwander.co.za`), while the canonical, `og:url` and the whole sitemap use `site.canonicalUrl` (`https://rooibergwander.co.za`). So `/the-trail` declares `"@id": "https://www.rooibergwander.co.za/the-trail#webpage"` on a page whose canonical is the non-www URL. This is exactly the split entity signal Part 10.5 warns about, and it is a one-constant fix. |
| S2 | **P1** | **`robots.txt` points the `Sitemap:` directive at `https://www.rooibergwander.co.za/sitemap-index.xml`** — a different host from the canonical, and the file still carries a `# PLACEHOLDER domain` comment. The sitemap it points at lists non-www URLs. |
| S3 | **P2** | **Six of nine meta descriptions exceed the ~155-character budget** set in Part 8.8 / 10.2, so Google truncates them: `/` **236**, `/the-trail` 197, `/accommodation` 194, `/how-pricing-works` 192, `/rates` 170, `/sadc-slackpacking` 167. Only `/logistics` (154) is inside it. The home page is 50% over. |
| S4 | **P2** | **`Organization` ships on the home page only.** Part 8.8 requires `Organization` + `BreadcrumbList` + `WebPage` on every page. Measured: `Organization` present on `/` and nowhere else. `/privacy` has **no JSON-LD at all** — not even `WebPage` or a breadcrumb. |
| S5 | **P2** | **Almost no H2 is question-shaped.** Part 10.5 makes this the core GEO/AEO requirement ("question-shaped `<h2>`s matching real queries, each answered in the first sentence"), and Part 10.11 lists the exact questions per page. Measured across the five public pages, the only question heading anywhere is `/rates` → "Cancellations & refunds" (not a question) and the `/logistics` FAQ accordion. Home has "A three-day walking safari in the Waterberg" where Part 10.11 specifies "What is the Rooiberg Wander?". |
| S6 | **P2** | **`/how-pricing-works` has a 17-character title with no brand** ("How pricing works"). Every other page follows `X \| Rooiberg Wander`. Part 10.2: brand last. |
| S7 | **P3** | **`Every lodge, one standard` is an `<h2>` on both `/accommodation` and `/logistics`.** Part 10.11's anti-cannibalisation rule gives the lodge cluster to `/accommodation` alone. |
| S8 | **P3** | **No `LocalBusiness` or `geo` schema anywhere** (Part 10.7 asks for it, with the Temminck's basecamp geo). Blocked: real coordinates have to come from the operator — see §4. |
| S9 | **P3** | **Sitemap carries no `<image:image>` entries**, which Part 10.1 asks for. No `serialize`/`lastmod` configured either. |

**Verified healthy, no action:** canonical on every page; exactly one `<h1>` per page at all four
viewports; `lang="en-ZA"`; no `hreflang` (correct per Part 10.8); `/sadc-slackpacking` is
`noindex`, absent from the sitemap, and correctly **not** `Disallow`ed in robots.txt; `/api/`,
`/booking/`, `/admin/`, `/pretrip`, `/trip-info` all excluded from the sitemap; the 301 from
`/sanctuaries` is in place; exactly one `Offer`, on `/rates`; `llms.txt` is thorough and current;
36 internal links point at `/rates` across six distinct descriptive anchor texts.

### 1.2 Performance

| # | Sev | Finding |
|---|-----|---------|
| P1 | **P1** | **`/the-trail` LCP is 4,072 ms** on the throttled profile — against a 2,500 ms "good" bar and a 2,000 ms internal target (Part 10.3). Cause: the page-hero image. `walking-route-2.jpg` is a 3120×2080 dense-bushveld photo; at 1440 px the browser takes the **1600w WebP at 426 KB**, and the 2560w variant is 846 KB. The homepage hero is a smooth sunset gradient and compresses to 212 KB at the same width, which is why only this page is slow. |
| P2 | **P2** | **No `image.quality` is configured in `astro.config.mjs`**, so every asset is encoded at the default 80. At quality 72 the same `walking-route-2` 1600w drops to ~333 KB (−22%) with no visible loss on a 480 px-tall band. The `widths` lists also go up to 3120 for bands that are never taller than 480 px. |
| P3 | **P2** | **`/accommodation` transfers ~952 KB** — the heaviest page on the site, from the per-lodge galleries (`temmnickss-room-1` alone is 530 KB at one width). |
| P4 | **P3** | **~40% of `global.css` (about 1,775 of 4,336 lines) is booking/checkout-only** and ships on every marketing page. The whole sheet is 123 KB raw / **20 KB gzipped**, so the real cost is modest — this is a maintenance finding more than a speed one. |
| P5 | **P3** | **The nav ships two `<img>` logo variants on every page**, a cream one and a dark one, toggled with `display:none`. Fetch cost is near zero (hidden images aren't fetched), but on the home page the dark logo is only requested *when you scroll*, so the swap can arrive late. Both are raster PNGs (700×361) rendered at 40–44 px. |

**Verified healthy:** CLS is 0.032 on the home page and ≤0.022 everywhere else, inside the 0.05
internal target; every `<img>` on every page carries explicit `width`/`height`; total JS is 62 KB
across the whole site and the marketing pages carry almost none of it.

### 1.3 CSS / DRY

| # | Sev | Finding |
|---|-----|---------|
| C1 | **P2** | **The "eyebrow" is written 50 times, no two alike.** 25 rules in `global.css` and 25 inline Tailwind strings across 17 `.astro` files, all expressing the same small uppercase letterspaced label — across **nine different letter-spacings** (0.03 / 0.04 / 0.05 / 0.06 / 0.08 / 0.1 / 0.12 / 0.14 / 0.18em), **three weights** (500 / 600 / 700) and four sizes. This is not just duplication, it is a visible inconsistency: `/the-trail` alone ships `text-2xs`, `text-xs` *and* `text-sm` variants of the same element. |
| C2 | **P2** | **46 dead classes, ~248 lines of CSS**, all of them commercial-model-v3 leftovers: `.bstyle*` (8, the catered/uncatered chooser), `.boption*` (8, the exclusive/shared compare), `.bcatchoice*` (4, the catering question v4 removed), `.bcal__cell--exclusive`/`--locked` + their legend keys (4), `.ratetable__sadcnote` (removed when the resident rate became undisclosed), `.rate-example`, `.amenity-grid`/`-item`, six `.routemap__*` variants, `.teaser__index`, `.bstep__size`, `.bstep__deposit-note`, four `.bpreview__*`. Verified against dynamically-built class names too — `bcal__cell--open/started/unavailable` and `bpreview__row--credit/rate/total` *are* live and are excluded from that count. |
| C3 | **P2** | **Heading ramps are inline and repeated 56 times** across ten near-identical variants (`font-display text-2xl text-earth sm:text-3xl` ×18, `font-display text-4xl text-earth sm:text-5xl` ×14, `…md:text-6xl` ×7, and seven more one-offs). There is no page-title or section-title primitive. |
| C4 | **P3** | **Eight exact duplicate declaration blocks** across unrelated selectors, e.g. `.boption__name`/`.bstyle__name`/`.bcatchoice__lead` (identical 4-declaration block ×3), `.daycard__daylabel`/`.sanctuary__role` (identical 6-declaration block), `.bstep__subheading`/`.btrip__title`, `.bwalkers__opt input`/`.ratetable__curbtn input` (identical 7-declaration visually-hidden-radio block). |
| C5 | **P3** | `global.css` is a single 4,336-line file covering marketing, the booking widget, the pre-trip form and the route map. The `@layer` structure is sound and the token discipline is genuinely good; the file is simply doing too many jobs to navigate. |

**Verified healthy:** no `tailwind.config.*` (correct for v4); tokens live in `@theme`/`:root`
exactly as Part 5 requires and are used consistently — I found no hard-coded brand hexes outside
the token block; the `@layer base` / `@layer components` split is clean; `--accent-ink` is a
well-judged pattern.

### 1.4 Accessibility

axe-core is **clean on all five public pages at both 1440 px and 390 px**, with one exception:

| # | Sev | Finding |
|---|-----|---------|
| A1 | **P3** | `/rates` booking widget: a locked step renders at `opacity: 0.5`, putting `.bstep__heading` and `#bf-cal-label` at **2.87:1**. The step also carries `pointer-events: none`, so it is an *inactive* component and WCAG 1.4.3 exempts it — but it is informational text, and 0.5 is aggressive. Raising it to ~0.75 would clear AA and weaken the "not yet available" cue; that is a design call, not a defect. |

Keyboard focus was walked with real `Tab` presses: every interactive element has a visible ring
that flips context-correctly (cream over the hero, earth on cream). No focus traps outside the
intentional one in the mobile menu.

### 1.5 Content

| # | Sev | Finding |
|---|-----|---------|
| N1 | **P3** | The mobile menu is full-screen **earth**, not cream. Cream-on-earth is 11.8:1 so it passes comfortably; flagged only because a cream overlay was asked for once and it is a brand decision, not a bug. |
| N2 | **P3** | `/rates` heading order: `h2 Rates at a glance` → `h3 How booking works` → `h2 Booking the trail`. The booking steps are not a subsection of the rate table; that `h3` should be an `h2`. |
| N3 | — | **Photography is the real ceiling on the lodge pages.** Temminck's (blown-out sky, building behind a tree, foreground irrigation) and Oukraal (driveway, parked vehicle, signboard) are arrival snaps in harsh midday light. Blackwood is genuinely good. Card craft can only do so much — Part 8.7 already lists interior/lodge photography as an outstanding gap, and this is the concrete cost of it. |

---

## 2. The plan

Ordered by value per unit of effort. Each package is independently shippable and ends green on
`npm run check`, `npm run build` and the eight `scripts/verify-*.mjs`.

### Package 1 — Canonical host, one constant (S1, S2) · ~30 min · **do first**
Point `schema.ts` at `site.canonicalUrl` instead of `site.url`, and fix the `Sitemap:` line in
`public/robots.txt` to the non-www host. Add a line to `scripts/verify-surfaces.mjs` asserting
that no built page emits a `www.` URL in JSON-LD, so it cannot regress. Highest SEO value on the
list and close to zero risk.

### Package 2 — Meta descriptions (S3, S6) · ~1 h
Rewrite all six over-length descriptions to ≤155 characters, leading with the distinguishing fact
(Part 10.11 keyword map). Give `/how-pricing-works` a branded title. Add a build-time assertion
for the 155-character budget alongside the check in Package 1 — it is the kind of thing that
drifts on every copy edit.

### Package 3 — `/the-trail` LCP (P1, P2) · ~1 h
Set `image: { service: { config: { quality: 72 } } }` in `astro.config.mjs`, and trim the
page-hero `widths` list — 3120w and 2560w variants of a 480 px-tall band are never worth their
weight. Expected: 426 KB → ~333 KB at 1600w and the 846 KB candidate gone, so LCP should land
under 2.5 s on the throttled profile. Re-measure with the same harness before and after; if
quality 72 is visibly soft on the bushveld detail, step to 75 and take the smaller win.

### Package 4 — Delete the dead CSS (C2) · ~1 h
Remove the 46 verified-dead classes and their comments, ~248 lines. Mechanical, and it makes
Package 5 much easier to review. Do it in its own commit so the diff is obviously a deletion.

### Package 5 — The eyebrow primitive (C1) · ~3 h
Add one `.eyebrow` component class with `--eyebrow-color` as the only knob, pick a single
size/weight/tracking (`--text-2xs` / 600 / 0.14em is already the plurality at 13 of 25 uses), and
replace all 50 sites. Where a genuine second scale is needed — table column heads, the hero
overline at 0.18em — add exactly one modifier each rather than reintroducing a spectrum. This is
the single biggest consistency win available, and it will visibly tighten `/the-trail`, which
currently ships three sizes of the same element.

### Package 6 — Heading primitives (C3, N2) · ~2 h
Two classes, `.page-title` and `.section-title`, replacing 56 inline ramps. Promote `/rates`'s
"How booking works" to `h2` while in there.

### Package 7 — GEO headings (S5) · ~3 h · **needs a copy decision**
Rewrite H2s to the question forms already specified in Part 10.11, each answered in its first
sentence. This is copy work, not code, and it touches customer-facing wording on every page — it
should go past the operator before it ships. Highest long-term SEO value on the list.

### Package 8 — Schema coverage (S4, S7) · ~1 h
Put `Organization` on every page (it is a constant, so this is one line in each page's `jsonLd`
array — or better, move it into `Seo.astro` so it cannot be forgotten). Give `/privacy` a
`WebPage` + breadcrumb. Retitle the duplicated `/logistics` lodge heading.

### Package 9 — Split `global.css` (C4, C5, P4) · ~3 h
Split into `tokens.css`, `base.css`, `marketing.css` and `booking.css`, imported in order from
`global.css` so nothing about the cascade changes. Fold the eight duplicate blocks into shared
classes while the code is in hand. Optionally import `booking.css` only from the two pages that
need it, which takes ~8 KB gzipped off every marketing page. Pure refactor, no visual diff — pair
it with a before/after screenshot run at all four viewports.

### Package 10 — Logo as SVG (P5) · ~1 h · **needs an asset**
Replace the two PNG lockups with one SVG using `currentColor`, which removes the variant swap
entirely and sharpens the mark at every DPR. Needs the logo in vector form from the operator.

### Not scheduled, deliberately
- **A1** (locked-step opacity) — exempt, and changing it is a design decision.
- **N1** (cream mobile menu) — passes AA, brand decision.
- **S8** (`LocalBusiness`/geo) — blocked on real coordinates; see below.
- The `npm audit` criticals in Astro/sharp/esbuild — a breaking dependency upgrade, its own piece
  of work with its own regression pass, not part of a visual/SEO cycle.

---

## 3. Already done this session

- **`b156799`** — overlay, layout and contrast repairs: statement-band and hero scrims rebuilt so
  the photography reads (hero overline went from 1.3:1 to 4.6:1 in the process); `/the-trail` and
  `/logistics` openers rebuilt without the inset brown panel; the home intro grid; the day-card
  reveal made transform-only; the WhatsApp button docked off the stats bar; `/rates` wrapping,
  widths and step layout; the `/accommodation` jump row; `--color-day4-ink`.
- **`2f3eac0`** — the home lodge teaser cards (below).

### The lodge cards
They were three loose photos with captions running below them at page level, and two of the three
stated their night twice ("NIGHT 2" above "The Bush Lodge · Night 2"). Now: a contained card with
a hairline border and the photo flush inside it, equal height across the row; **3:2**, the source
photos' native ratio, where the previous 4:3 was cropping the sides off three wide architectural
shots; the night marker moved onto the photo over a scrim that is flat where the marker sits (one
frame has pale paving exactly there and measured 2.7:1 — worst case is now 8.9:1); the duplicate
night stripped from the role line; and each card carrying the per-lodge accent already used on
`/accommodation`.

What this **cannot** fix is N3 — two of the three source photographs are weak. Cards this size
now present them as well as they can be presented.

---

## 4. Open with the operator

Additions to the CLAUDE.md Part 14 list, from this audit:

1. **Interior/lodge photography for Temminck's and Oukraal**, in warm light. This is the single
   biggest available improvement to the lodge pages and no amount of card design substitutes for
   it (N3, and already noted in Part 8.7).
2. **Geo coordinates for Temminck's Lodge**, to unblock `LocalBusiness`/geo schema (S8). Not
   invented.
3. **The logo in vector form**, to unblock Package 10 (P5).
4. **Sign-off on the GEO heading rewrite** (Package 7) before it ships, since it changes
   customer-facing copy on every page.
