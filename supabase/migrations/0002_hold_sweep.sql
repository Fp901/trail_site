-- The Rooiberg Wander — expired-hold sweep (Part 9.2 / 9.4)
--
-- WHY: when a guest starts checkout we insert a `pending` booking with a `hold_expires_at` and rely
-- on the `bookings_no_overlap` GiST exclusion constraint to stop double-booking. That constraint
-- must use an IMMUTABLE predicate, so it covers EVERY pending row regardless of `hold_expires_at`.
-- Result: an abandoned checkout keeps blocking its dates at the DB level even after the hold has
-- expired (the availability view already hides it, but the constraint does not). New, legitimate
-- bookings for those dates would then fail with a confusing conflict.
--
-- WHAT: a pg_cron job runs every 10 minutes and cancels any pending booking whose hold has passed.
-- Once the row is `cancelled` it no longer participates in the exclusion constraint, so the dates
-- free up. Confirmed bookings are never touched (status filter). The webhook's idempotency guard
-- (status = 'pending') means a swept row can never be revived by a late/duplicate webhook.

-- pg_cron is available on Supabase; enabling is idempotent.
create extension if not exists pg_cron;

-- Re-running this migration should not stack duplicate jobs — drop any prior copy first.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-stale-holds') then
    perform cron.unschedule('expire-stale-holds');
  end if;
end $$;

-- Every 10 minutes: cancel pending bookings whose hold has expired, releasing their dates.
select cron.schedule(
  'expire-stale-holds',
  '*/10 * * * *',
  $$
    update public.bookings
       set status = 'cancelled',
           hold_expires_at = null
     where status = 'pending'
       and hold_expires_at is not null
       and hold_expires_at < now();
  $$
);
