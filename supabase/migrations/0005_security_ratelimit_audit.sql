-- The Rooiberg Wander — security hardening: rate limiting + payment audit trail
--
-- WHY:
--  * rate_limits (A04/A09): the booking + enquiry Actions are otherwise guarded only by a honeypot.
--    Without a limiter, createCheckout can be scripted to spam `pending` holds and block calendar
--    dates (availability-DoS). A fixed-window per-key counter caps abuse server-side.
--  * payment_events (A09): an append-only audit of every webhook/payment outcome so the email-only
--    alerts become a reconcilable record. NO PII is stored here (ids/reference/amount/type only).

-- ---------------------------------------------------------------------------
-- Rate limiting — fixed-window counter, incremented atomically via check_rate_limit().
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key          text not null,            -- e.g. 'checkout:min:<ip>'
  window_start timestamptz not null,     -- start of the current fixed window
  count        int not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated; -- server (service-role) only

-- Atomic increment-and-check. Returns TRUE if the request is allowed, FALSE if the limit is
-- exceeded for the current window. The window is derived from now() so callers stay stateless.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count)
    values (p_key, v_window, 1)
  on conflict (key, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment audit trail — append-only; no PII (Part 11.9).
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  booking_id          uuid references public.bookings(id) on delete set null,
  processor_reference text,
  event_type          text not null,   -- confirmed | amount_mismatch | paid_but_cancelled |
                                        -- reference_not_found | duplicate_ignored
  amount_cents        int,
  detail              jsonb
);
create index if not exists payment_events_booking_idx on public.payment_events (booking_id);
create index if not exists payment_events_ref_idx on public.payment_events (processor_reference);

alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated; -- server (service-role) only

-- ---------------------------------------------------------------------------
-- Housekeeping: sweep stale rate-limit rows daily (keeps the table small). pg_cron is already
-- enabled by 0002. Idempotent re-schedule.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-rate-limits') then
    perform cron.unschedule('cleanup-rate-limits');
  end if;
end $$;

select cron.schedule(
  'cleanup-rate-limits',
  '17 3 * * *',
  $$ delete from public.rate_limits where window_start < now() - interval '1 day'; $$
);
