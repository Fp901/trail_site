// Step-1 UI contract + the eligibility rules it drives (§4, §5).
// Run: npx tsx scripts/verify-eligibility.mjs
//
// eligibleCaterings() in BookingWidget.astro is now the single place the day/size/catering/window
// rules meet on the client. It lives inside an Astro island so it cannot be imported here, so this
// script does two things:
//   1. Re-implements the same rules against lib/pricing.ts and asserts the TRUTH TABLE the widget
//      must produce. If the policy reading is wrong, it is wrong here in a readable form.
//   2. Asserts the widget's markup and wiring match §4 (buttons not a slider, 2-8, "both" default,
//      solo link, buyout toggle, spoken notices).
import { readFileSync } from 'node:fs';
import { minToOpen, isExclusiveDay, isWithinLastMinuteWindow } from '../src/lib/pricing.ts';
import {
  MIN_PARTY_SIZE,
  MAX_GROUP_SIZE,
  EXCLUSIVE_SIZE,
  SHARED_TOPUP_MIN,
} from '../src/data/rates.ts';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 64 - t.length))}`);

const widget = readFileSync(new URL('../src/components/BookingWidget.astro', import.meta.url), 'utf8');

// Reference implementation of the widget's eligibleCaterings(), kept deliberately literal.
function eligible({ iso, n, style, exclusiveOnly, dep }) {
  const permits = style === 'both' ? ['catered', 'uncatered'] : [style];
  if (dep.isBlocked) return [];
  if (isExclusiveDay(iso)) {
    if (dep.isExclusive) return [];
    if (n !== EXCLUSIVE_SIZE) return [];
    return permits;
  }
  if (exclusiveOnly) return [];
  if (dep.isExclusive) return [];
  if (dep.lockedCatering === null) return permits.filter((c) => n >= minToOpen(c));
  if (!permits.includes(dep.lockedCatering)) return [];
  if (n < SHARED_TOPUP_MIN) return [];
  if (n > dep.seatsLeft) return [];
  return [dep.lockedCatering];
}
const OPEN = { seatsLeft: 8, lockedCatering: null, isExclusive: false, isBlocked: false };
const MON = '2027-06-07'; // Monday, shared day
const WED = '2027-06-09'; // Wednesday, exclusive day
const THU = '2027-06-10'; // Thursday, exclusive day AND self-catered premium day
const eq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

section('1. Day classification the rules rest on');
assert('Monday is not an exclusive day', !isExclusiveDay(MON));
assert('Wednesday is an exclusive day', isExclusiveDay(WED));
assert('Thursday is an exclusive day', isExclusiveDay(THU));

section('2. "Show me both" on an UNOPENED shared date: the split minimum shows through');
// This is the case that makes "both" more than a cosmetic default: at 2-3 only catered is openable.
for (const n of [2, 3]) {
  assert(`n=${n} both -> catered only (self-catered needs ${minToOpen('uncatered')})`,
    eq(eligible({ iso: MON, n, style: 'both', exclusiveOnly: false, dep: OPEN }), ['catered']));
}
for (const n of [4, 5, 6, 7, 8]) {
  assert(`n=${n} both -> both caterings openable`,
    eq(eligible({ iso: MON, n, style: 'both', exclusiveOnly: false, dep: OPEN }), ['catered', 'uncatered']));
}
assert('n=2 style=uncatered on an unopened date -> nothing (states "needs 4")',
  eligible({ iso: MON, n: 2, style: 'uncatered', exclusiveOnly: false, dep: OPEN }).length === 0);
assert('n=2 style=catered on an unopened date -> catered',
  eq(eligible({ iso: MON, n: 2, style: 'catered', exclusiveOnly: false, dep: OPEN }), ['catered']));

section('3. An OPENED date is never a wall — joining takes MIN_TO_JOIN, not the opening minimum');
const openedSelf = { seatsLeft: 4, lockedCatering: 'uncatered', isExclusive: false, isBlocked: false };
assert('n=2 on an open self-catered date -> eligible (this was the bug: it demanded 4)',
  eq(eligible({ iso: MON, n: 2, style: 'uncatered', exclusiveOnly: false, dep: openedSelf }), ['uncatered']));
assert('n=2 under "both" on an open self-catered date -> that date\'s lock',
  eq(eligible({ iso: MON, n: 2, style: 'both', exclusiveOnly: false, dep: openedSelf }), ['uncatered']));
assert('n=5 on a date with 4 left -> nothing (full for this party)',
  eligible({ iso: MON, n: 5, style: 'uncatered', exclusiveOnly: false, dep: openedSelf }).length === 0);
assert('style=catered on a self-catered-locked date -> nothing, but it is the SWITCHABLE state',
  eligible({ iso: MON, n: 4, style: 'catered', exclusiveOnly: false, dep: openedSelf }).length === 0);

section('4. Wed/Thu are actionable only at exactly EXCLUSIVE_SIZE');
for (const n of [2, 3, 4, 5, 6, 7]) {
  assert(`n=${n} on a Wednesday -> nothing (buyout needs exactly ${EXCLUSIVE_SIZE})`,
    eligible({ iso: WED, n, style: 'both', exclusiveOnly: false, dep: OPEN }).length === 0);
}
assert(`n=${EXCLUSIVE_SIZE} on a Wednesday -> both caterings`,
  eq(eligible({ iso: WED, n: 8, style: 'both', exclusiveOnly: false, dep: OPEN }), ['catered', 'uncatered']));
assert('a Wednesday already taken by a buyout -> nothing',
  eligible({ iso: WED, n: 8, style: 'both', exclusiveOnly: false,
    dep: { ...OPEN, isExclusive: true } }).length === 0);

section('5. The private-buyout toggle filters, it does not disqualify');
assert('exclusiveOnly hides shared days',
  eligible({ iso: MON, n: 8, style: 'both', exclusiveOnly: true, dep: OPEN }).length === 0);
assert('exclusiveOnly keeps Wed/Thu at 8',
  eq(eligible({ iso: WED, n: 8, style: 'both', exclusiveOnly: true, dep: OPEN }), ['catered', 'uncatered']));
assert('8 can still fill a SHARED day with the toggle off (not the only route)',
  eq(eligible({ iso: MON, n: 8, style: 'both', exclusiveOnly: false, dep: OPEN }), ['catered', 'uncatered']));

section('6. Blocked dates are never eligible');
assert('blocked -> nothing, whatever the party',
  eligible({ iso: MON, n: 8, style: 'both', exclusiveOnly: false, dep: { ...OPEN, isBlocked: true } }).length === 0);

section('7. §4 markup contract');
assert(`walkers are radio BUTTONS, not a slider`, /input type="radio" name="groupSize"/.test(widget) && !/type="range"/.test(widget));
assert(`range starts at MIN_PARTY_SIZE (${MIN_PARTY_SIZE}) and ends at MAX_GROUP_SIZE (${MAX_GROUP_SIZE})`,
  /MAX_GROUP_SIZE - MIN_PARTY_SIZE \+ 1/.test(widget) && /i \+ MIN_PARTY_SIZE/.test(widget));
assert('no group-size <select> survives', !/<select[^>]*name="groupSize"/.test(widget));
// The "Show me both" card was removed on request: exactly two named style cards remain, and
// neither is visually pre-checked. The 'both' MODE still exists — it is the JS default a guest
// starts in before picking either card — so the truth table above stays entirely valid; only the
// third radio input is gone from the markup.
assert('exactly two style cards exist (both/catered/uncatered card removed)',
  !widget.includes('value="both"') && widget.includes('value="catered"') && widget.includes('value="uncatered"'));
assert('neither named style is pre-checked (no visible default; "both" is invisible/internal)',
  !/name="style" value="catered" checked/.test(widget) && !/name="style" value="uncatered" checked/.test(widget));
assert('"both" remains the internal JS default until a card is picked',
  /let style: Style = 'both'/.test(widget));
assert('style cards state their booking window', /CATERED_WINDOW_MONTHS\} months ahead/.test(widget) && /UNCATERED_WINDOW_MONTHS\} months ahead/.test(widget));
assert('solo link present and wired to the existing createInquiry', /data-solo-toggle/.test(widget) && /data-solo-submit/.test(widget));
// Comments are stripped first: the source deliberately SAYS "does not invent a single
// supplement", so a naive grep matches the explanation rather than an implementation.
const widgetCode = widget
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX block comments (can span lines)
  .replace(/\/\*[\s\S]*?\*\//g, '')       // JS block comments
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))      // line comments
  .join('\n');
assert('no single supplement is offered anywhere in the markup or logic',
  !/single supplement|solo supplement|solo surcharge/i.test(widgetCode));
// The Step 1 "trail to ourselves" checkbox AND the calendar's "Only private buyouts" filter chip
// were both removed on request. There is no dedicated buyout-only UI control left at all — the
// only route to a Wed/Thu buyout is choosing EXCLUSIVE_SIZE walkers directly, which the truth
// table in sections 1-6 above already exercises independently of any filter.
assert('no orphaned Step 1 checkbox selector survives', !/data-exclusive-only/.test(widget));
assert('no orphaned calendar filter-chip wiring survives',
  !/filterExclBtn|filterLmBtn|filterHsBtn|filterNextBtn|syncFilterChips|afterFilterChange/.test(widget));
assert('reach changes are announced via role="status"', /data-path-notice role="status"/.test(widget) && /function announceReach/.test(widget));

section('8. The Path A/B split is gone; one flow with three steps');
assert('no pathFor()', !/function pathFor/.test(widget));
assert('no switchPath()', !/function switchPath/.test(widget));
assert('no renumberSteps()', !/function renumberSteps/.test(widget));
assert('no data-path-a / data-path-b containers', !/data-path-a/.test(widget) && !/data-path-b/.test(widget));
// The flow is now a 5-step guided accordion. Numbering is STATIC in the markup (there is no
// renumbering function, asserted above), so the titles and their numbers are checked literally.
const STEPS = [
  [1, 'Your group'],
  [2, 'Booking type'],
  [3, 'Choose a start date'],
  [4, 'Your details'],
  [5, 'Review and pay'],
];
for (const [n, title] of STEPS) {
  assert(`step ${n} is "${title}"`,
    new RegExp(`<span class="bstep__num">${n}</span>\\. ${title}`).test(widget));
}
assert('every step carries a data-step index for the controller',
  STEPS.every(([n]) => new RegExp(`data-step="${n}"`).test(widget)));
// Progressive enhancement: the collapse CSS is keyed off a class the SCRIPT adds, so a script
// failure leaves every step open rather than shut. The markup must never ship pre-collapsed.
assert('the stepped class is added by script, not baked into the markup',
  /form\.classList\.add\('bform--stepped'\)/.test(widget) &&
  !/class="bform[^"]*bform--stepped/.test(widget));
assert('no step body ships hidden', !/data-step-body[^>]*\shidden/.test(widget));

section('9. Catering is RESOLVED, never assumed');
assert('catering starts null (no silent default)', /let catering: Catering \| null = null/.test(widget));
assert('a resolver exists and runs on every input change', /function resolveCateringForSelection/.test(widget));
assert('two-way choice is ASKED, not guessed', /data-catering-choice/.test(widget));
assert('submit is blocked while catering is unresolved', /Please choose catered or self-catered for that date/.test(widget));
assert('total shows a dash rather than a guessed price', /Choose catering to continue/.test(widget));

console.log(failed === 0 ? '\nALL ELIGIBILITY CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
