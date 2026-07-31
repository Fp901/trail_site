-- The Rooiberg Wander — Booking v3.1: per-person pricing + Wed/Thu exclusive buyouts +
-- open/top-up shared departures on every other day
--
-- WHY (Workstream B — commercial-model conformance, 2026-07-28 revision):
--   1. Every departure is now priced PER PERSON PER NIGHT (lib/pricing.ts). The DB no longer
--      needs to know the price at all — it only enforces WHICH dates/group-sizes are legal,
--      exactly as before.
--   2. WEDNESDAY and THURSDAY become EXCLUSIVE BUYOUT days: exactly 8 guests (min = max), one
--      booking, either catering. Every OTHER day (Sun, Mon, Tue, Fri, Sat) is a SHARED/FLEXIBLE
--      departure day: the FIRST active booking on a date LOCKS the day's catering, and its
--      minimum SPLITS BY CATERING -- >= 4 self-catered, >= 2 catered. Further bookings on that
--      date must be >= 2 (either product) and match the locked catering, up to 8 seats total.
--   3/4 are frontend/policy stories (calendar UI, seasonal/day pricing, booking windows) — no
--      schema impact beyond the views below.
--
-- Inventory model after this migration:
--   exclusive bookings: unique start_date among active rows (partial unique index), Wednesday
--     or Thursday only (trigger); group_size must equal 8 exactly.
--   shared bookings: any day except Wednesday/Thursday; multiple active rows may share a
--     start_date; the first active row on a date sets that date's catering (a later row with a
--     different catering is rejected) and must meet the per-catering opening minimum (4
--     self-catered / 2 catered); total seats (sum of group_size) capped at 8 per date by
--     a trigger under an advisory lock (the DB is the last line of defence against concurrent
--     seat-grabs; the server action checks first for UX).

-- ---------------------------------------------------------------------------
-- 1. Columns (unchanged from the v2.2 migration — booking_type/catering already exist on any
--    environment this has been applied to; safe to re-run).
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists booking_type text not null default 'exclusive'
    check (booking_type in ('exclusive', 'shared')),
  add column if not exists catering text not null default 'uncatered'
    check (catering in ('catered', 'uncatered'));

alter table public.bookings
  alter column residency drop not null;

-- ---------------------------------------------------------------------------
-- 2. Exclusive uniqueness — shared rows may share a start_date, so the unique-start-date
--    guard applies to exclusive bookings only. Unchanged in shape from v2.2.
-- ---------------------------------------------------------------------------
drop index if exists public.bookings_unique_start_date;

create unique index bookings_unique_start_date
  on public.bookings (start_date)
  where status in ('pending', 'confirmed') and booking_type = 'exclusive';

comment on index public.bookings_unique_start_date is
  'One active EXCLUSIVE (Wed/Thu buyout) booking per start_date. Shared departures on every '
  'other day intentionally allow multiple active bookings per date; their 8-seat capacity and '
  'catering lock are enforced by the bookings_slot_guard trigger.';

-- ---------------------------------------------------------------------------
-- 3. Slot guard trigger — Wednesday/Thursday are exclusive-buyout-only (exactly 8 guests);
--    every other day is shared/flexible (the first booking sets the day's catering and must meet
--    that catering's opening minimum — 4 self-catered / 2 catered — later bookings >= 2 and must
--    match, 8 seats total per date). BEFORE INSERT OR UPDATE so admin date-moves are covered too.
-- ---------------------------------------------------------------------------
create or replace function public.bookings_slot_guard()
returns trigger
language plpgsql
as $$
declare
  v_seats int;
  v_dow int;
  v_existing_catering text;
  v_min_open int;
begin
  -- Only active rows occupy inventory; cancelled rows may move/exist freely.
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  -- ISO day-of-week: Monday = 1 ... Saturday = 6, Sunday = 7.
  v_dow := extract(isodow from new.start_date);

  if new.booking_type = 'exclusive' then
    if v_dow not in (3, 4) then
      raise exception 'RW_EXCLUSIVE_WED_THU_ONLY: exclusive buyouts run Wednesday or Thursday only'
        using errcode = 'P0001';
    end if;
    if new.group_size <> 8 then
      raise exception 'RW_EXCLUSIVE_SIZE_8: an exclusive buyout is exactly 8 guests'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Shared/flexible rows: not Wednesday/Thursday (those are exclusive-only).
  if v_dow in (3, 4) then
    raise exception 'RW_SHARED_NOT_WED_THU: shared departures cannot start on a Wednesday or Thursday'
      using errcode = 'P0001';
  end if;

  -- Serialize concurrent seat-grabs for the same date (transaction-scoped advisory lock), then
  -- read the seats already held AND the catering already locked in by other active bookings.
  perform pg_advisory_xact_lock(hashtext('shared:' || new.start_date::text));
  select coalesce(sum(group_size), 0), min(catering) into v_seats, v_existing_catering
    from public.bookings
    where booking_type = 'shared'
      and start_date = new.start_date
      and status in ('pending', 'confirmed')
      and id <> new.id;

  if v_seats = 0 then
    -- Opening booking for this date: its catering sets the day's type (nothing to check it
    -- against yet), and the minimum SPLITS BY CATERING per the policy of 30 July 2026 --
    -- 4 self-catered, 2 catered. This mirrors minToOpen() in src/lib/pricing.ts; the two are
    -- independent implementations of one rule, so a change to either must change both.
    v_min_open := case when new.catering = 'catered' then 2 else 4 end;
    if new.group_size < v_min_open then
      raise exception 'RW_SHARED_OPEN_MIN: the first % booking on a shared date takes at least % people', new.catering, v_min_open
        using errcode = 'P0001';
    end if;
  else
    -- Top-up booking: needs at least 2 whichever the product, and must match the date's
    -- already-locked catering.
    if new.group_size < 2 then
      raise exception 'RW_SHARED_TOPUP_MIN: joining an open shared date takes at least 2 people'
        using errcode = 'P0001';
    end if;
    if new.catering <> v_existing_catering then
      raise exception 'RW_SHARED_CATERING_LOCKED: that date is already booked as %, not %', v_existing_catering, new.catering
        using errcode = 'P0001';
    end if;
  end if;

  if v_seats + new.group_size > 8 then
    raise exception 'RW_SHARED_FULL: only % place(s) left on that date', 8 - v_seats
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_slot_guard on public.bookings;
create trigger bookings_slot_guard
  before insert or update on public.bookings
  for each row execute function public.bookings_slot_guard();

-- ---------------------------------------------------------------------------
-- 4. Availability view — a start date is unavailable when: an active exclusive booking starts
--    then, OR it falls in an operator-blocked window, OR it is a FULL (or near-full) shared
--    date. This view is catering-agnostic — it answers "is this date bookable at all", not "for
--    which catering"; the per-catering/seats-left detail lives in shared_slot_availability
--    below, which the widget combines with this view client-side. Same shape/grants as
--    0009/0011.
-- ---------------------------------------------------------------------------
drop view if exists public.unavailable_windows;

create view public.unavailable_windows as
  select start_date from public.bookings
    where booking_type = 'exclusive'
      and (status = 'confirmed' or (status = 'pending' and hold_expires_at > now()))
  union
  select gs::date as start_date
    from public.blocked_dates b
    cross join lateral generate_series(b.start_date, b.end_date, interval '1 day') as gs
    where b.removed_at is null
  union
  -- A shared date is unavailable once fewer than SHARED_TOPUP_MIN (2) seats remain, not only
  -- when fully booked — a new top-up booking could not meet the 2-person minimum otherwise.
  -- Keep the literal "6" (= 8 capacity - 2 minimum) in sync with MAX_GROUP_SIZE/SHARED_TOPUP_MIN
  -- in src/data/rates.ts.
  select start_date from public.bookings
    where booking_type = 'shared'
      and (status = 'confirmed' or (status = 'pending' and hold_expires_at > now()))
    group by start_date
    having sum(group_size) > 6;

grant select on public.unavailable_windows to anon, authenticated;

comment on view public.unavailable_windows is
  'Intentional SECURITY DEFINER gateway: exposes ONLY blocked START dates (no PII, no ranges, '
  'no catering) for the anon availability calendar. Exclusive actives + operator-blocked days + '
  'FULL/near-full shared dates. Partially booked shared dates are NOT listed here (they remain '
  'bookable for a MATCHING catering top-up; see shared_slot_availability for seats + the locked '
  'catering). Do not add PII columns here.';

-- ---------------------------------------------------------------------------
-- 5. Shared-seat availability view — the calendar shows places left AND the locked catering per
--    shared date, so the widget can hide a date for a mismatched catering choice even though
--    seats remain. PII-free aggregate; a shared date with no row simply has all 8 places free
--    and no catering lock yet (NULL).
-- ---------------------------------------------------------------------------
drop view if exists public.shared_slot_availability;

create view public.shared_slot_availability as
  select
    start_date,
    greatest(0, 8 - sum(group_size))::int as seats_left,
    min(catering) as catering -- all active rows on a date share one catering; min() just reads it
  from public.bookings
  where booking_type = 'shared'
    and (status = 'confirmed' or (status = 'pending' and hold_expires_at > now()))
  group by start_date;

grant select on public.shared_slot_availability to anon, authenticated;

comment on view public.shared_slot_availability is
  'Intentional SECURITY DEFINER gateway: seats remaining AND the locked catering per shared '
  'date (no PII — only a date, a count and "catered"/"uncatered"). Dates absent from this view '
  'have all 8 places free and no catering lock yet. Do not add PII columns here.';
