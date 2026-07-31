// Pricing-chain conformance against the Booking & Pricing Policy dated 30 July 2026.
// Run: npx tsx scripts/verify-pricing.mjs
//
// No test framework in this repo and adding one is out of scope, so this follows the existing
// dependency-free `npx tsx` verification pattern.
//
// Structure matters here. Sections A and B ISOLATE the two pricing bugs so it is unambiguous
// which fix made which figure pass. The isolating assertions are the PER-PERSON TOTALS:
//
//   A. ROUNDING ORDER. Self-catered low-season last-minute -> R2,058 pp total.
//      Self-catered was NEVER gated on catering, so this total is blind to the catering-gate fix.
//      It is R2,059 if and only if the chain still rounds after multiplying by NIGHTS.
//
//   B. CATERING GATE. Catered high-season last-minute -> R11,232 pp total.
//      4800 x 0.78 = 3744 and 14400 x 0.78 = 11232 are both exact, so this total is identical
//      under either rounding order. It is wrong if and only if catered is still excluded.
//
//   Note the pppn assertions in A and B are additional coverage, NOT isolators: the old chain
//   defined ppNightCents as the PRE-discount rate, so a pppn check responds to both bugs.
//   Section H proves the isolation empirically rather than trusting this comment.
//
// Then C walks all eight rows of the policy table, D checks the boundaries, E checks the
// constants have not drifted, F checks no price anywhere carries cents, G records the flagged
// Wed/Thu asymmetry, and H proves A and B really do isolate.
import {
  computeQuote,
  ppNightCentsFor,
  basePpNightCentsFor,
  isWithinLastMinuteWindow,
  isHighSeason,
  isWeekendPricingDay,
  daysUntil,
} from '../src/lib/pricing.ts';
import {
  NIGHTS,
  CATERED_PP_NIGHT,
  UNCATERED_PP_NIGHT,
  SEASON_DISCOUNT,
  LAST_MINUTE_DISCOUNT,
  LAST_MINUTE_MIN_DAYS,
  LAST_MINUTE_MAX_DAYS,
} from '../src/data/rates.ts';

let failed = 0;
const R = (cents) => 'R' + (cents / 100).toLocaleString('en-US');
function check(label, got, want) {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    console.log(`        got ${typeof got === 'number' ? R(got) + ` (${got}c)` : got}`);
    console.log(`       want ${typeof want === 'number' ? R(want) + ` (${want}c)` : want}`);
    failed++;
  }
}
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 68 - t.length))}`);

// A fixed "now" so the last-minute window is deterministic. Chosen so that both a HIGH-season
// and a LOW-season start date can sit inside the 8-21 day window:
//   now = 2026-12-05 (low season)  ->  +14d = 2026-12-19 (HIGH: Dec 15 - Jan 15)
//                                  ->  +10d = 2026-12-15 (HIGH, first day of the Dec spike)
//   For a LOW-season last-minute date, now = 2026-11-01 -> +14d = 2026-11-15 (LOW).
const NOW_LOW = new Date('2026-11-01T00:00:00Z');
const NOW_DEC = new Date('2026-12-05T00:00:00Z');
const pppn = (catering, date, now) => ppNightCentsFor(catering, date, now);
const ppTotal = (catering, date, now) =>
  computeQuote({ bookingType: 'shared', catering, groupSize: 1, startDate: date, now }).ppTotalCents;

// ============================================================================================
section('A. ROUNDING ORDER, isolated (self-catered: never catering-gated)');
// 2026-11-15 is a Sunday -> "week" bucket (not Thu/Fri), LOW season, 14 days after NOW_LOW.
const A_DATE = '2026-11-15';
assert(`${A_DATE} is low season`, !isHighSeason(A_DATE));
assert(`${A_DATE} is a week-rate day (not Thu/Fri)`, !isWeekendPricingDay(A_DATE));
assert(`${A_DATE} is ${daysUntil(A_DATE, NOW_LOW)} days out, inside the window`, isWithinLastMinuteWindow(A_DATE, NOW_LOW));
// 880 x 0.78 = 686.4 -> round -> R686.   Round-after-multiply would give R2,059 for the total.
check('self-catered / low / last-minute  pppn  = R686', pppn('uncatered', A_DATE, NOW_LOW), 68600);
check('self-catered / low / last-minute  pp x3 = R2,058', ppTotal('uncatered', A_DATE, NOW_LOW), 205800);
assert('and is NOT R2,059 (the round-after-multiply drift)', ppTotal('uncatered', A_DATE, NOW_LOW) !== 205900);

// ============================================================================================
section('B. CATERING GATE, isolated on the pp total (arithmetic exact -> rounding-order-blind)');
// 2026-12-19 is HIGH season (Dec 15 - Jan 15), 14 days after NOW_DEC.
const B_DATE = '2026-12-19';
assert(`${B_DATE} is high season`, isHighSeason(B_DATE));
assert(`${B_DATE} is ${daysUntil(B_DATE, NOW_DEC)} days out, inside the window`, isWithinLastMinuteWindow(B_DATE, NOW_DEC));
assert('window predicate takes no catering argument', isWithinLastMinuteWindow.length <= 2);
// 4800 x 0.78 = 3744 exactly; 14400 x 0.78 = 11232 exactly. Identical under either rounding order.
check('catered / high / last-minute  pppn  = R3,744', pppn('catered', B_DATE, NOW_DEC), 374400);
check('catered / high / last-minute  pp x3 = R11,232', ppTotal('catered', B_DATE, NOW_DEC), 1123200);
assert('catered is NOT excluded from the discount', pppn('catered', B_DATE, NOW_DEC) < basePpNightCentsFor('catered', B_DATE));

// ============================================================================================
section('C. All eight rows of the policy table (section 9)');
// Dates chosen to hit each bucket. Sunday=week, Thursday/Friday=weekend premium.
const FAR = new Date('2026-01-01T00:00:00Z'); // far from every date below -> no last-minute
const rows = [
  ['Catered   / any / High / no LM ', 'catered',   '2026-08-16', FAR,     480000, 1440000],
  ['Catered   / any / High / LM    ', 'catered',   B_DATE,       NOW_DEC, 374400, 1123200],
  ['Catered   / any / Low  / no LM ', 'catered',   '2026-11-15', FAR,     384000, 1152000],
  ['Catered   / any / Low  / LM  * ', 'catered',   A_DATE,       NOW_LOW, 299500,  898500],
  ['Self-cat  / Tue / High / no LM ', 'uncatered', '2026-08-18', FAR,     110000,  330000],
  ['Self-cat  / Thu / High / no LM ', 'uncatered', '2026-08-20', FAR,     150000,  450000],
  ['Self-cat  / Tue / Low  / LM    ', 'uncatered', '2026-11-17', NOW_LOW,  68600,  205800],
  ['Self-cat  / Fri / High / LM    ', 'uncatered', '2026-12-18', NOW_DEC, 117000,  351000],
];
for (const [label, catering, date, now, wantPppn, wantPp] of rows) {
  check(`${label} pppn`, pppn(catering, date, now), wantPppn);
  check(`${label} pp x${NIGHTS}`, ppTotal(catering, date, now), wantPp);
}
console.log('  * R2,995 is the figure printed in the policy — the row that failed for BOTH reasons.');

// ============================================================================================
section('D. Last-minute window boundaries (21 and 8 inclusive; 7 excluded)');
const base = new Date('2026-11-01T00:00:00Z');
const at = (d) => { const x = new Date(base); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
assert(`T-22 outside (${at(22)})`, !isWithinLastMinuteWindow(at(22), base));
assert(`T-21 INSIDE  (${at(21)})`, isWithinLastMinuteWindow(at(21), base));
assert(`T-8  INSIDE  (${at(8)})`, isWithinLastMinuteWindow(at(8), base));
assert(`T-7  outside (${at(7)}) — full rate at T-7 is deliberate`, !isWithinLastMinuteWindow(at(7), base));
assert('window constants are 8 and 21', LAST_MINUTE_MIN_DAYS === 8 && LAST_MINUTE_MAX_DAYS === 21);

// ============================================================================================
section('E. Constants have not drifted from the policy');
assert('catered high = R4,800', CATERED_PP_NIGHT.high === 4800);
assert('self-catered Thu/Fri high = R1,500', UNCATERED_PP_NIGHT.weekend.high === 1500);
assert('self-catered other high = R1,100', UNCATERED_PP_NIGHT.week.high === 1100);
assert('season discount = 20%', SEASON_DISCOUNT === 0.2);
assert('last-minute discount = 22%', LAST_MINUTE_DISCOUNT === 0.22);
assert('NIGHTS = 3', NIGHTS === 3);
// The low values are stored explicitly rather than derived; assert they equal high x 0.8 so the
// two representations cannot silently diverge.
const lowOf = (h) => Math.round(h * (1 - SEASON_DISCOUNT));
assert(`catered low ${CATERED_PP_NIGHT.low} === ${lowOf(4800)}`, CATERED_PP_NIGHT.low === lowOf(4800));
assert(`self-cat weekend low ${UNCATERED_PP_NIGHT.weekend.low} === ${lowOf(1500)}`, UNCATERED_PP_NIGHT.weekend.low === lowOf(1500));
assert(`self-cat week low ${UNCATERED_PP_NIGHT.week.low} === ${lowOf(1100)}`, UNCATERED_PP_NIGHT.week.low === lowOf(1100));

// ============================================================================================
section('F. No price anywhere carries cents');
let centsFound = 0;
for (const catering of ['catered', 'uncatered']) {
  for (let d = 0; d < 365; d++) {
    const iso = at(d);
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const q = computeQuote({ bookingType: 'shared', catering, groupSize: n, startDate: iso, now: base });
      if (q.ppNightCents % 100 || q.basePpNightCents % 100 || q.ppTotalCents % 100 || q.totalCents % 100) centsFound++;
      // deposit/balance may legitimately split an odd rand, but must always reconcile exactly
      if (q.depositCents + q.balanceCents !== q.totalCents) {
        console.log(`FAIL  deposit+balance != total on ${iso} n=${n}`);
        failed++;
      }
    }
  }
}
assert('365 days x 7 party sizes x 2 caterings: zero fractional-rand prices', centsFound === 0);

// ============================================================================================
section('G. Exclusive pricing is 8 x the per-person figure (flagged asymmetry, section 12.1)');
const wed = '2026-08-19', thu = '2026-08-20';
const wedTotal = computeQuote({ bookingType: 'exclusive', catering: 'uncatered', groupSize: 8, startDate: wed, now: FAR }).totalCents;
const thuTotal = computeQuote({ bookingType: 'exclusive', catering: 'uncatered', groupSize: 8, startDate: thu, now: FAR }).totalCents;
check('Wed self-catered exclusive, high season = R26,400', wedTotal, 2640000);
check('Thu self-catered exclusive, high season = R36,000', thuTotal, 3600000);
console.log('  Implemented as the policy specifies. 36% apart on consecutive days — see FLAGS.');

// ============================================================================================
section('H. Proof that A and B isolate (re-runs the broken chains)');
// Reimplements the four combinations of (rounding order) x (catering gate) and asserts that each
// isolating total responds to exactly one of the two bugs. Without this, "isolated" is a claim in
// a comment; with it, a future regression that re-couples the two fixes fails here.
function legacyChain({ roundFirst, gateCatered }, catering, baseRand) {
  const inWindow = true; // both isolation dates are inside the window by construction
  const lm = gateCatered && catering === 'catered' ? false : inWindow;
  if (roundFirst) {
    const pppn = roundRand(toCents2(lm ? baseRand * (1 - LAST_MINUTE_DISCOUNT) : baseRand));
    return pppn * NIGHTS;
  }
  let pp = roundRand(toCents2(baseRand)) * NIGHTS;
  if (lm) pp = Math.round(pp * (1 - LAST_MINUTE_DISCOUNT));
  return pp;
}
const roundRand = (c) => Math.round(c / 100) * 100;
const toCents2 = (r) => Math.round(r * 100);
const A_BASE = UNCATERED_PP_NIGHT.week.low; // 880
const B_BASE = CATERED_PP_NIGHT.high;       // 4800
const A_WANT = 205800, B_WANT = 1123200;

const variants = [
  ['round-after + gate (both bugs)', { roundFirst: false, gateCatered: true }, false, false],
  ['round-after, gate fixed       ', { roundFirst: false, gateCatered: false }, false, true],
  ['round-first, gate present     ', { roundFirst: true, gateCatered: true }, true, false],
  ['round-first, no gate (current)', { roundFirst: true, gateCatered: false }, true, true],
];
for (const [name, v, expectAPass, expectBPass] of variants) {
  const aPass = legacyChain(v, 'uncatered', A_BASE) === A_WANT;
  const bPass = legacyChain(v, 'catered', B_BASE) === B_WANT;
  assert(`${name} -> A ${aPass ? 'pass' : 'fail'}, B ${bPass ? 'pass' : 'fail'} (as expected)`,
    aPass === expectAPass && bPass === expectBPass);
}
assert("A responds ONLY to rounding order", true /* shown by rows 1-2 failing A and 3-4 passing it */);
assert("B responds ONLY to the catering gate", true /* shown by rows 1,3 failing B and 2,4 passing it */);
// And the live chain must agree with the fully-fixed variant.
check('live chain matches the round-first/no-gate variant (case A)',
  ppTotal('uncatered', A_DATE, NOW_LOW), legacyChain({ roundFirst: true, gateCatered: false }, 'uncatered', A_BASE));
check('live chain matches the round-first/no-gate variant (case B)',
  ppTotal('catered', B_DATE, NOW_DEC), legacyChain({ roundFirst: true, gateCatered: false }, 'catered', B_BASE));

console.log(failed === 0 ? '\nALL PRICING CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
