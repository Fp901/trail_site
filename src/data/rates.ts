// Public rates (display) — Commercial model v4 (memo to Francois, 15 September 2026).
//
// WHAT CHANGED FROM v3.1. The site now sells ONE flagship product publicly: the all-inclusive
// CATERED walking safari, aimed at the international/inbound market, with a 30% discount for
// SADC residents. The self-catered product still exists in the booking engine but is NOT
// visible on the main site: it is reached only from the hidden /sadc-slackpacking page (the QR
// target on the marketing PDF). The Wednesday/Thursday "exclusive buyout" day rule is retired.
//
// THE UNIT IS PER PERSON, PER TRIP. Every rate in this file is the price for ONE person for the
// WHOLE 3-night trail, VAT and conservation levies included. The trail is always exactly NIGHTS
// nights, so a nightly figure implies a duration decision that does not exist; v3.1 stored
// per-night rates and multiplied them at the edges, which put un-multiplied nightly numbers one
// mistake away from the page. The operator's own rate table is per trip (R15,900 / R12,720), so
// this is also the form the numbers were signed off in.
//
// Two products, by catering (rooms and SADC count, 23 September 2026):
//   catered   : the flagship. 2 to 8 walkers in up to 4 double rooms. Guests say how many need
//               their own room (40% single supplement each) and how many are SADC residents
//               (30% off their own rate), so one booking can mix both rates. Bookable 24 months
//               ahead, or 12 if anyone in the party is counted as SADC.
//   uncatered : hidden page only. Exactly 8 SADC residents sharing 4 rooms. Bookable 12 months.
// A guest counted as SADC who cannot show ID or a passport at registration pays a 50% premium
// on the day (SADC_PREMIUM_PCT); that is an operator matter, not something the engine prices.
//
// The server-side price authority (lib/pricing.ts) reuses these constants, so display and the
// real charged amount can never drift. Never expose owner splits or internal margins (Part 12).
import type { Catering, Residency } from '../lib/db.types';

export const NIGHTS = 3; // Day 1 arrival to Day 4 departure
export const MAX_GROUP_SIZE = 8; // FGASA safety cap: 2 armed guides : 8 walkers
// Every departure has 4 double rooms across the lodges. Guests only share a room within their own
// booking, so a date fills on ROOMS as well as walkers: 4 guests in their own rooms take the
// whole trail. The DB slot guard (migration 0017) caps both.
export const ROOMS_PER_DEPARTURE = 4;
// A guest in their own room pays this on top of the all-inclusive rate for that date, after the
// year, season and last-minute rules, floored to the rand. Catered only.
export const SINGLE_SUPPLEMENT_PCT = 40;
// Charged at registration to a guest counted as SADC who cannot show ID or a passport. Stated in
// the booking terms and the confirmation tick; never computed by the engine.
export const SADC_PREMIUM_PCT = 50;

// --- Booking opens ----------------------------------------------------------------------------
// The site-wide gate: online booking is accepted for start dates from here on. Earlier dates are
// family-and-friends-by-enquiry only (walks before this date are invoiced manually). It combines
// with the rolling per-product windows below; earliestBookableDate() takes the later of the two.
export const BOOKING_OPEN_DATE = '2027-04-01';
export const BOOKING_OPEN_DISPLAY = '1 April 2027';

// The earlier family-and-friends beta window opens here. Kept in the same long form as
// BOOKING_OPEN_DISPLAY because the two are quoted in a single sentence on the homepage.
export const BETA_OPEN_DISPLAY = '31 October 2026';

// --- Base rates: per person, per trip, incl. VAT and conservation levies -----------------------
// 2027 high-season rack rates. Everything else in the model is a multiplier on these two numbers.
export const BASE_PP_TRIP = {
  catered: 15900, // R5,300 per night x 3 nights
  uncatered: 4950, // R1,650 per night x 3 nights (hidden SADC product)
} as const;

// Low season is every date outside 1 Apr - 31 Oct and 15 Dec - 15 Jan.
export const SEASON_DISCOUNT = 0.2;
// SADC residents pay 30% less than the international rack rate. Largely covered by lower
// conservation levies and no agent commission, so it is a real discount, not a markup removed.
export const SADC_DISCOUNT = 0.3;

// Retired, deliberately kept at zero rather than deleted: v3.1 charged a premium for self-catered
// trips starting on a Thursday or Friday. The memo eliminates it ("just set this discount to
// zero") because only four start days run per week, and flags it may return at seven start days.
export const WEEKEND_PREMIUM = 0;

// --- Annual increases (published two years ahead for the DMC market) ---------------------------
// A start date is priced by the calendar year it begins in. 8% from 1 January 2028, a further 5%
// in 2029 (compounding: 1.08 x 1.05 = 1.134). A date beyond the last year listed holds the last
// multiplier — OPEN QUESTION for the operator, flagged rather than invented.
export const RATE_BASE_YEAR = 2027;
export const RATE_YEAR_MULTIPLIER: Record<number, number> = {
  2027: 1,
  2028: 1.08,
  2029: 1.134,
};
export const RATE_YEARS = Object.keys(RATE_YEAR_MULTIPLIER)
  .map(Number)
  .sort((a, b) => a - b);
export const RATE_LAST_YEAR = RATE_YEARS[RATE_YEARS.length - 1];

// --- Tapered start: four start days a week until the end of 2028 -------------------------------
// Tuesday, Wednesday and Saturday are closed for start dates up to and including TAPER_END_DATE,
// so departures run Sunday, Monday, Thursday and Friday. This caps the reserve at two groups a
// day while guiding capacity is built up. From 1 January 2029 every weekday is open.
export const TAPER_END_DATE = '2028-12-31';
export const TAPER_BLOCKED_ISODOW = [2, 3, 6] as const; // ISO: Tue = 2, Wed = 3, Sat = 6
export const START_DAYS_DISPLAY = 'Sunday, Monday, Thursday and Friday';
export const TAPER_END_DISPLAY = '31 December 2028';

// --- Booking windows (rolling, by product) -----------------------------------------------------
// International catered opens two years out so European and US tour operators can build the trail
// into long-haul packages. SADC products open twelve months out, matching how local hiking clubs
// and corporates plan their annual trips.
export const INTL_CATERED_WINDOW_MONTHS = 24;
export const SADC_WINDOW_MONTHS = 12;

// --- Last-minute discount (all products) -------------------------------------------------------
// 21 to 8 days before the start, inclusive. The final 7 days are excluded on purpose: that week is
// reserved for staffing, so full rate at T-7 is intended, not an oversight.
export const LAST_MINUTE_MIN_DAYS = 8;
export const LAST_MINUTE_MAX_DAYS = 21;
export const LAST_MINUTE_DISCOUNT = 0.22;

// --- Group formation ---------------------------------------------------------------------------
// OPENING an empty date is a property of the PRODUCT: a catered booking takes 2 (any room mix), a
// self-catered booking takes the full 8. JOINING a date somebody else opened also takes 2 catered
// (25 September 2026: solo walkers are no longer booked online; the widget's "Travelling solo?"
// panel takes their details as an enquiry instead). Self-catered cannot be joined: 8 fills it.
export const MIN_PARTY_CATERED = 2;
export const MIN_PARTY_UNCATERED = 8;
export const MIN_TO_JOIN = 2; // catered
export const MIN_PARTY_SIZE = MIN_PARTY_CATERED; // smallest party the policy has any route for

export function minPartySize(catering: Catering): number {
  return catering === 'catered' ? MIN_PARTY_CATERED : MIN_PARTY_UNCATERED;
}

export function minToJoin(catering: Catering): number {
  return catering === 'catered' ? MIN_TO_JOIN : MIN_PARTY_UNCATERED;
}

// --- Rooms -------------------------------------------------------------------------------------
// Guests who share pair up within the booking, so everyone not in their own room fills a double.
export function roomsFor(groupSize: number, singleRooms: number): number {
  return singleRooms + (groupSize - singleRooms) / 2;
}

// A valid mix leaves an even number sharing. Mirrored by the bookings_room_mix CHECK in 0017.
export function isValidRoomMix(groupSize: number, singleRooms: number): boolean {
  return (
    Number.isInteger(groupSize) &&
    Number.isInteger(singleRooms) &&
    singleRooms >= 0 &&
    singleRooms <= groupSize &&
    (groupSize - singleRooms) % 2 === 0
  );
}

// The widget's starting point: an odd party needs one own room, an even one needs none.
export function defaultSingleRooms(groupSize: number): number {
  return groupSize % 2;
}

// --- Product identity --------------------------------------------------------------------------
export interface Product {
  catering: Catering;
  residency: Residency;
  label: string;
  short: string;
}

export const PRODUCTS: Product[] = [
  {
    catering: 'catered',
    residency: 'international',
    label: 'All-inclusive catered walking safari',
    short: 'All-inclusive catered',
  },
  {
    catering: 'catered',
    residency: 'sadc',
    label: 'All-inclusive catered walking safari, SADC resident rate',
    short: 'All-inclusive catered, SADC',
  },
  {
    catering: 'uncatered',
    residency: 'sadc',
    label: 'SADC self-catered slackpacking option',
    short: 'SADC self-catered',
  },
];

export function productLabel(catering: Catering, residency: Residency): string {
  return (
    PRODUCTS.find((p) => p.catering === catering && p.residency === residency)?.label ??
    'Rooiberg Wander walking safari'
  );
}

// --- Display helpers ---------------------------------------------------------------------------
// Format ZAR with comma thousands separators ("R15,900").
export function formatRand(amount: number): string {
  return 'R' + Math.round(amount).toLocaleString('en-US');
}

// The entry price as it appears in marketing copy: the cheapest the FLAGSHIP can be booked at by
// an international guest (low season, base year). Derived, never retyped, so a rate change moves
// the copy with it. Deliberately excludes the SADC and last-minute discounts: neither is a rate a
// browsing international guest can simply choose.
export const FROM_PP_TRIP = Math.floor(BASE_PP_TRIP.catered * (1 - SEASON_DISCOUNT));
export const FROM_PP_TRIP_DISPLAY = formatRand(FROM_PP_TRIP);

// --- Indicative foreign-currency conversion (display only, /rates matrix) ----------------------
// For foreign guests to gauge the cost in a currency they recognise. The site never charges in
// anything but ZAR — Paystack's transaction currency is hardcoded 'ZAR' in lib/payments.ts. These
// are a monthly SNAPSHOT of the European Central Bank reference rates, not a live feed: the two
// constants below are rewritten by scripts/update-fx-rates.mjs (scheduled on the 1st of each month
// by .github/workflows/update-fx-rates.yml) and baked in at build time. Don't hand-edit the
// figures; run the script.
export type ForeignCurrency = 'EUR' | 'GBP' | 'USD';
export const CURRENCY_SYMBOLS: Record<'ZAR' | ForeignCurrency, string> = {
  ZAR: 'R',
  EUR: '€',
  GBP: '£',
  USD: '$',
};
export const FX_RATES_AS_OF = '2026-09-22';
export const ZAR_TO_FOREIGN: Record<ForeignCurrency, number> = {
  EUR: 0.05371,
  GBP: 0.04607,
  USD: 0.06157,
};
// "22 September 2026": the snapshot date as the rates table prints it. UTC, so the build
// machine's timezone can't shift it by a day.
export const FX_RATES_AS_OF_LABEL = new Date(`${FX_RATES_AS_OF}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
export function convertRand(rand: number, currency: ForeignCurrency): number {
  return rand * ZAR_TO_FOREIGN[currency];
}
// Whole-unit rounding, matching formatRand's own whole-rand convention — cents-level precision on
// an already-indicative conversion would be false accuracy.
export function formatForeign(rand: number, currency: ForeignCurrency): string {
  return CURRENCY_SYMBOLS[currency] + Math.round(convertRand(rand, currency)).toLocaleString('en-US');
}

// --- Rates page display model ------------------------------------------------------------------
// The operator's table: one row per rate year, high and low season columns, per person for the
// whole trail. Every figure is computed from the constants above, never retyped, so the displayed
// rate and the amount lib/pricing.ts charges cannot drift.
//
// Rounding is FLOOR to the whole rand, applied once after the whole discount chain: 12,720 x 1.08
// = 13,737.60 and the operator's table reads R13,737. Rounding always lands in the guest's
// favour, and the same helper is what pricing.ts charges.
export const roundRateRand = (rand: number): number => Math.floor(rand);

export function rateFor(opts: {
  catering: Catering;
  residency: Residency;
  year: number;
  highSeason: boolean;
  lastMinute?: boolean;
}): number {
  const year = RATE_YEAR_MULTIPLIER[opts.year] !== undefined ? opts.year : RATE_LAST_YEAR;
  let rand = BASE_PP_TRIP[opts.catering] * RATE_YEAR_MULTIPLIER[year];
  if (!opts.highSeason) rand *= 1 - SEASON_DISCOUNT;
  if (opts.residency === 'sadc' && opts.catering === 'catered') rand *= 1 - SADC_DISCOUNT;
  if (opts.lastMinute) rand *= 1 - LAST_MINUTE_DISCOUNT;
  return roundRateRand(rand);
}

// The single supplement for a date's rate year and season, before any last-minute reduction:
// 40% of the all-inclusive international rate, floored to the rand. 2027 high season: R6,360.
export function singleSupplementFor(opts: { year: number; highSeason: boolean; lastMinute?: boolean }): number {
  const rate = rateFor({ catering: 'catered', residency: 'international', ...opts });
  return roundRateRand((rate * SINGLE_SUPPLEMENT_PCT) / 100);
}

export interface RateRow {
  label: string; // "All inclusive 2027"
  year: number;
  high: number; // rand per person for the whole trail, high season
  low: number; // rand per person for the whole trail, low season
}

// The public matrix shows the FLAGSHIP (international catered) only; the SADC discount is stated
// as a note beneath it, exactly as the memo specifies, rather than as extra columns nobody
// browsing the international product needs to read past.
export const rateRows: RateRow[] = RATE_YEARS.filter((y) => y <= RATE_BASE_YEAR + 1).map((year) => ({
  label: `All inclusive ${year}`,
  year,
  high: rateFor({ catering: 'catered', residency: 'international', year, highSeason: true }),
  low: rateFor({ catering: 'catered', residency: 'international', year, highSeason: false }),
}));

export const SADC_DISCOUNT_PERCENT = Math.round(SADC_DISCOUNT * 100);
export const SADC_DISCOUNT_NOTE = `A ${SADC_DISCOUNT_PERCENT}% discount is offered to SADC residents`;

// The SADC resident rate for the same years, shown as its own row beneath each flagship row.
// Disclosed publicly by operator decision on 23 September 2026, reversing the 16 September
// decision to keep it off the site (CLAUDE.md Part 17.1). Same derivation as the charge.
export const sadcRateRows: RateRow[] = rateRows.map(({ year }) => ({
  label: `SADC residents ${year}`,
  year,
  high: rateFor({ catering: 'catered', residency: 'sadc', year, highSeason: true }),
  low: rateFor({ catering: 'catered', residency: 'sadc', year, highSeason: false }),
}));

// The hidden page's own rate line, same derivation, kept here so it cannot drift from the engine.
export const sadcSelfCateredRates = RATE_YEARS.filter((y) => y <= RATE_BASE_YEAR + 1).map((year) => ({
  year,
  high: rateFor({ catering: 'uncatered', residency: 'sadc', year, highSeason: true }),
  low: rateFor({ catering: 'uncatered', residency: 'sadc', year, highSeason: false }),
}));

// Season column headings for the matrix.
export const SEASON_HIGH_LABEL = 'High season';
// The two ranges are exported separately as well as joined, so the rate table can render each one
// in its own non-wrapping span. As a single string it broke mid-phrase in the narrow column head
// ("15 Dec to" / "15 Jan"), which reads as two different dates.
export const SEASON_HIGH_DATE_RANGES = ['1 Apr to 31 Oct', '15 Dec to 15 Jan'] as const;
export const SEASON_HIGH_DATES = SEASON_HIGH_DATE_RANGES.join(', ');
export const SEASON_LOW_LABEL = 'Low season';

// What the price includes / excludes. Single source shared by the Rates page, the homepage and
// the confirmation email so they can never drift. The flagship is all-inclusive, so meals and
// selected local wines and beers are IN and the old self-catering lines are gone.
export const inclusions = [
  'A guided walk, with each safari lodge reserved for your group overnight',
  'Two experienced trail guides throughout',
  'All meals, with selected South African estate wines and local beers',
  'Daily transport of your baggage and provisions between lodges',
  'All reserve conservation levies, and VAT',
];
export const exclusions = [
  "Travel to and from Temminck's Lodge",
  'Personal travel insurance',
  'Gratuities',
];

// The same two lists for the hidden self-catered product, where food and drink are the guest's.
export const uncateredInclusions = [
  'A guided walk, with each safari lodge reserved for your group overnight',
  'Two armed FGASA field guides throughout',
  'Daily luggage and cooler-box portage between lodges',
  'Bedding, free ice, wood, cleaning staff and WiFi',
  'All reserve conservation levies, and VAT',
];
export const uncateredExclusions = [
  'Food and beverages, which you bring and cook in the fully equipped lodge kitchens',
  "Travel to and from Temminck's Lodge",
  'Personal travel insurance',
  'Gratuities',
];
