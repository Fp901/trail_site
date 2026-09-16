// Supporting surfaces: every page, email and data file that quotes a price, a discount, a
// minimum or a date must READ the constant rather than repeat the number.
// Run: npx tsx scripts/verify-surfaces.mjs
//
// The failure this guards against is drift, not breakage. A hardcoded copy of a rate keeps
// rendering perfectly while quietly advertising a number we no longer honour, which is worse than
// a crash: nothing fails, and the site lies. It matters more under commercial model v4 than it
// did before, because rates now change on a published schedule (+8% in 2028, +5% in 2029) rather
// than only when someone decides to reprice.
import { readFileSync } from 'node:fs';
import {
  BASE_PP_TRIP,
  FROM_PP_TRIP,
  FROM_PP_TRIP_DISPLAY,
  SADC_DISCOUNT,
  LAST_MINUTE_DISCOUNT,
  MAX_GROUP_SIZE,
  MIN_PARTY_CATERED,
  BOOKING_OPEN_DISPLAY,
  formatRand,
  rateFor,
  inclusions,
  exclusions,
} from '../src/data/rates.ts';

let failed = 0;
function assert(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) {
    if (detail) console.log(`        ${detail}`);
    failed++;
  }
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 66 - t.length))}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const home = read('src/pages/index.astro');
const rates = read('src/pages/rates.astro');
const explainer = read('src/pages/how-pricing-works.astro');
const table = read('src/components/RatesTable.astro');
const widget = read('src/components/BookingWidget.astro');
const sadc = read('src/pages/sadc-slackpacking.astro');
const email = read('src/lib/email.ts');
const llms = read('public/llms.txt');

// Every rand figure the model can currently produce, as a formatted string. Any of these appearing
// as a literal in a page is a hardcoded price.
const liveFigures = new Set();
for (const year of [2027, 2028, 2029]) {
  for (const catering of ['catered', 'uncatered']) {
    for (const residency of ['sadc', 'international']) {
      for (const highSeason of [true, false]) {
        liveFigures.add(formatRand(rateFor({ catering, residency, year, highSeason })));
      }
    }
  }
}

section('1. No page hardcodes a rate the engine computes');
for (const [name, src] of [
  ['index.astro', home],
  ['rates.astro', rates],
  ['how-pricing-works.astro', explainer],
  ['RatesTable.astro', table],
  ['sadc-slackpacking.astro', sadc],
]) {
  const found = [...liveFigures].filter((f) => src.includes(f));
  assert(`${name} quotes no rate as a literal`, found.length === 0, found.join(', '));
}

section('2. The figures that DO appear in copy come from the constants');
assert('rates.astro derives its "from" price via rateFor()', /rateFor\(\{/.test(rates));
assert('how-pricing-works reads FROM_PP_TRIP_DISPLAY', /FROM_PP_TRIP_DISPLAY/.test(explainer));
assert('how-pricing-works computes its worked example from lib/pricing', /ppTripCentsFor\(/.test(explainer));
assert('the rate table renders rateRows, not hand-written cells', /rateRows\.map/.test(table));
assert('the SADC page derives its rate line', /rateFor\(\{/.test(sadc) && /sadcSelfCateredRates/.test(sadc));
assert('the widget mirrors the price chain from its serialised constants, not literals',
  /R\.base \* \(R\.yearMultipliers/.test(widget) && !new RegExp(`\\b${BASE_PP_TRIP.catered}\\b`).test(widget));

section('3. Discounts, minimums and dates are read, not retyped');
const pct = (d) => `${Math.round(d * 100)}%`;
assert('the SADC percentage is derived wherever it appears in copy',
  !rates.includes(pct(SADC_DISCOUNT)) || /Math\.round\(SADC_DISCOUNT \* 100\)/.test(rates));
assert('the last-minute percentage is derived in the widget',
  /Math\.round\(LAST_MINUTE_DISCOUNT \* 100\)/.test(widget) || /Math\.round\(R\.lastMinuteDiscount \* 100\)/.test(widget));
assert('group size comes from MAX_GROUP_SIZE / MIN_PARTY_CATERED on the rates page',
  /MAX_GROUP_SIZE/.test(rates) && /MIN_PARTY_CATERED/.test(rates));
assert('the launch date on the homepage reads BOOKING_OPEN_DISPLAY', /BOOKING_OPEN_DISPLAY/.test(home));
assert('the start-day rule reads START_DAYS_DISPLAY rather than naming days by hand',
  /START_DAYS_DISPLAY/.test(rates) && /START_DAYS_DISPLAY/.test(explainer));

section('4. The included/excluded lists are shared, never restated');
assert('rates.astro renders the inclusions array', /inclusions/.test(rates));
assert('how-pricing-works renders the same arrays', /inclusions/.test(explainer) && /exclusions/.test(explainer));
assert('the confirmation email renders them too', /inclusionsBlock/.test(email));
assert('the SADC page uses its own pair, not the flagship one',
  /uncateredInclusions/.test(sadc) && !/\binclusions\b/.test(sadc.replace(/uncateredInclusions|uncateredExclusions/g, '')));
assert('every inclusion line appears exactly once in the array (no duplicate claims)',
  new Set(inclusions).size === inclusions.length && new Set(exclusions).size === exclusions.length);

section('5. llms.txt states the current model (it is read by AI crawlers, not rebuilt from code)');
for (const [label, needle] of [
  ['the flagship rate', formatRand(BASE_PP_TRIP.catered)],
  ['the low-season rate', FROM_PP_TRIP_DISPLAY],
  ['the launch date', BOOKING_OPEN_DISPLAY],
  ['the SADC discount', pct(SADC_DISCOUNT)],
  ['the last-minute discount', pct(LAST_MINUTE_DISCOUNT)],
  ['the capacity', String(MAX_GROUP_SIZE)],
]) {
  assert(`llms.txt states ${label} (${needle})`, llms.includes(needle));
}
assert('llms.txt does NOT link the unlisted SADC page', !llms.includes('sadc-slackpacking'));
assert('FROM_PP_TRIP is the low-season flagship rate, derived',
  FROM_PP_TRIP === rateFor({ catering: 'catered', residency: 'international', year: 2027, highSeason: false }));

console.log(`\n${failed === 0 ? 'ALL SURFACE CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
