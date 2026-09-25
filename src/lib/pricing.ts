// Server-side price authority (Part 9.1 / 11.4) — Commercial model v4. Works in CENTS.
// The browser never sends a price; the server always recomputes from the constants in
// data/rates.ts (shared with the display layer so they can never drift).
//
// THE UNIT IS PER PERSON, PER TRIP. data/rates.ts holds one rand figure per product for the whole
// 3-night trail; this module resolves it for a given start date and multiplies by party size.
// Nothing here divides by nights.
//
// Resolution order (policy order, mirrored by the operator's own rate table), per person:
//   base(catering) -> rate year -> season -> SADC discount -> last-minute discount
//   -> floor to the whole rand
// A booking then adds its lines: SADC guests at the SADC rate, everyone else at the international
// rate, plus a single supplement (40% of the international rate, floored) per own room.
// Flooring once, at the end of the per-person chain, is what makes 12,720 x 1.08 = R13,737 rather
// than R13,738, matching the memo's published table, and it always rounds the guest's way.
//
// Availability rules live here too (which start days exist, how far ahead each product books), so
// the widget, the createCheckout guard and the DB triggers all state one rule.
import {
  BASE_PP_TRIP,
  SEASON_DISCOUNT,
  SADC_DISCOUNT,
  RATE_YEAR_MULTIPLIER,
  RATE_BASE_YEAR,
  RATE_LAST_YEAR,
  LAST_MINUTE_MIN_DAYS,
  LAST_MINUTE_MAX_DAYS,
  LAST_MINUTE_DISCOUNT,
  BOOKING_OPEN_DATE,
  INTL_CATERED_WINDOW_MONTHS,
  SADC_WINDOW_MONTHS,
  TAPER_END_DATE,
  TAPER_BLOCKED_ISODOW,
  MAX_GROUP_SIZE,
  MIN_TO_JOIN,
  ROOMS_PER_DEPARTURE,
  SINGLE_SUPPLEMENT_PCT,
  minPartySize,
  minToJoin,
  roomsFor,
  isValidRoomMix,
  defaultSingleRooms,
  roundRateRand,
} from '../data/rates';

export const CURRENCY = 'ZAR';
// Canonical definitions live in lib/db.types.ts (mirrored from the SQL CHECK constraints and
// asserted against them by verify-admin.mjs). Imported for local use AND re-exported, so every
// existing import path keeps working unchanged.
import type { BookingType, Catering, Residency } from './db.types';
export type { BookingType, Catering, Residency };

const toCents = (rand: number) => Math.round(rand * 100);

// Payment model (unchanged by v4): full payment is due 45 days before arrival, non-refundable
// thereafter. A booking made 45+ days before its start date pays a deposit now and the balance is
// collected (via an emailed link) at the 45-day mark; inside 45 days it pays in full up front.
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

// ISO date + n calendar months (not an approximation by days — used for the 24mo/12mo rolling
// booking-window ceilings, where a day-count approximation would drift).
export function addMonthsIso(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// The earliest start date the online system accepts: the later of the 7-day lead time and the
// site-wide gate (BOOKING_OPEN_DATE). Earlier dates are family-and-friends-by-enquiry only.
export function earliestBookableDate(now: Date = new Date()): string {
  const lead = addDaysIso(todaySast(now), 7);
  return lead > BOOKING_OPEN_DATE ? lead : BOOKING_OPEN_DATE;
}

// Anchor for the rolling per-product windows: the later of today and the booking-open gate,
// mirroring earliestBookableDate's own rule. Rolling from today alone would, before launch,
// shrink the window every day the launch is still ahead; anchoring here means each window opens
// at its FULL length the moment booking opens, and behaves as a normal today-rolling window once
// launch has passed.
function windowAnchor(now: Date = new Date()): string {
  const today = todaySast(now);
  return today > BOOKING_OPEN_DATE ? today : BOOKING_OPEN_DATE;
}

// How far ahead a booking may start: 24 months for a catered party with no SADC guests, 12 as soon
// as anyone is counted as SADC, and 12 for self-catered (always 8 SADC guests).
export function windowMonthsFor(catering: Catering, sadcCount: number): number {
  return catering === 'catered' && sadcCount === 0
    ? INTL_CATERED_WINDOW_MONTHS
    : SADC_WINDOW_MONTHS;
}

// The latest start date bookable — rolling, anchored to windowAnchor().
export function latestBookableDate(
  catering: Catering,
  sadcCount: number,
  now: Date = new Date(),
): string {
  return addMonthsIso(windowAnchor(now), windowMonthsFor(catering, sadcCount));
}

// ISO day-of-week, Monday = 1 ... Sunday = 7 (matches Postgres isodow, used the same way in the
// DB trigger).
export function isoDow(isoDate: string): number {
  const jsDow = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday .. 6 = Saturday
  return jsDow === 0 ? 7 : jsDow;
}

// Tapered start: Tuesday, Wednesday and Saturday are not start days up to TAPER_END_DATE, so
// departures run Sunday, Monday, Thursday and Friday. Every weekday opens from 1 January 2029.
export function isTaperBlocked(isoDate: string): boolean {
  if (isoDate > TAPER_END_DATE) return false;
  return (TAPER_BLOCKED_ISODOW as readonly number[]).includes(isoDow(isoDate));
}

// Can the trail start on this date at all (taper aside from holds, blocks and windows)?
export function isAllowedStartDay(isoDate: string): boolean {
  return !isTaperBlocked(isoDate);
}

// The calendar year that prices a booking: the year the trip STARTS in. A date beyond the last
// published year holds the last multiplier (flagged for the operator, not invented).
export function rateYearFor(isoDate: string): number {
  const year = Number(isoDate.slice(0, 4));
  return RATE_YEAR_MULTIPLIER[year] !== undefined ? year : RATE_LAST_YEAR;
}

// High season: 1 April - 31 October, and 15 December - 15 January (wraps the year boundary).
export function isHighSeason(isoDate: string): boolean {
  const [, mStr, dStr] = isoDate.split('-');
  const mmdd = Number(mStr) * 100 + Number(dStr);
  if (mmdd >= 401 && mmdd <= 1031) return true; // Apr 1 - Oct 31
  if (mmdd >= 1215 || mmdd <= 115) return true; // Dec 15 - Jan 15
  return false;
}

// Is this start date inside the last-minute window? 21 to 8 days before the start, inclusive.
// Applies to every product. The final 7 days are excluded on purpose: that week is reserved for
// staffing, so full rate at T-7 is intended.
export function isWithinLastMinuteWindow(startDate: string, now: Date = new Date()): boolean {
  const gap = daysUntil(startDate, now);
  return gap >= LAST_MINUTE_MIN_DAYS && gap <= LAST_MINUTE_MAX_DAYS;
}

// The per-person, per-trip rate in RAND for a given product and date, WITHOUT the last-minute
// discount (base -> year -> season -> SADC). Exposed so the booking UI can show a named
// "rack rate" line separately from the last-minute reduction.
export function basePpTripRand(
  catering: Catering,
  residency: Residency,
  startDate: string,
): number {
  let rand = BASE_PP_TRIP[catering] * RATE_YEAR_MULTIPLIER[rateYearFor(startDate)];
  if (!isHighSeason(startDate)) rand *= 1 - SEASON_DISCOUNT;
  if (residency === 'sadc' && catering === 'catered') rand *= 1 - SADC_DISCOUNT;
  return roundRateRand(rand);
}

// The FULLY RESOLVED per-person, per-trip rate (cents), in policy order:
//   base -> rate year -> season -> SADC -> last-minute -> floor to the rand
// This is the single value that party size multiplies. Nothing downstream rounds again.
export function ppTripCentsFor(
  catering: Catering,
  residency: Residency,
  startDate: string,
  now: Date = new Date(),
): number {
  let rand = BASE_PP_TRIP[catering] * RATE_YEAR_MULTIPLIER[rateYearFor(startDate)];
  if (!isHighSeason(startDate)) rand *= 1 - SEASON_DISCOUNT;
  if (residency === 'sadc' && catering === 'catered') rand *= 1 - SADC_DISCOUNT;
  if (isWithinLastMinuteWindow(startDate, now)) rand *= 1 - LAST_MINUTE_DISCOUNT;
  return toCents(roundRateRand(rand));
}

// Single supplement per own room, in cents: 40% of the fully resolved international catered rate
// for that date (year, season and last-minute already applied), floored to the rand.
export function supplementCentsFor(startDate: string, now: Date = new Date()): number {
  const intlRand = ppTripCentsFor('catered', 'international', startDate, now) / 100;
  return toCents(roundRateRand((intlRand * SINGLE_SUPPLEMENT_PCT) / 100));
}

// --- Group formation ---------------------------------------------------------------------------
// Opening a date: 2 catered (any room mix), 8 self-catered. Joining: 2 catered. A date holds at
// most 4 rooms and 8 walkers. The DB trigger re-implements the same rules independently in SQL
// (it is the last line of defence and cannot import from here), so any change to these numbers
// must be mirrored in the slot guard (migration 0018).
export {
  minPartySize,
  minToJoin,
  MIN_TO_JOIN,
  MAX_GROUP_SIZE,
  ROOMS_PER_DEPARTURE,
  roomsFor,
  isValidRoomMix,
  defaultSingleRooms,
};

// A booking that takes all 4 rooms has the trail to itself. Exclusivity is a consequence of the
// room count, not a product.
export function isExclusiveParty(rooms: number, roomsTaken = 0): boolean {
  return roomsTaken === 0 && rooms >= ROOMS_PER_DEPARTURE;
}

export function bookingTypeFor(rooms: number, roomsTaken = 0): BookingType {
  return isExclusiveParty(rooms, roomsTaken) ? 'exclusive' : 'shared';
}

export type PaymentPlan = 'full' | 'deposit_balance';
export type DiscountPercent = 0 | 50 | 100;

export interface Quote {
  bookingType: BookingType;
  catering: Catering;
  // Stored band for the booking row: 'sadc' when anyone is counted as SADC. The real split is
  // sadcCount; the column is kept for reporting and the email copy.
  residency: Residency;
  groupSize: number;
  singleRooms: number;
  sadcCount: number;
  intlCount: number;
  rooms: number;
  totalCents: number; // the full amount the customer owes, VAT and levies included, after any code
  // One-time discount code (migration 0020). The percent comes from the code's DB row, never the
  // browser. totalBeforeDiscountCents - discountCents == totalCents.
  discountPercent: DiscountPercent;
  discountCents: number;
  totalBeforeDiscountCents: number;
  depositPercent: number;
  amountDueCents: number; // the FIRST charge: deposit (deposit_balance) or full total (full)
  currency: string;
  // Named per-person components, so the booking UI can show every line (never one unexplained
  // figure). All are final: year, season and last-minute already applied, floored to the rand.
  intlPpCents: number; // all-inclusive (or self-catered) rate
  sadcPpCents: number; // same with the SADC 30% off (catered); equal to intlPpCents self-catered
  supplementCents: number; // per own room; 0 for self-catered
  lastMinuteDiscountApplied: boolean;
  highSeason: boolean;
  rateYear: number;
  // Split payment. When no startDate is supplied (display contexts) the plan defaults to 'full'.
  paymentPlan: PaymentPlan;
  depositCents: number; // deposit portion of total (== totalCents when plan is 'full')
  balanceCents: number; // balance portion (0 when plan is 'full'); deposit + balance == total
  balanceDueDate: string | null; // ISO date, BALANCE_LEAD_DAYS before startDate, when split
}

// SERVER price authority.
//   total = sadcCount x sadcRate + (groupSize - sadcCount) x intlRate + singleRooms x supplement
// Each rate is resolved completely (year -> season -> SADC -> last-minute -> floor) before it
// multiplies; nothing below rounds again. Self-catered has no supplement and no SADC reduction
// (its rate is already a resident rate). Pass `startDate` to price the correct year and season
// and to apply the split-payment rule; without it, a base-year high-season estimate is returned.
// Room-mix and party-size VALIDITY is checked by the caller (createCheckout) and the DB; this
// function only prices what it is given.
export function computeQuote(input: {
  catering: Catering;
  groupSize: number;
  singleRooms?: number;
  sadcCount?: number;
  roomsTaken?: number;
  startDate?: string;
  now?: Date;
  discountPercent?: DiscountPercent;
}): Quote {
  const now = input.now ?? new Date();
  const { catering, groupSize } = input;
  const singleRooms = catering === 'catered' ? input.singleRooms ?? defaultSingleRooms(groupSize) : 0;
  const sadcCount = catering === 'catered' ? input.sadcCount ?? 0 : groupSize;
  const intlCount = groupSize - sadcCount;
  const rooms = roomsFor(groupSize, singleRooms);

  const fallbackDate = `${RATE_BASE_YEAR}-07-01`; // base year, high season: the headline rate
  const priceDate = input.startDate ?? fallbackDate;
  const lastMinuteDiscountApplied =
    !!input.startDate && isWithinLastMinuteWindow(input.startDate, now);
  const pp = (residency: Residency) =>
    input.startDate
      ? ppTripCentsFor(catering, residency, input.startDate, now)
      : toCents(basePpTripRand(catering, residency, priceDate));

  const intlPpCents = pp('international');
  const sadcPpCents = pp('sadc');
  const supplementCents =
    catering === 'catered'
      ? input.startDate
        ? supplementCentsFor(input.startDate, now)
        : toCents(roundRateRand((intlPpCents / 100) * SINGLE_SUPPLEMENT_PCT / 100))
      : 0;

  const totalBeforeDiscountCents =
    sadcCount * sadcPpCents + intlCount * intlPpCents + singleRooms * supplementCents;

  // A discount code comes off the whole total, last. The discounted total is floored to the whole
  // rand, so any rounding favours the guest; the discount is the exact remainder.
  const discountPercent: DiscountPercent = input.discountPercent ?? 0;
  const totalCents =
    Math.floor((totalBeforeDiscountCents * (100 - discountPercent)) / 100 / 100) * 100;
  const discountCents = totalBeforeDiscountCents - totalCents;

  // Split decision. Deposit is rounded; balance is the remainder so the two always reconcile to
  // totalCents exactly.
  const gapDays = input.startDate ? daysUntil(input.startDate, now) : 0;
  const isSplit = !!input.startDate && gapDays >= SPLIT_THRESHOLD_DAYS && totalCents > 0;
  const depositCents = isSplit ? Math.round(totalCents * DEPOSIT_FRACTION) : totalCents;
  const balanceCents = isSplit ? totalCents - depositCents : 0;
  const paymentPlan: PaymentPlan = isSplit ? 'deposit_balance' : 'full';
  const balanceDueDate =
    isSplit && input.startDate ? addDaysIso(input.startDate, -BALANCE_LEAD_DAYS) : null;

  return {
    bookingType: bookingTypeFor(rooms, input.roomsTaken ?? 0),
    catering,
    residency: sadcCount > 0 ? 'sadc' : 'international',
    groupSize,
    singleRooms,
    sadcCount,
    intlCount,
    rooms,
    totalCents,
    discountPercent,
    discountCents,
    totalBeforeDiscountCents,
    depositPercent: totalCents > 0 ? Math.round((depositCents / totalCents) * 100) : 0,
    amountDueCents: depositCents,
    currency: CURRENCY,
    intlPpCents,
    sadcPpCents,
    supplementCents,
    lastMinuteDiscountApplied,
    highSeason: isHighSeason(priceDate),
    rateYear: rateYearFor(priceDate),
    paymentPlan,
    depositCents,
    balanceCents,
    balanceDueDate,
  };
}
