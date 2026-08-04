// Step 3 "Review and pay" contract (§6).
// Run: npx tsx scripts/verify-review-step.mjs
//
// The rule §6 exists to enforce is "never one unexplained figure". That is easy to satisfy once
// and easy to lose later — the single-line "3 x R2,640 pp = R7,920" this replaced was itself a
// reasonable-looking summary that told the guest nothing about WHY the rate was what it was.
// So the named lines, and the fact that they reconcile with what we charge, are asserted here
// rather than reviewed by eye.
//
// Every figure is per person SHARING — the price for the whole mandatory NIGHTS-night trail —
// never a bare per-night rate: the trail has no shorter stay to choose, so a nightly figure would
// misstate what is actually on offer. The per-night numbers still exist inside lib/pricing.ts's
// model (season/day-of-week vary nightly), but nothing downstream may show one un-multiplied.
//
// It also checks the two things that are structurally load-bearing rather than cosmetic:
//   - ONE primary action in the step (two primaries is a step with no obvious next move).
//   - The policy modal is a native <dialog>, so the focus trap and Escape are the browser's.
import { readFileSync } from 'node:fs';
import { ppNightCentsFor, basePpNightCentsFor, isWithinLastMinuteWindow, isHighSeason } from '../src/lib/pricing.ts';
import {
  NIGHTS,
  UNCATERED_PP_NIGHT,
  CATERED_PP_NIGHT,
  MIN_PARTY_SIZE,
  MAX_GROUP_SIZE,
} from '../src/data/rates.ts';
import { SPLIT_THRESHOLD_DAYS, BALANCE_LEAD_DAYS } from '../src/lib/pricing.ts';
import { refundPolicy } from '../src/data/policies.ts';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 62 - t.length))}`);

const widget = readFileSync(new URL('../src/components/BookingWidget.astro', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

// The step, sliced so counts below measure THIS step and not the whole widget.
// The widget became a 5-step guided accordion: "Review and pay" is now step 5, and the
// lead-guest fields moved out to their own step 4. Section 1 below checks that split.
const stepStart = widget.indexOf('==== Step 5');
const stepEnd = widget.indexOf('data-policy-modal');
const step = widget.slice(stepStart, stepEnd);
const detailsStart = widget.indexOf('==== Step 4');
const detailsStep = widget.slice(detailsStart, stepStart);

section('1. The step exists, and the itinerary strip + included list are gone (removed on request)');
assert('the step exists and was located', stepStart > 0 && stepEnd > stepStart);
// Both were explicit step-8 deliverables, later removed deliberately as page clutter. Asserting
// their absence catches an accidental re-add as clearly as a missing-feature bug would.
assert('the itinerary strip (.bstrip) is gone', !/<ol class="bstrip"/.test(step) && !/routePins/.test(widget));
assert('the included list (.bincl) is gone', !/<ul class="bincl"/.test(step) && !/inclusions\.map/.test(step));
// The lead-guest fields now have their own step (4), so the review step is purely review + pay.
assert('"Your details" is its own step, headed as such', /<p class="bstep__heading" id="bf-details-label"><span class="bstep__num">4<\/span>\. Your details/.test(widget));
assert('the three lead-guest fields live in step 4, not the review step',
  ['id="bf-name"', 'id="bf-email"', 'id="bf-phone"'].every((f) => detailsStep.includes(f)) &&
  !['id="bf-name"', 'id="bf-email"', 'id="bf-phone"'].some((f) => step.includes(f)));

section('1b. The trip summary: the shape of the stay, NOT a second itinerary');
// Requested addition. The line it must not cross is the one drawn above: a per-night confirmation
// of dates and lodges is fine; reviving route pins, distances or day prose is not.
assert('a trip summary exists on the review step', /data-trip-summary/.test(step) && /data-trip-nights/.test(step));
assert('it starts hidden and is only shown once a date is chosen',
  /<div class="btrip" data-trip-summary hidden>/.test(step) &&
  /if \(!selectedStartIso \|\| lodges\.length === 0\) \{[\s\S]{0,80}tripSummary\.hidden = true/.test(widget));
// Derived from the itinerary, never retyped: a route change must not silently desync the two.
assert('the night lodges are derived from itinerary.ts, not hardcoded',
  /import \{ itinerary \} from '\.\.\/data\/itinerary'/.test(widget) &&
  /itinerary\[1\]\?\.from/.test(widget) && /itinerary\[1\]\?\.to/.test(widget) && /itinerary\[2\]\?\.to/.test(widget));
assert('no lodge name is typed as a literal in the widget',
  !/Temminck|Oukraal|Blackwood/.test(widget));
assert('it is capped at NIGHTS rows plus one departure row',
  /R\.nightLodges\.slice\(0, R\.nights\)/.test(widget));
assert('it renders with createElement/textContent, never innerHTML',
  !/tripNights\.innerHTML\s*=/.test(widget) && /tripNights\.textContent = ''/.test(widget));
assert('no distances, route pins or day descriptions came back with it',
  !/distanceKm/.test(widget) && !/routePins/.test(widget) && !/elevation/i.test(widget));

section('1c. The guided accordion degrades safely');
assert('the review step is terminal: no Continue button of its own',
  !/data-step-continue/.test(step));
assert('the submit button is still the only primary action there',
  /btn btn-primary bform__submit/.test(step));
assert('advancing is blocked until the step is genuinely complete',
  /function stepComplete/.test(widget) && /if \(!stepComplete\(n\)\)/.test(widget));
assert('a blocked Continue says WHY rather than silently refusing',
  /showPathNotice\(BLOCKED\[n\]/.test(widget));
// paintEstimate() returns early when there is no date or no resolved catering. Refreshing the
// step summaries from inside it would skip those paths and leave a collapsed step advertising a
// date that has just been invalidated, so the refresh lives in the wrapper every caller uses.
assert('step state refreshes on EVERY estimate path, not just the priced one',
  /function updateEstimate\(\) \{\s*\n\s*paintEstimate\(\);\s*\n\s*refreshSteps\(\);/.test(widget) &&
  !/refreshSteps\(\);\s*\n\s*\}\s*\n\s*\/\/ The single entry point/.test(widget));
assert('no caller reaches paintEstimate() directly',
  (widget.match(/(?<!function )paintEstimate\(\)/g) || []).length === 1);
// Focusing/scrolling on the initial call would drag the visitor to the widget on page load.
assert('the first step is opened WITHOUT stealing focus or scrolling',
  /goToStep\(1, false\)/.test(widget) &&
  /function goToStep\(n: number, reveal = true\)/.test(widget) &&
  /if \(!reveal\) return;/.test(widget));
assert('the retired .bstrip*/.bincl* CSS is gone too (no dead rules left behind)',
  !/\.bstrip\b|\.bincl\b/.test(css));

section('3. NEVER one unexplained figure (§6)');
assert('the single-line formula is gone', !/data-total-formula|bform__total-formula/.test(widget) && !/bform__total-formula/.test(css));
assert('a named breakdown container replaces it', /data-breakdown/.test(step));
assert('the breakdown names the catering in the base line',
  /\$\{catering === 'catered' \? 'Catered' : 'Self-catered'\} rate/.test(widget));
// The season comparison ("Standard rate" + "Low season, X% less") was removed on request: "no
// need to tell the customer how much discount they get off season, they can work out the
// difference themselves." The base line now shows the season-adjusted rate directly — a low
// season date just shows its own (lower) figure, with no percentage or high-season baseline.
assert('the season-comparison line is gone; the base line already reflects the season',
  !/Low season, \$\{Math\.round\(R\.seasonDiscount \* 100\)\}% less/.test(widget) &&
  !/standard rate/.test(widget));
assert('last-minute is a named line with its percentage from the constant',
  /Last-minute, \$\{Math\.round\(R\.lastMinuteDiscount \* 100\)\}% less/.test(widget));
assert('the resolved rate is its own line, in PER PERSON SHARING terms',
  /previewRow\('Your rate', `\$\{fmtR\(ppTotal\)\} per person sharing`, 'rate'\)/.test(widget));
// There is no separate "x NIGHTS" row any more: ppTotal (used in "Your rate" above) IS the
// per-night rate already multiplied by R.nights, so a standalone nights-multiplication line would
// just repeat the figure directly above it. Asserting its ABSENCE catches drift back to the old
// two-step (nightly, then x nights) format this replaced.
assert('no separate nights-multiplication row survives (folded into "Your rate")',
  !/previewRow\(`\$\{R\.nights\} nights`/.test(widget));
assert('the season-adjusted figure is pre-multiplied by nights before display',
  /const afterSeasonSharing = basePpNightCents\(catering, iso\) \* R\.nights/.test(widget));
assert('the party multiplication is shown', /walker' : 'walkers'\}`, fmtR\(totalCents\), 'total'\)/.test(widget));
assert('no row in the breakdown states a bare per-night figure',
  !/pp per night/.test(step) && !/per person per night/.test(step));
// One helper, two surfaces. Two implementations of the same arithmetic is how the card a guest
// reads before choosing ends up disagreeing with the one they pay from.
assert('the breakdown reuses the date preview\'s row helper rather than reimplementing it',
  (widget.match(/function previewRow\(/g) || []).length === 1 &&
  widget.slice(widget.indexOf('data-breakdown]')).includes('previewRow('));
assert('the breakdown is cleared before every repaint (no stale lines)',
  /if \(breakdownEl\) breakdownEl\.innerHTML = ''/.test(widget));
assert('an unresolved catering shows NO total rather than a guessed one',
  /if \(!catering\) \{[\s\S]{0,400}estimate\.textContent = '—'/.test(widget));

section('4. Those lines RECONCILE with what is charged');
// Same reconciliation as the preview, run against the review step's own line set: base, season,
// last-minute, rate, x nights, x walkers. If these do not land exactly on computeQuote's total,
// the breakdown is worse than the single figure it replaced.
const roundToRand = (c) => Math.round(c / 100) * 100;
const isWeekendPricingDay = (iso) => [4, 5].includes(new Date(iso + 'T00:00:00Z').getUTCDay());
const highSeasonPpNightCents = (cat, iso) =>
  cat === 'catered'
    ? roundToRand(CATERED_PP_NIGHT.high * 100)
    : roundToRand(UNCATERED_PP_NIGHT[isWeekendPricingDay(iso) ? 'weekend' : 'week'].high * 100);

const NOW = new Date('2026-08-01T09:00:00Z');
const dates = ['2026-08-10', '2026-08-06', '2026-11-16', '2026-11-19', '2026-08-12', '2027-01-04'];
let checked = 0;
let bad = null;
for (const iso of dates) {
  for (const cat of ['catered', 'uncatered']) {
    const base = highSeasonPpNightCents(cat, iso);
    const afterSeason = basePpNightCentsFor(cat, iso);
    const final = ppNightCentsFor(cat, iso, NOW);
    const seasonDelta = isHighSeason(iso) ? 0 : base - afterSeason;
    const lmDelta = isWithinLastMinuteWindow(iso, NOW) ? afterSeason - final : 0;
    if (base - seasonDelta - lmDelta !== final) {
      bad = `${iso} ${cat}: named lines sum to ${base - seasonDelta - lmDelta}, charged ${final}`;
      break;
    }
    const ppTotal = final * NIGHTS;
    for (let n = MIN_PARTY_SIZE; n <= MAX_GROUP_SIZE; n++) {
      if (ppTotal * n !== final * NIGHTS * n) { bad = `${iso} ${cat} n=${n}: total drifted`; break; }
    }
    if (bad) break;
    checked++;
  }
  if (bad) break;
}
assert(`every named breakdown reconciles to the charged total (${checked} combinations)${bad ? ' — ' + bad : ''}`,
  bad === null && checked === dates.length * 2);

section('5. The deposit rule is surfaced at payment (the Step 1 duplicate was removed on request)');
// .bstep__terms (a duplicate mention of the deposit rule in Step 1) was deliberately deleted, so
// this now checks only that the payment-time statement survives, still reading the constants.
assert('the retired Step 1 duplicate is gone', !/class="bstep__terms"/.test(widget));
assert('the deposit hint still exists at Step 3, near payment', /data-deposit-hint/.test(step));
assert(`the ${SPLIT_THRESHOLD_DAYS}-day threshold is interpolated, not typed`,
  /Departures \{SPLIT_THRESHOLD_DAYS\} or more days away/.test(widget));
assert(`the ${BALANCE_LEAD_DAYS}-day balance lead is interpolated, not typed`,
  /balance due \{BALANCE_LEAD_DAYS\} days before arrival/.test(widget));
assert('no "45 day" literal survives anywhere in the widget copy', !/\b45 (or more )?days?\b/.test(widget));

section('6. ONE primary action in the step');
const primaries = (step.match(/btn-primary/g) || []).length;
assert(`exactly one btn-primary in step 3 (found ${primaries})`, primaries === 1);
assert('the resume path is secondary, not a competing primary', /bform__resume/.test(step) && /btn-secondary bform__resume/.test(step));
assert('the submit button is the primary', /btn btn-primary bform__submit/.test(step));

section('7. Policy opens IN PLACE, in a native dialog');
assert('a native <dialog> is used', /<dialog class="bmodal" data-policy-modal/.test(widget));
assert('opened with showModal (top layer, page inert, focus trapped by the browser)',
  /policyModal\?\.showModal\(\)/.test(widget));
// Escape and the focus trap are the browser's. Returning focus to the trigger is the one thing
// <dialog> does not do, so it is the one thing we should be doing by hand.
assert('no hand-rolled focus trap or Escape handler for the modal',
  !/policyModal[\s\S]{0,400}key === 'Escape'/.test(widget));
assert('focus returns to the trigger on close', /policyModal\?\.addEventListener\('close', \(\) => policyOpen\?\.focus\(\)\)/.test(widget));
assert('the backdrop closes it', /if \(ev\.target === policyModal\) policyModal\.close\(\)/.test(widget));
assert('it is labelled by its own title', /aria-labelledby="bf-policy-title"/.test(widget));
assert('the close control is ≥44px', /\.bmodal__close \{[\s\S]{0,220}width: 2\.75rem;\s*\n\s*height: 2\.75rem/.test(css));
assert('the body scrolls, the frame does not', /\.bmodal__body \{[\s\S]{0,160}overflow-y: auto/.test(css));
assert('it never exceeds the viewport on a phone', /width: min\(46rem, calc\(100vw - 2rem\)\)/.test(css));

section('8. Policy CONTENT comes from data/policies.ts');
assert('policies are imported', /import \{ refundPolicy \} from '\.\.\/data\/policies'/.test(widget));
assert('the intro is rendered, not paraphrased', /\{refundPolicy\.intro\}/.test(widget));
assert('every tier is mapped', /\{refundPolicy\.tiers\.map\(/.test(widget));
assert('every clause is mapped', /\{refundPolicy\.clauses\.map\(/.test(widget));
assert(`all ${refundPolicy.clauses.length} clauses reach the modal (none dropped by a slice)`,
  !/refundPolicy\.clauses\.slice/.test(widget));
assert('no policy sentence is duplicated as a literal in the widget',
  !refundPolicy.tiers.some((t) => widget.includes(t.refund)));
assert('the tiers table has a caption for screen readers', /<caption class="sr-only">Refund by notice given before arrival<\/caption>/.test(widget));

section('9. Existing protections survived the rewrite');
// The lead-guest fields and their honeypot moved to step 4 in the accordion split, so these are
// checked against THAT slice. The POPIA note and privacy link stay with the payment action.
assert('honeypot still present', /<label>Company<input name="company" tabindex="-1"/.test(detailsStep));
assert('POPIA note still adjacent to the action', /By continuing you agree we may use your details/.test(step));
assert('the privacy page is still linked', /<a href="\/privacy">Privacy Policy<\/a>/.test(step));
assert('lead name, email and phone all still required',
  (detailsStep.match(/required/g) || []).length >= 3);
assert('each field still has an error region', (detailsStep.match(/class="form-error"/g) || []).length >= 3);
assert('the field group is labelled by the prompt that describes it',
  /<div class="bform__grid" aria-labelledby="bf-details-label-sub">/.test(detailsStep));
assert('inline validation is still bound to all three',
  /bindField\(nameInput,\s+nameRules\)/.test(widget) &&
  /bindField\(emailInput, emailRules\)/.test(widget) &&
  /bindField\(phoneInput, phoneRules\)/.test(widget));

section('10. House rules');
const userFacing = step
  .slice(step.indexOf('*/}') + 3)          // the slice begins mid-banner; drop the partial comment
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');
assert('no em-dash in the step\'s user-facing copy', !/—/.test(userFacing.replace(/&mdash;/g, '')));
// The included list is gone from this step, but the guard stays: data/rates.ts EXCLUDES meals on
// self-catered bookings and travel to the trailhead, so a claim to the contrary anywhere in the
// step that takes the money would be a fabrication with a price attached.
assert('no fabricated inclusion appears in the step\'s copy',
  !/\b(breakfast|braai|meals included|flights?|airport transfers?|insurance included)\b/i.test(userFacing));

console.log(failed === 0 ? '\nALL REVIEW-STEP CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
