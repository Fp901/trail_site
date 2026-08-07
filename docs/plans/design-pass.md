# Design pass — plan

Baseline captured, every item below located in source and verified in a browser before being written down. **Nothing has been changed yet.**

Baseline screenshots: `.design-pass/before/` — 5 routes × {1440, 390} plus booking form steps 1/3-calendar/4/5 at both widths (20 + 8 files).

> **Read §0 first.** Six items in the brief did not survive verification. Four are already correct in the shipped code and must not be "fixed"; two would introduce new defects if implemented as written. Per the brief's own instruction — *flag the conflict rather than silently resolving it* — they are listed rather than actioned.

---

## §0. Brief vs. verified reality — conflicts to resolve before Phase 4

| # | Brief says | Verified reality | Recommendation |
|---|---|---|---|
| 0.1 | `.btn-primary` is **white on ochre, 2.6:1** — switch the label colour | `global.css:410-414` already sets `color: var(--color-earth)`. Computed in-browser: `rgb(61,43,31)` on `rgb(193,154,107)` = **5.18:1, passes AA**. Same for `.nav-cta`. | **Drop this item.** Already correct. No call site to change. |
| 0.2 | Social + floating-WhatsApp links have **raw URLs as accessible names** | All three already have proper names: footer social carry `aria-label="Rooiberg Wander on Instagram/Facebook"`; the floating button carries `aria-label="Chat with us on WhatsApp"`; the footer text link reads "WhatsApp Hanlie". | **Drop this item.** Already correct. |
| 0.3 | "How the trail works" **may render step numbers twice** (ol marker + badge) — verify | Verified in-browser: `<ol class="howit">` computes `list-style-type: none`, and each `<li>` marker is `none`. Only the `.howit__num` badge renders. | **Drop this item.** Not a bug — this is the "verify in the browser" item, and it passes. |
| 0.4 | Verify the 5 calendar cell states don't rely on colour alone | They already don't, deliberately and documented (`global.css:1912-1978`): open = 1px border; started = 2px border + weight 700; exclusive = different hue + 2px; locked = **dashed** border; unavailable = **diagonal hatch texture**. Every cell also carries a stateful `aria-label` ("…open, nobody has started it, catered, R14,400 per person sharing"). | **Passes.** No change. Caveat: only 3 of 5 states exist in live data (no bookings yet); `--started` / `--exclusive` were read from source, not observed rendering. |
| 0.5 | Raise every sub-70% charcoal-on-cream text mix to `--tint-muted` (70%) | Correct **for charcoal** (70% = 4.98:1) and **earth** (70% = 4.87:1). **Not for green**: `color-mix(green 70%, transparent)` over cream = **3.29:1 — still fails AA.** A single 70% step cannot serve all three base colours. | Apply `--tint-muted` to charcoal/earth text. **Green text must go solid** `var(--color-green)` (6.42:1). Flagged, not silently resolved. |
| 0.6 | Replace the 13 clamps with the three shared ramps in the token block | The proposed `--text-*` names **are** Tailwind v4's built-in type-scale tokens. Setting them silently rescales **148 existing `text-*` utility usages in markup**, and `--text-4xl: clamp(2.5rem,6vw,4rem)` **exceeds the untouched `--text-5xl: 3rem`** above ~50rem viewport — reintroducing exactly the ordering inversion §C exists to remove. | See **§C** for the corrected token set. Must be resolved before Phase 3 lands. |

---

## §A. Contrast — defects, fix first

All ratios computed from the real token values (sRGB relative luminance, WCAG 2.x). Text on `--color-cream #f5f0e6` unless stated.

**Reference table (every ratio computed, per the brief's request):**

| Foreground | On | Ratio | Verdict |
|---|---|---|---|
| `--color-ochre` #c19a6b | cream | **2.28:1** | ✗ fails AA text *and* the 3:1 non-text minimum |
| `--color-ochre` | white | **2.59:1** | ✗ fails both |
| `--color-ochre` | `--color-earth` | 5.18:1 | ✓ AA |
| white | ochre | 2.59:1 | ✗ (not used — see §0.1) |
| `--color-earth` | ochre | **5.18:1** | ✓ AA — current `.btn-primary`/`.nav-cta` |
| charcoal 40% | cream | 2.24:1 | ✗ |
| charcoal 50% | cream | 2.87:1 | ✗ |
| charcoal **55%** | cream | **3.29:1** | ✗ body |
| charcoal 60% | cream | 3.77:1 | ✗ body |
| charcoal 62% | cream | 3.99:1 | ✗ body |
| charcoal **65%** | cream | **4.30:1** | ✗ body (large-text only) |
| charcoal **70%** | cream | **4.98:1** | ✓ AA — the floor |
| charcoal 75% | cream | 5.79:1 | ✓ AA |
| charcoal 85% | cream | 7.91:1 | ✓ AAA |
| earth 45% | cream | 2.52:1 | ✗ |
| earth 62% | cream | 3.88:1 | ✗ body |
| earth 70% | cream | 4.87:1 | ✓ AA |
| green 55% | cream | 2.45:1 | ✗ |
| green **70%** | cream | **3.29:1** | ✗ — **still fails at the proposed floor** (§0.5) |
| green 100% (solid) | cream | 6.42:1 | ✓ AA |
| charcoal solid | cream | 12.30:1 | ✓ AAA |
| earth solid | cream | 11.82:1 | ✓ AAA |
| `#9c2b1b` (error) | cream | 6.66:1 | ✓ AA |
| `#9c5b3b` (day4) | cream | 4.65:1 | ✓ AA |

**A1 — Ochre as a meaningful colour.** 48 ochre `color-mix` sites plus solid-ochre uses. Classify each; decorative may stay, meaningful must change.

- **Meaningful, must fix — the global focus ring.** `global.css:102-106` `:focus-visible { outline: 2px solid var(--color-ochre) }`. At 2.28:1 on cream and 2.59:1 on white this is the single highest-severity item in the pass: the focus indicator is the accessibility affordance for every keyboard user, and it fails the 3:1 non-text minimum on the site's two dominant backgrounds. It is duplicated at `:189-192` (`.nav-cta`), `:1015-1018` (form fields), `:1128`, `:1368`, `:1438`, `:1540`, and `:1988` (calendar cells). Fix once at the base rule and let the rest inherit, or update all eight together.
  - Recommended: keep ochre as the *outer* ring but add an earth inner ring so the indicator clears 3:1 on any ground — `outline: 2px solid var(--color-earth); box-shadow: 0 0 0 4px var(--color-ochre)` is the usual pattern, **but §5.5/Phase 3 forbid shadows**, so instead use `outline: 2px solid var(--color-earth); outline-offset: 2px` and reserve ochre for the *hover* affordance. Earth on cream = 11.82:1, on white = 13.6:1.
- **Meaningful, must fix — ochre as label text.** The eyebrow/kicker labels rendered in ochre on cream: `.home-lodge__context` is green (fine), but the accommodation-page eyebrows ("THE VALLEY BASECAMP · START & END POINT") and `.teaser__index` need checking per-site; any ochre *text* on cream is 2.28:1. Replace with `--color-green` (6.42:1) or earth.
- **Decorative, may stay:** `.teaser` top border, `.testimonial` left border, `.btn-primary` background (label is earth, 5.18:1), `.howit__num` ring, `.statsbar` dividers, `.bstep__notice` background tints, hero scrim gradients. These carry no information that isn't also carried by text or position.
- **Deliverable:** the classification table itself, produced during implementation, listing all 48 sites as decorative/meaningful with the ratio for each meaningful one.

**A2 — `.btn-primary` label.** **No change** — see §0.1.

**A3 — Muted text below the 70% floor.** Raise to `--tint-muted`. Confirmed failing call sites include `.form-hint` (`:1020-1024`, charcoal 55% = **3.29:1**, rendering at **12.48px** — small *and* low-contrast, the worst combination on the site), `.daycard__daylabel` (55%), `.bstyle__desc` (72% — passes, leave), `.teaser__text` (88% — passes), `.howit__text` (82% — passes). Audit all charcoal/earth/green mixes used as text; anything under 70% that is *text* moves to `--tint-muted`; anything green moves to solid.
- Note `.bcal__cell--unavailable` colour is charcoal 40% (2.24:1) — this is a **disabled control**, exempt under WCAG 1.4.3. Leave, but it is worth a deliberate decision rather than an accident.
- Note the codebase uses **two** tinting mechanisms: `color-mix()` in `global.css` *and* Tailwind `/opacity` utilities in markup (`text-charcoal/85`, `text-charcoal/80`). Both were checked: `/85` = 7.91:1 and `/80` = 6.76:1, both pass. The census in `docs/css-tailwind.md` covered only the CSS file — the markup opacity utilities are a second surface for this work.

**A4 — Calendar states.** **No change** — see §0.4.

---

## §B. Type scale — 44 sizes, set too small

**Measured, not assumed.** Across all five routes, every visible prose block over 40 characters:

| | desktop (1440) | mobile (390) |
|---|---|---|
| blocks measured | 125 | 125 |
| **rendering below 16px** | **70 (56%)** | **70 (56%)** |
| 16px | 44 | 44 |
| 14px | 38 | 38 |
| 14.4px | 15 | 15 |
| ≤13px | 12 | 12 |

The `<body>` root is a correct 16px; the problem is that **the secondary tier — which carries most of the actual content — sits at 14px**, and the 16px→14px gap is too small to read as hierarchy while both read as small. That is the mechanism behind "the site reads at ~80%": not a global shrink, but a dominant secondary tier set two steps too low.

**Work:**
- Raise body/secondary prose to `--text-base` (1rem). Primary call sites: `.teaser__text`, `.howit__text` (0.9rem), `.daycard__desc`, `.bstyle__desc` (0.8rem), `.bsolo__lead`, `.bjoin-card__meta`, plus the 34 non-admin `text-sm` markup usages.
- **Legitimately staying at `--text-sm`, with justification (out of scope per the brief):** the rate matrix (`:2299`) and availability calendar (`:1784`) — dense tabular UI where 16px would force horizontal scroll or a 7-column month grid to wrap. Also justified: `.form-hint` (raise to `--text-sm` 0.875rem from 0.78rem — it must clear the contrast floor per §A3, but need not reach 1rem), `.bstep__num`/table numerics, and legal/footnote text.
- Collapse the clusters onto the scale: `0.83/0.85/0.87/0.875/0.88/0.9/0.92/0.95` → `--text-sm` or `--text-base`; `0.7/0.72/0.75/0.78` → `--text-2xs`/`--text-xs`; `1.05/1.1/1.125/1.15` → `--text-lg`.
- Replace raw `22px` and `14px` with rem values (`--text-xl`, `--text-sm`).

---

## §C. Clamp ordering — and a correction to the proposed tokens

**The diagnosis is confirmed.** 13 hand-tuned clamps with growth rates from 2.4vw to 8vw do cross over. The brief's worked example holds: `clamp(1.75rem, 8vw, 2.5rem)` vs `clamp(2rem, 5vw, 2.75rem)` are equal at ~400px, the first leads at 600px, the second at 900px.

**But the proposed replacement introduces a new inversion.** Verified:

- Tailwind v4 ships `--text-4xl: 2.25rem` and `--text-5xl: 3rem`. The proposal sets `--text-4xl: clamp(2.5rem, 6vw, 4rem)` and **leaves `--text-5xl` untouched at 3rem**.
- Markup uses responsive step-ups everywhere — `text-4xl sm:text-5xl md:text-6xl` on h1s (`the-trail.astro:33`, `rates.astro:79`, `logistics.astro:43`, `accommodation.astro:39`, +10 more) and `text-2xl sm:text-3xl md:text-4xl` on h2s (`index.astro:195, 221`).
- At ≥768px an h2 at `md:text-4xl` would compute to **4rem (64px)** while an h1 at `md:text-5xl` computes to **3rem (48px)**. **The h2 becomes larger than the h1.**

**Corrected token set** (keeps the brief's intent, removes the inversion) — either:

- **(a) Cap 4xl below 5xl:** `--text-4xl: clamp(2.25rem, 5vw, 2.875rem)` and leave 5xl/6xl alone. Smallest blast radius; preserves the existing `sm:`/`md:` step-up idiom.
- **(b) Define the whole upper ramp** so 4xl < 5xl < 6xl holds at every width, and re-check all 14 `text-5xl` and the `text-6xl` sites.

**(a) is the recommendation** — the responsive step-up classes in markup already do the fluid work that the clamps were duplicating, and (a) leaves them intact.

**Verify at 390, 600, 768, 900, 1024, 1440px that heading order never inverts** — including across the `sm:`/`md:` breakpoints, not just within a single clamp.

---

## §D. Radii — 21 → 5

- `999px` (6×) and `9999px` (1×) → `--radius-full`. Zero visual change.
- `0.6/0.65/0.7/0.75` → `--radius-md` (0.625rem); `0.85/0.9` → `--radius-lg`-adjacent — note `0.85rem` has 7 uses and `--radius-lg` is 1rem, a visible +0.15rem on cards; if that reads too round, add one step rather than forcing it.
- `0.375rem` → `--radius-sm`; `1rem` → `--radius-lg`; `1.25rem` → `--radius-xl`.
- **Leave alone:** the asymmetric multi-corner values (`0 1rem 1rem 0`, `0 0.5rem 0.5rem 0`, `0 0.6rem 0.6rem 0`), `50%`, `2px`/`3px` hairline rounding on `.hamburger` spans and `:focus-visible`.

## §E. Gaps — 32 → the built-in spacing scale

Tailwind v4 ships `--spacing: 0.25rem` with `gap-*` utilities the project doesn't use. Collapse `0.5/0.55/0.6/0.65` → `0.5rem`/`0.625rem`, and the six micro-gaps `0.05–0.4rem` → `0.25rem`/`0.375rem`. Leave the one-off two-value row/column gaps tied to specific grids.

## §F. Untokenised colour

- `#9c5b3b` → `var(--color-day4)`: **6 raw-hex occurrences** (`:1533` area `.bcal__cell--locked` border, plus 5 others), and one existing `var(--color-day4, #9c5b3b)` fallback that can lose its fallback.
- `#9c2b1b` → new `--color-error`. **Confirmed not a typo for `#9c5b3b`**: they differ by 48/255 in the green channel (`2b`=43 vs `5b`=91) and are semantically distinct (form-error red vs Day-4 terracotta). Both were checked for contrast: error = 6.66:1 on cream, 7.57:1 on white. Used at `:1027`, `:1037`, and one `color-mix` site.

## §G. Tint steps — 113 → 5

Map every mix onto `--tint-subtle/soft/medium/muted/strong`. The recurring 55/60/65/70/75% values become `--tint-muted` **where the base is charcoal or earth**; green-based text goes solid (§0.5). Mixes that cannot map without a visible change — notably `.bcal__cell--open` (green 12% on #fff) and `.bcal__cell--started` (green 26%), where the fill steps encode calendar state — will be listed in the implementation notes rather than forced.

---

## §H. Content and markup

**Hero density — confirmed exactly as described.** `index.astro:78-104`: `<Hero>` (2 CTAs) → `<StatsBar>` (4 stats) → `.trust-bar` (3 proof points) → `.launch-banner` (2 more CTAs). **4 CTAs and 3 metadata blocks before the first content section.**
- Reduce to one primary + one secondary CTA.
- Consolidate metadata to one block — `StatsBar` is the stronger of the three (it is the product's actual shape: 3 nights / 3 days / 3 lodges / 8 max); fold the trust-bar's three points into it or move them beside the CTA.
- Demote `.launch-banner` to a slim bar or below the fold. It currently sits in a full `<Section>` with two buttons and outcompetes the hero's own CTA.

**Copy repetition — measured on the homepage:** "corporate team-building" **6×**, "families" **4×**, "malaria-free" **4×**. Reduce to one prominent statement each.

**The eyebrow item needs a decision (conflict).** The brief describes "the kicker above 'Why walk the Rooiberg Wander'" as a 20-word sentence in an eyebrow slot. It is actually `.statement-band__text` (`index.astro:144-146`) — a **21-word line inside the designed dark statement band**, set in display type over a full-bleed image, not an eyebrow. `Why walk the Rooiberg Wander` (`:153`) has no eyebrow above it at all. Cutting to 2–4 words would leave a 260–440px-tall band nearly empty. **Recommend tightening to ~8–10 words** and removing the unexplained "RoiSan" (below) in the same edit — or confirm you want the band gutted.

**Bugs — verified:**
- ✅ **"Privacy" duplicated in the footer** — two `/privacy` links (nav column + bottom bar). Confirmed.
- ✅ **All three home lodge cards link to `/accommodation`** with no anchor. Confirmed — `href="/accommodation"` ×3. Add `#rotavi` / `#oukraal` / `#blackwood` (the accommodation page already renders per-lodge sections).
- ✅ **Lodge card anchor text swallows the image alt.** Confirmed via accessible-name computation: the link's name is *"The valley around Temminck's Lodge, the basecamp at the foot of the Rooiberg where the trail begins and ends. Night 1 Temminck's Lodge The Valley Basecamp · Start & End Point"* — ~170 characters. Fix with `alt=""` on the decorative card image (the adjacent text already names the destination) or an explicit `aria-label` on the anchor.
- ✅ **Mixed date formats in a single sentence** — `index.astro:95-98`: "start dates from **15 January 2027** … at a significant discount from **31/10/2026**". Confirmed. Normalise to the long form.
- ✅ **"RoiSan" appears exactly once**, unexplained, in the statement band (`:145`) vs "Rooiberg" throughout. Confirmed.
- ✅ **Footer `© 2026`** while bookings open 2027. Confirmed. Make it dynamic or 2026–2027.
- ❌ **Double step numbers — not a bug.** See §0.3.
- ❌ **Missing aria-labels — not a bug.** See §0.2.

---

## §I. Admin CSS split — feasible, low risk, with one fix required first

**~790 lines** of `.admin-*` (`:3421`–`:4210`) ship in the single `global.css` that every public visitor downloads.

**Structural finding:** there is only **one layout** (`src/layouts/Layout.astro`), imported by both public pages *and* all six admin pages, and it is what imports `global.css`. So the split cannot be done by swapping layouts without a new layout component (which the constraints disallow). It **can** be done by having each admin page import `../../styles/admin.css` directly — Astro bundles page-level CSS per route, so public routes never receive it. Six one-line additions, no layout or component API change.

**Cascade-order risk — assessed rule by rule:**
- Admin markup *does* reuse shared classes (`btn`, `btn-primary`, `btn-secondary`, `form-field`, `bform`), so `admin.css` must load *in addition to* `global.css`, never instead of it.
- Cross-boundary overrides that are **higher specificity** win regardless of source order and are therefore safe: `.admin-card .form-field` (0,2,0), `.admin-card__row .btn` (0,2,0), `.admin-remove__panel .btn` (0,2,0), `.admin-remove__panel input` (0,2,0).
- Equal-specificity rules that set properties `.btn` doesn't touch are also safe: `.admin-card__btn { margin-top }`, `.admin-filters__new { width }`.
- **One genuine order dependency:** `.admin-inq__toggle` (`:4139-4143`) sets `min-height`, `padding` and `font-size` at **equal specificity (0,1,0)** to `.btn`, which sets different `padding` (0.75rem 1.5rem vs 0.4rem 0.85rem) and `font-size` (0.95rem vs 0.8rem). It currently wins only because it appears later in the same file. Astro does not guarantee that a page-level stylesheet is emitted after a layout-level one.

**Verdict: proceed, but fix the dependency first** — raise `.admin-inq__toggle` to `.admin-inq .admin-inq__toggle` (0,2,0) in the same commit that moves it. Order then stops mattering and the split is safe. **Do this last (step 9)**, and confirm in the built output that no `.admin-` selector appears in the public route bundles.

---

## Phase 3 — Token block

Add to `@theme` in `global.css`, keeping existing entries as-is. **`--text-4xl` differs from the brief** per §C; everything else is as specified.

```css
  /* Type — 9 replacing 44.  NB: these ARE Tailwind v4's built-in type tokens;
     setting them rescales all 148 existing text-* utilities in markup. */
  --text-2xs:  0.75rem;
  --text-xs:   0.8125rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.375rem;
  --text-2xl:  clamp(1.5rem,   3vw, 1.875rem);
  --text-3xl:  clamp(1.875rem, 4vw, 2.5rem);
  --text-4xl:  clamp(2.25rem,  5vw, 2.875rem);  /* capped below the untouched --text-5xl: 3rem */

  /* Radii — 5 replacing 21 */
  --radius-sm:   0.375rem;
  --radius-md:   0.625rem;
  --radius-lg:   1rem;
  --radius-xl:   1.25rem;
  --radius-full: 999px;

  /* Tint steps — 70% is the contrast floor for charcoal/earth text on cream.
     Green text does NOT clear AA at 70% (3.29:1) — use solid --color-green. */
  --tint-subtle: 8%;
  --tint-soft:   16%;
  --tint-medium: 40%;
  --tint-muted:  70%;
  --tint-strong: 85%;

  --color-error: #9c2b1b;
```

**No shadow tokens** — zero `box-shadow` in 4,343 lines is the most consistent thing in the codebase and matches §5.5. Preserved.
**Line-height untouched** — 36 of 64 uses sit in the §5.3 body range and the tail is heading contexts tightening as specified.

---

## Phase 4 — Sequence

Each step its own commit with its own before/after screenshot pass.

1. **Contrast (§A)** — focus ring first (highest severity), then sub-70% text mixes, then the ochre classification table. Skip §A2/§A4 per §0.
2. **Token block (Phase 3)** — no call sites changed. Expect *some* visual movement anyway, because the `--text-*` tokens immediately rescale existing markup utilities (§0.6); screenshot before/after to isolate it from step 3.
3. **Body size lift (§B)** — reflows everything. Alone. Re-screenshot all five routes + both booking-form states at both widths.
4. **Remaining type-cluster collapse (§B).**
5. **Clamp unification (§C)** — verify at 390/600/768/900/1024/1440 that heading order never inverts, including across `sm:`/`md:` step-ups.
6. **Radii (§D), gaps (§E).**
7. **Untokenised colour (§F), tint mapping (§G).**
8. **Content and markup (§H)** — hero density, repetition, the verified bugs. The statement-band wording needs your decision first.
9. **Admin split (§I)** — judged low-risk, conditional on the `.admin-inq__toggle` specificity fix landing in the same commit.

## Verification

- `npx astro check` → 0 errors/0 warnings; `npm run build` clean; all 11 `verify-*.mjs` green (several grep `global.css` for retired class names and *will* catch renames).
- **Progressive enhancement**: after any `.bstep*` change, load `/rates` with JS disabled and confirm all five steps render expanded and no `is-current`/`is-done`/`is-locked` rule applies without `.bform--stepped`.
- **Reduced motion**: any new animated rule needs an override in the trailing `@media (prefers-reduced-motion: reduce)` block, which must stay last in the file.
- Re-shoot the full before/after set; diff at both widths.
- Screenshot capture: dev server on `:4321`, driven by Playwright from the npx cache (`~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`) with `executablePath` set to `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`. **Scroll-prime every page before `fullPage` capture** — lazy-loaded images render blank otherwise (this produced a false "broken images" reading on the first pass).
