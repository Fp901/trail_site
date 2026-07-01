-- The Rooiberg Wander — retune the pre-trip window from 72 hours to 7 days
--
-- WHY: the pre-trip details sequence (0004 + api/cron/pretrip-reminders) used a 72-hour window with
-- guest reminders at confirmed_at + 24h / + 60h and an operator escalation at + 72h. The deadline
-- communicated to guests is now SEVEN DAYS, with reminders at day 3 (72h) and day 6 (144h) and the
-- operator escalation at day 7 (168h). All timing remains relative to bookings.confirmed_at.
--
-- WHAT: rename the two reminder guard columns for clarity (RENAME, not drop/recreate, so any flags
-- already set on live bookings are preserved). The day-7 escalation column keeps its existing name
-- (pretrip_overdue_alert_sent) — it is still "overdue", just at a later threshold.
--   pretrip_reminder_24h_sent → pretrip_reminder_day3_sent  (fires at confirmed_at + 72h)
--   pretrip_reminder_60h_sent → pretrip_reminder_day6_sent  (fires at confirmed_at + 144h)
--   pretrip_overdue_alert_sent (unchanged)                  (fires at confirmed_at + 168h)
--
-- Idempotent: only renames when the old column still exists and the new one does not, so re-running
-- this migration (or running it after a partial apply) is safe.

do $$
begin
  if exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'bookings'
           and column_name = 'pretrip_reminder_24h_sent'
      ) and not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'bookings'
           and column_name = 'pretrip_reminder_day3_sent'
      ) then
    alter table public.bookings rename column pretrip_reminder_24h_sent to pretrip_reminder_day3_sent;
  end if;

  if exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'bookings'
           and column_name = 'pretrip_reminder_60h_sent'
      ) and not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'bookings'
           and column_name = 'pretrip_reminder_day6_sent'
      ) then
    alter table public.bookings rename column pretrip_reminder_60h_sent to pretrip_reminder_day6_sent;
  end if;
end $$;
