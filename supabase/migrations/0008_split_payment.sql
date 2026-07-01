-- The Rooiberg Wander — split payment (deposit + balance)
--
-- WHY: bookings made 30+ days before the trip now pay a 50% deposit up front and the 50% balance
-- later, collected via a SECOND Paystack transaction. The balance payment link is sent 45 days
-- before start_date (anchored to start_date, not to confirmation). Bookings inside 30 days still
-- pay 100% up front (payment_plan = 'full') and engage none of this.
--
-- This migration is purely ADDITIVE: new nullable/defaulted columns on bookings, plus a SECOND
-- processor-reference column for the balance transaction. The existing processor_reference UNIQUE
-- constraint (the deposit/first payment) is untouched; the balance reference gets its own unique
-- index. Existing rows default to payment_plan = 'full' with a zero balance, so nothing breaks.

alter table public.bookings
  add column if not exists payment_plan text not null default 'full'
    check (payment_plan in ('full', 'deposit_balance')),
  -- Split of total_cents (set at booking time). For 'full': deposit_paid_cents = total, balance = 0.
  add column if not exists deposit_paid_cents int,
  add column if not exists balance_due_cents int not null default 0,
  -- When the balance becomes collectable (set at confirmation): start_date - 45 days, or the
  -- confirmation time itself for the edge case where that point has already passed.
  add column if not exists balance_due_date timestamptz,
  -- Guards (CAS, set-once) so cron re-runs / re-delivered webhooks never double-act.
  add column if not exists balance_link_sent_at timestamptz,
  add column if not exists balance_paid_at timestamptz,
  add column if not exists balance_overdue_alert_sent boolean not null default false,
  -- The balance is a separate Paystack transaction → its own reference + txn id. Kept distinct
  -- from processor_reference/processor_txn_id (which remain the deposit/first payment).
  add column if not exists balance_processor_reference text,
  add column if not exists balance_processor_txn_id text;

-- Balance reference must be unique when present (mirrors the deposit reference's guarantee), but
-- NULL for 'full' bookings — a partial unique index allows many NULLs while keeping set values unique.
create unique index if not exists bookings_balance_reference_idx
  on public.bookings (balance_processor_reference)
  where balance_processor_reference is not null;

-- Index the balance-reminder cron's scan predicate (confirmed deposit bookings awaiting balance).
create index if not exists bookings_balance_due_idx
  on public.bookings (balance_due_date)
  where payment_plan = 'deposit_balance' and balance_paid_at is null;
