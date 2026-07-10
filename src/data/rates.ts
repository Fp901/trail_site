// Public rates (display) — Booking v2. Prices are quoted VAT-INCLUSIVE.
// Pricing axis is CATERED vs UNCATERED (the old local/foreign residency split is removed).
// Two products:
//   1. Private (exclusive) trail: flat group rate, self-catered; optional catering added
//      per person per night.
//   2. Shared Monday departures: one shared, catered-only slot every Monday; priced per
//      person per night; each booking 2 to 8 people; 8 places total across bookings.
// The server-side price authority (lib/pricing.ts) reuses these constants — display and the
// real charged amount can never drift. Never expose owner splits (Part 12).

export const VAT_RATE = 0.15;
export const NIGHTS = 3; // Day 1 arrival to Day 4 departure

// --- Private (exclusive) trail -----------------------------------------------------------
// Flat per-group rate, VAT-inclusive, self-catered (operator-confirmed).
export const GROUP_RATE_UNCATERED = 60000;
// Catered option: added PER PERSON PER NIGHT on top of the group rate (operator-confirmed).
export const CATERING_PP_NIGHT = 2300;

// --- Shared Monday departures ------------------------------------------------------------
// PLACEHOLDER rate pending operator confirmation — set from industry norms for fully catered
// guided walking safaris. Edit this ONE constant to change display + charged amount together.
export const SHARED_PP_NIGHT = 3950; // per person per night, VAT-inclusive, catered
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

// VAT portion contained within a VAT-inclusive amount.
export const vatPortion = (inclTotal: number) =>
  Math.round(inclTotal - inclTotal / (1 + VAT_RATE));

// Format ZAR with comma thousands separators ("R60,000").
export function formatRand(amount: number): string {
  return 'R' + amount.toLocaleString('en-US');
}

// Display cards for the Rates page (RatesTable.astro).
export interface RateCard {
  id: 'exclusive' | 'shared';
  label: string;
  headline: string; // the big price line
  headlineNote: string; // qualifier under the price
  notes: string[]; // supporting bullet lines
}

export const rates: RateCard[] = [
  {
    id: 'exclusive',
    label: 'Private trail (exclusive use)',
    headline: formatRand(GROUP_RATE_UNCATERED),
    headlineNote: 'per group, self-catered, incl. VAT',
    notes: [
      `Flat rate for your private group of up to 10 guests (optional two extra by special arrangement). Includes all conservation levies.`,
      `Catered option: add ${formatRand(CATERING_PP_NIGHT)} per person per night (${NIGHTS} nights). Example: a catered group of 4 pays ${formatRand(GROUP_RATE_UNCATERED + 4 * NIGHTS * CATERING_PP_NIGHT)} in total.`,
      'Departs any day except Monday.',
    ],
  },
  {
    id: 'shared',
    label: 'Shared Monday departures',
    headline: `${formatRand(SHARED_PP_NIGHT)} pp/night`,
    headlineNote: `${formatRand(SHARED_PP_NIGHT * NIGHTS)} per person for the ${NIGHTS}-night trail, catered, incl. VAT`,
    notes: [
      `One shared departure every Monday: your booking of ${SHARED_MIN_PEOPLE} to ${SHARED_MAX_CAPACITY} people joins other small groups, up to ${SHARED_MAX_CAPACITY} walkers in total.`,
      'Fully catered only. Includes all conservation levies.',
    ],
  },
];

// What the private group rate includes / excludes. Single source shared by the Rates page and
// the homepage so the two can never drift.
export const inclusions = [
  'Private guided walk for your group only, with exclusive use of each safari lodge overnight (up to 10 guests; optional two extra by special arrangement)',
  'Two qualified, armed trail guides throughout',
  'Daily transport of your baggage and provisions between camps',
  'Camp assistants for cleaning, kitchen prep and the barbeque',
  'Free ice, wood and WiFi at every lodge',
  'All reserve conservation levies',
  'VAT at 15%',
];
export const exclusions = [
  'Food and beverages on self-catered bookings (choose the catered option to include meals)',
  'Travel to and from Rotavi Lodge',
  'Personal travel insurance',
];
