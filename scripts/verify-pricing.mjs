// Pricing-chain conformance against the commercial model v4 memo (15 September 2026).
// Run: npx tsx scripts/verify-pricing.mjs
//
// No test framework in this repo and adding one is out of scope, so this follows the existing
// dependency-free `npx tsx` verification pattern.
//
// WHAT THIS GUARDS. The operator published a rate table; the engine must reproduce it exactly:
//
//                        high season   low season
//   All inclusive 2027     R15,900      R12,720
//   All inclusive 2028     R17,172      R13,737
//
// R13,737 is the sharp edge: 12,720 x 1.08 = 13,737.60. It is R13,737 if and only if the chain
// FLOORS to the whole rand, once, after the discounts. Round-half-up gives R13,738 and the site
// would quote a figure the operator never published. Section A isolates exactly that.
//
// Then B covers the SADC discount, C the season boundaries, D the last-minute window, E the
// rate-year boundary, F the taper and booking windows, G that no price carries cents, and H that
// the constants themselves have not drifted from the memo.
import {
  computeQuote,
  ppTripCentsFor,
  basePpTripRand,
  isWithinLastMinuteWindow,
  isHighSeason,
  isTaperBlocked,
  isAllowedStartDay,
  rateYearFor,
  latestBookableDate,
  earliestBookableDate,
  bookingTypeFor,
  daysUntil,
  roomsFor,
  isValidRoomMix,
  defaultSingleRooms,
} from '../src/lib/pricing.ts';
import {
  NIGHTS,
  BASE_PP_TRIP,
  SEASON_DISCOUNT,
  SADC_DISCOUNT,
  RATE_YEAR_MULTIPLIER,
  LAST_MINUTE_DISCOUNT,
  LAST_MINUTE_MIN_DAYS,
  LAST_MINUTE_MAX_DAYS,
  MAX_GROUP_SIZE,
  MIN_PARTY_CATERED,
  MIN_PARTY_UNCATERED,
  MIN_TO_JOIN,
  ROOMS_PER_DEPARTURE,
  SINGLE_SUPPLEMENT_PCT,
  singleSupplementFor,
  TAPER_END_DATE,
  INTL_CATERED_WINDOW_MONTHS,
  SADC_WINDOW_MONTHS,
  rateFor,
  rateRows,
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
const rand = (cents) => cents / 100;

// A fixed "now", far enough back that no sample date falls in the last-minute window unless the
// section means it to.
const NOW = new Date('2026-09-16T08:00:00Z');

// Representative dates. July is high season, November is low; both are Thursdays or Fridays in
// the years used, i.e. real start days under the taper.
const HIGH_2027 = '2027-07-15'; // Thursday
const LOW_2027 = '2027-11-11';  // Thursday
const HIGH_2028 = '2028-07-13'; // Thursday
const LOW_2028 = '2028-11-09';  // Thursday

section('A. The published rate table, including the flooring edge');
assert('2027 high season, international = R15,900',
  rand(ppTripCentsFor('catered', 'international', HIGH_2027, NOW)) === 15900);
assert('2027 low season, international = R12,720',
  rand(ppTripCentsFor('catered', 'international', LOW_2027, NOW)) === 12720);
assert('2028 high season, international = R17,172',
  rand(ppTripCentsFor('catered', 'international', HIGH_2028, NOW)) === 17172);
assert('2028 low season, international = R13,737 (FLOOR, not 13,738)',
  rand(ppTripCentsFor('catered', 'international', LOW_2028, NOW)) === 13737,
  `got R${rand(ppTripCentsFor('catered', 'international', LOW_2028, NOW))}; 12,720 x 1.08 = 13,737.60`);
assert('rateRows (the displayed matrix) carries exactly those four figures',
  rateRows.length === 2 &&
  rateRows[0].high === 15900 && rateRows[0].low === 12720 &&
  rateRows[1].high === 17172 && rateRows[1].low === 13737,
  JSON.stringify(rateRows));
assert('display rateFor() and charged ppTripCentsFor() agree, all four cells',
  [[2027, true, HIGH_2027], [2027, false, LOW_2027], [2028, true, HIGH_2028], [2028, false, LOW_2028]]
    .every(([year, high, iso]) =>
      rateFor({ catering: 'catered', residency: 'international', year, highSeason: high }) ===
      rand(ppTripCentsFor('catered', 'international', iso, NOW))));

section('B. SADC discount');
assert('SADC catered 2027 high = R11,130 (30% off 15,900)',
  rand(ppTripCentsFor('catered', 'sadc', HIGH_2027, NOW)) === 11130);
assert('SADC catered 2027 low = R8,904 (30% off 12,720)',
  rand(ppTripCentsFor('catered', 'sadc', LOW_2027, NOW)) === 8904);
assert('SADC self-catered 2027 high = R4,950, low = R3,960',
  rand(ppTripCentsFor('uncatered', 'sadc', HIGH_2027, NOW)) === 4950 &&
  rand(ppTripCentsFor('uncatered', 'sadc', LOW_2027, NOW)) === 3960);
assert('the SADC discount does NOT apply to the self-catered product (already a resident rate)',
  ppTripCentsFor('uncatered', 'sadc', HIGH_2027, NOW) === BASE_PP_TRIP.uncatered * 100);
assert('a quote prices SADC guests at the SADC rate and the rest at the international rate',
  rand(computeQuote({ catering: 'catered', groupSize: 2, singleRooms: 0, sadcCount: 1, startDate: HIGH_2027, now: NOW }).totalCents) === 15900 + 11130);
assert('self-catered: every guest at the self-catered rate, no SADC reduction on top',
  rand(computeQuote({ catering: 'uncatered', groupSize: 8, startDate: HIGH_2027, now: NOW }).totalCents) === 8 * 4950);

section('C. Season boundaries (1 Apr - 31 Oct, 15 Dec - 15 Jan)');
for (const [iso, want] of [
  ['2027-03-31', false], ['2027-04-01', true], ['2027-10-31', true], ['2027-11-01', false],
  ['2027-12-14', false], ['2027-12-15', true], ['2028-01-15', true], ['2028-01-16', false],
]) {
  assert(`${iso} high season = ${want}`, isHighSeason(iso) === want);
}

section('D. Last-minute window: 21 to 8 days out, 22% off, both products');
const lmNow = new Date('2027-07-01T08:00:00Z');
const at = (days) => {
  const d = new Date('2027-07-01T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
assert(`${LAST_MINUTE_MAX_DAYS} days out is inside the window`, isWithinLastMinuteWindow(at(LAST_MINUTE_MAX_DAYS), lmNow));
assert(`${LAST_MINUTE_MAX_DAYS + 1} days out is outside`, !isWithinLastMinuteWindow(at(LAST_MINUTE_MAX_DAYS + 1), lmNow));
assert(`${LAST_MINUTE_MIN_DAYS} days out is inside`, isWithinLastMinuteWindow(at(LAST_MINUTE_MIN_DAYS), lmNow));
assert(`${LAST_MINUTE_MIN_DAYS - 1} days out is outside (the staffing week)`, !isWithinLastMinuteWindow(at(LAST_MINUTE_MIN_DAYS - 1), lmNow));
{
  const iso = at(14); // 15 July 2027, high season, inside the window
  const full = rateFor({ catering: 'catered', residency: 'international', year: 2027, highSeason: true });
  assert('last-minute takes 22% off the international rate, floored',
    rand(ppTripCentsFor('catered', 'international', iso, lmNow)) === Math.floor(full * (1 - LAST_MINUTE_DISCOUNT)));
  assert('last-minute stacks after the SADC discount',
    rand(ppTripCentsFor('catered', 'sadc', iso, lmNow)) ===
    Math.floor(full * (1 - SADC_DISCOUNT) * (1 - LAST_MINUTE_DISCOUNT)));
  assert('basePpTripRand excludes the last-minute discount (it is a named line, not the base)',
    basePpTripRand('catered', 'international', iso) === full);
}

section('E. Rate year is the year the trip STARTS in');
assert('a 2027 date prices at the base year', rateYearFor('2027-12-31') === 2027);
assert('a 2028 date prices at +8%', rateYearFor('2028-01-01') === 2028);
assert('a year beyond the published table holds the last published multiplier',
  rateYearFor('2031-06-01') === Math.max(...Object.keys(RATE_YEAR_MULTIPLIER).map(Number)));
assert('2029 = 1.134 (8% then a further 5%)', RATE_YEAR_MULTIPLIER[2029] === 1.134);

section('F. Taper and booking windows');
// 2027-07-13 is a Tuesday, -14 a Wednesday, -17 a Saturday; -15 Thursday, -16 Friday.
assert('Tuesday is not a start day before the taper ends', isTaperBlocked('2027-07-13'));
assert('Wednesday is not a start day before the taper ends', isTaperBlocked('2027-07-14'));
assert('Saturday is not a start day before the taper ends', isTaperBlocked('2027-07-17'));
assert('Thursday and Friday are start days', !isTaperBlocked('2027-07-15') && !isTaperBlocked('2027-07-16'));
assert('Sunday and Monday are start days', !isTaperBlocked('2027-07-18') && !isTaperBlocked('2027-07-19'));
assert(`the taper ends after ${TAPER_END_DATE}`, isTaperBlocked('2028-12-26') && !isTaperBlocked('2029-01-02'));
assert('isAllowedStartDay is the taper, stated positively',
  isAllowedStartDay('2027-07-15') && !isAllowedStartDay('2027-07-13'));
{
  const intl = latestBookableDate('catered', 0, NOW);
  const sadc = latestBookableDate('catered', 1, NOW);
  assert(`a catered party with no SADC guests books ${INTL_CATERED_WINDOW_MONTHS} months out; one SADC guest makes it ${SADC_WINDOW_MONTHS}`,
    intl > sadc, `intl ${intl} vs sadc ${sadc}`);
  assert('both windows anchor to the booking-open gate before launch, so each opens at full length',
    intl.startsWith('2029-04') && sadc.startsWith('2028-04'), `intl ${intl}, sadc ${sadc}`);
  assert('self-catered uses the SADC window whoever asks',
    latestBookableDate('uncatered', 8, NOW) === sadc);
  assert('earliest bookable date is the launch gate while launch is ahead',
    earliestBookableDate(NOW) === '2027-04-01');
}

section('G. No price anywhere carries cents, and the split reconciles');
{
  const q = computeQuote({ catering: 'catered', groupSize: 5, singleRooms: 1, sadcCount: 2, startDate: HIGH_2028, now: NOW });
  assert('total is whole rands', q.totalCents % 100 === 0);
  assert('deposit + balance == total exactly', q.depositCents + q.balanceCents === q.totalCents);
  assert('a trip 45+ days out is a deposit plan', q.paymentPlan === 'deposit_balance');
  assert('total = SADC x sadcRate + others x intlRate + own rooms x supplement',
    q.totalCents === 2 * q.sadcPpCents + 3 * q.intlPpCents + 1 * q.supplementCents);
  const near = computeQuote({ catering: 'catered', groupSize: 2, singleRooms: 0, sadcCount: 2, startDate: at(10), now: lmNow });
  assert('a trip inside 45 days pays in full', near.paymentPlan === 'full' && near.balanceCents === 0);
}

section('H. Group formation and derived exclusivity (rooms)');
assert(`opening takes ${MIN_PARTY_CATERED} catered, ${MIN_PARTY_UNCATERED} self-catered; joining ${MIN_TO_JOIN}; capacity ${MAX_GROUP_SIZE} walkers in ${ROOMS_PER_DEPARTURE} rooms`,
  MIN_PARTY_CATERED === 2 && MIN_PARTY_UNCATERED === 8 && MIN_TO_JOIN === 2 && MAX_GROUP_SIZE === 8 && ROOMS_PER_DEPARTURE === 4);
assert('a booking that takes all 4 rooms is exclusive', bookingTypeFor(4) === 'exclusive');
assert('a booking with fewer rooms shares the date', bookingTypeFor(3) === 'shared');
assert('rooms = own rooms + sharers / 2', roomsFor(3, 1) === 2 && roomsFor(4, 4) === 4 && roomsFor(8, 0) === 4 && roomsFor(1, 1) === 1);

section('J. Rooms, single supplement and the SADC count');
assert('3 walkers, 2 own rooms is refused (an odd number would share)', !isValidRoomMix(3, 2));
assert('3 walkers, 1 own room is valid; 4 walkers, 4 own rooms is valid', isValidRoomMix(3, 1) && isValidRoomMix(4, 4));
assert('the default is 1 own room for an odd party, 0 for an even one', defaultSingleRooms(3) === 1 && defaultSingleRooms(4) === 0);
{
  const q = computeQuote({ catering: 'catered', groupSize: 3, singleRooms: 1, sadcCount: 2, startDate: HIGH_2027, now: NOW });
  assert('3 walkers, 1 own room, 2 SADC, 2027 high season = R44,520 (2 x 11,130 + 15,900 + 6,360)',
    rand(q.totalCents) === 44520, `got R${rand(q.totalCents)}`);
  assert('the 2027 high-season supplement is R6,360 (40% of R15,900)', rand(q.supplementCents) === 6360);
  assert('the display helper agrees', singleSupplementFor({ year: 2027, highSeason: true }) === 6360);
  const solo = computeQuote({ catering: 'catered', groupSize: 1, singleRooms: 1, sadcCount: 0, startDate: HIGH_2027, now: NOW });
  assert('a solo walker pays the international rate plus one supplement', rand(solo.totalCents) === 15900 + 6360 && solo.rooms === 1);
  const four = computeQuote({ catering: 'catered', groupSize: 4, singleRooms: 4, sadcCount: 0, startDate: HIGH_2027, now: NOW });
  assert('4 walkers in 4 own rooms take all 4 rooms and are exclusive', four.rooms === 4 && four.bookingType === 'exclusive');
  const sc = computeQuote({ catering: 'uncatered', groupSize: 8, singleRooms: 3, sadcCount: 0, startDate: HIGH_2027, now: NOW });
  assert('self-catered ignores room and SADC inputs: 8 SADC sharing 4 rooms, no supplement',
    sc.sadcCount === 8 && sc.singleRooms === 0 && sc.supplementCents === 0 && sc.rooms === 4);
  const lm = computeQuote({ catering: 'catered', groupSize: 1, singleRooms: 1, sadcCount: 0, startDate: at(14), now: lmNow });
  const lmIntl = Math.floor(15900 * (1 - LAST_MINUTE_DISCOUNT));
  assert('last-minute applies before the supplement is taken (40% of the reduced rate, floored)',
    rand(lm.supplementCents) === Math.floor(lmIntl * 0.4) && rand(lm.totalCents) === lmIntl + Math.floor(lmIntl * 0.4));
  assert('the supplement is 40%', SINGLE_SUPPLEMENT_PCT === 40);
}

section('J. One-time discount codes (migration 0020)');
{
  const base = { catering: 'catered', groupSize: 3, singleRooms: 1, sadcCount: 2, startDate: HIGH_2027, now: NOW };
  const half = computeQuote({ ...base, discountPercent: 50 });
  assert('a 50% code halves R44,520 to R22,260, the whole total including the supplement',
    rand(half.totalCents) === 22260 && rand(half.discountCents) === 22260 && rand(half.totalBeforeDiscountCents) === 44520);
  assert('the deposit split is worked out on the discounted total',
    half.paymentPlan === 'deposit_balance' && half.depositCents + half.balanceCents === half.totalCents &&
    rand(half.depositCents) === 11130);
  const free = computeQuote({ ...base, discountPercent: 100 });
  assert('a 100% code makes the booking free, paid in full (nothing to split)',
    free.totalCents === 0 && free.amountDueCents === 0 && free.paymentPlan === 'full' && rand(free.discountCents) === 44520);
  const none = computeQuote(base);
  assert('no code: no discount, the total is unchanged',
    none.discountPercent === 0 && none.discountCents === 0 && none.totalCents === none.totalBeforeDiscountCents);
  // An odd-rand total: the discounted total floors to the whole rand (the guest's favour).
  const odd = computeQuote({ catering: 'catered', groupSize: 1, singleRooms: 1, sadcCount: 1, startDate: HIGH_2027, now: NOW });
  const oddHalf = computeQuote({ catering: 'catered', groupSize: 1, singleRooms: 1, sadcCount: 1, startDate: HIGH_2027, now: NOW, discountPercent: 50 });
  assert('50% of an odd total floors to the whole rand, and the parts still reconcile',
    oddHalf.totalCents === Math.floor(odd.totalCents / 2 / 100) * 100 &&
    oddHalf.totalCents % 100 === 0 && oddHalf.totalCents + oddHalf.discountCents === odd.totalCents);
}

section('I. Constants match the memo');
assert('base rates are R15,900 catered and R4,950 self-catered per person per trip',
  BASE_PP_TRIP.catered === 15900 && BASE_PP_TRIP.uncatered === 4950);
assert('the trip is 3 nights', NIGHTS === 3);
assert('season discount 20%, SADC 30%, last-minute 22%',
  SEASON_DISCOUNT === 0.2 && SADC_DISCOUNT === 0.3 && LAST_MINUTE_DISCOUNT === 0.22);
assert('2028 is +8% on 2027', RATE_YEAR_MULTIPLIER[2028] === 1.08);
// SAST is UTC+2, so 22:00 UTC is already the NEXT day in Johannesburg. The gap must be counted
// from the South African date, not the UTC one, or a booking made late at night could be
// classified into a different last-minute or deposit band than the one it is charged in.
assert('daysUntil counts from the SAST date, not the UTC date',
  daysUntil('2027-04-08', new Date('2027-04-01T22:00:00Z')) === 6 &&
  daysUntil('2027-04-08', new Date('2027-04-01T12:00:00Z')) === 7);

console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
