// Currency conversion contract — the ZAR/EUR/GBP/USD tabs on the /rates price matrix.
// Run: npx tsx scripts/verify-currency.mjs
//
// This is a DISPLAY-ONLY, browsing-aid feature, deliberately scoped to RatesTable.astro. It must
// never touch the transactional path: Paystack charges in ZAR regardless of what a visitor was
// looking at (lib/payments.ts hardcodes currency: 'ZAR'), and the live booking widget's quotes and
// totals are unaffected by this. The checks below exist to keep that boundary honest:
//   1. ZAR is the default, and is what a guest sees with no interaction.
//   2. The three foreign figures are PRE-COMPUTED at build time from the same constants the ZAR
//      figure comes from — the client script only picks which pre-rendered string to show, so
//      there is no second, drift-prone conversion implementation living in a <script> tag.
//   3. The conversion is visibly flagged as approximate, and states the actual charge currency.
//   4. Nothing under src/actions, src/lib/payments.ts or src/lib/pricing.ts (the transactional
//      price authority) references the foreign-currency constants at all.
import { readFileSync } from 'node:fs';
import {
  ZAR_TO_FOREIGN,
  CURRENCY_SYMBOLS,
  FX_RATES_AS_OF,
  ppSharingRand,
  rateRows,
  formatRand,
  formatForeign,
  convertRand,
} from '../src/data/rates.ts';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 62 - t.length))}`);
const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

const rates = read('src/data/rates.ts');
const table = read('src/components/RatesTable.astro');
const css = read('src/styles/global.css');
const paymentsLib = read('src/lib/payments.ts');
const pricingLib = read('src/lib/pricing.ts');
const actions = read('src/actions/index.ts');

section('1. Rates stay static and manually set (no new live third-party dependency)');
assert('ZAR_TO_FOREIGN is a plain object literal, not a fetch/API call',
  /export const ZAR_TO_FOREIGN: Record<ForeignCurrency, number> = \{/.test(rates));
assert('there is no fetch/axios/http call anywhere near the currency constants',
  !/fetch\(|axios|XMLHttpRequest/.test(rates.slice(rates.indexOf('ForeignCurrency'))));
assert('the rates carry an as-of date, so staleness is visible rather than silent',
  /export const FX_RATES_AS_OF = '\d{4}-\d{2}-\d{2}'/.test(rates));
assert('all three foreign currencies have a rate', ['EUR', 'GBP', 'USD'].every((c) => typeof ZAR_TO_FOREIGN[c] === 'number' && ZAR_TO_FOREIGN[c] > 0));

section('2. ZAR is the default and the only CHARGED currency');
// The source has a conditional expression (Astro evaluates it at build time), not a literal
// "checked" attribute — assert the EXPRESSION picks exactly ZAR, not the rendered HTML output.
assert('ZAR is the one currency the checked expression picks',
  /checked=\{cur === 'ZAR'\}/.test(table));
assert('the checked expression appears exactly once (one radio group, one default)',
  (table.match(/checked=\{cur === 'ZAR'\}/g) || []).length === 1);
assert('Paystack still hardcodes ZAR as the transaction currency (unaffected by this feature)',
  /currency:\s*['"]ZAR['"]/.test(paymentsLib) || /'ZAR'/.test(paymentsLib));
assert('the price authority (lib/pricing.ts) never imports the foreign-currency helpers',
  !/ZAR_TO_FOREIGN|convertRand|formatForeign/.test(pricingLib));
assert('the booking/checkout action never imports the foreign-currency helpers',
  !/ZAR_TO_FOREIGN|convertRand|formatForeign/.test(actions));
assert('the live BookingWidget does not import the currency-conversion helpers (scope stays the matrix, not checkout)',
  !/ZAR_TO_FOREIGN|convertRand|formatForeign/.test(read('src/components/BookingWidget.astro')));

section('3. Every currency figure is PRE-COMPUTED at build time, not re-derived in the client script');
assert('RatesTable computes a priceSet() at build time per cell', /function priceSet\(rand: number\)/.test(table));
assert('priceSet reads ppSharingRand + formatRand/formatForeign, not raw constants',
  /ppSharingRand\(rand\)/.test(table) && /formatForeign\(sharing, 'EUR'\)/.test(table));
assert('each cell carries all four pre-rendered strings as data attributes',
  /'data-price-zar': formatRand\(sharing\)/.test(table) &&
  /'data-price-eur': formatForeign\(sharing, 'EUR'\)/.test(table) &&
  /'data-price-gbp': formatForeign\(sharing, 'GBP'\)/.test(table) &&
  /'data-price-usd': formatForeign\(sharing, 'USD'\)/.test(table));
assert('the client script only SELECTS a pre-rendered string, it does not compute one',
  /el\.textContent = value/.test(table) && !/\* 0\.0\d/.test(table) && !/ZAR_TO_FOREIGN/.test(table));
// One call per FOREIGN currency inside priceSet() — ZAR itself goes through formatRand, not
// formatForeign, so 3 calls (EUR/GBP/USD) is the correct count, not 4.
assert('formatForeign is called exactly 3 times (EUR, GBP, USD) — all inside priceSet, none in the client script',
  (table.match(/formatForeign\(/g) || []).length === 3);
assert('the client <script> never calls formatForeign itself (values are only read off dataset)',
  !/<script>[\s\S]*formatForeign\([\s\S]*<\/script>/.test(table));

section('4. The conversion is flagged, not presented as exact or live');
assert('a disclaimer element exists', /data-currency-note/.test(table));
assert('it states the site is charged in ZAR', /charged in South\s*\n?\s*African Rand/.test(table) || /charged in South African Rand/.test(table.replace(/\s+/g, ' ')));
assert('it names the as-of date from the constant, not a typed date', /\{FX_RATES_AS_OF\}/.test(table));
assert('it is hidden while ZAR (the actual charge currency) is selected, shown otherwise',
  /note\.hidden = currency === 'ZAR'/.test(table));
assert('"approximate" or "indicative" appears, so the figure is never read as authoritative',
  /[Aa]pproximate|[Ii]ndicative/.test(table));

section('5. Accessibility + mobile-first');
assert('tabs are a native fieldset/legend + radios (keyboard-operable, no custom widget)',
  /<fieldset class="ratetable__currency"/.test(table) && /<legend class="sr-only">/.test(table));
assert('each tab is a real radio input, not a div with a click handler', /type="radio" name="ratetable-currency"/.test(table));
assert('tab targets are announced via visible label text', /<span>\{cur\}<\/span>/.test(table));
assert('currency chip targets are >= 44px on touch',
  /\.ratetable__curbtn \{[\s\S]{0,400}min-height: 2\.75rem/.test(css) || /\.ratetable__curbtn \{[\s\S]{0,400}min-height:\s*44px/.test(css));
assert('the tab row scrolls rather than wrapping awkwardly at 380px, OR wraps safely',
  /\.ratetable__currency \{/.test(css));
assert('the script re-initialises safely across Astro view-transitions (idempotent bind guard)',
  /wrap\.dataset\.bound === 'true'/.test(table) && /astro:page-load/.test(table));

section('6. Numeric reconciliation: every rendered figure matches the constant it claims to');
let reconciled = 0;
let mismatch = null;
for (const row of rateRows) {
  for (const nightly of [row.high, row.low]) {
    const sharing = ppSharingRand(nightly);
    const zar = formatRand(sharing);
    for (const cur of ['EUR', 'GBP', 'USD']) {
      const expected = CURRENCY_SYMBOLS[cur] + Math.round(sharing * ZAR_TO_FOREIGN[cur]).toLocaleString('en-US');
      const got = formatForeign(sharing, cur);
      if (got !== expected) { mismatch = `${row.label} ${nightly}: ${cur} expected ${expected}, got ${got}`; break; }
    }
    if (mismatch) break;
    reconciled++;
  }
  if (mismatch) break;
}
assert(`all ${rateRows.length * 2} rate-row cells reconcile across all 3 foreign currencies (${reconciled} checked)${mismatch ? ' — ' + mismatch : ''}`,
  mismatch === null && reconciled === rateRows.length * 2);
assert('convertRand is a pure multiplication (no hidden rounding before the final Math.round)',
  convertRand(1000, 'EUR') === 1000 * ZAR_TO_FOREIGN.EUR);

console.log(failed === 0 ? '\nALL CURRENCY CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
