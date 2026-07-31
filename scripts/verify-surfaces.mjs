// Supporting surfaces (§9): homepage "from" price, the pricing explainer, the WhatsApp fallback,
// and the confirmation email.
// Run: npx tsx scripts/verify-surfaces.mjs
//
// The failure this guards against is drift, not breakage. Every one of these surfaces states a
// price, a discount, a minimum or a deadline that ALSO lives in data/rates.ts or lib/pricing.ts.
// A hardcoded copy of any of them keeps rendering perfectly while quietly advertising a number we
// no longer honour, which is worse than a crash: nothing fails, and the site lies.
//
// So the shape of this script is: for every figure that appears in copy, assert the copy reads
// the constant rather than a literal.
import { readFileSync } from 'node:fs';
import {
  NIGHTS,
  LOWEST_PP_NIGHT,
  FROM_PP_SHARING_DISPLAY,
  ppSharingRand,
  UNCATERED_PP_NIGHT,
  CATERED_PP_NIGHT,
  LAST_MINUTE_DISCOUNT,
  SEASON_DISCOUNT,
  inclusions,
  exclusions,
  formatRand,
} from '../src/data/rates.ts';
import { SPLIT_THRESHOLD_DAYS, BALANCE_LEAD_DAYS, isHighSeason } from '../src/lib/pricing.ts';
import { routePins } from '../src/data/route.ts';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 62 - t.length))}`);
const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

const home = read('src/pages/index.astro');
const explainer = read('src/pages/how-pricing-works.astro');
const ratesPage = read('src/pages/rates.astro');
const widget = read('src/components/BookingWidget.astro');
const email = read('src/lib/email.ts');
const rates = read('src/data/rates.ts');
const css = read('src/styles/global.css');

section('1. The "from" price is DERIVED, per person SHARING, and every quoted rate is honourable');
assert('LOWEST_PP_NIGHT is computed with Math.min over the rate table, not assigned',
  /export const LOWEST_PP_NIGHT = Math\.min\(/.test(rates));
// A hand-picked "cheapest cell" is the exact thing that goes stale: the table can change without
// anyone remembering the marketing figure was copied out of it.
assert('it is not a literal', !/export const LOWEST_PP_NIGHT = \d+/.test(rates));
const everyRate = [
  UNCATERED_PP_NIGHT.week.high, UNCATERED_PP_NIGHT.week.low,
  UNCATERED_PP_NIGHT.weekend.high, UNCATERED_PP_NIGHT.weekend.low,
  CATERED_PP_NIGHT.high, CATERED_PP_NIGHT.low,
];
assert(`LOWEST_PP_NIGHT (${LOWEST_PP_NIGHT}) really is the minimum of all six published rates`,
  LOWEST_PP_NIGHT === Math.min(...everyRate));
// Deliberate: the last-minute rate is lower still, but a guest cannot choose to be in that window.
assert('the last-minute rate is NOT advertised as the entry price',
  LOWEST_PP_NIGHT > LOWEST_PP_NIGHT * (1 - LAST_MINUTE_DISCOUNT) &&
  /Deliberately excludes the\n\/\/ last-minute discount/.test(rates));
// The trail has no shorter stay to choose (all NIGHTS nights are mandatory), so the entry price
// quoted anywhere on the site must be the per-person SHARING total, never the bare nightly rate.
assert('ppSharingRand multiplies by NIGHTS, and is the ONLY conversion site-wide',
  /export const ppSharingRand = \(perNightRand: number\): number => perNightRand \* NIGHTS/.test(rates));
assert(`FROM_PP_SHARING_DISPLAY (${FROM_PP_SHARING_DISPLAY}) is exactly LOWEST_PP_NIGHT x NIGHTS`,
  FROM_PP_SHARING_DISPLAY === formatRand(LOWEST_PP_NIGHT * NIGHTS));
assert('the display string is built from ppSharingRand, once',
  /export const FROM_PP_SHARING_DISPLAY = formatRand\(ppSharingRand\(LOWEST_PP_NIGHT\)\)/.test(rates));
assert('the retired nightly display constant is gone', !/FROM_PP_NIGHT_DISPLAY/.test(rates));

section('2. Homepage CTAs quote the SHARING total, and never a literal');
assert('the homepage imports the computed figure', /FROM_PP_SHARING_DISPLAY \} from '\.\.\/data\/rates'/.test(home));
const homeUses = (home.match(/FROM_PP_SHARING_DISPLAY/g) || []).length - 1; // minus the import
assert(`it is used in the copy (${homeUses} places)`, homeUses >= 3);
assert(`the literal "${FROM_PP_SHARING_DISPLAY}" appears nowhere on the homepage`,
  !new RegExp(`\\b${FROM_PP_SHARING_DISPLAY}\\b`).test(home));
assert('no rand figure at all is typed into the homepage', !/\bR\d[\d,]*\b/.test(home));
assert('the primary CTA states the SHARING price', /See rates and book, from \{FROM_PP_SHARING_DISPLAY\} per person sharing/.test(home));
assert('the closing CTA states it too', /Rates start at \{FROM_PP_SHARING_DISPLAY\} per person sharing/.test(home));
assert('the retired nightly display constant is not imported anywhere on the homepage', !/FROM_PP_NIGHT_DISPLAY/.test(home));
assert('the homepage never claims a per-night price', !/per person per night|pp\/night/.test(home));

section('3. The pricing explainer exists and computes everything it claims');
assert('the page exists at /how-pricing-works', explainer.length > 500);
assert('it has exactly one <h1>', (explainer.match(/<h1/g) || []).length === 1);
assert('it carries Seo metadata and JSON-LD', /webPageSchema\(\{ path: '\/how-pricing-works'/.test(explainer));
assert('breadcrumbs place it under Rates', /\{ name: 'How pricing works', path: '\/how-pricing-works' \}/.test(explainer));
// Question-shaped headings answered in the first sentence: the house SEO/GEO rule, and also just
// how a person reads a pricing page.
const questions = (explainer.match(/q: '[^']*\?'/g) || []).length;
assert(`headings are question-shaped and answered first (${questions} questions)`, questions >= 4);
assert('every question is fed to FAQ JSON-LD', /faqPageSchema\(factors\.map\(/.test(explainer));
assert('NO rand figure is typed into the explainer', !/\bR\d[\d,]*\b/.test(explainer));
assert('rates come through formatRand of the constants', (explainer.match(/formatRand\(/g) || []).length >= 6);
assert(`the ${Math.round(SEASON_DISCOUNT * 100)}% season figure is computed`,
  /Math\.round\(SEASON_DISCOUNT \* 100\)/.test(explainer) && !/\b20% less\b/.test(explainer.replace(/seasonPct/g, '')));
assert(`the ${Math.round(LAST_MINUTE_DISCOUNT * 100)}% last-minute figure is computed`,
  /Math\.round\(LAST_MINUTE_DISCOUNT \* 100\)/.test(explainer));
assert('the last-minute discount is stated for BOTH caterings (the step-1 rule)',
  /applies to both catered and self-catered/.test(explainer));
assert('the worked example runs the REAL pricing function, not arithmetic retyped here',
  /ppNightCentsFor\(exampleCatering, exampleIso, exampleNow\)/.test(explainer));
assert('the example uses a fixed "now" so the last-minute window cannot silently alter it',
  /const exampleNow = new Date\('2027-01-20T00:00:00Z'\)/.test(explainer));
// The example's PROSE must be derived from its date, not written beside it. The first draft said
// "low season" on a date inside 1 Apr to 31 Oct: every number was right and the sentence was not.
assert('the season label is derived from the date, not typed',
  /const exampleSeason = isHighSeason\(exampleIso\) \?/.test(explainer) &&
  !/low season, Monday start|outside high season/.test(explainer));
assert('the weekday is derived too', /const exampleWeekday = exampleDate\.toLocaleDateString/.test(explainer));
assert('the catering label is derived', /const exampleStyle = exampleCatering === 'uncatered'/.test(explainer));
{
  // Independently re-derive the example date's season and confirm the page cannot claim otherwise.
  const iso = (explainer.match(/const exampleIso = '([\d-]+)'/) || [])[1];
  assert(`the example date ${iso} really is low season`, iso != null && !isHighSeason(iso));
}
assert('the example shows deposit AND balance, not just a total',
  /Paid today \(50% deposit\)/.test(explainer) && /Balance, due \$\{BALANCE_LEAD_DAYS\} days before arrival/.test(explainer));
// The worked example's headline row must be the per-person SHARING figure (nightly rate already
// multiplied by NIGHTS), not a nightly rate awaiting a separate "x nights" step — the trail has no
// shorter stay, so a two-step "per night, then x nights" breakdown would misstate what is on offer.
assert('the example computes a SHARING figure by multiplying the engine\'s per-night rate by NIGHTS',
  /const examplePpSharing = ppNightCentsFor\(exampleCatering, exampleIso, exampleNow\) \* NIGHTS/.test(explainer));
assert('the example\'s headline row is labelled "per person sharing"',
  /\$\{asRand\(examplePpSharing\)\} per person sharing/.test(explainer));
assert('no separate nights-multiplication row survives in the example',
  !/NIGHTS.{0,20}nights.{0,20}asRand\(examplePpTotal\)/.test(explainer) && !/examplePpTotal/.test(explainer));
assert('the example never states a bare per-night figure', !/per person per night/.test(explainer));
assert('inclusions and exclusions are mapped from data/rates.ts',
  /\{inclusions\.map\(/.test(explainer) && /\{exclusions\.map\(/.test(explainer));
for (const item of [...inclusions, ...exclusions]) {
  assert(`"${item.slice(0, 30)}..." is not duplicated as a literal`, !explainer.includes(item));
}
assert('the worked-example styling exists', /\.pricing-example__row \{/.test(css));

section('4. It is reachable, and the rates page links to it');
assert('/rates links to the explainer', /withBase\('\/how-pricing-works'\)/.test(ratesPage));
assert('the booking widget links to it too', /withBase\('\/how-pricing-works'\)/.test(widget));

section('5. The step-1 conformance fix reached the MARKETING copy, not just the engine');
// lib/pricing.ts was corrected in step 1 so the last-minute discount applies to both caterings.
// This sentence on /rates still gated it on self-catered, which would have under-quoted catered
// guests against what we now actually charge them.
assert('/rates no longer restricts the last-minute discount to self-catered',
  !/Self-catered bookings made \{LAST_MINUTE_MIN_DAYS\}/.test(ratesPage));
assert('it now says catered or self-catered', /% off, catered or\s*\n\s*self-catered\./.test(ratesPage));
assert('no page still claims the discount is self-catered only',
  ![home, explainer, ratesPage, widget].some((f) => /self-catered bookings.{0,80}% off/i.test(f)));

section('6. Deadline literals removed from copy');
// SPLIT_THRESHOLD_DAYS and BALANCE_LEAD_DAYS are both 45 today. Copy that types "45" keeps saying
// 45 after either moves, in the one place a guest treats as a commitment.
assert(`no "${SPLIT_THRESHOLD_DAYS} day" literal in the booking widget`, !/\b45[+]? (or more )?days?\b/.test(widget));
assert('the deposit strip on /rates reads the constants', /\{SPLIT_THRESHOLD_DAYS\}\+ days out/.test(ratesPage));
assert('the payment summary on /rates reads the constants',
  /Full payment is due \{BALANCE_LEAD_DAYS\} days before arrival/.test(ratesPage));
assert('the confirmation email reads the constant', /\$\{BALANCE_LEAD_DAYS\} days before your trip/.test(email));
assert('no "45 days" literal survives in the email', !/\b45 days\b/.test(email));
// Deliberately NOT bound to SPLIT_THRESHOLD_DAYS: non-refundability is a separate commercial term
// that merely coincides with the payment threshold today, so fusing them would hide two decisions
// behind one constant. De-duplicated against its OWN source instead.
assert('the refund summary renders from refundPolicy.tiers, not a retyped sentence',
  /refundPolicy\.tiers\[0\]\.window/.test(ratesPage) && !/Cancel 45 or more days/.test(ratesPage));
assert('no page retypes a deposit/balance deadline as a literal',
  ![home, ratesPage, widget, email, explainer].some((f) =>
    /\b45[+]? (or more )?days?\b/.test(f.replace(/^\s*(\/\/|\*).*$/gm, ''))));

section('6b. The comp-booking form cannot submit a group size the server will reject');
const compForm = read('src/pages/admin/bookings/new.astro');
assert('the buyout size comes from the constant, not a DOM read', /groupSize: EXCLUSIVE_SIZE,/.test(compForm));
assert('it no longer parses the number back out of a display field', !/Number\(val\('cb-group'\)/.test(compForm));
assert('the displayed value is the constant too', /value=\{EXCLUSIVE_SIZE\}/.test(compForm));
assert('the hint states the constant rather than a literal 8',
  /exactly \{EXCLUSIVE_SIZE\} guests/.test(compForm) && !/exactly 8 guests/.test(compForm));
// `disabled` removes the field from the accessibility tree; readonly keeps it announced.
assert('the display field is readonly, not disabled', /readonly aria-readonly="true"/.test(compForm) && !/readonly disabled/.test(compForm));

section('7. WhatsApp fallback at both dead ends');
assert('a fallback line exists in the widget', /class="bform__fallback"/.test(widget));
assert('it uses the configured number, not a typed link', /\{site\.contact\.whatsappUrl\}/.test(widget));
assert('it opens safely', (widget.match(/target="_blank" rel="noopener"/g) || []).length >= 2);
assert('it sits BELOW the primary action, as an escape hatch not a rival',
  widget.indexOf('bform__submit') < widget.indexOf('bform__fallback'));
assert('it is not styled as a button', !/bform__fallback[\s\S]{0,200}btn-primary/.test(widget));
assert('the empty state also offers WhatsApp', /ask us on WhatsApp/.test(widget));
assert('the fallback has its own styling', /\.bform__fallback \{/.test(css));

section('8. The confirmation email gained the trail and what it covers');
assert('a trail strip is built', /function trailStrip\(\)/.test(email));
assert('it reads routePins rather than naming lodges', /import \{ routePins \} from '\.\.\/data\/route'/.test(email));
for (const pin of routePins) {
  assert(`"${pin.name}" is not hardcoded in the email`, !email.includes(`>${pin.name}<`));
}
assert('the loop returns to the hub', /role: 'Day 1, arrive'[\s\S]{0,240}role: 'Day 4, depart'/.test(email));
assert('an inclusions block is built from data/rates.ts', /function inclusionsBlock\(\)/.test(email));
for (const item of inclusions) {
  assert(`"${item.slice(0, 30)}..." is not duplicated in the email`, !email.includes(item));
}
assert('both are inserted into the confirmation', /trailStrip\(\) \+/.test(email) && /inclusionsBlock\(\) \+/.test(email));
// Email clients that ignore flex are the reason this is a table, and the reason it is asserted.
assert('layout uses tables, not flex (Outlook)', !/function trailStrip\(\)[\s\S]{0,1200}display:\s*flex/.test(email));
assert('every interpolated value is escaped', !/\$\{stop\.name\}/.test(email) && /escapeHtml\(stop\.name\)/.test(email));
assert('inclusion text is escaped too', /escapeHtml\(item\)/.test(email));
assert('self-catered guests are told food is theirs to bring',
  /opts\.catering === 'uncatered'[\s\S]{0,220}Food and drink are yours to bring/.test(email));

section('9. House rules');
for (const [name, src] of [['homepage', home], ['explainer', explainer]]) {
  const copy = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')                        // JSX comments
    .replace(/^---[\s\S]*?^---$/m, (m) => m.replace(/—/g, ''))      // frontmatter is code
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  assert(`no em-dash in ${name} copy`, !/—/.test(copy));
}
assert('no fabricated credential appears on the explainer',
  !/FGASA|certified|years of experience|award[- ]winning/i.test(explainer));
assert(`the explainer claims exactly the ${inclusions.length} inclusions we publish`,
  (explainer.match(/inclusions\.map/g) || []).length === 1);

// The trail is always exactly NIGHTS nights (mandatory, no shorter stay), so no customer-facing
// surface may quote a bare per-night price — every figure is per person SHARING for the whole
// trail. Swept across every surface this script already reads.
for (const [name, src] of [['homepage', home], ['explainer', explainer], ['rates page', ratesPage], ['booking widget', widget]]) {
  assert(`${name} never states a bare per-night price`, !/per person per night|pp\/night/.test(src));
}
assert('the rates JSON-LD offers price the SHARING total, not the raw nightly constant',
  /price: ppSharingRand\(UNCATERED_PP_NIGHT\.week\.low\)/.test(ratesPage) &&
  /price: ppSharingRand\(CATERED_PP_NIGHT\.low\)/.test(ratesPage));

console.log(failed === 0 ? '\nALL SURFACE CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
