// Pure yield-ranking service (booking UX redesign, Phase 3 — REVISED per the operator's own
// note). Orders candidate dates by the price signal already encoded in the published rate card
// (src/data/rates.ts, read via computeQuote() in ./pricing) — NOT by an estimated cost per
// departure. The operator's own profitability analysis already lives in that rate card: the
// weekday-vs-Thursday self-catered split, the flat catered rate, the seasonal swing, the
// last-minute band. This module reads that signal rather than re-deriving or second-guessing it
// with a placeholder cost model.
//
// There is deliberately no costs.ts and no FIXED_COST_PER_DEPARTURE anywhere in this file or its
// imports. Every number rankDates() scores with — ppTotalCents for a given catering and date —
// is a rate a guest could look up themselves on the Rates page. The one thing this module adds
// beyond the raw rate is COMPLETION_BONUS/ORPHAN_PENALTY, and even those are sized off THIS
// candidate's own per-seat rate (see rankDates() below), never an estimate.
//
// Pure and read-only: the only import is computeQuote() from ./pricing (itself pure — no
// Supabase, no Paystack, no fetch, no secrets). rankDates() takes a caller-supplied candidate
// list and returns a new scored/sorted array; it never fetches, writes, or has any way to create,
// modify, or reject a booking. See ranking.verify.mjs (run via `npx tsx`) for a runnable proof of
// both the purity claim and the scoring arithmetic.
import { computeQuote, type Catering } from './pricing';

export type IsoDate = string;

// 'join' = topping up (or filling) an already-open shared date. 'open' = this booking is the
// first on an unopened shared date. 'buyout' = a Wednesday/Thursday exclusive buyout (always
// exactly EXCLUSIVE_PARTY guests — see data/rates.ts EXCLUSIVE_SIZE, mirrored below rather than
// imported to keep this module dependency-free of anything but pricing).
export type RankAction = 'join' | 'open' | 'buyout';

export interface RankCandidate {
  date: IsoDate;
  action: RankAction;
  catering: Catering;
  /** Seats already taken up BEFORE this booking. Required for 'join', ignored otherwise. */
  seatsLeft?: number;
}

export interface RankedDate extends RankCandidate {
  /** The exact per-person total the server would charge for this date/catering (computeQuote()). */
  ppTotalCents: number;
  /** This booking's total charge: ppTotalCents × the party size that would book this candidate. */
  totalCents: number;
  score: number;
  completionBonusApplied: boolean;
  orphanPenaltyApplied: boolean;
}

// Mirrors EXCLUSIVE_SIZE / MAX_GROUP_SIZE in data/rates.ts — a buyout is always exactly this
// many guests. Not imported from rates.ts so this module's only dependency stays ./pricing.
const EXCLUSIVE_PARTY = 8;

/**
 * Scores and orders candidate dates by the price the guest would actually be charged.
 *
 *   join    groupSize × ppTotalCents(catering, date)
 *           + one seat's ppTotalCents  if this booking completes the departure to 8
 *           − one seat's ppTotalCents  if this booking leaves exactly 1 seat (unbookable under
 *                                      the 2-guest top-up minimum)
 *   open    groupSize × ppTotalCents(catering, date)
 *   buyout  8 × ppTotalCents(catering, date)
 *
 * No cost term is subtracted anywhere. A catered seat already prices at roughly 4× a
 * self-catered seat under the published rate card, so catered dates naturally outrank
 * self-catered ones of equal party size with no extra weighting — that ordering belongs to the
 * rate card, not to this function.
 *
 * Pure: no fetch, no mutation of its inputs, no write path. Two calls with the same arguments
 * always return the same result (aside from `now`'s effect on season/last-minute pricing).
 */
export function rankDates(candidates: RankCandidate[], groupSize: number, now: Date = new Date()): RankedDate[] {
  const ranked: RankedDate[] = candidates.map((c) => {
    const perSeat = computeQuote({
      bookingType: c.action === 'buyout' ? 'exclusive' : 'shared',
      catering: c.catering,
      groupSize: 1, // ppTotalCents does not vary with groupSize; 1 just asks for the per-seat figure
      startDate: c.date,
      now,
    }).ppTotalCents;

    const partySize = c.action === 'buyout' ? EXCLUSIVE_PARTY : groupSize;
    let score = partySize * perSeat;
    let completionBonusApplied = false;
    let orphanPenaltyApplied = false;

    if (c.action === 'join' && typeof c.seatsLeft === 'number') {
      const seatsAfter = c.seatsLeft - groupSize;
      if (seatsAfter === 0) {
        score += perSeat;
        completionBonusApplied = true;
      } else if (seatsAfter === 1) {
        score -= perSeat;
        orphanPenaltyApplied = true;
      }
    }

    return {
      ...c,
      ppTotalCents: perSeat,
      totalCents: partySize * perSeat,
      score,
      completionBonusApplied,
      orphanPenaltyApplied,
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
