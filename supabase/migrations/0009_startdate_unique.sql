-- The Rooiberg Wander — staggered-groups availability (Option A)
--
-- WHY: the reserve runs multiple groups on the trail at once, staggered across the three lodges. A
-- new group can start on ANY day as long as no other group starts on that SAME day (two groups would
-- otherwise both be at Lodge 1 on night 1). Overlapping date RANGES are fine — the lodges handle
-- concurrent groups. So the only real double-booking is two ACTIVE bookings sharing a start_date.
--
-- This REPLACES the daterange GiST exclusion (bookings_no_overlap, migration 0001) — which blocked
-- the whole start→end window — with a simple unique index on start_date for active bookings, and
-- narrows the availability view to expose only the blocked START dates.
--
-- DATA SAFETY: the old constraint forbade any overlapping active ranges, which is STRICTER than
-- same-start-date uniqueness (two bookings sharing a start_date necessarily overlap). So any data the
-- old constraint permitted already has distinct active start_dates → the new unique index applies
-- cleanly, with no possibility of a duplicate-key failure on existing rows.

-- 1. Drop the old full-range overlap constraint.
alter table public.bookings drop constraint if exists bookings_no_overlap;

-- 2. Two active (pending or confirmed) bookings cannot share a start_date; overlapping ranges are OK.
--    Cancelled / hold-expired rows drop out of the predicate, freeing the date (see hold-sweep, 0002).
create unique index if not exists bookings_unique_start_date
  on public.bookings (start_date)
  where status in ('pending', 'confirmed');

comment on index public.bookings_unique_start_date is
  'Staggered groups (Option A): groups share the trail concurrently across different lodges, so '
  'overlapping date ranges are allowed. Only two active bookings on the SAME start_date are a real '
  'double-booking (both at Lodge 1 on night 1) — this uniquely prevents that.';

-- 3. Availability view — expose ONLY the blocked START dates (single dates, not ranges). The anon
--    calendar reads this to grey out just the days a new booking may not start on. Operator-blocked
--    windows are expanded to one row per day so every day inside a blocked range is an unavailable
--    start date. The end_date column is being removed, so the view must be DROPPED + recreated
--    (CREATE OR REPLACE cannot drop a column); the anon grant + advisory comment are re-applied after.
drop view if exists public.unavailable_windows;

create view public.unavailable_windows as
  select start_date from public.bookings
    where status = 'confirmed'
       or (status = 'pending' and hold_expires_at > now())
  union
  select gs::date as start_date
    from public.blocked_dates b
    cross join lateral generate_series(b.start_date, b.end_date, interval '1 day') as gs;

grant select on public.unavailable_windows to anon, authenticated;

comment on view public.unavailable_windows is
  'Intentional SECURITY DEFINER gateway: exposes ONLY blocked START dates (no PII, no ranges) so the '
  'anon availability calendar can tell which days a new booking may NOT start on, without any direct '
  'access to bookings. Staggered-groups model — a date inside an existing trip but not itself a start '
  'date remains bookable. Do not add PII columns here.';
