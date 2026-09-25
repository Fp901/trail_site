// One-time discount codes: server-side operations (Part 11). SERVER ONLY: uses the service-role
// Supabase client. The format and hashing rules live in discount-code-format.ts, shared with the
// generator script.
//
// Security model, in one place:
//   - Codes are ~79 random bits and only their SHA-256 is stored.
//   - Every attempt (the widget's preview and the checkout itself) passes codeAttemptAllowed():
//     5 a minute and 20 a day per IP, on top of createCheckout's own limits.
//   - Unknown, used, expired and void codes all get the same message, so an attacker learns
//     nothing about which case they hit.
//   - The percentage always comes from the database row, never from the browser.
//   - A code is claimed only through reserve_discount_code() (migration 0020): one UPDATE, so two
//     simultaneous checkouts can never both claim it.
import { getSupabaseAdmin } from './supabase';
import { rateLimit } from './ratelimit';
import { normaliseCode, isWellFormed, hashCode } from './discount-code-format';
import type { DiscountPercent } from './pricing';

export const CODE_REJECTED_MESSAGE = "That code isn't valid or has already been used.";
export const CODE_RATE_LIMITED_MESSAGE =
  'Too many code attempts. Please wait a few minutes and try again.';

// A reservation outlives the booking hold by this much, so a guest who pays in the last seconds of
// the hold (the webhook can land a little after) still has their code when it is redeemed.
const RESERVATION_GRACE_MINUTES = 30;


export async function codeAttemptAllowed(ip: string): Promise<boolean> {
  const perMinute = await rateLimit(`discount:min:${ip}`, 5, 60);
  const perDay = await rateLimit(`discount:day:${ip}`, 20, 86_400);
  return perMinute && perDay;
}

// Normalise and shape-check a guest's input. Returns the hash to look up, or null when it cannot
// possibly be a code (no database call is made for those).
export function hashIfWellFormed(raw: string): string | null {
  const n = normaliseCode(raw);
  return isWellFormed(n) ? hashCode(n) : null;
}

// Read-only check for the widget's preview. Does NOT claim the code: that happens at checkout.
export async function previewCode(hash: string): Promise<DiscountPercent | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('discount_codes')
    .select('percent, status, reserved_until, expires_at')
    .eq('code_hash', hash)
    .maybeSingle();
  if (!data) return null;
  const now = Date.now();
  if (data.expires_at && Date.parse(data.expires_at) <= now) return null;
  const free =
    data.status === 'available' ||
    (data.status === 'reserved' && data.reserved_until && Date.parse(data.reserved_until) < now);
  return free ? (data.percent as DiscountPercent) : null;
}

// Claim a code for a booking hold ending at holdExpiresAt. Returns the code's id and percent, or
// null if it cannot be claimed (for any reason; the caller shows CODE_REJECTED_MESSAGE).
export async function reserveCode(
  hash: string,
  holdExpiresAt: Date,
): Promise<{ id: string; percent: DiscountPercent } | null> {
  const supabase = getSupabaseAdmin();
  const until = new Date(holdExpiresAt.getTime() + RESERVATION_GRACE_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase.rpc('reserve_discount_code', { p_hash: hash, p_until: until });
  if (error) {
    console.error('[discounts] reserve failed:', error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { id: row.id as string, percent: row.percent as DiscountPercent } : null;
}

// Link a reserved code to the booking that claimed it (for support, and for the webhook).
export async function attachCode(codeId: string, bookingId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('discount_codes')
    .update({ booking_id: bookingId })
    .eq('id', codeId)
    .eq('status', 'reserved');
  if (error) console.error('[discounts] attach failed:', error.message);
}

// Give a reserved code back (the booking insert failed, or the guest cancelled at checkout).
// Only ever touches a code that is still merely reserved: a redeemed code is never released.
export async function releaseCode(codeId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('discount_codes')
    .update({ status: 'available', reserved_until: null, booking_id: null })
    .eq('id', codeId)
    .eq('status', 'reserved');
  if (error) console.error('[discounts] release failed:', error.message);
}

// Mark a code used for good: payment confirmed (webhook), or a free booking confirmed.
export async function redeemCode(codeId: string, bookingId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('discount_codes')
    .update({ status: 'redeemed', redeemed_at: new Date().toISOString(), booking_id: bookingId })
    .eq('id', codeId)
    .neq('status', 'void');
  if (error) console.error('[discounts] redeem failed:', error.message);
}
