// Server-side price authority (Part 9.1 / 11.4) — Booking v2. Works in CENTS. The browser never
// sends a price; the server always recomputes from the constants in data/rates.ts (shared with
// the display layer so they can never drift). All prices are VAT-inclusive.
//
// Two products:
//   exclusive — private group; FIXED flat group rate (self-catered or catered) — group size
//               does not change the price.
//   shared    — Monday-only shared departure; catered only; priced PER PERSON per night.
import {
  VAT_RATE,
  NIGHTS,
  GROUP_RATE_UNCATERED,
  GROUP_RATE_CATERED,
  SHARED_PP_NIGHT,
  BOOKING_OPEN_DATE,
} from '../data/rates';

export const CURRENCY = 'ZAR';
export type BookingType = 'exclusive' | 'shared';
export type Catering = 'catered' | 'uncatered';

const toCents = (rand: number) => Math.round(rand * 100);

// Split-payment rule (money policy). A booking made this many days (or more) before its start date
// pays a deposit now and the balance later; inside this window it pays in full up front.
export const SPLIT_THRESHOLD_DAYS = 30;
// Deposit fraction for split bookings (50% deposit, 50% balance).
export const DEPOSIT_FRACTION = 0.5;
// The balance link is sent this many days before start_date (anchored to start_date).
export const BALANCE_LEAD_DAYS = 45;

const MS_PER_DAY = 86_400_000;

// Today as an ISO date in SAST (UTC+2, no DST).
export function todaySast(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

// Whole days from today (SAST date) to `startDate` (ISO YYYY-MM-DD).
export function daysUntil(startDate: string, now: Date = new Date()): number {
  const today = todaySast(now);
  return Math.round(
    (Date.parse(`${startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / MS_PER_DAY,
  );
}

// ISO date + n days.
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The earliest start date the ONLINE system accepts: the later of the 7-day lead time and the
// go-live opening date (BOOKING_OPEN_DATE). Shared by the createCheckout guard, the widget
// frontmatter and the calendar, so they can never disagree. Earlier dates are enquiry-only.
export function earliestBookableDate(now: Date = new Date()): string {
  const lead = addDaysIso(todaySast(now), 7);
  return lead > BOOKING_OPEN_DATE ? lead : BOOKING_OPEN_DATE;
}

// Is the ISO date a Monday? Mondays are reserved for shared departures (ISO dow 1). Anchored to
// UTC midnight, matching how date-only strings are handled everywhere else in the codebase.
export function isMonday(isoDate: string): boolean {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay() === 1;
}

export type PaymentPlan = 'full' | 'deposit_balance';

export interface Quote {
  bookingType: BookingType;
  catering: Catering;
  groupSize: number;
  netCents: number;
  vatCents: number;
  totalCents: number; // VAT-inclusive — the amount the customer owes
  depositPercent: number;
  amountDueCents: number; // the FIRST charge: deposit (deposit_balance) or full total (full)
  currency: string;
  // Shared departures only: the per-person figures used for display (0 for exclusive).
  ppNightCents: number;
  ppTotalCents: number;
  // Split payment. When no startDate is supplied (display contexts) the plan defaults to 'full'.
  paymentPlan: PaymentPlan;
  depositCents: number; // deposit portion of total (== totalCents when plan is 'full')
  balanceCents: number; // balance portion (0 when plan is 'full'); deposit + balance == total
}

// SERVER price authority.
//   exclusive: FIXED flat group rate — catered ? GROUP_RATE_CATERED : GROUP_RATE_UNCATERED.
//              Group size does NOT change the price.
//   shared:    groupSize * NIGHTS * SHARED_PP_NIGHT (catering is always 'catered', per person)
// Pass `startDate` to apply the split-payment rule (gap >= SPLIT_THRESHOLD_DAYS → 50% deposit
// now, 50% balance later; inside the window → pay in full).
export function computeQuote(input: {
  bookingType: BookingType;
  catering: Catering;
  groupSize: number;
  startDate?: string;
  now?: Date;
}): Quote {
  const now = input.now ?? new Date();
  const catering: Catering = input.bookingType === 'shared' ? 'catered' : input.catering;

  let totalCents: number;
  let ppNightCents = 0;
  let ppTotalCents = 0;
  if (input.bookingType === 'shared') {
    ppNightCents = toCents(SHARED_PP_NIGHT);
    ppTotalCents = ppNightCents * NIGHTS;
    totalCents = ppTotalCents * input.groupSize;
  } else {
    totalCents = toCents(catering === 'catered' ? GROUP_RATE_CATERED : GROUP_RATE_UNCATERED);
  }

  const vatCents = totalCents - Math.round(totalCents / (1 + VAT_RATE));
  const netCents = totalCents - vatCents;

  // Split decision. Deposit is rounded; balance is the remainder so the two always reconcile
  // to totalCents exactly.
  const gapDays = input.startDate ? daysUntil(input.startDate, now) : 0;
  const isSplit = !!input.startDate && gapDays >= SPLIT_THRESHOLD_DAYS;
  const depositCents = isSplit ? Math.round(totalCents * DEPOSIT_FRACTION) : totalCents;
  const balanceCents = isSplit ? totalCents - depositCents : 0;
  const paymentPlan: PaymentPlan = isSplit ? 'deposit_balance' : 'full';

  return {
    bookingType: input.bookingType,
    catering,
    groupSize: input.groupSize,
    netCents,
    vatCents,
    totalCents,
    depositPercent: Math.round((depositCents / totalCents) * 100),
    amountDueCents: depositCents,
    currency: CURRENCY,
    ppNightCents,
    ppTotalCents,
    paymentPlan,
    depositCents,
    balanceCents,
  };
}
