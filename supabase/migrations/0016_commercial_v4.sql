-- The Rooiberg Wander — commercial model v4 (memo to Francois, 15 September 2026)
--
-- WHAT THIS CHANGES
--   1. residency is a live pricing input again: 'local' becomes 'sadc', and a SADC catered
--      booking pays 30% less. A new residency_declared_at records when the guest ticked the
--      "we will show SA ID or SADC passport at check-in" declaration.
--   2. The Wednesday/Thursday exclusive-buyout day rule is GONE. Every open start day works the
--      same way: 8 places, first booking opens the date and locks its catering, later bookings
--      join in 2s. booking_type is now DERIVED by the trigger (a party that opens a date with all
--      8 places is 'exclusive'), never asserted by the application.
--   3. Minimum party size is a property of the product: 2 for catered, 8 for self-catered.
--   4. Tapered start: Tuesday, Wednesday and Saturday are not start days up to 31 December 2028.
--   5. Booking opens 1 April 2027 (was 15 January 2027); international catered books 24 months
--      ahead, every SADC product 12.
--   6. departure_inventory carries seats_taken explicitly (the "2 of 8 spots booked" line) and
--      drops is_exclusive, which no longer names a distinct state.
--
-- Safe to re-run. Money columns, RLS, the hold sweep and the split-payment columns are untouched.

-- ---------------------------------------------------------------------------
-- 1. Residency: 'local' -> 'sadc', plus the declaration timestamp.
-- ---------------------------------------------------------------------------
alter table public.bookings drop constraint if exists bookings_residency_check;
update public.bookings set residency = 'sadc' where residency = 'local';
alter table public.bookings
  add constraint bookings_residency_check
  check (residency is null or residency in ('sadc', 'international'));

alter table public.bookings
  add column if not exists residency_declared_at timestamptz;

-- The country the lead guest gave at checkout (ISO 3166-1 alpha-2). The rate band above is
-- DERIVED from it, so storing the country keeps the reason for the band auditable, and gives the
-- operator the source-market breakdown the business plan's DMC strategy depends on.
alter table public.bookings
  add column if not exists lead_country text;

comment on column public.bookings.residency is
  'Pricing input under commercial model v4: sadc pays 30% less for the catered product, and the '
  'self-catered product is SADC-only. Nullable only for pre-v4 rows.';
comment on column public.bookings.lead_country is
  'ISO 3166-1 alpha-2 country of residence given by the lead guest at checkout. The residency '
  'band is derived from this server-side (src/data/countries.ts); the browser never sends a band.';
comment on column public.bookings.residency_declared_at is
  'When the guest accepted the SADC residency declaration at checkout. Null for international '
  'bookings and for pre-v4 rows. Proof itself is checked in person at Temminck''s Lodge.';

-- ---------------------------------------------------------------------------
-- 2. Slot guard — one rule for every open start day.
--    Opening booking: meets the product minimum (2 catered / 8 self-catered) and locks the
--    date's catering. Later bookings: at least 2 people, matching catering, up to 8 seats.
--    booking_type is derived here so the DB, not the caller, decides what "exclusive" means.
--    BEFORE INSERT OR UPDATE so admin date-moves are covered too.
-- ---------------------------------------------------------------------------
create or replace function public.bookings_slot_guard()
returns trigger
language plpgsql
as $$
declare
  c_capacity        constant int := 8;  -- MAX_GROUP_SIZE
  c_min_catered     constant int := 2;  -- MIN_PARTY_CATERED
  c_min_uncatered   constant int := 8;  -- MIN_PARTY_UNCATERED
  c_min_join        constant int := 2;  -- MIN_TO_JOIN
  v_seats int;
  v_existing_catering text;
  v_min_open int;
begin
  -- Only active rows occupy inventory; cancelled rows may move/exist freely.
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  if new.group_size > c_capacity then
    raise exception 'RW_GROUP_TOO_LARGE: a departure takes at most % guests', c_capacity
      using errcode = 'P0001';
  end if;

  -- Serialize concurrent seat-grabs for the same date (transaction-scoped advisory lock), then
  -- read the seats already held AND the catering already locked in by other active bookings.
  -- Unlike v3 this counts EVERY active row on the date, not only the shared ones: there is no
  -- separate exclusive inventory any more.
  perform pg_advisory_xact_lock(hashtext('departure:' || new.start_date::text));
  select coalesce(sum(group_size), 0), min(catering) into v_seats, v_existing_catering
    from public.bookings
    where start_date = new.start_date
      and status in ('pending', 'confirmed')
      and id <> new.id;

  if v_seats = 0 then
    -- Opening booking: its catering sets the day's type, and the minimum is a property of the
    -- product. Mirrors minPartySize() in src/data/rates.ts; the two are independent
    -- implementations of one rule, so a change to either must change both.
    v_min_open := case when new.catering = 'catered' then c_min_catered else c_min_uncatered end;
    if new.group_size < v_min_open then
      raise exception 'RW_OPEN_MIN: the first % booking on a date takes at least % people', new.catering, v_min_open
        using errcode = 'P0001';
    end if;
  else
    -- Joining an open date: at least 2 people, and the catering already locked in.
    if new.group_size < c_min_join then
      raise exception 'RW_TOPUP_MIN: joining an open date takes at least % people', c_min_join
        using errcode = 'P0001';
    end if;
    if new.catering <> v_existing_catering then
      raise exception 'RW_CATERING_LOCKED: that date is already booked as %, not %', v_existing_catering, new.catering
        using errcode = 'P0001';
    end if;
  end if;

  if v_seats + new.group_size > c_capacity then
    raise exception 'RW_FULL: only % place(s) left on that date', c_capacity - v_seats
      using errcode = 'P0001';
  end if;

  -- Derived, never asserted: a party that opens a date with the full complement has the trail to
  -- itself. Anything else shares, even if it later fills up.
  new.booking_type := case
    when v_seats = 0 and new.group_size >= c_capacity then 'exclusive'
    else 'shared'
  end;

  return new;
end;
$$;

drop trigger if exists bookings_slot_guard on public.bookings;
create trigger bookings_slot_guard
  before insert or update on public.bookings
  for each row execute function public.bookings_slot_guard();

-- The v3 partial unique index enforced "one exclusive booking per start date". Capacity is now
-- enforced entirely by the seat count above, and an 'exclusive' row is simply a full one, so the
-- index would reject nothing the guard does not already reject. Dropped to keep one rule.
drop index if exists public.bookings_unique_start_date;

-- ---------------------------------------------------------------------------
-- 3. Window guard — booking opens 1 April 2027; 24 months ahead for international catered,
--    12 for every SADC product; T-7 close; and the tapered start days.
--    INSERT-only and comp-exempt, exactly as in 0014: an admin moving or comping a booking is a
--    deliberate act by an authenticated operator, already audit-logged.
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
    when new.catering = 'catered' and coalesce(new.residency, 'international') = 'international'
      then c_months_intl
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
-- 4. departure_inventory — same sparse, PII-free contract as 0015, reshaped for v4:
--    seats_taken is exposed (the guaranteed-departure line quotes it) and is_exclusive is gone.
-- ---------------------------------------------------------------------------
drop view if exists public.departure_inventory;

create view public.departure_inventory as
with active as (
  -- Rows that actually hold inventory: confirmed, or pending with a live hold.
  select start_date, catering, group_size
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
  -- Remaining capacity out of 8. Forced to 0 when the date cannot take another booking at all,
  -- so "does this party fit" is a single comparison client-side regardless of the reason.
  case
    when b.start_date is not null then 0                        -- operator-blocked
    else greatest(0, 8 - coalesce(k.seats_taken, 0))
  end::int                        as seats_left,
  k.locked_catering,                                            -- null = not yet opened
  (b.start_date is not null)      as is_blocked
from dated d
left join booked  k on k.start_date = d.start_date
left join blocked b on b.start_date = d.start_date;

grant select on public.departure_inventory to anon, authenticated;

comment on view public.departure_inventory is
  'Intentional SECURITY DEFINER gateway for the anon booking calendar. Derived from bookings + '
  'blocked_dates on every read, never materialised, so it cannot drift from the rows it '
  'describes. PII-FREE by construction: a date, two seat counts, a catering label and a boolean. '
  'CLIENT CONTRACT: the view is SPARSE. A start_date absent from it has no state at all, meaning '
  'no seats taken, all 8 places free, no catering lock, not blocked. Rows only exist for dates '
  'carrying a booking or an operator block. seats_left is forced to 0 on a blocked date so a '
  'single comparison answers "does this party fit"; seats_taken still reports the real count. '
  'locked_catering is null until the first booking on a date sets it. Do not add PII columns.';
