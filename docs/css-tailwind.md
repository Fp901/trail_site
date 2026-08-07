# CSS & Tailwind reference

How styling is set up and organised in this repo. This is a reference, not the design authority — for any visual decision, CLAUDE.md Part 5 (the visual bible) wins over anything inferred here.

## 1. Setup

- **Tailwind v4**, wired via the `@tailwindcss/vite` plugin in `astro.config.mjs` (`vite: { plugins: [tailwindcss()] }`). There is **no** `tailwind.config.*` file — v4 is CSS-first; tokens live in `@theme` inside `src/styles/global.css` (confirmed: no config file present in the repo root).
- **Do not** add `@astrojs/tailwind` — that's the deprecated v3 integration and conflicts with the CSS-first `@theme` approach already in place.
- `tailwindcss` and `@tailwindcss/vite` are pinned to an **exact** version, `4.3.1` (no `^`/`~`), in `package.json`. Bump deliberately, not via a routine `npm update`.
- One Tailwind plugin in use: `@tailwindcss/typography` (`^0.5.20`), loaded via `@plugin '@tailwindcss/typography';` at the top of `global.css`.
- Fonts are self-hosted via Fontsource, not a CDN link: `@fontsource-variable/fraunces` (display) and `@fontsource-variable/inter` (body).
- Single stylesheet: `src/styles/global.css` (4,343 lines). There is no CSS-in-JS, no CSS Modules, and no per-component `<style>` blocks in `.astro` files for anything reused — shared styling lives in this one file, imported once via the layout.

## 2. Design tokens (`@theme`, lines 15-33)

```css
--color-earth: #3d2b1f;      /* dominant deep earth */
--color-ochre: #c19a6b;      /* sharp warm accent — use sparingly */
--color-green: #4a5d23;      /* muted veld green — secondary/nature */
--color-charcoal: #2c2c2c;   /* body text */
--color-cream: #f5f0e6;      /* backgrounds / cards */
--color-hairline: rgba(61, 43, 31, 0.1);

--color-day2: #c19a6b;       /* route-map Day 2 — ochre */
--color-day3: #4a5d23;       /* route-map Day 3 — green */
--color-day4: #9c5b3b;       /* route-map Day 4 — terracotta */

--font-display: 'Fraunces Variable', 'Fraunces', Georgia, 'Times New Roman', serif;
--font-body: 'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
```

`@theme` exposes each as both a raw CSS variable (`var(--color-ochre)`) and a Tailwind utility (`bg-ochre`, `text-earth`, `font-display`, …). Markup should use one of those two forms — never a hard-coded hex. See CLAUDE.md §5.4 for the palette's intended usage weighting (earth/cream dominant, ochre sparing) and §5.3 for type pairing rules.

## 3. Layer structure

- **`@layer base`** (38-112) — root-level defaults: `--nav-h` (sticky-nav height reserved on interior pages), html/body resets, heading defaults (Fraunces, `line-height: 1.1`, `letter-spacing: -0.015em`, variable-font `SOFT`/`WONK` axes), a handful of selectors opted into `font-variant-numeric: tabular-nums` (rate tables, stat values, day numerals), the global ochre `:focus-visible` ring, and `::selection` styling.
- **`@layer components`** (118-4330) — everything else, ~50 named sections, each preceded by a `/* --- Section --- */` comment banner. Roughly build-ordered rather than alphabetised. No `@layer utilities` block exists — one-off utility-style needs are handled with Tailwind's own utility classes directly in markup, not custom CSS.
- Trailing **`@media (prefers-reduced-motion: reduce)`** block (4331+) turns off the file's transitions/animations globally for users who've asked for it — see §5.

## 4. Component class inventory

Grouped by area, with the line each section banner starts at (`global.css:N`) so you can jump straight there. Class names are BEM-ish (`.block__element`, `.block--modifier`); most blocks are single-purpose and used by exactly one component.

**Chrome (nav, footer, buttons)**
- `.site-header`, `.nav-link`, `.nav-cta` — sticky nav, incl. the transparent-over-hero → solid-cream-on-scroll state machine (`:119`)
- `.site-brand`, `.brand-mark` — logo lockup, sized by height so it can never overflow `--nav-h` (`:203`)
- `.mobile-menu*`, `.hamburger` — full-screen mobile overlay (`:260`)
- `.skip-link` (`:369`), `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` (`:387`) — the three button treatments (ochre / outline / for-dark-imagery)
- `.footer-link`, `.footer-social*` (`:452`, `:727`)

**Homepage**
- `.teaser*` (`:461`), `.statement-band*` (`:507`), `.howit*` — numbered how-it-works steps (`:551`), `.home-lodges`/`.home-lodge*` (`:602`), `.testimonials`/`.testimonial*` (`:663`), `.greview*` — Google review band (`:700`)
- `.statsbar*` (`:3355`), Hero styles (`:3271`)

**The Trail / itinerary**
- `.timeline`, `.daycard*` — the vertical, "strung numeral" itinerary layout with a hairline connecting rail (`:751`)
- `.daycard__elevation` — elevation-profile image caption block (`:875`)

**Booking flow** (the largest area of the file by far)
- `.resume-prompt*` — abandoned-checkout resume banner (`:903`)
- `.bform*`, `.form-field*`, `.form-hint`/`.form-error` — shared form primitives (`:927`)
- `.bstep*` — the 5-step guided accordion; `is-current`/`is-done`/`is-locked` state classes only apply once JS adds `.bform--stepped`, so the form degrades to a plain long-scroll form without JS (`:1039`, `:1183`)
- ⚠️ `.boption*` — option-comparison cards (`:1101`). **Dead CSS: 12 rules with no markup anywhere in the repo** (not in `BookingWidget.astro`, not generated in JS). Verified by searching the whole tree; the only surviving reference was this document. Candidate for deletion.
- `.btrip*` — **step 5** trip summary, one line per night (`:1251`)
- `.bwalkers*`, `.bsolo*`, `.blink` — **step 1**, "Your group" (walker-count chips + the solo path) (`:1309`)
- `.bstyle*` — **step 2**, "Booking type" (catered / self-catered cards). Note the `/* --- Step 1: your group (walkers / style / private buyout) --- */` banner above this block in `global.css` is stale — the style cards moved to step 2 in the markup and the banner was never updated.
- `.bjoin-list`, `.bjoin-card*`, `.bjoin-empty*` — **step 3**, party-of-1-3 "join a departure" list (`:1513`)
- `.bmodal*` — native `<dialog>`-based policy modal (`:1595`)
- `.bcatchoice*` — **step 3**, two-way catering prompt under the calendar (`:1466`)
- Availability calendar — **step 3** (`:1784`) and its 5 cell-state colour codings (`:1912`)
- Date preview panel (`:2007`), pre-trip details form (`:2216`)

**Rates & trust**
- Rate matrix (`:2299`), booking-confidence strip / payment trust row (`:2581`)

**Content pages**
- Logistics/safety blocks (`:2771`), wildlife & birding cards (`:2863`), season cards (`:2900`), FAQ accordion — native `<details>/<summary>` (`:2950`), sanctuary feature rows (`:2994`), accommodation amenities grid (`:3110`), homepage trust bar (`:3143`), RouteMap SVG styling (`:3181`)

**Admin dashboard** (`.admin-*`, from ~`:3400`)
- Nav shell (`:3756`), stat cards + filters (`:3826`), action cards (`:3949`), activity timeline (`:4038`), enquiries (`:4096`), blocked-dates panel (`:4158`), beta notice (`:4211`), enquiry disclosure (`:4238`), cancellation-policy summary (`:4278`)

Line numbers are as of this doc's last update — re-grep the `/* --- ... --- */` banners if `global.css` has since grown or been reordered; treat this table as a map, not a promise.

## 5. Conventions

- **Tinting via `color-mix()`, not new tokens.** Every hover/disabled/muted-text variant is produced by mixing an existing token with `transparent`, `#fff`, or another token at build time in CSS — e.g. `color-mix(in srgb, var(--color-charcoal) 65%, transparent)` for muted body text. No new named colour tokens are added for these; see §6 for how many distinct mixes this has produced in practice.
- **`--accent` as a per-context colour hook.** Day cards set `--accent` inline (from `colorVar` in `itinerary.ts`, matching `--color-day2/3/4`) and the CSS reads `var(--accent)` for the numeral, distance badge, and arrow — one rule set serves three different accent colours per day.
- **`font-variant-numeric: tabular-nums`** is applied via a shared selector list (rates, stat values, day numerals, `.bstep__num`) so columns of digits align instead of each digit taking its natural proportional width.
- **No `box-shadow` anywhere in the file** (confirmed, §6) — consistent with CLAUDE.md §5.5's "hairline borders over heavy shadows" rule; depth comes from a 1px `var(--color-hairline)` border, not elevation.
- **Progressive enhancement on the booking form.** The 5-step accordion ships fully expanded with no collapse behaviour; only `.bform--stepped` (added by JS) activates the `is-current`/`is-done`/`is-locked` rules. A JS failure can't leave a payment form stuck shut.
- **`prefers-reduced-motion: reduce`** is honoured globally in one trailing block rather than scattered per-component overrides.
- **Native interactive elements over custom JS widgets** where possible: `<details>/<summary>` for the FAQ accordion, `<dialog>` for the policy modal (gets focus trap, Escape, and backdrop for free).

## 6. Value census

Actual distinct values in use across `global.css`, from a literal grep — this is what's really shipping, not what the design system says should ship. Full commands and output:

```
rg -o 'font-size:\s*[^;]+'      src/styles/global.css | sort | uniq -c | sort -rn
rg -o 'border-radius:\s*[^;]+'  src/styles/global.css | sort | uniq -c | sort -rn
rg -o 'box-shadow:\s*[^;]+'     src/styles/global.css | sort | uniq -c | sort -rn
rg -o 'line-height:\s*[^;]+'    src/styles/global.css | sort | uniq -c | sort -rn
rg -o 'gap:\s*[^;]+'            src/styles/global.css | sort | uniq -c | sort -rn
rg -o 'color-mix\([^)]*\)'      src/styles/global.css | sort | uniq -c | sort -rn
```

### `font-size` — 44 distinct values, 178 occurrences

```
     26 font-size: 0.9rem
     26 font-size: 0.8rem
     16 font-size: 0.85rem
     10 font-size: 0.875rem
     10 font-size: 0.75rem
     10 font-size: 0.72rem
      9 font-size: 0.7rem
      8 font-size: 0.95rem
      5 font-size: 1rem
      5 font-size: 1.2rem
      4 font-size: 0.8125rem
      4 font-size: 0.68rem
      3 font-size: 1.5rem
      3 font-size: 1.35rem
      3 font-size: 1.25rem
      3 font-size: 1.15rem
      3 font-size: 0.78rem
      2 font-size: 1.4rem
      2 font-size: 1.1rem
      2 font-size: 1.05rem
      1 font-size: clamp(2rem, 6vw, 3rem)
      1 font-size: clamp(2rem, 5vw, 2.75rem)
      1 font-size: clamp(2.5rem, 7vw, 5rem)
      1 font-size: clamp(1.75rem, 8vw, 2.5rem)
      1 font-size: clamp(1.75rem, 5vw, 2.5rem)
      1 font-size: clamp(1.5rem, 4vw, 2rem)
      1 font-size: clamp(1.5rem, 3vw, 2rem)
      1 font-size: clamp(1.5rem, 3.5vw, 1.875rem)
      1 font-size: clamp(1.5rem, 3.4vw, 2.4rem)
      1 font-size: clamp(1.35rem, 4vw, 1.75rem)
      1 font-size: clamp(1.25rem, 3vw, 1.6rem)
      1 font-size: clamp(1.0625rem, 2.4vw, 1.375rem)
      1 font-size: 2rem
      1 font-size: 22px
      1 font-size: 14px
      1 font-size: 1.3rem
      1 font-size: 1.125rem
      1 font-size: 0.92rem
      1 font-size: 0.88rem
      1 font-size: 0.87rem
      1 font-size: 0.83rem
      1 font-size: 0.65rem
      1 font-size: 0.62rem
      1 font-size: 0.625rem
```

**Flags:**
- `22px` and `14px` are the only two raw-pixel `font-size`s in the entire file — every other value is `rem` (or `clamp()` of rems). Near-certainly should be `1.375rem`-ish and `0.875rem` respectively for consistency, unless there's a specific reason (e.g. matching an external icon's native size) — worth checking those two call sites specifically.
- Tight cluster in the 0.8-0.95 range with 9 distinct values 1px-2px apart (`0.83rem`, `0.85rem`, `0.875rem`, `0.87rem`, `0.88rem`, `0.9rem`, `0.92rem`, `0.95rem`) — the kind of drift that happens when each component is tuned in isolation. Strong candidate for collapsing onto a ~4-6 step type scale.
- Similarly `0.7rem` / `0.72rem` / `0.75rem` / `0.78rem` (4 values within 0.08rem) and `1.05rem` / `1.1rem` / `1.15rem`/`1.125rem` (4 values within 0.05rem).
- 13 distinct `clamp()` headline sizes, each hand-tuned per component — expected for a responsive-display-type site, but confirms there's no shared clamp/token for hero-scale type.

### `border-radius` — 21 distinct values, 77 occurrences

```
     10 border-radius: 0.6rem
      7 border-radius: 1rem
      7 border-radius: 0.85rem
      6 border-radius: 999px
      6 border-radius: 0.5rem
      5 border-radius: 1.25rem
      5 border-radius: 0.75rem
      4 border-radius: 0.9rem
      4 border-radius: 0.65rem
      4 border-radius: 0 1rem 1rem 0
      3 border-radius: 0.7rem
      3 border-radius: 0.375rem
      2 border-radius: 50%
      2 border-radius: 2px
      2 border-radius: 0 0.5rem 0.5rem 0
      2 border-radius: 0
      1 border-radius: 9999px
      1 border-radius: 3px
      1 border-radius: 0.2rem
      1 border-radius: 0 0.6rem 0.6rem 0
      1 border-radius: 0 0 1rem 1rem
```

**Flags:**
- `999px` (6×) and `9999px` (1×) are the same intent ("fully pill/circular") expressed two different ways — should be one value, not two. Easy, safe collapse.
- `0.6rem` / `0.65rem` / `0.7rem` / `0.75rem` cluster (4 values 0.05rem apart) and `0.85rem` / `0.9rem` cluster — same drift pattern as font-size.
- The asymmetric multi-corner values (`0 1rem 1rem 0`, `0 0.5rem 0.5rem 0`, `0 0.6rem 0.6rem 0`) are all "round the trailing corners only" for adjoining elements (e.g. an input glued to a button) — those are legitimately distinct per-component, not drift.

### `box-shadow` — 0 occurrences

No `box-shadow` declarations anywhere in `global.css`. Matches the design system's "hairline borders over heavy shadows" rule (CLAUDE.md §5.5) — confirmed in practice, not just in the brief.

### `line-height` — 15 distinct values, 64 occurrences

```
     12 line-height: 1.6
     12 line-height: 1.55
     12 line-height: 1.5
      7 line-height: 1
      3 line-height: 1.7
      3 line-height: 1.45
      3 line-height: 1.4
      3 line-height: 1.3
      2 line-height: 1.25
      2 line-height: 1.1
      1 line-height: 1.65
      1 line-height: 1.35
      1 line-height: 1.2
      1 line-height: 1.15
      1 line-height: 1.05
```

**Flags:** the three most common values (`1.5`, `1.55`, `1.6` — 12 uses each, 36 of 64 total) sit inside CLAUDE.md §5.3's specified body range (1.5-1.7), so body-copy line-height is genuinely disciplined. The long tail (`1.05` to `1.45`) is mostly heading/label contexts tightening below that range, which also matches spec (§5.3: tight ~1.05-1.08 for display). No obvious drift to flag here — this is the cleanest of the five numeric properties.

### `gap` — 32 distinct values, 90 occurrences

```
     14 gap: 0.5rem
     10 gap: 0.75rem
      9 gap: 0.6rem
      8 gap: 1rem
      5 gap: 0.4rem
      5 gap: 0.2rem
      4 gap: 0.65rem
      3 gap: 0.9rem
      3 gap: 0.75rem 1.5rem
      2 gap: 1.25rem
      2 gap: 0.5rem 1.5rem
      2 gap: 0.55rem
      2 gap: 0.3rem
      2 gap: 0.35rem
      2 gap: 0.15rem
      1 gap: 3rem
      1 gap: 2rem 2.5rem
      1 gap: 2rem
      1 gap: 1rem 2rem
      1 gap: 1.75rem
      1 gap: 1.5rem
      1 gap: 1.1rem
      1 gap: 0.9rem 1.5rem
      1 gap: 0.75rem 1.25rem
      1 gap: 0.65rem 1.25rem
      1 gap: 0.5rem 1rem
      1 gap: 0.55rem 1.1rem
      1 gap: 0.4rem 0.5rem
      1 gap: 0.35rem 0.75rem
      1 gap: 0.25rem 0.75rem
      1 gap: 0.05rem
      1 gap: 0
```

**Flags:** the four leaders (`0.5rem`, `0.75rem`, `0.6rem`, `1rem` — 41 of 90 occurrences) roughly track an 0.25rem/4px rhythm and look intentional. Below that, `0.5rem`/`0.55rem`/`0.6rem`/`0.65rem` form another tight 4-value, 0.05rem-step cluster — same drift signature as font-size and border-radius. Two-value (row/column) gaps are mostly one-offs tied to a specific grid and not drift candidates.

### `color-mix()` — 113 distinct calls, 220 occurrences

The literal command specified above (`rg -o 'color-mix\([^)]*\)'`) truncates at the first `)` because every call nests a `var(...)`, so it only reports the opening fragment (e.g. `color-mix(in srgb, var(--color-charcoal)` — 72 "distinct" rows that are really 5 base-colour buckets). Re-run with a paren-balanced pattern for the real picture:

```
rg -oP 'color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)' src/styles/global.css | sort | uniq -c | sort -rn
```

That yields **113 distinct full `color-mix()` expressions** (220 total call sites) — every one is `color-mix(in srgb, <token-or-hex> <percent>%, <transparent | #fff | white | another-token>)`. No malformed or off-pattern calls found. Breakdown by base colour (mix-ins only, from the truncated grep, which is accurate for this question): `--color-charcoal` 72, `--color-ochre` 48, `--color-earth` 38, `--color-green` 25, `--color-cream` 25, `--accent` 2, plus 7 occurrences involving the terracotta hex `#9c5b3b` (6 as a raw hex literal, 1 as `var(--color-day4, #9c5b3b)` — token with a hex fallback) and 3 mixing the form-error hex `#9c2b1b` directly (no token — see below).

**Flags:**
- **113 distinct percentage/colour combinations is a real finding**, not just verbose CSS: nearly every mix is a one-off percentage (`88%`, `86%`, `78%`, `70%`, `65%`, `62%`, …) tuned per call site rather than drawn from a shared set of opacity steps. A handful of round numbers repeat a lot (`transparent` mixes at 55%/60%/65%/70%/75% each appear independently 5-9 times), suggesting an implicit-but-unenforced scale already exists in practice.
- **`#9c5b3b` (terracotta / Day 4) is used as a raw hex in `color-mix()` 6 times**, alongside `var(--color-day4)` used elsewhere and one defensive `var(--color-day4, #9c5b3b)` fallback — same colour reachable three different ways, with no build-time link between the raw occurrences and the token if its value ever changes.
- **`#9c2b1b` (form-error red) is used 3 times and has no `@theme` token at all** — it's the one semantic colour (error state) that isn't tokenized like the rest of the palette.
