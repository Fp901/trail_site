-- The Rooiberg Wander — joining a departure takes 2 again (25 September 2026)
--
-- WHAT THIS CHANGES
--   0017 let a single walker join a date someone had already booked. Solo walkers are no longer
--   booked online: the widget's "Travelling solo?" panel takes their details as an enquiry. So the
--   slot guard's joining minimum goes back to 2 for catered bookings (self-catered still needs the
--   full 8, so it can never be joined). Rooms, walkers, catering lock and derived booking_type are
--   exactly as 0017. Only bookings_slot_guard is replaced; nothing else in 0017 changes.
--
-- Safe to re-run.

create or replace function public.bookings_slot_guard()
returns trigger
language plpgsql
as $$
declare
  c_capacity        constant int := 8;  -- MAX_GROUP_SIZE
  c_rooms           constant int := 4;  -- ROOMS_PER_DEPARTURE
  c_min_catered     constant int := 2;  -- MIN_PARTY_CATERED
  c_min_uncatered   constant int := 8;  -- MIN_PARTY_UNCATERED
  c_min_join        constant int := 2;  -- MIN_TO_JOIN (catered)
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
    -- Joining: 2 catered; self-catered needs the full 8, so in practice a self-catered date can
    -- never be joined. (Resolved into a variable first: PL/pgSQL reads an IF condition up to the
    -- first THEN, so a CASE inside it breaks.)
    v_min_join := case when new.catering = 'catered' then c_min_join else c_min_uncatered end;
    if new.group_size < v_min_join then
      raise exception 'RW_TOPUP_MIN: joining an open date takes at least % people', v_min_join
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
