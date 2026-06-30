// Server-side rate limiting (Part 11 — A04/A09). Fixed-window per-key counter stored in Postgres
// (no extra infra), incremented atomically by the check_rate_limit() SQL function (migration 0005).
//
// Fail-OPEN: if the limiter itself errors (DB blip, not configured), allow the request rather than
// block real bookings — availability beats strict limiting here. Failures are logged.
import { getSupabaseAdmin } from './supabase';

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('[ratelimit] rpc error:', error.message);
      return true; // fail-open
    }
    return data === true;
  } catch (err) {
    console.error('[ratelimit] failed:', (err as Error).message);
    return true; // fail-open
  }
}

// Best-effort client IP from the proxy header (Vercel sets x-forwarded-for). Falls back to a
// constant bucket so a missing header still limits in aggregate rather than not at all.
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0]!.trim() : '';
  return ip || 'unknown';
}
