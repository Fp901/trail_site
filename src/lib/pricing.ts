// Server-side price authority (Part 9.1 / 11.4). Works in CENTS. The browser never sends a
// price; the server always recomputes from these constants (shared with the display in
// data/rates.ts so they can never drift). VAT-inclusive total is what we charge.
import { TOTAL_LOCAL, TOTAL_INTERNATIONAL, VAT_RATE } from '../data/rates';

export const CURRENCY = 'ZAR';
export type Residency = 'local' | 'international';

const toCents = (rand: number) => Math.round(rand * 100);

export interface Quote {
  residency: Residency;
  groupSize: number;
  netCents: number;
  vatCents: number;
  totalCents: number; // VAT-inclusive — the amount the customer owes
  depositPercent: number;
  amountDueCents: number; // total * depositPercent / 100 (full payment when percent = 100)
  currency: string;
}

// Deposit vs full — decision is FULL payment (BOOKING_DEPOSIT_PERCENT=100). Clamped 1..100.
function depositPercent(): number {
  const raw = Number(import.meta.env.BOOKING_DEPOSIT_PERCENT ?? 100);
  return Number.isFinite(raw) && raw > 0 && raw <= 100 ? raw : 100;
}

export function computeQuote(input: { residency: Residency; groupSize: number }): Quote {
  const totalRand = input.residency === 'international' ? TOTAL_INTERNATIONAL : TOTAL_LOCAL;
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
  };
}
