-- The Rooiberg Wander — one derived inventory view, replacing the two-view availability read
--
-- Policy §10 asks for one record per start date holding remaining capacity, the locked catering
-- type or null, and an exclusive flag, and is explicit that it must be DERIVED, not materialised:
-- a separate inventory table duplicating booking state drifts from the bookings it mirrors, and
-- bookings_slot_guard already enforces capacity under an advisory lock against `bookings` as the
-- single source of truth. A view gives the same interface with no drift.
--
-- This replaces `unavailable_windows` + `shared_slot_availability`, which between them expressed
-- overlapping truth in two shapes and forced the calendar to join them client-side.
--
-- ------------------------------------------------------------------------------------------
-- TWO DELIBERATE DEPARTURES FROM THE §10 SHAPE, both flagged:
--
-- 1. `is_blocked` is added. §10 lists capacity + locked catering + exclusive flag. But §5 needs
--    the grey cell to STATE ITS REASON, and "full" and "operator-blocked" are different reasons
--    a guest should be told apart. Without this column the calendar cannot distinguish them.
--
-- 2. The view is SPARSE, not a generated date series. Only dates with state (a booking or a
--    block) get a row; a date that is absent is fully open. Generating a row per day across the
--    18-month catered window would be ~550 rows on every calendar load, which at launch — with
--    no bookings at all — means shipping ~22KB to say "everything is free". The client contract
--    is documented on the view comment below, and the widget applies it in one place.
-- ------------------------------------------------------------------------------------------

drop view if exists public.departure_inventory;

create view public.departure_inventory as
with active as (
  -- Rows that actually hold inventory: confirmed, or pending with a live hold.
  select start_date, booking_type, catering, group_size
  from public.bookings
  where status = 'confirmed'
     or (status = 'pending' and hold_expires_at > now())
),
blocked as (
  -- Operator-blocked windows expanded from ranges to individual days, because the calendar
  -- reasons in days. `distinct` guards against overlapping blocked ranges double-counting.
  select distinct gs::date as start_date
  from public.blocked_dates b
  cross join lateral generate_series(b.start_date, b.end_date, interval '1 day') as gs
  where b.removed_at is null
),
exclusive_taken as (
  select distinct start_date from active where booking_type = 'exclusive'
),
shared_agg as (
  -- All active shared rows on a date share one catering (the trigger enforces it), so min()
  -- simply reads the locked value rather than choosing between competing ones.
  select
    start_date,
    sum(group_size)::int as seats_taken,
    min(catering)        as locked_catering
  from active
  where booking_type = 'shared'
  group by start_date
),
dated as (
  select start_date from blocked
  union
  select start_date from exclusive_taken
  union
  select start_date from shared_agg
)
select
  d.start_date,
  -- Remaining capacity out of 8. Forced to 0 when the date cannot take another booking at all,
  -- so "does this party fit" is a single comparison client-side regardless of the reason.
  case
    when e.start_date is not null then 0                              -- exclusive buyout holds it
    when b.start_date is not null then 0                              -- operator-blocked
    else greatest(0, 8 - coalesce(s.seats_taken, 0))
  end::int                        as seats_left,
  s.locked_catering,                                                  -- null = not yet opened
  (e.start_date is not null)      as is_exclusive,
  (b.start_date is not null)      as is_blocked
from dated d
left join shared_agg      s on s.start_date = d.start_date
left join exclusive_taken e on e.start_date = d.start_date
left join blocked         b on b.start_date = d.start_date;

grant select on public.departure_inventory to anon, authenticated;

comment on view public.departure_inventory is
  'Intentional SECURITY DEFINER gateway for the anon booking calendar. Derived from bookings + '
  'blocked_dates on every read, never materialised, so it cannot drift from the rows it '
  'describes. PII-FREE by construction: a date, a seat count, a catering label and two booleans. '
  'CLIENT CONTRACT: the view is SPARSE. A start_date absent from it has no state at all, meaning '
  'all 8 places free, no catering lock, not exclusive, not blocked. Rows only exist for dates '
  'carrying a booking or an operator block. seats_left is forced to 0 for exclusive-held and '
  'blocked dates so a single comparison answers "does this party fit". locked_catering is null '
  'until the first booking on a shared date sets it. Do not add PII columns here.';

-- ---------------------------------------------------------------------------
-- Retire the two views this replaces. Both were anon-readable and are now dead: the only
-- application consumer was BookingWidget.astro, migrated to departure_inventory in the same
-- change. Dropping them rather than leaving them in place is deliberate — two live definitions
-- of the same truth is the drift §10 warns about, even when both are views.
-- ---------------------------------------------------------------------------
drop view if exists public.unavailable_windows;
drop view if exists public.shared_slot_availability;
