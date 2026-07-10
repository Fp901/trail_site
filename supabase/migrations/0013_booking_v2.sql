-- The Rooiberg Wander — Booking v2: catered/uncatered pricing + shared Monday departures
--
-- WHY (four operator user stories):
--   1. The pricing axis changes from residency (local/international) to CATERING
--      (catered/uncatered). The international premium is removed; new bookings no longer
--      record residency (legacy rows keep theirs).
--   2. Every MONDAY becomes one SHARED, catered-only departure that takes MULTIPLE group
--      bookings: each booking 2..8 people, 8 places total across bookings, priced per person
--      per night. All other days remain exclusive (one private group per start date).
--   3/4 are frontend/policy stories (calendar colour, go-live gating) — no schema impact
--      beyond the views below.
--
-- Inventory model after this migration:
--   exclusive bookings: unique start_date among active rows (partial unique index), any day
--     EXCEPT Monday (trigger).
--   shared bookings: Mondays only; multiple active rows may share a start_date; total seats
--     (sum of group_size) capped at 8 by a trigger under an advisory lock (the DB is the last
--     line of defence against concurrent seat-grabs; the server action checks first for UX).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists booking_type text not null default 'exclusive'
    check (booking_type in ('exclusive', 'shared')),
  -- Legacy rows were all self-catered, so the default maps history correctly.
  add column if not exists catering text not null default 'uncatered'
    check (catering in ('catered', 'uncatered'));

-- New bookings no longer record residency; legacy data is preserved. The CHECK constraint
-- passes on NULL, so only the NOT NULL needs to go.
alter table public.bookings
  alter column residency drop not null;

-- ---------------------------------------------------------------------------
-- 2. Exclusive uniqueness — shared rows may share a start_date, so the unique-start-date
--    guard now applies to exclusive bookings only.
-- ---------------------------------------------------------------------------
drop index if exists public.bookings_unique_start_date;

create unique index bookings_unique_start_date
  on public.bookings (start_date)
  where status in ('pending', 'confirmed') and booking_type = 'exclusive';

comment on index public.bookings_unique_start_date is
  'One active EXCLUSIVE booking per start_date (staggered-groups model). Shared Monday '
  'departures intentionally allow multiple active bookings per date; their 8-seat capacity '
  'is enforced by the bookings_slot_guard trigger.';

-- ---------------------------------------------------------------------------
-- 3. Slot guard trigger — Mondays are shared-only, other days exclusive-only, and shared
--    capacity is 8 seats. BEFORE INSERT OR UPDATE so admin date-moves are covered too.
-- ---------------------------------------------------------------------------
create or replace function public.bookings_slot_guard()
returns trigger
language plpgsql
as $$
declare
  v_seats int;
begin
  -- Only active rows occupy inventory; cancelled rows may move/exist freely.
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  if new.booking_type = 'exclusive' then
    if extract(isodow from new.start_date) = 1 then
      raise exception 'RW_MONDAY_SHARED_ONLY: Mondays are reserved for shared departures'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Shared rows: Monday only, 2..8 people per booking, 8 seats total across bookings.
  if extract(isodow from new.start_date) <> 1 then
    raise exception 'RW_SHARED_MONDAY_ONLY: shared departures start on Mondays only'
      using errcode = 'P0001';
  end if;
  if new.group_size < 2 or new.group_size > 8 then
    raise exception 'RW_SHARED_SIZE: shared bookings take 2 to 8 people'
      using errcode = 'P0001';
  end if;

  -- Serialize concurrent seat-grabs for the same Monday (transaction-scoped advisory lock),
  -- then count the seats already held by OTHER active shared bookings on that date.
  perform pg_advisory_xact_lock(hashtext('shared:' || new.start_date::text));
  select coalesce(sum(group_size), 0) into v_seats
    from public.bookings
    where booking_type = 'shared'
      and start_date = new.start_date
      and status in ('pending', 'confirmed')
      and id <> new.id;
  if v_seats + new.group_size > 8 then
    raise exception 'RW_SHARED_FULL: only % place(s) left on that Monday', 8 - v_seats
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
--    then, OR it falls in an operator-blocked window, OR it is a FULL shared Monday (8 seats
--    held). Partially booked Mondays stay bookable. Same shape/grants as 0009/0011.
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
  -- A Monday is unavailable once fewer than SHARED_MIN_PEOPLE (2) seats remain, not only when
  -- fully booked — a new booking could not meet the 2-person minimum otherwise. Keep the
  -- literal "6" (= 8 capacity - 2 minimum) in sync with SHARED_MAX_CAPACITY/SHARED_MIN_PEOPLE
  -- in src/data/rates.ts.
  select start_date from public.bookings
    where booking_type = 'shared'
      and (status = 'confirmed' or (status = 'pending' and hold_expires_at > now()))
    group by start_date
    having sum(group_size) > 6;

grant select on public.unavailable_windows to anon, authenticated;

comment on view public.unavailable_windows is
  'Intentional SECURITY DEFINER gateway: exposes ONLY blocked START dates (no PII, no ranges) '
  'for the anon availability calendar. Exclusive actives + operator-blocked days + FULL shared '
  'Mondays. Partially booked shared Mondays are NOT listed (they remain bookable; see '
  'shared_slot_availability for seats). Do not add PII columns here.';

-- ---------------------------------------------------------------------------
-- 5. Shared-seat availability view — the calendar shows places left per Monday. PII-free
--    aggregate; a Monday with no row simply has all 8 places free.
-- ---------------------------------------------------------------------------
drop view if exists public.shared_slot_availability;

create view public.shared_slot_availability as
  select
    start_date,
    greatest(0, 8 - sum(group_size))::int as seats_left
  from public.bookings
  where booking_type = 'shared'
    and (status = 'confirmed' or (status = 'pending' and hold_expires_at > now()))
  group by start_date;

grant select on public.shared_slot_availability to anon, authenticated;

comment on view public.shared_slot_availability is
  'Intentional SECURITY DEFINER gateway: seats remaining per shared Monday (no PII — only a '
  'date and a count). Mondays absent from this view have all 8 places free. Do not add PII '
  'columns here.';
