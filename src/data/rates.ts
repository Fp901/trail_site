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
    headlineNote: 'per group, self-catered',
    notes: [
      `Flat rate for your private group of up to 10 guests (optional two extra by special arrangement), regardless of group size. Includes all conservation levies.`,
      `Catered option: a fixed ${formatRand(GROUP_RATE_CATERED)} per group instead, also regardless of group size.`,
      'Departs any day except Monday.',
    ],
  },
  {
    id: 'shared',
    label: 'Shared Monday departures',
    headline: `${formatRand(SHARED_PP_NIGHT)} pp/night`,
    headlineNote: `${formatRand(SHARED_PP_NIGHT * NIGHTS)} per person for the ${NIGHTS}-night trail, catered`,
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
];
export const exclusions = [
  'Food and beverages on self-catered bookings (choose the catered option to include meals)',
  'Travel to and from Rotavi Lodge',
  'Personal travel insurance',
];
