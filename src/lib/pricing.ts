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

export interface Quote {
  residency: Residency;
  groupSize: number;
  netCents: number;
  vatCents: number;
  totalCents: number; // VAT-inclusive — the amount the customer owes (discount already applied)
  depositPercent: number;
  amountDueCents: number; // total * depositPercent / 100 (full payment when percent = 100)
  currency: string;
  launchDiscountApplied: boolean; // true if the launch discount reduced this quote
  discountEndDate: string | null; // ISO date the launch discount runs until (null when not applied)
}

// Deposit vs full — decision is FULL payment (BOOKING_DEPOSIT_PERCENT=100). Clamped 1..100.
function depositPercent(): number {
  const raw = Number(import.meta.env.BOOKING_DEPOSIT_PERCENT ?? 100);
  return Number.isFinite(raw) && raw > 0 && raw <= 100 ? raw : 100;
}

// Launch discount is active while now is on or before LAUNCH_DISCOUNT_END (inclusive of that whole
// day, in UTC to match the date-only constant and our stored dates).
function launchDiscountActive(now: Date = new Date()): boolean {
  const end = new Date(`${LAUNCH_DISCOUNT_END}T23:59:59Z`);
  return now.getTime() <= end.getTime();
}

export function computeQuote(input: { residency: Residency; groupSize: number }): Quote {
  const baseRand = input.residency === 'international' ? TOTAL_INTERNATIONAL : TOTAL_LOCAL;

  // Apply the launch discount to the standard rate when the window is open. The discounted figure
  // is the VAT-inclusive total we actually charge; VAT/net are derived from it so they stay consistent.
  const launchDiscountApplied = launchDiscountActive();
  const totalRand = launchDiscountApplied ? baseRand * (1 - LAUNCH_DISCOUNT) : baseRand;

  const totalCents = toCents(totalRand); // VAT-inclusive, the amount charged
  const vatCents = totalCents - Math.round(totalCents / (1 + VAT_RATE));
  const netCents = totalCents - vatCents;
  const percent = depositPercent();
  const amountDueCents = Math.round((totalCents * percent) / 100);
  return {
    residency: input.residency,
    groupSize: input.groupSize,
    netCents,
    vatCents,
    totalCents,
    depositPercent: percent,
    amountDueCents,
    currency: CURRENCY,
    launchDiscountApplied,
    discountEndDate: launchDiscountApplied ? LAUNCH_DISCOUNT_END : null,
  };
}
