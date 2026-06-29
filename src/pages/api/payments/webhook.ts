// Paystack webhook (Part 9.2 / 11.4). prerender=false — needs the RAW body for signature
// verification. Verifies x-paystack-signature (HMAC-SHA512), then INDEPENDENTLY verifies the
// transaction, then idempotently confirms the booking. Never trusts the redirect. No PII logged.
import type { APIRoute } from 'astro';
import { payments } from '../../../lib/payments';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { sendEmail } from '../../../lib/email';
import { site } from '../../../data/site';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const signature = request.headers.get('x-paystack-signature') ?? '';

  if (!payments.verifyWebhookSignature(raw, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('Bad payload', { status: 400 });
  }

  if (event?.event !== 'charge.success') {
    return new Response('ignored', { status: 200 });
  }

  const reference: string | undefined = event?.data?.reference;
  if (!reference) return new Response('ok', { status: 200 });

  // Independently confirm with Paystack (never trust the event alone).
  const verify = await payments.verifyTransaction(reference);
  if (verify.status !== 'success') return new Response('ok', { status: 200 });

  const supabase = getSupabaseAdmin();
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, amount_due_cents, lead_email, lead_name, start_date')
    .eq('processor_reference', reference)
    .single();

  // Paid-but-unbookable alerting (interim, until we have an audit log). The payment HAS succeeded
  // here, so silently returning 200 would lose money with no record. We log + email the operator
  // for manual confirm/refund via the Paystack dashboard, then 200 so Paystack does not retry.
  const notify = import.meta.env.BOOKINGS_NOTIFY_TO ?? site.notifyEmail;
  const at = new Date().toISOString();
  const alertManualReview = async (subject: string, bookingId?: string) => {
    try {
      await sendEmail({
        to: notify,
        subject,
        html: `<p>A Paystack payment succeeded but the booking could not be confirmed automatically.
Please confirm or refund this transaction manually from the Paystack dashboard.</p>
<ul>
<li><strong>Paystack reference:</strong> ${reference}</li>
<li><strong>Amount paid:</strong> R${(verify.amountCents / 100).toLocaleString('en-US')} (${verify.amountCents} cents)</li>
${bookingId ? `<li><strong>Booking ID:</strong> ${bookingId}</li>` : ''}
<li><strong>Time:</strong> ${at}</li>
</ul>`,
      });
    } catch {
      // Best-effort: the console.error above is the durable record if the alert email fails.
    }
  };

  // Payment succeeded but no booking row exists for this reference.
  if (!booking) {
    console.error('[webhook] MANUAL REVIEW — payment received but booking reference not found', {
      reference,
      transactionId: verify.transactionId,
      amountCents: verify.amountCents,
      at,
    });
    await alertManualReview('ACTION REQUIRED: payment received but booking reference not found');
    return new Response('manual-review: reference not found', { status: 200 });
  }

  // Happy path — confirm a still-pending booking. Idempotent: only acts while pending.
  if (booking.status === 'pending') {
    if (verify.amountCents !== booking.amount_due_cents) {
      // Amount mismatch — do not confirm; flag for manual review.
      console.error('[webhook] amount mismatch for booking', booking.id);
      return new Response('amount mismatch', { status: 200 });
    }

    await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        processor_txn_id: verify.transactionId,
        amount_paid_cents: verify.amountCents,
        hold_expires_at: null,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
      .eq('status', 'pending');

    // Best-effort emails (failures must not 500 the webhook).
    try {
      await sendEmail({
        to: booking.lead_email,
        subject: 'Your Rooiberg Wander booking is confirmed',
        html: `<p>Thank you — your booking for The Rooiberg Wander is confirmed.</p>
<p>Start date (arrival, Day 1): <strong>${booking.start_date}</strong></p>
<p>We will be in touch with the final details. A tax invoice accompanies your payment receipt.</p>`,
      });
    } catch {
      /* ignore */
    }
    try {
      await sendEmail({
        to: import.meta.env.BOOKINGS_NOTIFY_TO ?? site.notifyEmail,
        subject: `Booking confirmed — ${booking.lead_name}`,
        html: `<p>A booking has been confirmed.</p>
<p>Booking ID: ${booking.id}<br/>Arrival: ${booking.start_date}</p>`,
      });
    } catch {
      /* ignore */
    }

    return new Response('ok', { status: 200 });
  }

  // Payment succeeded but the hold had already been cancelled/swept (paid-but-cancelled race).
  // Money is taken with no active hold — alert for manual confirm or refund.
  if (booking.status === 'cancelled') {
    console.error('[webhook] MANUAL REVIEW — payment received but booking hold expired/cancelled', {
      reference,
      bookingId: booking.id,
      amountCents: verify.amountCents,
      at,
    });
    await alertManualReview('ACTION REQUIRED: payment received but booking hold expired', booking.id);
    return new Response('manual-review: booking hold expired', { status: 200 });
  }

  // Anything else (e.g. already 'confirmed') — idempotent replay, nothing to do.
  return new Response('ok', { status: 200 });
};
