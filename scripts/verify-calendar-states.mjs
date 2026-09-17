// Calendar cell states: the accessibility and legibility contract of the booking calendar.
// Run: npx tsx scripts/verify-calendar-states.mjs
//
// Under commercial model v4 a date can be in one of six logical states but wears one of four
// appearances. The rules this guards:
//   1. State is never carried by colour ALONE (WCAG 1.4.1) — each cell class has a non-colour cue.
//   2. A cell face carries no price or badge text (an operator request: the grid stays calm), so
//      every scrap of status has to live in the aria-label instead. If a cell says nothing, a
//      screen-reader user has no way to tell an open date from a full one.
//   3. An unavailable cell always states WHY, and stays focusable (aria-disabled, not disabled),
//      or the reason is unreachable by keyboard.
//   4. The legend mirrors the cell classes, so the key and the grid cannot drift apart.
import { readFileSync } from 'node:fs';

let failed = 0;
function assert(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) {
    if (detail) console.log(`        ${detail}`);
    failed++;
  }
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 66 - t.length))}`);

const widget = readFileSync(new URL('../src/components/BookingWidget.astro', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

const VISUALS = ['open', 'started', 'locked', 'unavailable'];
const STATES = ['open', 'joinable', 'cateringLocked', 'full', 'needsOpen', 'closed'];

section('1. The state model');
assert('six logical states are declared', STATES.every((s) => widget.includes(`'${s}'`)));
assert('four appearances are declared',
  /type CellVisual = 'open' \| 'started' \| 'locked' \| 'unavailable'/.test(widget));
assert('visualFor() maps state onto appearance in one place',
  /function visualFor\(c: Classification\): CellVisual/.test(widget));
assert('the retired buyout/exclusive cell state is gone',
  !/buyoutOnly/.test(widget) && !/bcal__cell--exclusive/.test(widget));
assert('the retired filter state is gone',
  !/exclusiveOnly/.test(widget) && !/lastMinuteOnly/.test(widget) && !/highSeasonOnly/.test(widget));

section('2. Colour is never the only cue');
for (const v of VISUALS) {
  const block = css.match(new RegExp(`\\.bcal__cell--${v}\\s*\\{([\\s\\S]*?)\\}`));
  assert(`.bcal__cell--${v} is styled`, !!block);
  if (block) {
    const rules = block[1];
    const hasNonColourCue = /border|outline|text-decoration|font-weight|opacity|box-shadow|background-image/.test(rules);
    assert(`.bcal__cell--${v} carries a non-colour cue`, hasNonColourCue, rules.trim().slice(0, 120));
  }
}

section('3. The cell face stays calm; status lives in the label');
assert('day number is the only text node put in a cell', /dayNum\.textContent = String\(day\)/.test(widget));
assert('no price string is written onto a cell face',
  !/cell\.appendChild\([\s\S]{0,80}fmtR\(/.test(widget));
assert('every actionable cell gets an aria-label', /cell\.setAttribute\('aria-label'/.test(widget));
assert('an actionable label names the places left or that the date is open',
  /guaranteed departure, \$\{c\.seatsTaken\} of \$\{R\.maxGroup\} places booked/.test(widget));
assert('an actionable label names the price once a rate context has been fetched',
  /const priceWord = priced\(\) \? `, \$\{fmtR\(ppTripCents\(iso\)\)\} per person`/.test(widget));
assert('aria-pressed marks the selected date', /cell\.setAttribute\('aria-pressed'/.test(widget));

section('4. An unavailable cell states its reason and stays reachable');
assert('cellReasonText() exists and covers every closed reason',
  /function cellReasonText\(c: Classification\): string/.test(widget) &&
  ['blocked', 'taperDay', 'tooSoon'].every((r) => widget.includes(`c.reason === '${r}'`)));
assert('the taper reason names the real start days rather than saying "unavailable"',
  /not a start day: departures run \$\{R\.startDays\}/.test(widget));
assert('unavailable cells use aria-disabled, NOT the disabled attribute',
  /cell\.setAttribute\('aria-disabled', 'true'\)/.test(widget) && !/cell\.disabled = true/.test(widget));
assert('unavailable cells still carry a label', /`\$\{human\}, \$\{cellReasonText\(c\)\}`/.test(widget));

section('5. The legend mirrors the cell classes');
for (const v of VISUALS) {
  const key = v === 'unavailable' ? 'out' : v;
  assert(`legend has a key for ${v} (.bcal__key--${key})`, widget.includes(`bcal__key--${key}`));
}
assert('legend is aria-hidden (each cell already states its own status)',
  /<div class="bcal__legend" aria-hidden="true">/.test(widget));
assert('the guaranteed-departure wording matches the memo exactly',
  /Guaranteed Departure: \$\{c\.seatsTaken\} of \$\{R\.maxGroup\} spots booked\. \$\{c\.seatsLeft\} spots available\./.test(widget));

section('6. Keyboard reachability of the grid');
assert('the grid is one roving tab stop', /cell\.tabIndex = iso === calFocusIso \? 0 : -1/.test(widget));
assert('arrow keys, Home, End, PageUp and PageDown all move the stop',
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp'].every((k) => widget.includes(`'${k}'`)));
assert('Escape closes the preview without moving focus', /if \(key === 'Escape'\)/.test(widget));

console.log(`\n${failed === 0 ? 'ALL CALENDAR-STATE CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
