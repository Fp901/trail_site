// Public rates (display) — Booking v3.1 (Workstream B: commercial-model conformance). Pricing
// is now per-person-per-night for EVERY departure — the earlier flat-group-rate model is
// retired. Two departure types, by day of week:
//   Exclusive buyout — Wednesday or Thursday only. EXACTLY 8 guests (min = max = the universal
//     safety/logistics cap of 2 guides : 8 walkers), either self-catered or catered, priced pp.
//   Shared/flexible — Sunday, Monday, Tuesday, Friday or Saturday. The FIRST active booking on
//     a date must be at least 4 people; its catering choice (catered or uncatered) locks the
//     day's type. Further bookings on that date must be at least 2 people and match the locked
//     catering, up to 8 seats total.
// Every rate additionally varies by season (high/low, ±20%) and, for self-catered only, by
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

// --- Group formation -------------------------------------------------------------------------
export const EXCLUSIVE_SIZE = 8; // Wed/Thu buyout: exactly this many (min = max)
export const SHARED_OPEN_MIN = 4; // first booking on a flexible date
export const SHARED_TOPUP_MIN = 2; // later bookings on an already-open flexible date

// --- Booking windows (rolling from today, per catering) --------------------------------------
// Replaces the earlier single fixed BOOKING_OPEN_DATE: catered departures can be booked much
// further ahead, matching the longer international trip-planning cycle.
export const CATERED_WINDOW_MONTHS = 18;
export const UNCATERED_WINDOW_MONTHS = 8;

// --- Last-minute discount (self-catered only) -------------------------------------------------
// "3 to 1 weeks before, not the last week" = more than 7 days out, up to 21 days out.
export const LAST_MINUTE_MIN_DAYS = 8;
export const LAST_MINUTE_MAX_DAYS = 21;
export const LAST_MINUTE_DISCOUNT = 0.22;

// Format ZAR with comma thousands separators ("R1,500").
export function formatRand(amount: number): string {
  return 'R' + Math.round(amount).toLocaleString('en-US');
}

// Display cards for the Rates page (RatesTable.astro). Every card is now priced pp — there is
// no flat-group product left. Headline uses the LOW-season "from" figure (the lowest genuine
// entry price); supporting notes carry the season/day variation and group-size rules.
export interface RateCard {
  id: 'exclusive' | 'shared-uncatered' | 'shared-catered';
  label: string;
  bestFor: string; // short quiet badge
  heroPrice: string; // the big "from R___ pp/night" number
  heroUnit: string;
  smallPrint?: string; // tertiary detail (e.g. the full-trail pp total)
  subline: string;
  notes: string[];
}

const uncateredWeekLow = UNCATERED_PP_NIGHT.week.low;
const uncateredWeekendHigh = UNCATERED_PP_NIGHT.weekend.high;
const cateredLow = CATERED_PP_NIGHT.low;

export const rates: RateCard[] = [
  {
    id: 'shared-uncatered',
    label: 'Shared, self-catered',
    bestFor: 'Best for 2 to 7 walkers',
    heroPrice: `From ${formatRand(uncateredWeekLow)} pp/night`,
    heroUnit: '',
    smallPrint: `Up to ${formatRand(uncateredWeekendHigh)} pp/night on a Thursday/Friday start in high season`,
    subline: 'Join or open a shared departure. You bring and prepare your own food.',
    notes: [
      'Sunday, Monday, Tuesday, Friday or Saturday start. The first booking on a date needs 4 or more people; later bookings top up in 2s, up to 8 in total.',
      'Lower midweek, higher on a Thursday or Friday start; lower again outside the high season.',
    ],
  },
  {
    id: 'shared-catered',
    label: 'Shared, catered',
    bestFor: 'Best for the international market',
    heroPrice: `From ${formatRand(cateredLow)} pp/night`,
    heroUnit: '',
    subline: 'Join or open a shared departure, fully catered. One rate, any start day.',
    notes: [
      'Sunday, Monday, Tuesday, Friday or Saturday start. The first booking on a date needs 4 or more people; later bookings top up in 2s, up to 8 in total.',
      'Lower outside the high season; no day-of-week premium.',
    ],
  },
  {
    id: 'exclusive',
    label: 'Private buyout',
    bestFor: 'The whole trail to yourselves',
    heroPrice: `From ${formatRand(uncateredWeekLow)} pp/night`,
    heroUnit: '',
    smallPrint: 'Self-catered or catered, priced the same as the shared rate above',
    subline: 'Exactly 8 places, Wednesday or Thursday only. No other booking joins your date.',
    notes: [
      'Self-catered or catered, your choice.',
      'Priced per person per night, same rates as the shared departures.',
    ],
  },
];

// What the price includes / excludes. Single source shared by the Rates page and the homepage
// so the two can never drift.
export const inclusions = [
  'A guided walk with your group, with exclusive use of each safari lodge overnight',
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
