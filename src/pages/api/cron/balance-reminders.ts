// Balance-reminders cron (Vercel Cron — see vercel.json). prerender=false. Split payment: for
// confirmed deposit bookings with an outstanding balance, this daily job does two things, both
// anchored to start_date (NOT confirmed_at):
//   1. Send the balance payment link once balance_due_date (start_date − 45d) has arrived and the
//      link has not been sent yet. The link is a fresh Paystack checkout (same PaymentProcessor as
//      the deposit) built by lib/balance.sendBalancePaymentLink, which CAS-guards balance_link_sent_at.
//   2. Fire a one-time internal "ACTION REQUIRED: balance overdue" alert once the trip is within 30
//      days (start_date − 30d) and the balance is still unpaid. FLAG ONLY — the booking is not
//      cancelled and its dates are not released (business policy; reconfirm before go-live).
//
// Idempotency: (1) is guarded inside sendBalancePaymentLink; (2) uses a compare-and-set on
// balance_overdue_alert_sent (flip false→true, only the winning run sends) — same discipline as the
// pre-trip cron. Re-running in the same day cannot double-send either.
import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { sendBalancePaymentLink } from '../../../lib/balance';
import { sendBalanceOverdueAlert } from '../../../lib/email';
import { site } from '../../../data/site';

export const prerender = false;

const MS_PER_DAY = 86_400_000;
const OVERDUE_DAYS_BEFORE_START = 30; // trip within 30 days + unpaid balance → operator alert

// Shared-secret gate — identical to the pre-trip cron. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>`. Fail closed if the secret is missing. Timing-safe compare.
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
  const nowIso = new Date(now).toISOString();
  const notify = import.meta.env.BOOKINGS_NOTIFY_TO ?? site.notifyEmail;

  // Candidates: confirmed deposit bookings with an unpaid balance and at least one action still open
  // (link not sent, or overdue alert not sent).
  const { data: rows, error } = await supabase
    .from('bookings')
    .select(
      'id, lead_name, lead_email, start_date, processor_reference, balance_due_cents, balance_due_date, balance_link_sent_at, balance_overdue_alert_sent',
    )
    .eq('status', 'confirmed')
    .eq('payment_plan', 'deposit_balance')
    .is('balance_paid_at', null)
    .or('balance_link_sent_at.is.null,balance_overdue_alert_sent.eq.false');

  if (error) {
    console.error('[balance-cron] query failed:', error.message);
    return new Response('query failed', { status: 500 });
  }

  const candidates = rows ?? [];

  // Claim the overdue guard: flip false→true; only the run that wins sends.
  const claimOverdue = async (id: string): Promise<boolean> => {
    const { data } = await supabase
      .from('bookings')
      .update({ balance_overdue_alert_sent: true })
      .eq('id', id)
      .eq('balance_overdue_alert_sent', false)
      .select('id');
    return Array.isArray(data) && data.length > 0;
  };

  let linksSent = 0;
  let overdue = 0;

  for (const b of candidates) {
    // 1. Balance link — due once balance_due_date has passed and it has not been sent.
    if (!b.balance_link_sent_at && b.balance_due_date && Date.parse(b.balance_due_date) <= now) {
      try {
        if (
          await sendBalancePaymentLink({
            id: b.id,
            lead_email: b.lead_email,
            lead_name: b.lead_name,
            start_date: b.start_date,
            balance_due_cents: b.balance_due_cents,
            balance_due_date: b.balance_due_date,
          })
        ) {
          linksSent++;
        }
      } catch (err) {
        console.error('[balance-cron] link send failed for', b.id, (err as Error).message);
      }
    }

    // 2. Overdue alert — trip within 30 days and balance still unpaid. FLAG ONLY (no cancellation).
    const overdueThresholdMs =
      Date.parse(`${b.start_date}T00:00:00Z`) - OVERDUE_DAYS_BEFORE_START * MS_PER_DAY;
    if (!b.balance_overdue_alert_sent && overdueThresholdMs <= now) {
      if (await claimOverdue(b.id)) {
        try {
          await sendBalanceOverdueAlert({
            to: notify,
            leadName: b.lead_name,
            reference: b.processor_reference,
            startDate: b.start_date,
            balanceCents: b.balance_due_cents,
            balanceDueDate: b.balance_due_date,
          });
          overdue++;
        } catch {
          console.error('[balance-cron] overdue alert email failed for', b.id);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, at: nowIso, scanned: candidates.length, linksSent, overdue }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
};
