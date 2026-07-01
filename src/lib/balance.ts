// Balance payment link (split payment — deposit + balance). Shared by BOTH the webhook (edge case:
// the 45-days-before point has already passed at confirmation) and the daily balance-reminders cron,
// so the link is generated identically in one place.
//
// The SECOND Paystack transaction is created through the SAME PaymentProcessor interface
// (payments.initCheckout) as the deposit — there is no parallel payment path. Its reference is
// stored in balance_processor_reference (distinct from the deposit's processor_reference) so the
// webhook can tell a balance payment from a deposit payment.
import crypto from 'node:crypto';
import { getSupabaseAdmin } from './supabase';
import { payments } from './payments';
import { sendBalanceLinkEmail } from './email';
import { site } from '../data/site';

export interface BalanceBooking {
  id: string;
  lead_email: string;
  lead_name: string;
  start_date: string;
  balance_due_cents: number;
  balance_due_date: string | null;
}

// Generate a fresh balance checkout and email the link. Returns true only if THIS call sent it.
// Idempotent across concurrent runs / re-runs via a compare-and-set on balance_link_sent_at.
export async function sendBalancePaymentLink(b: BalanceBooking): Promise<boolean> {
  if (!b.balance_due_cents || b.balance_due_cents <= 0) return false;

  const supabase = getSupabaseAdmin();
  const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? site.url;

  // 1. Create the Paystack session FIRST. If this throws we have NOT claimed the guard, so the cron
  //    retries next pass — we never mark a link "sent" without a real, payable URL behind it.
  const reference = `rwb_${crypto.randomUUID()}`;
  const init = await payments.initCheckout({
    email: b.lead_email,
    amountCents: b.balance_due_cents,
    reference,
    callbackUrl: `${siteUrl}/booking/confirm`,
    metadata: { booking_id: b.id, kind: 'balance' },
  });

  // 2. Atomically claim the send: set the sent timestamp + balance reference, but only while it has
  //    not already been sent and the balance is not already paid. 0 rows => another run won this
  //    booking; our just-created session is a harmless unused orphan and we do NOT email.
  const sentAt = new Date().toISOString();
  const { data: claimed } = await supabase
    .from('bookings')
    .update({ balance_link_sent_at: sentAt, balance_processor_reference: reference })
    .eq('id', b.id)
    .is('balance_link_sent_at', null)
    .is('balance_paid_at', null)
    .select('id');
  if (!claimed || claimed.length === 0) return false;

  // 3. Email the link. If the send fails, roll our claim back (clear both fields) so a later cron
  //    pass retries — a balance payment link that never reached the guest must not look "sent".
  try {
    await sendBalanceLinkEmail({
      to: b.lead_email,
      leadName: b.lead_name,
      startDate: b.start_date,
      amountCents: b.balance_due_cents,
      dueDate: b.balance_due_date,
      url: init.authorizationUrl,
    });
  } catch (err) {
    await supabase
      .from('bookings')
      .update({ balance_link_sent_at: null, balance_processor_reference: null })
      .eq('id', b.id)
      .eq('balance_processor_reference', reference); // roll back only OUR claim
    console.error(
      '[balance] link email failed; rolled back for retry',
      b.id,
      (err as Error).message,
    );
    return false;
  }
  return true;
}
