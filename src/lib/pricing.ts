// Server-side price authority (Part 9.1 / 11.4) — Booking v3.1 (Workstream B). Works in CENTS.
// The browser never sends a price; the server always recomputes from the constants in
// data/rates.ts (shared with the display layer so they can never drift). The operator is NOT
// VAT-registered, so no VAT is charged or shown anywhere; totalCents is the full amount paid.
//
// Two departure types, both priced PER PERSON PER NIGHT now (the flat-group-rate model is
// retired):
//   exclusive — Wednesday or Thursday only; EXACTLY 8 guests (min = max); either catering.
//   shared    — every other day; the first active booking on a date needs >= 4 people and its
//               catering choice locks the day; later bookings need >= 2 and must match, up to
//               8 seats total per date. (The "does this catering match the date's locked type"
//               check requires a DB lookup and lives in actions/index.ts + the DB trigger, not
//               here — this module is pure price/date math with no I/O.)
// Rate also varies by season (high/low, ±20%) and, for self-catered only, by weekday vs the
// Thursday/Friday "weekend" premium. A last-minute discount (self-catered only, 8-21 days out)
// applies on top.
import {
  NIGHTS,
  UNCATERED_PP_NIGHT,
  CATERED_PP_NIGHT,
  CATERED_WINDOW_MONTHS,
  UNCATERED_WINDOW_MONTHS,
  LAST_MINUTE_MIN_DAYS,
  LAST_MINUTE_MAX_DAYS,
  LAST_MINUTE_DISCOUNT,
  BOOKING_OPEN_DATE,
} from '../data/rates';

export const CURRENCY = 'ZAR';
export type BookingType = 'exclusive' | 'shared';
export type Catering = 'catered' | 'uncatered';

const toCents = (rand: number) => Math.round(rand * 100);

// Payment model (unchanged by Workstream B): full payment is due 45 days before arrival,
// non-refundable thereafter. A booking made 45+ days before its start date pays a deposit now
// and the balance is collected (via an emailed link) at the 45-day mark; inside 45 days it pays
// in full up front.
export const SPLIT_THRESHOLD_DAYS = 45;
export const DEPOSIT_FRACTION = 0.5;
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

// ISO date + n calendar months (not an approximation by days — used for the 18mo/8mo rolling
// booking-window ceilings, where a day-count approximation would drift).
export function addMonthsIso(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// The earliest start date the online system accepts: the later of the 7-day lead time and the
// site-wide soft-launch gate (BOOKING_OPEN_DATE). Earlier dates are family-and-friends-by-enquiry
// only (BetaBanner). This is independent of the per-catering rolling windows below.
export function earliestBookableDate(now: Date = new Date()): string {
  const lead = addDaysIso(todaySast(now), 7);
  return lead > BOOKING_OPEN_DATE ? lead : BOOKING_OPEN_DATE;
}

// Anchor for the rolling per-catering windows below: the later of today and the soft-launch
// gate (BOOKING_OPEN_DATE), mirroring earliestBookableDate's own "later of the two" rule. Rolling
// from today alone would, before launch, shrink the window every day the launch is still ahead
// (a self-catered window that's a full 8 months on launch day would otherwise already be eaten
// into by however long the wait has been). Anchoring here means the window opens at its FULL
// length the moment booking opens; after launch this is simply "today", identical to before.
function windowAnchor(now: Date = new Date()): string {
  const today = todaySast(now);
  return today > BOOKING_OPEN_DATE ? today : BOOKING_OPEN_DATE;
}

// The latest start date bookable for a given catering choice — a rolling window anchored to
// windowAnchor(), not a fixed calendar date. Catered departures book much further ahead than
// self-catered, matching the longer international trip-planning cycle. Shared by the
// createCheckout guard, the widget frontmatter and the calendar so they can never disagree.
export function latestBookableDate(catering: Catering, now: Date = new Date()): string {
  const months = catering === 'catered' ? CATERED_WINDOW_MONTHS : UNCATERED_WINDOW_MONTHS;
  return addMonthsIso(windowAnchor(now), months);
}

// ISO day-of-week, Monday = 1 ... Sunday = 7 (matches Postgres isodow, used the same way in the
// DB trigger).
function isoDow(isoDate: string): number {
  const jsDow = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday .. 6 = Saturday
  return jsDow === 0 ? 7 : jsDow;
}

// Wednesday or Thursday — the exclusive-buyout days (exactly 8 guests, no other booking joins).
export function isExclusiveDay(isoDate: string): boolean {
  const d = isoDow(isoDate);
  return d === 3 || d === 4;
}

// Every other day — shared/flexible departures (open at 4+, top up in 2s, up to 8).
export function isSharedDay(isoDate: string): boolean {
  return !isExclusiveDay(isoDate);
}

// Thursday or Friday — the self-catered "weekend" pricing premium. Catered has no day-of-week
// premium. (Thursday is deliberately both an exclusive-buyout day AND a weekend-pricing day —
// those are two independent rules from the pricing brief, not a contradiction.)
export function isWeekendPricingDay(isoDate: string): boolean {
  const d = isoDow(isoDate);
  return d === 4 || d === 5;
}

// High season: 1 April - 31 October, and 15 December - 15 January (wraps the year boundary).
export function isHighSeason(isoDate: string): boolean {
  const [, mStr, dStr] = isoDate.split('-');
  const mmdd = Number(mStr) * 100 + Number(dStr);
  if (mmdd >= 401 && mmdd <= 1031) return true; // Apr 1 – Oct 31
  if (mmdd >= 1215 || mmdd <= 115) return true; // Dec 15 – Jan 15
  return false;
}

// The per-person-per-night rate (cents) for a given catering choice and start date.
export function ppNightCentsFor(catering: Catering, startDate: string): number {
  const season = isHighSeason(startDate) ? 'high' : 'low';
  if (catering === 'catered') return toCents(CATERED_PP_NIGHT[season]);
  const bucket = isWeekendPricingDay(startDate) ? 'weekend' : 'week';
  return toCents(UNCATERED_PP_NIGHT[bucket][season]);
}

// Is a self-catered booking for this start date eligible for the last-minute discount (8 to 21
// days out)? Catered is never eligible.
export function isLastMinuteEligible(catering: Catering, startDate: string, now: Date = new Date()): boolean {
  if (catering !== 'uncatered') return false;
  const gap = daysUntil(startDate, now);
  return gap >= LAST_MINUTE_MIN_DAYS && gap <= LAST_MINUTE_MAX_DAYS;
}

export type PaymentPlan = 'full' | 'deposit_balance';

export interface Quote {
  bookingType: BookingType;
  catering: Catering;
  groupSize: number;
  totalCents: number; // the full amount the customer owes — no VAT is charged
  depositPercent: number;
  amountDueCents: number; // the FIRST charge: deposit (deposit_balance) or full total (full)
  currency: string;
  ppNightCents: number; // per person per night, before the last-minute discount
  ppTotalCents: number; // per person for the whole trail, AFTER the last-minute discount
  lastMinuteDiscountApplied: boolean;
  // Split payment. When no startDate is supplied (display contexts) the plan defaults to 'full'.
  paymentPlan: PaymentPlan;
  depositCents: number; // deposit portion of total (== totalCents when plan is 'full')
  balanceCents: number; // balance portion (0 when plan is 'full'); deposit + balance == total
  balanceDueDate: string | null; // ISO date, BALANCE_LEAD_DAYS before startDate, when split
}

// SERVER price authority. totalCents = groupSize × NIGHTS × ppNight(catering, startDate,
// season, day-of-week), less the last-minute discount when eligible. bookingType does not
// affect price directly (an exclusive buyout is simply a shared-rate booking of exactly 8) —
// it only affects which days/group-sizes are valid, enforced in actions/index.ts + the DB
// trigger, not here.
// Pass `startDate` to price the correct season/day and to apply the split-payment rule (gap >=
// SPLIT_THRESHOLD_DAYS → 50% deposit now, 50% balance later; inside the window → pay in full).
// Display contexts with no startDate get a representative high-season, week-rate estimate.
export function computeQuote(input: {
  bookingType: BookingType;
  catering: Catering;
  groupSize: number;
  startDate?: string;
  now?: Date;
}): Quote {
  const now = input.now ?? new Date();
  const catering = input.catering;

  const ppNightCents = input.startDate
    ? ppNightCentsFor(catering, input.startDate)
    : toCents(catering === 'catered' ? CATERED_PP_NIGHT.high : UNCATERED_PP_NIGHT.week.high);

  let ppTotalCents = ppNightCents * NIGHTS;
  const lastMinuteDiscountApplied = !!input.startDate && isLastMinuteEligible(catering, input.startDate, now);
  if (lastMinuteDiscountApplied) {
    ppTotalCents = Math.round(ppTotalCents * (1 - LAST_MINUTE_DISCOUNT));
  }

  const totalCents = ppTotalCents * input.groupSize;

  // Split decision. Deposit is rounded; balance is the remainder so the two always reconcile
  // to totalCents exactly.
  const gapDays = input.startDate ? daysUntil(input.startDate, now) : 0;
  const isSplit = !!input.startDate && gapDays >= SPLIT_THRESHOLD_DAYS;
  const depositCents = isSplit ? Math.round(totalCents * DEPOSIT_FRACTION) : totalCents;
  const balanceCents = isSplit ? totalCents - depositCents : 0;
  const paymentPlan: PaymentPlan = isSplit ? 'deposit_balance' : 'full';
  const balanceDueDate = isSplit && input.startDate ? addDaysIso(input.startDate, -BALANCE_LEAD_DAYS) : null;

  return {
    bookingType: input.bookingType,
    catering,
    groupSize: input.groupSize,
    totalCents,
    depositPercent: totalCents > 0 ? Math.round((depositCents / totalCents) * 100) : 0,
    amountDueCents: depositCents,
    currency: CURRENCY,
    ppNightCents,
    ppTotalCents,
    lastMinuteDiscountApplied,
    paymentPlan,
    depositCents,
    balanceCents,
    balanceDueDate,
  };
}
