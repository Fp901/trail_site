-- The Rooiberg Wander — rooms, single supplement and SADC count (23 September 2026)
--
-- WHAT THIS CHANGES
--   1. A departure has 4 double rooms (still at most 8 walkers). A booking says how many guests
--      need their own room (single_rooms) and how many are SADC residents (sadc_count). Guests
--      only share a room within their own booking, so rooms = single_rooms + sharers / 2.
--   2. The slot guard caps a date at 4 rooms AND 8 walkers. Opening an empty date still takes
--      2 catered / 8 self-catered; joining now takes 1 catered, so a solo walker can only book a
--      guaranteed departure. booking_type is 'exclusive' when one booking takes all 4 rooms.
--   3. The window guard gives 12 months as soon as anyone is counted as SADC (was: the band).
--   4. departure_inventory gains rooms_taken. Still no personal data.
--   5. age_confirmed_at records when the lead guest ticked the minimum-age confirmation.
--   6. lead_country stays (nullable) for older rows; the widget no longer asks for a country.
--
-- Safe to re-run. Money columns, RLS, the hold sweep and the split-payment columns are untouched.

-- ---------------------------------------------------------------------------
-- 1. Columns, backfill and the room-mix CHECK.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists single_rooms int not null default 0,
  add column if not exists sadc_count int not null default 0,
  add column if not exists age_confirmed_at timestamptz;

-- Existing rows predate room choices: an odd party is assumed to need one own room, and a row
-- priced at the SADC band counted every guest as SADC. Runs before the CHECK below so an odd
-- group_size never violates it.
update public.bookings
  set single_rooms = group_size % 2
  where single_rooms = 0 and group_size % 2 = 1;
update public.bookings
  set sadc_count = group_size
  where residency = 'sadc' and sadc_count = 0;

alter table public.bookings
  add column if not exists rooms int generated always as (single_rooms + (group_size - single_rooms) / 2) stored;

alter table public.bookings drop constraint if exists bookings_room_mix;
alter table public.bookings
  add constraint bookings_room_mix check (
    single_rooms between 0 and group_size
    and (group_size - single_rooms) % 2 = 0
    and sadc_count between 0 and group_size
  );

alter table public.bookings alter column lead_country drop not null;

comment on column public.bookings.single_rooms is
  'Guests in their own room (each pays the 40% single supplement, catered only). The rest share '
  'doubles within the booking, so (group_size - single_rooms) is always even.';
comment on column public.bookings.sadc_count is
  'Guests counted as SADC residents at checkout (30% off their own rate, catered). Self-catered '
  'bookings are always 8. Any SADC guest shortens the booking window to 12 months.';
comment on column public.bookings.rooms is
  'Rooms this booking occupies: single_rooms + (group_size - single_rooms) / 2. A date holds 4.';
comment on column public.bookings.age_confirmed_at is
  'When the lead guest confirmed every guest will be at least 16 on the start date.';

-- ---------------------------------------------------------------------------
-- 2. Slot guard — rooms and walkers.
--    BEFORE INSERT OR UPDATE so admin date-moves are covered too. The generated `rooms` column is
--    not yet computed in a BEFORE trigger, so the booking's own room count is worked out here.
-- ---------------------------------------------------------------------------
create or replace function public.bookings_slot_guard()
returns trigger
language plpgsql
as $$
declare
  c_capacity        constant int := 8;  -- MAX_GROUP_SIZE
  c_rooms           constant int := 4;  -- ROOMS_PER_DEPARTURE
  c_min_catered     constant int := 2;  -- MIN_PARTY_CATERED
  c_min_uncatered   constant int := 8;  -- MIN_PARTY_UNCATERED
  c_min_join        constant int := 1;  -- MIN_TO_JOIN (catered)
  v_seats int;
  v_rooms_taken int;
  v_new_rooms int;
  v_existing_catering text;
  v_min_open int;
  v_min_join int;
begin
  -- Only active rows occupy inventory; cancelled rows may move/exist freely.
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  if new.group_size > c_capacity then
    raise exception 'RW_GROUP_TOO_LARGE: a departure takes at most % guests', c_capacity
      using errcode = 'P0001';
  end if;

  v_new_rooms := new.single_rooms + (new.group_size - new.single_rooms) / 2;

  -- Serialize concurrent grabs for the same date (transaction-scoped advisory lock), then read
  -- the walkers, rooms and catering already held by other active bookings on it.
  perform pg_advisory_xact_lock(hashtext('departure:' || new.start_date::text));
  select coalesce(sum(group_size), 0),
         coalesce(sum(single_rooms + (group_size - single_rooms) / 2), 0),
         min(catering)
    into v_seats, v_rooms_taken, v_existing_catering
    from public.bookings
    where start_date = new.start_date
      and status in ('pending', 'confirmed')
      and id <> new.id;

  if v_seats = 0 then
    -- Opening booking: its catering sets the day's type, and the minimum is a property of the
    -- product. Mirrors minPartySize() in src/data/rates.ts.
    v_min_open := case when new.catering = 'catered' then c_min_catered else c_min_uncatered end;
    if new.group_size < v_min_open then
      raise exception 'RW_OPEN_MIN: the first % booking on a date takes at least % people', new.catering, v_min_open
        using errcode = 'P0001';
    end if;
  else
    if new.catering <> v_existing_catering then
      raise exception 'RW_CATERING_LOCKED: that date is already booked as %, not %', v_existing_catering, new.catering
        using errcode = 'P0001';
    end if;
    -- Joining: 1 catered, which the group_size CHECK already guarantees. Self-catered needs the
    -- full 8, so in practice a self-catered date can never be joined. (Resolved into a variable
    -- first: PL/pgSQL reads an IF condition up to the first THEN, so a CASE inside it breaks.)
    v_min_join := case when new.catering = 'catered' then c_min_join else c_min_uncatered end;
    if new.group_size < v_min_join then
      raise exception 'RW_TOPUP_MIN: joining an open date takes at least % people', c_min_uncatered
        using errcode = 'P0001';
    end if;
  end if;

  if v_rooms_taken + v_new_rooms > c_rooms then
    raise exception 'RW_ROOMS_FULL: only % room(s) left on that date', c_rooms - v_rooms_taken
      using errcode = 'P0001';
  end if;

  if v_seats + new.group_size > c_capacity then
    raise exception 'RW_FULL: only % place(s) left on that date', c_capacity - v_seats
      using errcode = 'P0001';
  end if;

  -- Derived, never asserted: a booking that takes all 4 rooms has the trail to itself.
  new.booking_type := case
    when v_new_rooms >= c_rooms then 'exclusive'
    else 'shared'
  end;

  return new;
end;
$$;

drop trigger if exists bookings_slot_guard on public.bookings;
create trigger bookings_slot_guard
  before insert or update on public.bookings
  for each row execute function public.bookings_slot_guard();

-- ---------------------------------------------------------------------------
-- 3. Window guard — as 0016, except the 12-month ceiling now applies whenever sadc_count > 0.
-- ---------------------------------------------------------------------------
create or replace function public.bookings_window_guard()
returns trigger
language plpgsql
as $$
declare
  -- KEEP IN SYNC WITH src/data/rates.ts. scripts/verify-window.mjs asserts these values match the
  -- TypeScript constants and fails if they drift.
  c_booking_open     constant date := date '2027-04-01';  -- BOOKING_OPEN_DATE
  c_min_lead_days    constant int  := 7;                  -- T-7 close
  c_months_intl      constant int  := 24;                 -- INTL_CATERED_WINDOW_MONTHS
  c_months_sadc      constant int  := 12;                 -- SADC_WINDOW_MONTHS
  c_taper_end        constant date := date '2028-12-31';  -- TAPER_END_DATE
  c_taper_dows       constant int[] := array[2, 3, 6];    -- TAPER_BLOCKED_ISODOW: Tue, Wed, Sat

  v_today    date;
  v_anchor   date;
  v_earliest date;
  v_latest   date;
  v_months   int;
begin
  -- Cancelled rows hold no inventory and are not subject to the window.
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  -- Exemptions: comp bookings, and every UPDATE (admin date-moves).
  if tg_op <> 'INSERT' or coalesce(new.processor, '') = 'comp' then
    return new;
  end if;

  -- Tapered start: four start days a week until the end of 2028.
  if new.start_date <= c_taper_end
     and extract(isodow from new.start_date)::int = any (c_taper_dows) then
    raise exception 'RW_TAPER_DAY: departures run Sunday, Monday, Thursday and Friday until %', c_taper_end
      using errcode = 'P0001';
  end if;

  v_today := (now() at time zone 'Africa/Johannesburg')::date;

  v_earliest := greatest(v_today + c_min_lead_days, c_booking_open);
  if new.start_date < v_earliest then
    raise exception 'RW_WINDOW_TOO_SOON: the earliest bookable start date is %', v_earliest
      using errcode = 'P0001';
  end if;

  v_anchor := greatest(v_today, c_booking_open);
  v_months := case
    when new.catering = 'catered' and new.sadc_count = 0 then c_months_intl
    else c_months_sadc
  end;
  v_latest := v_anchor + (v_months || ' months')::interval;
  if new.start_date > v_latest then
    raise exception 'RW_WINDOW_TOO_FAR: that product books up to % months ahead (to %)', v_months, v_latest
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_window_guard on public.bookings;
create trigger bookings_window_guard
  before insert or update on public.bookings
  for each row execute function public.bookings_window_guard();

-- ---------------------------------------------------------------------------
-- 4. departure_inventory — as 0016, plus rooms_taken.
-- ---------------------------------------------------------------------------
drop view if exists public.departure_inventory;

create view public.departure_inventory as
with active as (
  -- Rows that actually hold inventory: confirmed, or pending with a live hold.
  select start_date, catering, group_size, rooms
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
booked as (
  -- All active rows on a date share one catering (the slot guard enforces it), so min() simply
  -- reads the locked value rather than choosing between competing ones.
  select
    start_date,
    sum(group_size)::int as seats_taken,
    sum(rooms)::int      as rooms_taken,
    min(catering)        as locked_catering
  from active
  group by start_date
),
dated as (
  select start_date from blocked
  union
  select start_date from booked
)
select
  d.start_date,
  coalesce(k.seats_taken, 0)::int as seats_taken,
  -- Remaining walker capacity out of 8. Forced to 0 when the date cannot take another booking at
  -- all, so "does this party fit" is a single comparison client-side regardless of the reason.
  case
    when b.start_date is not null then 0                        -- operator-blocked
    else greatest(0, 8 - coalesce(k.seats_taken, 0))
  end::int                        as seats_left,
  -- Rooms held on the date, out of 4. The calendar fits a party by rooms first.
  coalesce(k.rooms_taken, 0)::int as rooms_taken,
  k.locked_catering,                                            -- null = not yet opened
  (b.start_date is not null)      as is_blocked
from dated d
left join booked  k on k.start_date = d.start_date
left join blocked b on b.start_date = d.start_date;

grant select on public.departure_inventory to anon, authenticated;

comment on view public.departure_inventory is
  'Intentional SECURITY DEFINER gateway for the anon booking calendar. Derived from bookings + '
  'blocked_dates on every read, never materialised, so it cannot drift from the rows it '
  'describes. PII-FREE by construction: a date, seat and room counts, a catering label and a '
  'boolean. CLIENT CONTRACT: the view is SPARSE. A start_date absent from it has no state at all, '
  'meaning no seats or rooms taken, all 8 places and 4 rooms free, no catering lock, not blocked. '
  'Rows only exist for dates carrying a booking or an operator block. seats_left is forced to 0 on '
  'a blocked date so a single comparison answers "does this party fit"; seats_taken and '
  'rooms_taken still report the real counts. locked_catering is null until the first booking on a '
  'date sets it. Do not add PII columns.';
