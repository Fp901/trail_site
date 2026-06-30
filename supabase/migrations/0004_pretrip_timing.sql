-- The Rooiberg Wander — pre-trip reminder/escalation guards
--
-- WHY: confirmed guests are reminded to complete their pre-trip details, then escalated to the
-- operator if still missing. Each step must fire at most once per booking. These boolean flags are
-- the guards: the reminder cron (api/cron/pretrip-reminders) flips false→true with a compare-and-set
-- so a re-run can never double-send.
--
-- TIMING: all of it is relative to bookings.confirmed_at (set exactly once in the webhook on the
-- pending→confirmed transition), NOT the trip start_date — bookings can be made as little as 7 days
-- out, so a trip-relative trigger would be wrong.
--   - pretrip_reminder_24h_sent  → guest reminder at confirmed_at + 24h
--   - pretrip_reminder_60h_sent  → guest reminder at confirmed_at + 60h
--   - pretrip_overdue_alert_sent → internal operator alert at confirmed_at + 72h

alter table public.bookings
  add column if not exists pretrip_reminder_24h_sent  boolean not null default false,
  add column if not exists pretrip_reminder_60h_sent  boolean not null default false,
  add column if not exists pretrip_overdue_alert_sent boolean not null default false;
