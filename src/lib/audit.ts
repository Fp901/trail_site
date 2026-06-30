// Payment audit trail (Part 11.9 — A09). Append-only record of webhook/payment outcomes for
// reconciliation. Best-effort and PII-free: never store names/emails here, only ids/reference/
// amount/type. A failed insert must never break the calling flow (e.g. the webhook).
import { getSupabaseAdmin } from './supabase';

export type PaymentEventType =
  | 'confirmed'
  | 'amount_mismatch'
  | 'paid_but_cancelled'
  | 'reference_not_found'
  | 'duplicate_ignored';

export async function recordPaymentEvent(e: {
  eventType: PaymentEventType;
  bookingId?: string | null;
  processorReference?: string | null;
  amountCents?: number | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('payment_events').insert({
      event_type: e.eventType,
      booking_id: e.bookingId ?? null,
      processor_reference: e.processorReference ?? null,
      amount_cents: e.amountCents ?? null,
      detail: e.detail ?? null,
    });
  } catch (err) {
    console.error('[audit] failed to record', e.eventType, (err as Error).message);
  }
}
