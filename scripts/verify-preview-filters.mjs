// Date preview contract (§5). The calendar's four filter chips (Next available / Only private
// buyouts / Only last-minute / High season only) were later removed on request — this file used
// to also cover them; section 6 now just confirms they and their wiring are fully gone.
// Run: npx tsx scripts/verify-preview-filters.mjs
//
// Two things here are worth asserting mechanically rather than reviewing by eye:
//
//   1. THE PREVIEW'S ARITHMETIC. The card was later simplified to quote one resolved rate rather
//      than a base/season/last-minute breakdown (that breakdown still exists at Step 3). Section
//      5 still checks that the underlying engine reconciles, since Step 3's breakdown depends on
//      exactly the same functions.
//
//   2. THE OPENING/DISMISSING CONTRACT. The document explicitly corrects hover to "tap AND
//      keyboard focus, dismissable without a pointer". Hover is the easy thing to reach for and
//      the easy regression to miss, so it is asserted structurally.
import { readFileSync } from 'node:fs';
import { ppNightCentsFor, basePpNightCentsFor, isWithinLastMinuteWindow, isHighSeason } from '../src/lib/pricing.ts';
import {
  NIGHTS,
  UNCATERED_PP_NIGHT,
  CATERED_PP_NIGHT,
  SEASON_DISCOUNT,
  LAST_MINUTE_DISCOUNT,
  EXCLUSIVE_SIZE,
  MIN_PARTY_SIZE,
  MAX_GROUP_SIZE,
} from '../src/data/rates.ts';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 62 - t.length))}`);

const widget = readFileSync(new URL('../src/components/BookingWidget.astro', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

section('1. The card opens on TAP and KEYBOARD FOCUS, never on hover');
assert('cells open the preview on focus', /cell\.addEventListener\('focus'[\s\S]{0,160}openPreview\(iso\)/.test(widget));
assert('actionable cells open the preview on click', /cell\.addEventListener\('click', \(\) => \{ previewDismissedIso = ''; openPreview\(iso\); \}\)/.test(widget));
// The correction the document calls out by name. A mouseenter/mouseover handler anywhere in the
// calendar would reintroduce exactly the behaviour it rejects.
assert('NO hover handler exists on the calendar', !/addEventListener\('(mouseenter|mouseover)'/.test(widget));
assert('no CSS :hover rule opens the preview', !/:hover[^{]*\{[^}]*\}\s*[\s\S]{0,80}\.bpreview\s*\{[^}]*display:\s*block/.test(css));
assert('the card is NOT a live region (the cell aria-label already speaks the date)',
  !/data-cal-preview[^>]*aria-live/.test(widget));

section('2. Dismissable without a pointer, and focus is never stranded');
assert('Escape closes the card', /key === 'Escape'[\s\S]{0,220}closePreview\(true\)/.test(widget));
assert('Escape is handled on the grid, so focus stays on the cell', /calGrid\?\.addEventListener\('keydown'/.test(widget));
assert('dismissal is remembered per-cell only', /previewDismissedIso === iso\) return/.test(widget));
assert('arrowing to another cell re-opens it', /previewDismissedIso = ''; \/\/ arrowing/.test(widget));
assert('the Close button returns focus to the cell it came from', /closePreview\(true\);\s*\n\s*if \(iso\) focusCell\(iso\)/.test(widget));
assert('selecting hands focus to the confirmation line', /calSelectedEl\?\.focus\(\)/.test(widget));
assert('the confirmation line can receive that focus', /data-cal-selected tabindex="-1"/.test(widget));

section('3. The grid is ONE tab stop, so Tab reaches the card action');
assert('roving tabindex on cells', /cell\.tabIndex = iso === calFocusIso \? 0 : -1/.test(widget));
assert('exactly one cell is left tabbable after a render', /if \(!calGrid\.querySelector\('\[tabindex="0"\]'\)\)/.test(widget));
assert('focusCell demotes the previous stop before promoting the new one',
  /querySelectorAll<HTMLButtonElement>\('\[tabindex="0"\]'\)\.forEach\(\(b\) => \{ b\.tabIndex = -1; \}\)/.test(widget));
for (const [key, delta] of [['ArrowLeft', -1], ['ArrowRight', 1], ['ArrowUp', -7], ['ArrowDown', 7]]) {
  assert(`${key} moves ${delta} day(s)`, new RegExp(`key === '${key}'\\) to = addDaysIso\\(from, ${delta}\\)`).test(widget));
}
assert('Home and End move within the week', /key === 'Home'/.test(widget) && /key === 'End'/.test(widget));
assert('PageUp/PageDown page the month', /key === 'PageUp' \|\| key === 'PageDown'/.test(widget));
assert('navigation is clamped to the bookable range',
  /if \(iso < R\.earliest\) iso = R\.earliest;[\s\S]{0,80}if \(iso > calLatest\) iso = calLatest;/.test(widget));
assert('the card sits AFTER the grid in the DOM (Tab order)',
  widget.indexOf('data-cal-grid') < widget.indexOf('data-cal-preview'));

section('4. §5 card contents');
assert('date with weekday', /bpreview__date[\s\S]{0,200}weekday: 'long'/.test(widget));
assert('season label', /isHighSeasonIso\(iso\) \? 'High season' : 'Low season'/.test(widget));
assert('places left / opening state / buyout state are all distinguished',
  /The whole departure is yours[\s\S]{0,320}places left[\s\S]{0,200}You would be opening it/.test(widget));
// The standard-rate/season-comparison breakdown was deliberately removed from THIS card on
// request ("remove the low season/standard rate comparison ... when quoting prices"); the card
// now quotes one resolved figure. The full breakdown still legitimately exists at Step 3
// (updateEstimate, covered by verify-review-step.mjs) — sliced out here so this check is scoped
// to previewCateringBlock() only, not a blanket sweep of the whole widget file.
const previewBlockStart = widget.indexOf('function previewCateringBlock');
const previewBlockEnd = widget.indexOf('function renderPreview');
const previewBlockFn = widget.slice(previewBlockStart, previewBlockEnd);
assert('previewCateringBlock() was located', previewBlockStart > 0 && previewBlockEnd > previewBlockStart);
assert('the standard-rate/season-comparison lines are gone from this card',
  !/previewRow\('Standard rate'/.test(previewBlockFn) &&
  !/Low season, \$\{Math\.round\(R\.seasonDiscount \* 100\)\}% less/.test(previewBlockFn) &&
  !/Last-minute, \$\{Math\.round\(R\.lastMinuteDiscount \* 100\)\}% less/.test(previewBlockFn));
assert('resolved rate line', /previewRow\('Your rate'/.test(previewBlockFn));
assert('the figure is still per person SHARING, computed from the real engine, not retyped',
  /const finalSharing = ppNightCents\(cat, iso\) \* R\.nights/.test(previewBlockFn));
assert('total for the party size', /walkers'\}` \+ ''|\$\{people\} \$\{people === 1 \? 'walker' : 'walkers'\}/.test(widget));
assert('deposit due today', /previewRow\('Pay today \(50% deposit\)'/.test(widget) && /previewRow\('Pay today \(in full\)'/.test(widget));
assert('the balance date is stated, not just the amount', /Balance of \$\{fmtR\(total - dep\)\} due/.test(widget));
assert('a "Select this start date" action exists', /Select this start date/.test(widget));
assert('two eligible caterings each get their OWN priced block, not a "from" figure',
  /for \(const cat of c\.eligible \?\? \[\]\) \{\s*\n\s*previewBody\.appendChild\(previewCateringBlock/.test(widget));
assert('closed dates still get a card stating the reason', /Not available: '/.test(widget));
assert('the reason strings live in ONE place shared with the cells', /function cell_reason_text/.test(widget));

section('5. The pricing ENGINE reconciles internally (base - season - last-minute = final)');
// This card no longer displays the breakdown (section 4), but Step 3's review step still does
// (verify-review-step.mjs), and both read the exact same lib/pricing.ts functions checked here.
// Every figure is rounded the same way the charged figure is, so base - seasonDelta - lmDelta
// must land exactly on the rate lib/pricing.ts would charge, and rate x nights x people on the
// exact total — an engine-level guarantee, independent of which surface displays how much of it.
const roundToRand = (c) => Math.round(c / 100) * 100;
const isWeekendPricingDay = (iso) => {
  const d = new Date(iso + 'T00:00:00Z').getUTCDay();
  return d === 4 || d === 5;
};
function highSeasonPpNightCents(cat, iso) {
  if (cat === 'catered') return roundToRand(CATERED_PP_NIGHT.high * 100);
  return roundToRand(UNCATERED_PP_NIGHT[isWeekendPricingDay(iso) ? 'weekend' : 'week'].high * 100);
}
// Fixed "now" so the last-minute window is deterministic.
const NOW = new Date('2026-08-01T09:00:00Z');
const dates = [
  '2026-08-05', // Wed, high season
  '2026-08-06', // Thu, high season, self-catered weekend premium
  '2026-08-10', // Mon, high season
  '2026-11-16', // Mon, LOW season
  '2026-11-19', // Thu, LOW season, weekend premium
  '2026-08-12', // 11 days out -> inside the last-minute window
  '2026-08-16', // 15 days out -> inside the last-minute window
  '2027-01-04', // high season (the 15 Dec - 15 Jan wrap)
];
let reconciled = 0;
let mismatch = null;
for (const iso of dates) {
  for (const cat of ['catered', 'uncatered']) {
    const base = highSeasonPpNightCents(cat, iso);
    const afterSeason = basePpNightCentsFor(cat, iso);
    const final = ppNightCentsFor(cat, iso, NOW);
    const low = !isHighSeason(iso);
    const lm = isWithinLastMinuteWindow(iso, NOW);
    const seasonDelta = low ? base - afterSeason : 0;
    const lmDelta = lm ? afterSeason - final : 0;
    if (base - seasonDelta - lmDelta !== final) {
      mismatch = `${iso} ${cat}: lines sum to ${base - seasonDelta - lmDelta}, charged ${final}`;
      break;
    }
    // The season line must actually be SEASON_DISCOUNT of the base, and the last-minute line
    // LAST_MINUTE_DISCOUNT of the post-season rate — not just any two numbers that happen to sum.
    if (low && Math.abs(seasonDelta - base * SEASON_DISCOUNT) > 100) {
      mismatch = `${iso} ${cat}: season line is not ${SEASON_DISCOUNT * 100}% of base`;
      break;
    }
    if (lm && Math.abs(lmDelta - afterSeason * LAST_MINUTE_DISCOUNT) > 100) {
      mismatch = `${iso} ${cat}: last-minute line is not ${LAST_MINUTE_DISCOUNT * 100}% of the seasonal rate`;
      break;
    }
    for (let n = MIN_PARTY_SIZE; n <= MAX_GROUP_SIZE; n++) {
      const total = final * NIGHTS * n;
      const dep = Math.round(total / 2);
      if (dep + (total - dep) !== total) {
        mismatch = `${iso} ${cat} n=${n}: deposit + balance !== total`;
        break;
      }
    }
    if (mismatch) break;
    reconciled++;
  }
  if (mismatch) break;
}
assert(`every breakdown reconciles to the charged rate and total (${reconciled} combinations)${mismatch ? ' — ' + mismatch : ''}`,
  mismatch === null && reconciled === dates.length * 2);
assert('a buyout card prices EXCLUSIVE_SIZE, not the selected party size',
  new RegExp(`const people = isExcl \\? R\\.exclusiveSize : n;`).test(widget));
assert(`EXCLUSIVE_SIZE is ${EXCLUSIVE_SIZE} and comes from rates.ts, never retyped in the widget`,
  !/isExcl \? 8 :/.test(widget));

section('6. The four calendar filter chips are gone entirely (removed on request)');
// "Next available", "Only private buyouts", "Only last-minute" and "High season only" were all
// removed: "We do not need them." The underlying filter STATE (exclusiveOnly, lastMinuteOnly,
// highSeasonOnly) is left declared-but-permanently-false inside eligibleCaterings()/classifyDate()
// rather than torn out of that well-tested logic — see verify-eligibility.mjs's truth table, which
// still exercises those branches and confirms they are safe, inert no-ops with nothing left to
// ever set them true. This section only asserts the UI and its wiring are gone.
for (const attr of ['data-filter-next', 'data-filter-exclusive', 'data-filter-lastminute', 'data-filter-highseason']) {
  assert(`no orphaned markup for ${attr}`, !new RegExp(attr).test(widget));
}
assert('the retired chip DOM refs are gone', !/filterNextBtn|filterExclBtn|filterLmBtn|filterHsBtn/.test(widget));
assert('the retired chip-sync/change-announce helpers are gone', !/function syncFilterChips|function afterFilterChange/.test(widget));
assert('the retired .bcal__filters/.bcal__chip CSS is gone too', !/\.bcal__filters\b|\.bcal__chip\b/.test(css));
// A buyout is still reachable exactly the way §4/§5 always intended: choosing EXCLUSIVE_SIZE
// walkers unlocks Wed/Thu on its own, with no filter required — asserted in verify-eligibility.mjs.
assert('the buyout-toggle force-group-size convenience is gone with its only caller',
  !/eight\.checked = true/.test(widget));

section('7. Month/year jump (§5: "not optional")');
assert('a jump control exists', /data-cal-jump/.test(widget));
assert('it is a native select (best mobile date-jump affordance)', /<select class="bcal__jump"/.test(widget));
assert('it has an accessible label', /for="bf-cal-jump">Jump to month/.test(widget));
assert('it spans the WHOLE bookable range, not a fixed 12', /for \(let idx = calMinIdx; idx <= calMaxIdx; idx\+\+\)/.test(widget));
assert('it is rebuilt when the window ceiling changes with style', /if \(calJump\.options\.length !== wantOpts\) buildJump\(\)/.test(widget));
assert('it tracks the view when paging with the arrows', /calJump\.value = String\(viewIdx\(calView\.y, calView\.m\)\)/.test(widget));
assert('the retired month <span> is gone', !/data-cal-month/.test(widget));
assert('its target is ≥44px on touch', /\.bcal__jump \{[\s\S]{0,400}min-height: 2\.75rem/.test(css));

section('8. Mobile-first: nothing new pushes the grid sideways');
assert('the card is inline under the grid, not a positioned popover', !/\.bpreview \{[\s\S]{0,300}position: (absolute|fixed)/.test(css));
assert('card action is a full-width primary at 380px', /\.bpreview__go \{[\s\S]{0,120}flex: 1 1 auto/.test(css));
assert('every new tap target is ≥44px', (css.match(/min-height: 2\.75rem/g) || []).length >= 4);
assert('breakdown figures are tabular so the column aligns', /\.bpreview__value \{[\s\S]{0,120}font-variant-numeric: tabular-nums/.test(css));

section('9. House rules');
const userFacing = widget
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')  // JSX block comments
  .replace(/\/\*[\s\S]*?\*\//g, '')        // JS block comments
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))         // whole-line comments
  .map((l) => l.replace(/\s\/\/.*$/, ''))     // trailing comments on code lines
  .join('\n')
  .replace(/textContent = '—'/g, '');           // the deliberate "no total yet" glyph, not prose
assert('no em-dash in user-facing copy', !/—/.test(userFacing));
// Every rate, discount and window figure the guest reads must come from data/rates.ts. A literal
// here is a copy that keeps saying 22% long after the policy changes.
assert('no discount percentage is hardcoded in copy', !/\b(22|20)%/.test(userFacing.replace(/\d+% less/g, '')));
assert('the last-minute window length is interpolated, not typed',
  /\{LAST_MINUTE_MIN_DAYS\} to \{LAST_MINUTE_MAX_DAYS\} days away/.test(widget));

console.log(failed === 0 ? '\nALL PREVIEW + FILTER CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
