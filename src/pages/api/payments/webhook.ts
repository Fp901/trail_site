// Paystack webhook (Part 9.2 / 11.4). prerender=false — needs the RAW body for signature
// verification. Verifies x-paystack-signature (HMAC-SHA512), then INDEPENDENTLY verifies the
// transaction, then idempotently confirms the booking. Never trusts the redirect. No PII logged.
import type { APIRoute } from 'astro';
import { payments } from '../../../lib/payments';
import { getSupabaseAdmin } from '../../../lib/supabase';
import {
  sendBookingConfirmation,
  sendBalancePaidConfirmation,
  sendBookingOperatorNotification,
  sendManualReviewAlert,
  sendTaxInvoice,
} from '../../../lib/email';
import { sendBalancePaymentLink } from '../../../lib/balance';
import { recordPaymentEvent } from '../../../lib/audit';
import { site } from '../../../data/site';

// 45-day lead: the balance link is sent this far before start_date (mirrors pricing.BALANCE_LEAD_DAYS).
const BALANCE_LEAD_DAYS = 45;
const MS_PER_DAY = 86_400_000;

// Columns needed for both the deposit (first payment) and balance (second payment) branches.
const BOOKING_COLS =
  'id, status, amount_due_cents, total_cents, lead_email, lead_name, start_date, pretrip_token, ' +
  'group_size, residency, payment_plan, deposit_paid_cents, balance_due_cents, balance_due_date, balance_paid_at';

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

  // A charge.success can be either the DEPOSIT/first payment (matches processor_reference) or the
  // BALANCE/second payment (matches balance_processor_reference). Look up the deposit reference
  // first; only if that misses do we treat it as a balance reference. This keeps the two references
  // distinct and stops the branches from conflating.
  const { data: byDeposit } = await supabase
    .from('bookings')
    .select(BOOKING_COLS)
    .eq('processor_reference', reference)
    .maybeSingle();
  let booking: any = byDeposit;
  let isBalancePayment = false;
  if (!booking) {
    const { data: byBalance } = await supabase
      .from('bookings')
      .select(BOOKING_COLS)
      .eq('balance_processor_reference', reference)
      .maybeSingle();
    if (byBalance) {
      booking = byBalance;
      isBalancePayment = true;
    }
  }

  // Paid-but-unbookable alerting (interim, until we have an audit log). The payment HAS succeeded
  // here, so silently returning 200 would lose money with no record. We log + email the operator
  // for manual confirm/refund via the Paystack dashboard, then 200 so Paystack does not retry.
  const notify = import.meta.env.BOOKINGS_NOTIFY_TO ?? site.notifyEmail;
  const at = new Date().toISOString();
  const alertManualReview = async (subject: string, bookingId?: string) => {
    try {
      await sendManualReviewAlert({
        to: notify,
        reference,
        amountCents: verify.amountCents,
        subject,
        reason: 'A Paystack payment succeeded but the booking could not be confirmed automatically. Please confirm or refund this transaction manually from the Paystack dashboard.',
        bookingId,
        at,
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
    await recordPaymentEvent({
      eventType: 'reference_not_found',
      processorReference: reference,
      amountCents: verify.amountCents,
      detail: { transactionId: verify.transactionId },
    });
    await alertManualReview('ACTION REQUIRED: payment received but booking reference not found');
    return new Response('manual-review: reference not found', { status: 200 });
  }

  // ---- BALANCE (second) payment -----------------------------------------------------------------
  // A payment on the balance reference of an already-confirmed deposit booking. Same rigor as the
  // deposit flow: verify amount, act idempotently, and flag inconsistencies rather than fail silently.
  if (isBalancePayment) {
    // The booking must already be confirmed (the deposit was paid). Anything else is inconsistent —
    // money is in, but the booking state is wrong: flag for manual review, do not mutate.
    if (booking.status !== 'confirmed') {
      console.error('[webhook] MANUAL REVIEW — balance paid but booking not confirmed', {
        reference,
        bookingId: booking.id,
        status: booking.status,
        at,
      });
      await recordPaymentEvent({
        eventType: 'balance_inconsistent',
        bookingId: booking.id,
        processorReference: reference,
        amountCents: verify.amountCents,
        detail: { status: booking.status },
      });
      await alertManualReview(
        'ACTION REQUIRED: balance payment received but booking is not confirmed',
        booking.id,
      );
      return new Response('manual-review: balance on non-confirmed booking', { status: 200 });
    }

    if (verify.amountCents !== booking.balance_due_cents) {
      console.error('[webhook] balance amount mismatch for booking', booking.id);
      await recordPaymentEvent({
        eventType: 'balance_amount_mismatch',
        bookingId: booking.id,
        processorReference: reference,
        amountCents: verify.amountCents,
        detail: { expectedCents: booking.balance_due_cents },
      });
      await alertManualReview('ACTION REQUIRED: balance payment amount mismatch', booking.id);
      return new Response('balance amount mismatch', { status: 200 });
    }

    // Idempotent: only the first delivery flips balance_paid_at (CAS on null). amount_paid_cents is
    // bumped to the full total now that deposit + balance are both collected.
    const { data: paid } = await supabase
      .from('bookings')
      .update({
        balance_paid_at: new Date().toISOString(),
        balance_processor_txn_id: verify.transactionId,
        amount_paid_cents: booking.total_cents,
      })
      .eq('id', booking.id)
      .is('balance_paid_at', null)
      .select('id');

    if (!paid || paid.length === 0) {
      // Re-delivered balance webhook — already processed. Nothing to do.
      await recordPaymentEvent({
        eventType: 'duplicate_ignored',
        bookingId: booking.id,
        processorReference: reference,
        amountCents: verify.amountCents,
      });
      return new Response('ok', { status: 200 });
    }

    await recordPaymentEvent({
      eventType: 'balance_confirmed',
      bookingId: booking.id,
      processorReference: reference,
      amountCents: verify.amountCents,
      detail: { transactionId: verify.transactionId },
    });

    try {
      await sendBalancePaidConfirmation({
        to: booking.lead_email,
        leadName: booking.lead_name,
        startDate: booking.start_date,
      });
    } catch (err) {
      console.error('[webhook] balance paid confirmation email failed', err);
    }

    try {
      await sendTaxInvoice({
        to: booking.lead_email,
        leadName: booking.lead_name,
        bookingId: booking.id,
        startDate: booking.start_date,
        issuedAt: new Date().toISOString(),
        amountCents: verify.amountCents,
        invoiceType: 'balance',
        groupSize: booking.group_size,
      });
    } catch (err) {
      console.error('[webhook] balance tax invoice email failed', err);
    }

    return new Response('ok', { status: 200 });
  }

  // Happy path — confirm a still-pending booking. Idempotent: only acts while pending.
  if (booking.status === 'pending') {
    if (verify.amountCents !== booking.amount_due_cents) {
      // Amount mismatch — do not confirm; flag for manual review.
      console.error('[webhook] amount mismatch for booking', booking.id);
      await recordPaymentEvent({
        eventType: 'amount_mismatch',
        bookingId: booking.id,
        processorReference: reference,
        amountCents: verify.amountCents,
        detail: { expectedCents: booking.amount_due_cents },
      });
      return new Response('amount mismatch', { status: 200 });
    }

    // Split payment: for a deposit booking, compute when the balance becomes collectable. Normally
    // start_date − 45 days; but if that point has already passed at confirmation (booked 30–45 days
    // out), the balance is due NOW — set balance_due_date to the confirmation time (the edge case).
    const isDepositBooking = booking.payment_plan === 'deposit_balance';
    const nowMs = Date.now();
    let balanceDueDate: string | null = null;
    let balanceDueNow = false;
    if (isDepositBooking) {
      const scheduledMs = Date.parse(`${booking.start_date}T00:00:00Z`) - BALANCE_LEAD_DAYS * MS_PER_DAY;
      balanceDueNow = scheduledMs <= nowMs;
      balanceDueDate = new Date(balanceDueNow ? nowMs : scheduledMs).toISOString();
    }

    await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        processor_txn_id: verify.transactionId,
        amount_paid_cents: verify.amountCents,
        hold_expires_at: null,
        confirmed_at: new Date().toISOString(),
        ...(isDepositBooking ? { balance_due_date: balanceDueDate } : {}),
      })
      .eq('id', booking.id)
      .eq('status', 'pending');

    await recordPaymentEvent({
      eventType: 'confirmed',
      bookingId: booking.id,
      processorReference: reference,
      amountCents: verify.amountCents,
      detail: { transactionId: verify.transactionId },
    });

    // Edge case: balance already due at confirmation → send the balance link immediately instead of
    // waiting for a cron pass that would treat it as "future". Best-effort: if this fails, the
    // balance-reminders cron picks it up next run (balance_link_sent_at is still null).
    if (isDepositBooking && balanceDueNow) {
      try {
        await sendBalancePaymentLink({
          id: booking.id,
          lead_email: booking.lead_email,
          lead_name: booking.lead_name,
          start_date: booking.start_date,
          balance_due_cents: booking.balance_due_cents,
          balance_due_date: balanceDueDate,
        });
      } catch {
        /* best-effort — cron will retry */
      }
    }

    // Best-effort emails (failures must not 500 the webhook). The confirmation carries the pre-trip
    // link as its headline CTA plus, for deposit bookings, the deposit/balance summary.
    try {
      await sendBookingConfirmation({
        to: booking.lead_email,
        leadName: booking.lead_name,
        startDate: booking.start_date,
        pretripToken: booking.pretrip_token,
        paymentPlan: booking.payment_plan,
        depositCents: booking.deposit_paid_cents,
        balanceCents: booking.balance_due_cents,
        balanceDueDate,
        balanceLinkImminent: balanceDueNow,
      });
    } catch (err) {
      console.error('[webhook] guest confirmation email failed', err);
    }
    try {
      await sendBookingOperatorNotification({
        to: import.meta.env.BOOKINGS_NOTIFY_TO ?? site.notifyEmail,
        leadName: booking.lead_name,
        leadEmail: booking.lead_email,
        startDate: booking.start_date,
        groupSize: booking.group_size,
        residency: booking.residency,
        bookingId: booking.id,
        paymentPlan: booking.payment_plan,
        totalCents: booking.total_cents,
        depositCents: booking.deposit_paid_cents,
      });
    } catch (err) {
      console.error('[webhook] operator notification email failed', err);
    }

    // Tax invoice — sent after the confirmation so the guest receives confirmation first.
    // For a deposit booking the invoice covers the deposit amount; for a full-pay booking
    // it covers the total. The balance tax invoice is sent when the balance is paid.
    try {
      await sendTaxInvoice({
        to: booking.lead_email,
        leadName: booking.lead_name,
        bookingId: booking.id,
        startDate: booking.start_date,
        issuedAt: new Date().toISOString(),
        amountCents: verify.amountCents,
        invoiceType: isDepositBooking ? 'deposit' : 'full',
        groupSize: booking.group_size,
      });
    } catch (err) {
      console.error('[webhook] tax invoice email failed', err);
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
    await recordPaymentEvent({
      eventType: 'paid_but_cancelled',
      bookingId: booking.id,
      processorReference: reference,
      amountCents: verify.amountCents,
    });
    await alertManualReview('ACTION REQUIRED: payment received but booking hold expired', booking.id);
    return new Response('manual-review: booking hold expired', { status: 200 });
  }

  // Anything else (e.g. already 'confirmed') — idempotent replay, nothing to do.
  if (booking.status === 'confirmed') {
    await recordPaymentEvent({
      eventType: 'duplicate_ignored',
      bookingId: booking.id,
      processorReference: reference,
      amountCents: verify.amountCents,
    });
  }
  return new Response('ok', { status: 200 });
};
