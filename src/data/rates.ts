// Public rates (display) — Booking v2. The operator is NOT VAT-registered, so no VAT is
// charged or shown anywhere; prices below are the full amount the customer pays.
// Pricing axis is CATERED vs UNCATERED (the old local/foreign residency split is removed).
// Two products:
//   1. Private (exclusive) trail: FIXED per-group rate, either self-catered or catered —
//      NOT per person. Group size does not change the price.
//   2. Shared Monday departures: one shared, catered-only slot every Monday; priced PER
//      PERSON per night; each booking 2 to 8 people; 8 places total across bookings.
// The server-side price authority (lib/pricing.ts) reuses these constants — display and the
// real charged amount can never drift. Never expose owner splits (Part 12).

export const NIGHTS = 3; // Day 1 arrival to Day 4 departure

// --- Private (exclusive) trail -----------------------------------------------------------
// Both rates are FLAT per-group — group size does not change the price. Recomputed from the
// former VAT-inclusive figures (the operator is not VAT-registered, so the 15% VAT component
// was removed: new price = old VAT-inclusive price / 1.15, rounded to the nearest Rand).
export const GROUP_RATE_UNCATERED = 52174; // self-catered (was R60,000 incl. VAT)
// The catered rate is fixed, derived once from a 10-person basis at the (now VAT-removed)
// per-person-per-night catering cost, then locked in as a flat group price — it does NOT
// scale with the actual group size. CATERING_PP_NIGHT_BASIS exists only to document and
// compute that derivation; it is never applied per-person at checkout.
const CATERING_PP_NIGHT_BASIS = 2000; // was R2,300 incl. VAT
const CATERING_BASIS_PEOPLE = 10;
export const GROUP_RATE_CATERED =
  GROUP_RATE_UNCATERED + CATERING_BASIS_PEOPLE * NIGHTS * CATERING_PP_NIGHT_BASIS; // 112,174

// --- Shared Monday departures ------------------------------------------------------------
// PLACEHOLDER rate pending operator confirmation — set from industry norms for fully catered
// guided walking safaris, then VAT removed the same way as above. Edit this ONE constant to
// change display + charged amount together.
export const SHARED_PP_NIGHT = 3435; // per person per night, catered (was R3,950 incl. VAT)
export const SHARED_MIN_PEOPLE = 2; // minimum people per shared booking
export const SHARED_MAX_CAPACITY = 8; // total places on a shared Monday, across all bookings

// --- Online booking window (go-live policy) ------------------------------------------------
// BOOKING_OPEN_DATE is the ONLY date that gates the calendar and the server guard: online
// bookings are accepted for start dates on/after it. BETA_END_DATE gates nothing — it appears
// only in the beta banner copy. Earlier dates are family-and-friends by enquiry/WhatsApp.
export const BOOKING_OPEN_DATE = '2027-01-15';
export const BOOKING_OPEN_DISPLAY = '15 January 2027';
export const BETA_END_DATE = '2027-07-15';
export const BETA_END_DISPLAY = '15 July 2027';

// Format ZAR with comma thousands separators ("R60,000").
export function formatRand(amount: number): string {
  return 'R' + amount.toLocaleString('en-US');
}

// Display cards for the Rates page (RatesTable.astro). Three purchasable options, equal
// visual weight. Per-person figures are ONLY ever attached to the shared option — the two
// private options are flat group rates and must never show a divided/per-person figure.
export interface RateCard {
  id: 'exclusive-uncatered' | 'exclusive-catered' | 'shared';
  label: string;
  bestFor: string; // short quiet badge, e.g. "Best for groups of 6 or more"
  heroPrice: string; // the big number
  heroUnit: string; // qualifier next to the price, e.g. "per group"
  smallPrint?: string; // tertiary detail shown in small print (shared card's pp/night figure)
  subline: string; // the sentence directly beneath the price
  notes: string[]; // supporting bullet lines
}

// Wording matches the brief's sub-line verbatim, with the em-dash swapped for a colon per the
// site's standing no-em-dash copy rule.
const FLAT_RATE_SUBLINE =
  'Flat rate: all 10 beds and the whole trail are yours, however many walk.';

export const rates: RateCard[] = [
  {
    id: 'exclusive-uncatered',
    label: 'Private trail, self-catered',
    bestFor: 'Best for groups of 6 or more',
    heroPrice: formatRand(GROUP_RATE_UNCATERED),
    heroUnit: 'per group',
    subline: FLAT_RATE_SUBLINE,
    notes: [
      'You bring and prepare your own food, with camp assistants for cleaning and the barbeque.',
      'Departs any day except Monday.',
    ],
  },
  {
    id: 'exclusive-catered',
    label: 'Private trail, catered',
    bestFor: 'Best for private catered trips',
    heroPrice: formatRand(GROUP_RATE_CATERED),
    heroUnit: 'per group',
    subline: FLAT_RATE_SUBLINE,
    notes: [
      'All meals included, prepared by camp staff.',
      'Departs any day except Monday.',
    ],
  },
  {
    id: 'shared',
    label: 'Shared Monday departure',
    bestFor: 'Best for 2 to 5 walkers',
    heroPrice: formatRand(SHARED_PP_NIGHT * NIGHTS),
    heroUnit: 'per person for the trail',
    smallPrint: `${formatRand(SHARED_PP_NIGHT)} pp/night`,
    subline: 'The only per-person option. Join other walkers, up to 8 in total.',
    notes: [
      'Mondays only, all meals included.',
      `Bookings of ${SHARED_MIN_PEOPLE} to ${SHARED_MAX_CAPACITY} people.`,
    ],
  },
];

// What the private group rate includes / excludes. Single source shared by the Rates page and
// the homepage so the two can never drift.
export const inclusions = [
  'Private guided walk for your group only, with exclusive use of each safari lodge overnight (up to 10 guests, with two more by special arrangement)',
  'Two qualified, armed trail guides throughout',
  'Daily transport of your baggage and provisions between camps',
  'Camp assistants for cleaning, kitchen prep and the barbeque',
  'Free ice, wood and WiFi at every lodge',
  'All reserve conservation levies',
];
export const exclusions = [
  'Food and beverages on self-catered bookings (choose the catered option to include meals)',
  'Travel to and from Rotavi Lodge',
  'Personal travel insurance',
];
