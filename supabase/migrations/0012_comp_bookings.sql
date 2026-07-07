-- The Rooiberg Wander — complimentary (gift) bookings for marketing (influencers/journalists)
--
-- Admins may create a CONFIRMED booking that bypasses payment. The booking row itself needs no
-- new columns: money fields are all zero, processor='comp', processor_reference='comp_<uuid>'.
-- This migration only teaches the append-only audit log the new action type.

alter table public.admin_audit
  drop constraint if exists admin_audit_action_check;

alter table public.admin_audit
  add constraint admin_audit_action_check check (action in (
    'note',
    'update_contact',
    'move_dates',
    'cancel_booking',
    'resend_email',
    'mark_balance_paid',
    'block_dates',
    'unblock_dates',
    'inquiry_handled',
    'create_comp_booking'
  ));
