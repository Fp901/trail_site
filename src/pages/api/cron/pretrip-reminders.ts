// Pre-trip reminder/escalation cron (triggered by Vercel Cron — see vercel.json). prerender=false.
//
// TIMING is relative to bookings.confirmed_at (set once in the webhook), NOT the trip start_date.
// The deadline communicated to guests is SEVEN DAYS:
//   confirmed_at + 72h  (day 3) → guest reminder   (pretrip_reminder_day3_sent)
//   confirmed_at + 144h (day 6) → guest reminder   (pretrip_reminder_day6_sent)
//   confirmed_at + 168h (day 7) → operator alert   (pretrip_overdue_alert_sent)
// Any stage is SKIPPED if the guest already submitted (a pretrip_details row with submitted_at).
//
// Idempotency: each stage is "claimed" by a compare-and-set (flip the _sent flag false→true and
// confirm a row was updated) BEFORE sending — same discipline as the webhook. Only the run that
// flips the flag sends, so re-running in the same minute cannot double-send. Emails are best-effort
// (a failed send leaves the flag set; consistent with the webhook's best-effort emails).
import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { sendPretripReminder, sendPretripOverdueAlert } from '../../../lib/email';
import { site } from '../../../data/site';

export const prerender = false;

const HOUR = 3600_000;

// Shared-secret gate. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set in the project env. Fail closed if the secret is missing. Timing-safe compare.
function authorized(request: Request): boolean {
  const secret = import.meta.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export const GET: APIRoute = async ({ request }) => {
  if (!authorized(request)) return new Response('Unauthorized', { status: 401 });

  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const notify = import.meta.env.BOOKINGS_NOTIFY_TO ?? site.notifyEmail;

  // Candidates: confirmed, at least 72h past confirmation (the earliest threshold, day 3), with at
  // least one guard still open. Submitted bookings are filtered out in JS via the embedded relation.
  const cutoff72 = new Date(now - 72 * HOUR).toISOString();
  const { data: rows, error } = await supabase
    .from('bookings')
    .select(
      'id, lead_name, lead_email, start_date, confirmed_at, processor_reference, pretrip_token, pretrip_reminder_day3_sent, pretrip_reminder_day6_sent, pretrip_overdue_alert_sent',
    )
    .eq('status', 'confirmed')
    .not('confirmed_at', 'is', null)
    .lte('confirmed_at', cutoff72)
    .or(
      'pretrip_reminder_day3_sent.eq.false,pretrip_reminder_day6_sent.eq.false,pretrip_overdue_alert_sent.eq.false',
    );

  if (error) {
    console.error('[pretrip-cron] query failed:', error.message);
    return new Response('query failed', { status: 500 });
  }

  const candidates = rows ?? [];

  // Which candidates have already submitted their pre-trip details? Separate flat query (no reliance
  // on PostgREST relationship embedding). "Submitted" = a pretrip_details row with submitted_at set.
  const submittedIds = new Set<string>();
  if (candidates.length) {
    const { data: subs } = await supabase
      .from('pretrip_details')
      .select('booking_id')
      .not('submitted_at', 'is', null)
      .in(
        'booking_id',
        candidates.map((c) => c.id),
      );
    for (const s of subs ?? []) submittedIds.add(s.booking_id);
  }

  // Claim a guard: flip false→true and confirm exactly this run did it. Returns true only to the
  // run that won the flip, which then (and only then) sends.
  const claim = async (id: string, col: string): Promise<boolean> => {
    const { data } = await supabase
      .from('bookings')
      .update({ [col]: true })
      .eq('id', id)
      .eq(col, false)
      .select('id');
    return Array.isArray(data) && data.length > 0;
  };

  let sentDay3 = 0;
  let sentDay6 = 0;
  let overdue = 0;

  for (const b of candidates) {
    if (submittedIds.has(b.id)) continue; // pre-trip form already completed
    if (!b.confirmed_at || !b.pretrip_token) continue;

    const hours = (now - new Date(b.confirmed_at).getTime()) / HOUR;

    // 168h (day 7) — internal operator escalation.
    if (hours >= 168 && !b.pretrip_overdue_alert_sent) {
      if (await claim(b.id, 'pretrip_overdue_alert_sent')) {
        try {
          await sendPretripOverdueAlert({
            to: notify,
            leadName: b.lead_name,
            reference: b.processor_reference,
            startDate: b.start_date,
            confirmedAt: b.confirmed_at,
            pretripToken: b.pretrip_token,
          });
          overdue++;
        } catch {
          console.error('[pretrip-cron] overdue alert email failed for', b.id);
        }
      }
    }

    // 144h (day 6) — second guest reminder.
    if (hours >= 144 && !b.pretrip_reminder_day6_sent) {
      if (await claim(b.id, 'pretrip_reminder_day6_sent')) {
        try {
          await sendPretripReminder({
            to: b.lead_email,
            leadName: b.lead_name,
            startDate: b.start_date,
            pretripToken: b.pretrip_token,
            stage: 'day6',
          });
          sentDay6++;
        } catch {
          console.error('[pretrip-cron] day-6 reminder email failed for', b.id);
        }
      }
    }

    // 72h (day 3) — first guest reminder.
    if (hours >= 72 && !b.pretrip_reminder_day3_sent) {
      if (await claim(b.id, 'pretrip_reminder_day3_sent')) {
        try {
          await sendPretripReminder({
            to: b.lead_email,
            leadName: b.lead_name,
            startDate: b.start_date,
            pretripToken: b.pretrip_token,
            stage: 'day3',
          });
          sentDay3++;
        } catch {
          console.error('[pretrip-cron] day-3 reminder email failed for', b.id);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: candidates.length, sentDay3, sentDay6, overdue }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
