// Public rates (display) — Part 8.5 + 2026 brief. Prices are quoted VAT-INCLUSIVE per group.
// SA residents: R60,000 incl. VAT. Foreign nationals: +20% = R72,000 incl. VAT.
// The server-side price authority (lib/pricing.ts) reuses these constants. Never expose
// per-person breakdowns or owner splits (Part 12).

export const VAT_RATE = 0.15;
export const TOTAL_LOCAL = 60000; // per group, VAT-inclusive
export const INTERNATIONAL_PREMIUM = 0.2; // +20% for foreign nationals
export const TOTAL_INTERNATIONAL = TOTAL_LOCAL * (1 + INTERNATIONAL_PREMIUM); // 72,000

// Launch offer — the trail launches on this date, with a 50% discount during the Launch Phase.
// LAUNCH_DISCOUNT is the single source of truth for the discount rate: it drives BOTH the display
// here AND the real amount charged server-side (lib/pricing.ts applies it in computeQuote, gated by
// LAUNCH_DISCOUNT_END). Keep the two in sync via this constant.
export const LAUNCH_DATE = '1 October 2026';
export const LAUNCH_OFFER = true;
export const LAUNCH_DISCOUNT = 0.5; // 50% off
export const launchPrice = (total: number) => Math.round(total * (1 - LAUNCH_DISCOUNT));

// VAT portion contained within a VAT-inclusive amount.
export const vatPortion = (inclTotal: number) =>
  Math.round(inclTotal - inclTotal / (1 + VAT_RATE));

export interface RateCard {
  id: 'local' | 'international';
  label: string;
  total: number; // VAT-inclusive headline figure
  note: string;
}

export const rates: RateCard[] = [
  {
    id: 'local',
    label: 'SA Residents',
    total: TOTAL_LOCAL, // R60,000
    note: 'Flat rate for exclusive use by up to 10 guests (optional two extra by special arrangement). Includes all conservation levies.',
  },
  {
    id: 'international',
    label: 'Foreign Nationals',
    total: TOTAL_INTERNATIONAL, // R72,000
    note: 'A 20% premium on the resident rate to cover additional conservation levies. Exclusive use by up to 10 guests (optional two extra by special arrangement). Includes all conservation levies. The Foreign National premium is pro-rated for groups comprising a mix of Foreign Nationals and Residents.',
  },
];

// Format ZAR with comma thousands separators to match the brief ("R60,000").
export function formatRand(amount: number): string {
  return 'R' + amount.toLocaleString('en-US');
}

// What the group rate includes / excludes. Single source of truth shared by the Rates page and the
// homepage "What's included" section so the two can never drift.
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
  'All food and beverages (the trail is self-catered)',
  'Travel to and from Rotavi Lodge',
  'Personal travel insurance',
];
