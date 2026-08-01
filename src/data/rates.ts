// Public rates (display) — Booking v3.1 (Workstream B: commercial-model conformance). Pricing
// is now per-person-per-night for EVERY departure — the earlier flat-group-rate model is
// retired. Two departure types, by day of week:
//   Exclusive buyout — Wednesday or Thursday only. EXACTLY 8 guests (min = max = the universal
//     safety/logistics cap of 2 guides : 8 walkers), either self-catered or catered, priced pp.
//   Shared/flexible — Sunday, Monday, Tuesday, Friday or Saturday. The FIRST active booking on
//     a date must be at least 4 people; its catering choice (catered or uncatered) locks the
//     day's type. Further bookings on that date must be at least 2 people and match the locked
//     catering, up to 8 seats total.
// Every rate additionally varies by season (high/low, minus 20% in low) and, for self-catered only, by
// weekday-vs-weekend (Thursday/Friday carry a premium; catered has no day-of-week premium).
// The server-side price authority (lib/pricing.ts) reuses these constants — display and the
// real charged amount can never drift. Never expose owner splits (Part 12).
//
// VAT note: the source pricing brief calls these rates "VAT inclusive," but the operator has
// not registered for VAT (confirmed earlier this build; nothing here changes that, and there is
// no VAT number or registration to invent — see Part 12's "never fabricate" rule). These
// constants are implemented as the plain, full amount charged, exactly like every other price
// on this site; no VAT breakdown, VAT number, or "tax invoice" language is reintroduced. Flag
// for the operator before launch if real VAT registration is actually intended.

export const NIGHTS = 3; // Day 1 arrival to Day 4 departure
export const MAX_GROUP_SIZE = 8; // universal cap — 2 guides : 8 walkers

// BOOKING_OPEN_DATE is the site-wide soft-launch gate (unrelated to the Workstream B pricing
// policy, and not superseded by it): online booking is accepted for start dates from this date
// on; earlier dates are family-and-friends-by-enquiry only. It combines with, rather than
// replaces, the per-catering rolling windows below (earliestBookableDate takes the later of the
// two; see lib/pricing.ts).
export const BOOKING_OPEN_DATE = '2027-01-15';
export const BOOKING_OPEN_DISPLAY = '15 January 2027';

// --- Per-person-per-night rates (Rand), before the seasonal adjustment ---------------------
// Self-catered: Thursday/Friday start dates are the premium "weekend" rate; every other start
// day is the "week" rate.
export const UNCATERED_PP_NIGHT = {
  week: { high: 1100, low: 880 }, // low = high × (1 − SEASON_DISCOUNT) = 1,100 × 0.8
  weekend: { high: 1500, low: 1200 }, // 1,500 × 0.8
} as const;
// Catered: one flat rate regardless of day of week, still seasonal.
export const CATERED_PP_NIGHT = { high: 4800, low: 3840 } as const; // 4,800 × 0.8

export const SEASON_DISCOUNT = 0.2; // low season = high season rate × (1 − 0.2)

// The lowest rate anyone can actually be charged, DERIVED from the table above rather than
// picked by hand. Every "from R…" on the site reads this, so a rate change moves the marketing
// copy with it instead of leaving a figure we no longer honour. Deliberately excludes the
// last-minute discount: that is a window a guest cannot choose to be in, so advertising it as
// the entry price would be a rate we cannot offer on request.
export const LOWEST_PP_NIGHT = Math.min(
  UNCATERED_PP_NIGHT.week.high,
  UNCATERED_PP_NIGHT.week.low,
  UNCATERED_PP_NIGHT.weekend.high,
  UNCATERED_PP_NIGHT.weekend.low,
  CATERED_PP_NIGHT.high,
  CATERED_PP_NIGHT.low,
);

// --- Per-person SHARING price (the customer-facing unit) ------------------------------------
// The trail is always exactly NIGHTS nights; there is no shorter stay to choose, so quoting a
// nightly rate implies a duration decision that does not exist. Every price shown to a guest is
// therefore the cost per person for the WHOLE trail, never a bare nightly figure. "Sharing" is
// the standard travel-industry term for a per-person rate assuming shared (twin/double)
// occupancy — which every rate here already assumes: there is no solo booking route and no
// single supplement (MIN_PARTY_SIZE below).
//
// The underlying UNCATERED_PP_NIGHT / CATERED_PP_NIGHT tables stay per-night internally, because
// season and start-day variation are genuinely nightly rules — but nothing downstream may show
// one of those numbers un-multiplied. This is the one place that conversion happens.
export const ppSharingRand = (perNightRand: number): number => perNightRand * NIGHTS;

// --- Group formation -------------------------------------------------------------------------
export const EXCLUSIVE_SIZE = 8; // Wed/Thu buyout: exactly this many (min = max)

// The opening minimum SPLITS BY CATERING TYPE (policy, 30 July 2026): the first booking on an
// open day needs 4 self-catered but only 2 catered. Every booking after the first needs 2,
// whichever the product. Consequence worth knowing: for CATERED, opening and joining have the
// same size floor, so a party of 2 can start a catered date but not a self-catered one. Whether
// a guest is opening or joining therefore depends on party size AND catering, never size alone.
export const SHARED_OPEN_MIN_UNCATERED = 4;
export const SHARED_OPEN_MIN_CATERED = 2;
export const SHARED_TOPUP_MIN = 2; // later bookings on an already-open flexible date, both products

// The smallest party the policy has any route for: 2 to open catered, 4 to open self-catered,
// 2 to join anything, 8 for exclusive. There is no solo route (flagged — see §12.4 of the brief).
export const MIN_PARTY_SIZE = 2;

// --- Booking windows (rolling from today, per catering) --------------------------------------
// Replaces the earlier single fixed BOOKING_OPEN_DATE: catered departures can be booked much
// further ahead, matching the longer international trip-planning cycle.
export const CATERED_WINDOW_MONTHS = 18;
export const UNCATERED_WINDOW_MONTHS = 8;

// --- Last-minute discount (BOTH caterings) ----------------------------------------------------
// 21 to 8 days before the start, inclusive. Applies to catered AND self-catered: the policy
// wants locals taking discounted catered spots and states cannibalisation is not a concern, so
// there is deliberately no eligibility condition beyond the window. The final 7 days are
// excluded on purpose (that week is reserved for staffing), so full rate at T-7 is intended.
export const LAST_MINUTE_MIN_DAYS = 8;
export const LAST_MINUTE_MAX_DAYS = 21;
export const LAST_MINUTE_DISCOUNT = 0.22;

// Format ZAR with comma thousands separators ("R1,500").
export function formatRand(amount: number): string {
  return 'R' + Math.round(amount).toLocaleString('en-US');
}

// The entry price as it appears in copy — the per-person SHARING total for the whole trail, not
// a nightly figure. One expression, so no page can carry a stale figure.
export const FROM_PP_SHARING_DISPLAY = formatRand(ppSharingRand(LOWEST_PP_NIGHT));

// --- Indicative foreign-currency conversion (display only, /rates matrix) --------------------
// For foreign guests to gauge the cost in a currency they recognise. The site never charges in
// anything but ZAR — Paystack's transaction currency is hardcoded 'ZAR' in lib/payments.ts, and
// nothing here changes that. These rates are a STATIC, manually-set approximation (not a live
// FX feed): adding a live third-party rate API would be a new external dependency and a new SSR
// data path for what is a browsing aid, not the transactional price. Flag to the operator: these
// are illustrative and should be checked/updated periodically; they are not live market rates.
export type ForeignCurrency = 'EUR' | 'GBP' | 'USD';
export const CURRENCY_SYMBOLS: Record<'ZAR' | ForeignCurrency, string> = {
  ZAR: 'R',
  EUR: '€',
  GBP: '£',
  USD: '$',
};
// Illustrative ZAR -> foreign multipliers, set once at the date below. Update periodically.
export const FX_RATES_AS_OF = '2026-07-31';
export const ZAR_TO_FOREIGN: Record<ForeignCurrency, number> = {
  EUR: 0.049,
  GBP: 0.042,
  USD: 0.053,
};
export function convertRand(rand: number, currency: ForeignCurrency): number {
  return rand * ZAR_TO_FOREIGN[currency];
}
// Whole-unit rounding, matching formatRand's own whole-rand convention — cents-level precision on
// an already-indicative conversion would be false accuracy.
export function formatForeign(rand: number, currency: ForeignCurrency): string {
  return CURRENCY_SYMBOLS[currency] + Math.round(convertRand(rand, currency)).toLocaleString('en-US');
}

// --- Rates page display model -----------------------------------------------------------------
// One rate matrix (RatesTable.astro), not three marketing cards. The three cards it replaces
// repeated the same day-of-week/group-size rules verbatim and each led with the single cheapest
// cell in the matrix ("From R2,640 per person sharing"), which anchored on a price most bookings
// never pay.
//
// The matrix is deliberately TRANSPOSED relative to the operator's source spreadsheet: rate
// types are rows and seasons are columns, so it is three columns wide instead of four and fits a
// 380px phone without sideways scrolling. Same numbers, rotated.
//
// Every figure is read from the constants above — never re-typed as a literal — so the displayed
// rate and the amount lib/pricing.ts actually charges cannot drift apart.
export interface RateRow {
  label: string; // "Catered"
  qualifier: string; // "any start day"
  // Both fields hold the PER-NIGHT rand rate — the underlying model, kept here because that is
  // the genuine unit season/day-of-week rules vary by. RatesTable.astro converts through
  // ppSharingRand() before ever putting a number on the page; nothing may display `high`/`low`
  // un-multiplied.
  high: number; // rand per night, high season
  low: number; // rand per night, low season
}

export const rateRows: RateRow[] = [
  {
    label: 'Catered',
    qualifier: 'any start day',
    high: CATERED_PP_NIGHT.high,
    low: CATERED_PP_NIGHT.low,
  },
  {
    label: 'Self-catered',
    qualifier: 'Thursday & Friday start',
    high: UNCATERED_PP_NIGHT.weekend.high,
    low: UNCATERED_PP_NIGHT.weekend.low,
  },
  {
    label: 'Self-catered',
    qualifier: 'Saturday to Wednesday start',
    high: UNCATERED_PP_NIGHT.week.high,
    low: UNCATERED_PP_NIGHT.week.low,
  },
];

// Season column headings for the matrix.
export const SEASON_HIGH_LABEL = 'High season';
export const SEASON_HIGH_DATES = '1 Apr to 31 Oct, 15 Dec to 15 Jan';
export const SEASON_LOW_LABEL = 'Low season';

// The two booking rules, stated ONCE (the retired cards repeated them three times). These are
// availability rules, deliberately kept separate from the price matrix above: what a trip costs
// and which days you may book it on are two independent axes, and merging them was the main
// source of confusion on the old page.
export interface BookingRule {
  days: string;
  title: string;
  body: string;
}

export const bookingRules: BookingRule[] = [
  {
    days: 'Wednesday or Thursday',
    title: 'Exclusive',
    body: `A private buyout for a group of exactly ${EXCLUSIVE_SIZE}. No other booking joins your dates.`,
  },
  {
    days: 'Friday to Tuesday',
    title: 'Join a shared group',
    body: `The first booking opens the date and sets its catering: ${SHARED_OPEN_MIN_CATERED} or more for catered, ${SHARED_OPEN_MIN_UNCATERED} or more for self-catered.`,
  },
];

// What the price includes / excludes. Single source shared by the Rates page and the homepage
// so the two can never drift.
export const inclusions = [
  'A guided walk, with each safari lodge reserved for your group overnight',
  'Two experienced trail guides throughout',
  'Daily transport of your baggage and provisions between lodges',
  'Lodge staff for cleaning, kitchen prep and the barbeque',
  'Free bedding, ice, wood and WiFi at every lodge',
  'All reserve conservation levies',
];
export const exclusions = [
  'Food and beverages on self-catered bookings (choose the catered option to include meals)',
  "Travel to and from Temminck's Lodge",
  'Personal travel insurance',
];
