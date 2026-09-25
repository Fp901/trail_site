-- bookings_slot_guard conformance harness — rooms model (migrations 0017 + 0018: joining takes 2).
--
-- WHY THIS IS A .sql FILE AND NOT PART OF THE tsx SCRIPTS
-- The trigger is the last line of defence and deliberately re-implements the rules in plpgsql,
-- independently of src/lib/pricing.ts. It therefore cannot be tested from Node.
--
-- HOW TO RUN
--   1. Apply supabase/migrations/0017_rooms_supplement_sadc_count.sql and 0018_join_minimum_two.sql
--   2. Paste this whole file into the Supabase SQL editor and run it
--   3. The last two result sets print the verdict and one row per check.
-- It wraps everything in a transaction and ROLLS BACK, so it never leaves test rows behind.
--
-- Rows are inserted with processor 'comp', which the WINDOW guard exempts, so only the slot guard
-- (and the room-mix CHECK) can reject them here. The taper and windows have their own harness
-- (verify-window-trigger.sql). Every test uses its own date, so earlier rows never interfere.
--
-- COVERS: opening minimums, the solo-join rule, the catering lock, the 4-room and 8-walker caps,
-- the room-mix CHECK, the generated rooms column and the DERIVED booking_type.
--
-- THE RACE ("two parties racing for the last room: exactly one succeeds") needs two sessions,
-- which the SQL editor cannot run from one script. Section E proves the sequential half (the
-- second grab of the last room is refused). To test true concurrency, open two SQL editor tabs:
--   tab 1:  begin; insert <a 2-walker, 1-room party on 2027-12-02>; -- do not commit yet
--   tab 2:  begin; insert <another such party on 2027-12-02>;      -- blocks on the advisory lock
--   tab 1:  commit;                                                  -- tab 2 now raises RW_ROOMS_FULL
-- after seeding 2027-12-02 with 3 rooms. Roll both back afterwards.

begin;

create temporary table t_res(label text, ok boolean, detail text);
-- Session-private and rolled back at the end, so no client can ever reach it. RLS is enabled
-- only so the Supabase SQL editor does not stop to ask; the owner running this is not bound by it.
alter table t_res enable row level security;

create or replace function t_try(
  p_label text, p_start date, p_size int, p_singles int, p_catering text, p_type text,
  p_should_fail boolean, p_expect_code text default null
) returns void language plpgsql as $fn$
declare
  v_err text;
begin
  begin
    insert into public.bookings
      (start_date, end_date, group_size, single_rooms, sadc_count, booking_type, catering,
       lead_name, lead_email, status, total_cents, amount_due_cents, currency, processor,
       processor_reference)
    values
      (p_start, p_start + 3, p_size, p_singles, case when p_catering = 'uncatered' then p_size else 0 end,
       p_type, p_catering, 'Harness', 'harness@example.com',
       'pending', 0, 0, 'ZAR', 'comp', 'harness_' || gen_random_uuid());
    v_err := null;
  exception when others then
    v_err := SQLERRM;
  end;

  if p_should_fail then
    if v_err is null then
      insert into t_res values (p_label, false, 'expected rejection, insert SUCCEEDED');
    elsif p_expect_code is not null and position(p_expect_code in v_err) = 0 then
      insert into t_res values (p_label, false, 'wrong error: ' || v_err);
    else
      insert into t_res values (p_label, true, 'correctly rejected');
    end if;
  else
    if v_err is null then
      insert into t_res values (p_label, true, 'correctly accepted');
    else
      insert into t_res values (p_label, false, 'expected acceptance, got: ' || v_err);
    end if;
  end if;
end;
$fn$;

-- Seed helper: an active booking that holds rooms on a date.
create or replace function t_seed(p_start date, p_size int, p_singles int, p_catering text)
returns void language sql as $fn$
  insert into public.bookings
    (start_date, end_date, group_size, single_rooms, sadc_count, booking_type, catering,
     lead_name, lead_email, status, total_cents, amount_due_cents, currency, processor,
     processor_reference)
  values
    (p_start, p_start + 3, p_size, p_singles, case when p_catering = 'uncatered' then p_size else 0 end,
     'shared', p_catering, 'Seed', 'seed@example.com',
     'confirmed', 0, 0, 'ZAR', 'comp', 'seed_' || gen_random_uuid());
$fn$;

-- ============================================================================================
-- A. OPENING AN EMPTY DATE. Catered takes 2 (any room mix); self-catered takes the full 8.
-- ============================================================================================
select t_try('A1 catered, 2 sharing, fresh date -> ACCEPT',              date '2027-06-07', 2, 0, 'catered',   'shared', false);
select t_try('A2 catered, 2 in own rooms, fresh date -> ACCEPT',         date '2027-06-10', 2, 2, 'catered',   'shared', false);
select t_try('A3 catered solo on a fresh date -> reject',                date '2027-06-14', 1, 1, 'catered',   'shared', true, 'RW_OPEN_MIN');
select t_try('A4 self-catered, 4, fresh -> reject',                      date '2027-06-21', 4, 0, 'uncatered', 'shared', true, 'RW_OPEN_MIN');
select t_try('A5 self-catered, 8 sharing, fresh -> ACCEPT',              date '2027-07-05', 8, 0, 'uncatered', 'shared', false);
select t_try('A6 size 9 -> reject (walker cap)',                         date '2027-07-12', 9, 1, 'catered',   'shared', true, 'RW_GROUP_TOO_LARGE');
select t_try('A7 3 walkers, 2 own rooms -> reject (odd number sharing)', date '2027-07-15', 3, 2, 'catered',   'shared', true, 'bookings_room_mix');
select t_try('A8 4 walkers, 4 own rooms, fresh -> ACCEPT',               date '2027-07-19', 4, 4, 'catered',   'shared', false);
select t_try('A9 5 walkers, 5 own rooms -> reject (5 rooms > 4)',        date '2027-07-22', 5, 5, 'catered',   'shared', true, 'RW_ROOMS_FULL');

-- ============================================================================================
-- B. JOINING. Seed 2027-08-02 with 3 walkers in 3 own rooms (3 of 4 rooms used).
-- ============================================================================================
select t_seed(date '2027-08-02', 3, 3, 'catered');
select t_try('B1 party needing 2 rooms on a 3-room date -> reject',      date '2027-08-02', 2, 2, 'catered',   'shared', true, 'RW_ROOMS_FULL');
select t_try('B2 mismatched catering -> reject',                         date '2027-08-02', 8, 0, 'uncatered', 'shared', true, 'RW_CATERING_LOCKED');

select t_seed(date '2027-08-05', 3, 3, 'catered');
select t_try('B3 party needing 1 room (2 sharing) on a 3-room date -> ACCEPT', date '2027-08-05', 2, 0, 'catered', 'shared', false);

select t_seed(date '2027-08-09', 2, 0, 'catered');
select t_try('B4 solo walker joining a guaranteed departure -> reject',  date '2027-08-09', 1, 1, 'catered',   'shared', true, 'RW_TOPUP_MIN');
select t_try('B6 two walkers joining a guaranteed departure -> ACCEPT',  date '2027-08-09', 2, 0, 'catered',   'shared', false);

select t_seed(date '2027-08-12', 8, 0, 'uncatered');
select t_try('B5 a second self-catered group on a full date -> reject',  date '2027-08-12', 8, 0, 'uncatered', 'shared', true, 'RW_ROOMS_FULL');

-- ============================================================================================
-- C. THE GENERATED rooms COLUMN.
-- ============================================================================================
select t_seed(date '2027-08-16', 5, 1, 'catered');
insert into t_res
select 'C1 5 walkers with 1 own room occupy 3 rooms', rooms = 3, 'stored rooms = ' || rooms
from public.bookings where start_date = date '2027-08-16' and lead_email = 'seed@example.com';

-- ============================================================================================
-- D. booking_type IS DERIVED BY THE TRIGGER: exclusive when one booking takes all 4 rooms.
-- ============================================================================================
insert into public.bookings
  (start_date, end_date, group_size, single_rooms, booking_type, catering, lead_name, lead_email,
   status, total_cents, amount_due_cents, currency, processor, processor_reference)
values
  (date '2027-09-06', date '2027-09-09', 4, 4, 'shared', 'catered', 'Derive', 'derive@example.com',
   'pending', 0, 0, 'ZAR', 'comp', 'derive_' || gen_random_uuid()),
  (date '2027-09-09', date '2027-09-12', 8, 0, 'shared', 'catered', 'Derive', 'derive8@example.com',
   'pending', 0, 0, 'ZAR', 'comp', 'derive8_' || gen_random_uuid()),
  (date '2027-09-13', date '2027-09-16', 2, 0, 'exclusive', 'catered', 'Derive', 'derive2@example.com',
   'pending', 0, 0, 'ZAR', 'comp', 'derive2_' || gen_random_uuid()),
  (date '2027-09-16', date '2027-09-19', 5, 1, 'exclusive', 'catered', 'Derive', 'derive3@example.com',
   'pending', 0, 0, 'ZAR', 'comp', 'derive3_' || gen_random_uuid());
insert into t_res
select 'D1 4 walkers in 4 own rooms are stored as exclusive', booking_type = 'exclusive', 'stored as ' || booking_type
from public.bookings where lead_email = 'derive@example.com';
insert into t_res
select 'D2 8 walkers sharing 4 rooms are stored as exclusive', booking_type = 'exclusive', 'stored as ' || booking_type
from public.bookings where lead_email = 'derive8@example.com';
insert into t_res
select 'D3 a caller asserting exclusive for 1 room is corrected to shared', booking_type = 'shared', 'stored as ' || booking_type
from public.bookings where lead_email = 'derive2@example.com';
insert into t_res
select 'D4 3 rooms is shared even when the caller says exclusive', booking_type = 'shared', 'stored as ' || booking_type
from public.bookings where lead_email = 'derive3@example.com';

-- ============================================================================================
-- E. THE LAST ROOM, SEQUENTIALLY. Seed 3 rooms; the first 1-room party takes the last room, the
--    second is refused. (True concurrency: see the two-tab procedure in the header.)
-- ============================================================================================
select t_seed(date '2027-12-02', 3, 3, 'catered');
select t_try('E1 first party (2 sharing) for the last room -> ACCEPT',   date '2027-12-02', 2, 0, 'catered',   'shared', false);
select t_try('E2 second party for the same room -> reject',              date '2027-12-02', 2, 0, 'catered',   'shared', true, 'RW_ROOMS_FULL');

-- ============================================================================================
-- RESULTS
-- ============================================================================================
select
  case when bool_and(ok) then 'ALL TRIGGER CHECKS PASSED' else 'FAILURES PRESENT' end as verdict,
  count(*) filter (where not ok) as failures,
  count(*) as total
from t_res;

select label, ok, detail from t_res order by label;

rollback;  -- leaves no test rows behind
