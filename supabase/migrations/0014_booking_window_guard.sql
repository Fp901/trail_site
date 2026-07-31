-- The Rooiberg Wander — booking-window + T-7 enforcement at the database layer
--
-- WHY THIS IS A SEPARATE MIGRATION FROM 0013
-- 0013 corrected rules the trigger already enforced (the per-catering opening minimum). This
-- migration adds enforcement that did not exist at the DB layer at all: until now the booking
-- window and the T-7 close were checked ONLY in createCheckout, i.e. above the last line of
-- defence. Policy §11 wants the trigger to reject both. New logic, own migration, own harness
-- (scripts/verify-window-trigger.sql).
--
-- ------------------------------------------------------------------------------------------
-- THREE DELIBERATE EXEMPTIONS. Each one prevents a regression, and each is load-bearing.
--
-- 1. INSERT ONLY, never UPDATE.
--    The webhook flips pending -> confirmed with an UPDATE. If window checks ran on UPDATE, a
--    booking that sat pending while "today" advanced past the boundary would FAIL TO CONFIRM
--    AFTER THE GUEST HAD PAID. Money taken, no booking. The window is a rule about when you may
--    START a booking, not a condition re-tested for the row's whole life, so INSERT-only is
--    correct as well as safe.
--
-- 2. processor = 'comp' is exempt.
--    adminCreateCompBooking (actions/index.ts) deliberately allows any date from today onward for
--    gifted/marketing trips. A blanket T-7 check would break it for every date inside a week.
--    Comp rows are already unmistakable (processor = 'comp'), audit-logged and admin-only.
--
-- 3. Admin date-moves are exempt by virtue of (1).
--    adminMoveDates carries the comment "Admins may move inside the public 7-day lead window
--    (deliberate override, logged)". It is an UPDATE, so (1) already exempts it. Noted here so
--    nobody "fixes" (1) later without realising it removes a documented capability.
--
-- Net effect: the guest booking path gains real DB-level enforcement; nothing an admin could do
-- before becomes impossible, and no paid booking can be blocked from confirming.
-- ------------------------------------------------------------------------------------------
--
-- OPEN QUESTION FLAGGED, NOT GUESSED — the T-7 boundary.
-- Policy §11 says "reject ... at or inside T-7", which reads as rejecting a start date exactly 7
-- days out. But §2 defines "earliest bookable is the later of that gate and today + 7 days"
-- (7 days out IS bookable), and §3's last-minute note says "full rate at T-7 is deliberate",
-- which only makes sense if a booking can exist at T-7 to be charged full rate for. Two of the
-- three statements agree that T-7 is bookable, so that is what is implemented here.
-- The boundary is the single constant c_min_lead_days below: change 7 to 8 to adopt the stricter
-- reading. Confirm with the operator before launch.

create or replace function public.bookings_window_guard()
returns trigger
language plpgsql
as $$
declare
  -- KEEP IN SYNC WITH src/data/rates.ts. scripts/verify-window.mjs asserts these three values
  -- match the TypeScript constants and fails the build-time check if they drift.
  c_booking_open       constant date := date '2027-01-15';  -- BOOKING_OPEN_DATE
  c_min_lead_days      constant int  := 7;                  -- T-7 close (see OPEN QUESTION above)
  c_months_catered     constant int  := 18;                 -- CATERED_WINDOW_MONTHS
  c_months_uncatered   constant int  := 8;                  -- UNCATERED_WINDOW_MONTHS

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

  -- Exemptions (2) and (3): comp bookings, and every UPDATE.
  if tg_op <> 'INSERT' or coalesce(new.processor, '') = 'comp' then
    return new;
  end if;

  -- SAST, matching todaySast() in src/lib/pricing.ts. Postgres runs UTC in Supabase, so using
  -- current_date directly would disagree with the application for two hours of every day.
  v_today := (now() at time zone 'Africa/Johannesburg')::date;

  -- Floor: the later of the T-7 close and the site-wide launch gate. Mirrors
  -- earliestBookableDate().
  v_earliest := greatest(v_today + c_min_lead_days, c_booking_open);
  if new.start_date < v_earliest then
    raise exception 'RW_WINDOW_TOO_SOON: start date % is before the earliest bookable date %', new.start_date, v_earliest
      using errcode = 'P0001';
  end if;

  -- Ceiling: a rolling per-catering window anchored to the later of today and the launch gate,
  -- mirroring windowAnchor() + latestBookableDate(). Anchoring to today alone would make the
  -- trigger stricter than the application before launch and reject legitimate bookings.
  v_months := case when new.catering = 'catered' then c_months_catered else c_months_uncatered end;
  v_anchor := greatest(v_today, c_booking_open);
  v_latest := (v_anchor + (v_months || ' months')::interval)::date;
  if new.start_date > v_latest then
    raise exception 'RW_WINDOW_TOO_FAR: start date % is beyond the % booking window, which ends %', new.start_date, new.catering, v_latest
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Separate trigger from bookings_slot_guard, fired BEFORE it (alphabetical order within the same
-- timing/event in Postgres: "aa_" prefix would be needed to guarantee order, but these two are
-- independent — neither depends on the other's outcome, so order does not matter).
drop trigger if exists bookings_window_guard on public.bookings;
create trigger bookings_window_guard
  before insert or update on public.bookings
  for each row execute function public.bookings_window_guard();

comment on function public.bookings_window_guard() is
  'Rejects guest bookings outside the booking window: before the T-7 close / BOOKING_OPEN_DATE '
  'floor, or beyond the rolling per-catering ceiling (18 months catered, 8 self-catered). '
  'INSERT-only and comp-exempt by design — see the header comment in 0014 for why, particularly '
  'that running on UPDATE would block already-paid bookings from confirming.';
