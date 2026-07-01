// Server-side price authority (Part 9.1 / 11.4). Works in CENTS. The browser never sends a
// price; the server always recomputes from these constants (shared with the display in
// data/rates.ts so they can never drift). VAT-inclusive total is what we charge.
import { TOTAL_LOCAL, TOTAL_INTERNATIONAL, VAT_RATE, LAUNCH_DISCOUNT } from '../data/rates';

export const CURRENCY = 'ZAR';
export type Residency = 'local' | 'international';

// Launch-phase discount window. While "now" is on or before this date, computeQuote applies
// LAUNCH_DISCOUNT (from data/rates.ts) to the standard rate. This is the REAL amount charged via
// Paystack, not a display trick. The full-rate constants (TOTAL_LOCAL/TOTAL_INTERNATIONAL) are
// left untouched, so the engine reverts to full price automatically once this window closes.
// PLACEHOLDER end date — confirm the real Launch Phase end date before go-live.
export const LAUNCH_DISCOUNT_END = '2026-12-31';

const toCents = (rand: number) => Math.round(rand * 100);

// Split-payment rule (money policy). A booking made this many days (or more) before its start date
// pays a deposit now and the balance later; inside this window it pays in full up front.
export const SPLIT_THRESHOLD_DAYS = 30;
// Deposit fraction for split bookings (50% deposit, 50% balance).
export const DEPOSIT_FRACTION = 0.5;
// The balance link is sent this many days before start_date (anchored to start_date).
export const BALANCE_LEAD_DAYS = 45;

const MS_PER_DAY = 86_400_000;

// Whole days from `today` (UTC date) to `startDate` (ISO YYYY-MM-DD), both treated as UTC midnight.
export function daysUntil(startDate: string, now: Date = new Date()): number {
  const today = now.toISOString().slice(0, 10);
  return Math.round(
    (Date.parse(`${startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / MS_PER_DAY,
  );
}

export type PaymentPlan = 'full' | 'deposit_balance';

export interface Quote {
  residency: Residency;
  groupSize: number;
  netCents: number;
  vatCents: number;
  totalCents: number; // VAT-inclusive — the amount the customer owes (discount already applied)
  depositPercent: number;
  amountDueCents: number; // the FIRST charge: deposit (deposit_balance) or full total (full)
  currency: string;
  launchDiscountApplied: boolean; // true if the launch discount reduced this quote
  discountEndDate: string | null; // ISO date the launch discount runs until (null when not applied)
  // Split payment (Part: deposit + balance). When no startDate is supplied (display contexts), the
  // plan defaults to 'full' and balanceCents is 0.
  paymentPlan: PaymentPlan;
  depositCents: number; // deposit portion of total (== totalCents when plan is 'full')
  balanceCents: number; // balance portion of total (0 when plan is 'full'); deposit + balance == total
}

// Launch discount is active while now is on or before LAUNCH_DISCOUNT_END (inclusive of that whole
// day, in UTC to match the date-only constant and our stored dates).
function launchDiscountActive(now: Date = new Date()): boolean {
  const end = new Date(`${LAUNCH_DISCOUNT_END}T23:59:59Z`);
  return now.getTime() <= end.getTime();
}

// SERVER price authority. Pass `startDate` (and optionally `now`) to apply the split-payment rule:
//   gap (today → startDate) < SPLIT_THRESHOLD_DAYS  → pay 100% now ('full')
//   gap >= SPLIT_THRESHOLD_DAYS                      → pay a 50% deposit now, 50% balance later
// The split is taken from the ALREADY-DISCOUNTED total, so the launch discount applies to the full
// price before the 50/50 split (deposit + balance always sum to totalCents — no rounding drift).
// With no startDate (display/estimate contexts) the plan is 'full'.
export function computeQuote(input: {
  residency: Residency;
  groupSize: number;
  startDate?: string;
  now?: Date;
}): Quote {
  const now = input.now ?? new Date();
  const baseRand = input.residency === 'international' ? TOTAL_INTERNATIONAL : TOTAL_LOCAL;

  // Apply the launch discount to the standard rate when the window is open. The discounted figure
  // is the VAT-inclusive total we actually charge; VAT/net are derived from it so they stay consistent.
  const launchDiscountApplied = launchDiscountActive(now);
  const totalRand = launchDiscountApplied ? baseRand * (1 - LAUNCH_DISCOUNT) : baseRand;

  const totalCents = toCents(totalRand); // VAT-inclusive, the amount charged
  const vatCents = totalCents - Math.round(totalCents / (1 + VAT_RATE));
  const netCents = totalCents - vatCents;

  // Split decision (from the discounted total). Deposit is rounded; balance is the remainder so the
  // two always reconcile to totalCents exactly.
  const gapDays = input.startDate ? daysUntil(input.startDate, now) : 0;
  const isSplit = !!input.startDate && gapDays >= SPLIT_THRESHOLD_DAYS;
  const depositCents = isSplit ? Math.round(totalCents * DEPOSIT_FRACTION) : totalCents;
  const balanceCents = isSplit ? totalCents - depositCents : 0;
  const paymentPlan: PaymentPlan = isSplit ? 'deposit_balance' : 'full';
  const amountDueCents = depositCents; // the first charge

  return {
    residency: input.residency,
    groupSize: input.groupSize,
    netCents,
    vatCents,
    totalCents,
    depositPercent: Math.round((depositCents / totalCents) * 100),
    amountDueCents,
    currency: CURRENCY,
    launchDiscountApplied,
    discountEndDate: launchDiscountApplied ? LAUNCH_DISCOUNT_END : null,
    paymentPlan,
    depositCents,
    balanceCents,
  };
}
