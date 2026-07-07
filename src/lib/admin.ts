// Admin action helpers (admin overhaul v1). Two jobs:
//   1. requireAdmin — every admin ACTION re-verifies the session server-side (page gates are
//      never trusted alone; A01).
//   2. recordAdminEvent — the append-only who/what/when/before/after log (admin_audit table).
//      Unlike recordPaymentEvent, mutation callers AWAIT this before returning success so a
//      change is never silently unlogged. admin_email always comes from the verified session,
//      never from client input.
import { ActionError, type ActionAPIContext } from 'astro:actions';
import { getAdminUser } from './auth';
import { getSupabaseAdmin } from './supabase';

export type AdminAction =
  | 'note'
  | 'update_contact'
  | 'move_dates'
  | 'cancel_booking'
  | 'resend_email'
  | 'mark_balance_paid'
  | 'block_dates'
  | 'unblock_dates'
  | 'inquiry_handled'
  | 'create_comp_booking';

// Verify the calling request carries a valid admin session; return the admin's identity.
export async function requireAdmin(ctx: ActionAPIContext): Promise<{ email: string }> {
  const user = await getAdminUser(ctx.cookies);
  if (!user?.email) {
    throw new ActionError({ code: 'UNAUTHORIZED', message: 'Please sign in again.' });
  }
  return { email: user.email };
}

// Append one row to admin_audit. before/after should contain ONLY the changed fields.
export async function recordAdminEvent(e: {
  adminEmail: string;
  action: AdminAction;
  bookingId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('admin_audit').insert({
    admin_email: e.adminEmail,
    action: e.action,
    booking_id: e.bookingId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
    note: e.note ?? null,
  });
  if (error) {
    // Surfaced (not swallowed): an unlogged mutation must be visible. Callers run this AFTER
    // their mutation, so be honest that the change itself may have been applied.
    console.error('[admin-audit] failed to record', e.action, error.message);
    throw new ActionError({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'The change may have been applied but could not be logged. Please refresh to check, and report this.',
    });
  }
}
