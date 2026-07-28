// Public rates (display) — Booking v2.2. The operator is NOT VAT-registered, so no VAT is
// charged or shown anywhere; prices below are the full amount the customer pays.
// Pricing axis is CATERED vs UNCATERED. Two products, split by day of week:
//   1. Private (exclusive) trail: Tuesday to Saturday only. FIXED per-group rate, either
//      self-catered (up to 10 guests) or catered (up to 8 guests) — NOT per person. Group
//      size does not change the price.
//   2. Shared/mixed departures: Sunday or Monday only, catered-only, priced PER PERSON per
//      night; each booking 2 to 8 people; 8 places total across bookings, per date.
// The server-side price authority (lib/pricing.ts) reuses these constants — display and the
// real charged amount can never drift. Never expose owner splits (Part 12).

export const NIGHTS = 3; // Day 1 arrival to Day 4 departure

// --- Private (exclusive) trail -----------------------------------------------------------
// Both rates are FLAT per-group — group size does not change the price.
export const GROUP_RATE_UNCATERED = 54000; // self-catered, up to 10 guests
export const GROUP_RATE_CATERED = 105000; // fully catered, up to 8 guests (lower group cap)
export const UNCATERED_MAX_PEOPLE = 10; // self-catered private group cap
export const CATERED_MAX_PEOPLE = 8; // catered private group cap (also the shared/mixed cap)

// --- Shared/mixed departures (Sunday or Monday) -------------------------------------------
export const SHARED_PP_NIGHT = 5000; // per person per night, catered
export const SHARED_MIN_PEOPLE = 2; // minimum people per shared booking
export const SHARED_MAX_CAPACITY = 8; // total places on a shared date, across all bookings

// --- Online booking window (go-live policy) ------------------------------------------------
// BOOKING_OPEN_DATE is the ONLY date that gates the calendar and the server guard: online
// bookings are accepted for start dates on/after it. Earlier dates are family-and-friends by
// enquiry/WhatsApp. (The beta phase has no fixed end date.)
export const BOOKING_OPEN_DATE = '2027-01-15';
export const BOOKING_OPEN_DISPLAY = '15 January 2027';

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

export const rates: RateCard[] = [
  {
    id: 'exclusive-uncatered',
    label: 'Private trail, self-catered',
    bestFor: 'Best for groups of 6 or more',
    heroPrice: formatRand(GROUP_RATE_UNCATERED),
    heroUnit: 'per group',
    subline: 'Flat rate: all 10 beds and the whole trail are yours, however many walk.',
    notes: [
      'You bring and prepare your own food, with lodge staff for cleaning and the barbeque.',
      'Departs Tuesday to Saturday.',
    ],
  },
  {
    id: 'exclusive-catered',
    label: 'Private trail, catered',
    bestFor: 'Best for private catered trips',
    heroPrice: formatRand(GROUP_RATE_CATERED),
    heroUnit: 'per group',
    subline: 'Flat rate: the whole trail is yours, up to 8 guests, however many walk.',
    notes: [
      'All meals included, prepared by lodge staff.',
      'Departs Tuesday to Saturday.',
    ],
  },
  {
    id: 'shared',
    label: 'Shared departure',
    bestFor: 'Best for 2 to 5 walkers',
    heroPrice: formatRand(SHARED_PP_NIGHT * NIGHTS),
    heroUnit: 'per person for the trail',
    smallPrint: `${formatRand(SHARED_PP_NIGHT)} pp/night`,
    subline: 'The only per-person option. Join other walkers, up to 8 in total.',
    notes: [
      'Sundays and Mondays only, all meals included.',
      `Bookings of ${SHARED_MIN_PEOPLE} to ${SHARED_MAX_CAPACITY} people.`,
    ],
  },
];

// What the private group rate includes / excludes. Single source shared by the Rates page and
// the homepage so the two can never drift.
export const inclusions = [
  'Private guided walk for your group only, with exclusive use of each safari lodge overnight',
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
