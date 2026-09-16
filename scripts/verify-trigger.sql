-- bookings_slot_guard conformance harness — commercial model v4 (memo, 15 September 2026).
--
-- WHY THIS IS A .sql FILE AND NOT PART OF THE tsx SCRIPTS
-- The trigger is the last line of defence and deliberately re-implements the rules in plpgsql,
-- independently of src/lib/pricing.ts. It therefore cannot be tested from Node. Migration 0016
-- has NOT been applied to Supabase yet, so nothing in this file has been executed against it.
--
-- HOW TO RUN
--   1. Apply supabase/migrations/0016_commercial_v4.sql
--   2. Paste this whole file into the Supabase SQL editor and run it
--   3. Every block prints PASS or raises. Any FAIL/exception is a real conformance failure.
-- It wraps everything in a transaction and ROLLS BACK, so it never leaves test rows behind.
--
-- COVERS: the product minimums, the join minimum, the catering lock, capacity, and the DERIVED
-- booking_type. The taper, the booking windows and T-7 live in bookings_window_guard and have
-- their own harness (verify-window-trigger.sql).

begin;

-- Deterministic dates. Every date used below is a Sunday, Monday, Thursday or Friday, i.e. a real
-- start day under the taper, so the slot guard is what rejects a row rather than the window guard.
-- (The slot guard does not check the day of week at all under v4 — that is deliberate — but using
-- real start days keeps the harness honest if the two triggers are ever run together.)
create temporary table t_res(label text, ok boolean, detail text);

create or replace function t_try(
  p_label text, p_start date, p_size int, p_catering text, p_type text, p_should_fail boolean,
  p_expect_code text default null
) returns void language plpgsql as $fn$
declare
  v_err text;
begin
  begin
    insert into public.bookings
      (start_date, end_date, group_size, booking_type, catering, lead_name, lead_email,
       status, total_cents, amount_due_cents, currency, processor, processor_reference)
    values
      (p_start, p_start + 3, p_size, p_type, p_catering, 'Harness', 'harness@example.com',
       'pending', 0, 0, 'ZAR', 'test', 'harness_' || gen_random_uuid());
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

-- ============================================================================================
-- A. PRODUCT MINIMUM TO OPEN A DATE. Catered takes 2; self-catered takes the full 8.
--    Each subtest opens on a FRESH date so v_seats = 0 and the opening branch is the one tested.
-- ============================================================================================
select t_try('A1 catered, size 2, fresh date -> ACCEPT',       date '2027-06-07', 2, 'catered',   'shared', false);
savepoint sp; rollback to sp;
select t_try('A2 catered, size 1, fresh date -> reject',       date '2027-06-14', 1, 'catered',   'shared', true, 'RW_OPEN_MIN');
savepoint sp; rollback to sp;
select t_try('A3 self-catered, size 4, fresh -> reject',       date '2027-06-21', 4, 'uncatered', 'shared', true, 'RW_OPEN_MIN');
savepoint sp; rollback to sp;
select t_try('A4 self-catered, size 7, fresh -> reject',       date '2027-06-28', 7, 'uncatered', 'shared', true, 'RW_OPEN_MIN');
savepoint sp; rollback to sp;
select t_try('A5 self-catered, size 8, fresh -> ACCEPT',       date '2027-07-05', 8, 'uncatered', 'shared', false);
savepoint sp; rollback to sp;
select t_try('A6 any product, size 9 -> reject (capacity)',    date '2027-07-12', 9, 'catered',   'shared', true, 'RW_GROUP_TOO_LARGE');
savepoint sp; rollback to sp;

-- ============================================================================================
-- B. JOINING AN OPEN DATE: minimum 2, catering must match the lock, capacity 8.
--    Seed a catered date with 2, then test top-ups against it.
-- ============================================================================================
insert into public.bookings
  (start_date, end_date, group_size, booking_type, catering, lead_name, lead_email, status,
   total_cents, amount_due_cents, currency, processor, processor_reference)
values
  (date '2027-08-02', date '2027-08-05', 2, 'shared', 'catered', 'Seed', 'seed@example.com',
   'confirmed', 0, 0, 'ZAR', 'test', 'seed_' || gen_random_uuid());

select t_try('B1 join catered date with 2 -> ACCEPT',          date '2027-08-02', 2, 'catered',   'shared', false);
savepoint sp; rollback to sp;
select t_try('B2 join with 1 -> reject',                       date '2027-08-02', 1, 'catered',   'shared', true, 'RW_TOPUP_MIN');
savepoint sp; rollback to sp;
select t_try('B3 join with MISMATCHED catering -> reject',     date '2027-08-02', 2, 'uncatered', 'shared', true, 'RW_CATERING_LOCKED');
savepoint sp; rollback to sp;
select t_try('B4 join with 7 (would total 9) -> reject',       date '2027-08-02', 7, 'catered',   'shared', true, 'RW_FULL');
savepoint sp; rollback to sp;
select t_try('B5 join with 6 (totals exactly 8) -> ACCEPT',    date '2027-08-02', 6, 'catered',   'shared', false);
savepoint sp; rollback to sp;

-- ============================================================================================
-- C. THE RETIRED DAY-OF-WEEK RULE. Under v3 a shared booking could not start on a Wednesday and
--    an exclusive one could ONLY start on a Wednesday or Thursday. Both are gone: any day the
--    window guard allows is an ordinary bookable date to this trigger. C1/C2 are the regression
--    guards — under the old trigger they would have raised RW_SHARED_NOT_WED_THU and
--    RW_EXCLUSIVE_WED_THU_ONLY respectively.
--    2027-06-09 is a WEDNESDAY, 2027-06-07 a MONDAY.
-- ============================================================================================
select t_try('C1 catered pair on a Wednesday -> ACCEPT',       date '2027-06-09', 2, 'catered',   'shared', false);
savepoint sp; rollback to sp;
select t_try('C2 full group on a Monday -> ACCEPT',            date '2027-06-07', 8, 'catered',   'shared', false);
savepoint sp; rollback to sp;

-- ============================================================================================
-- D. booking_type IS DERIVED BY THE TRIGGER, never trusted from the caller. A party of 8 opening
--    a date is exclusive; anything else shares, INCLUDING a caller that asserts 'exclusive'.
-- ============================================================================================
insert into public.bookings
  (start_date, end_date, group_size, booking_type, catering, lead_name, lead_email, status,
   total_cents, amount_due_cents, currency, processor, processor_reference)
values
  (date '2027-09-06', date '2027-09-09', 8, 'shared', 'catered', 'Derive', 'derive@example.com',
   'pending', 0, 0, 'ZAR', 'test', 'derive_' || gen_random_uuid());
insert into t_res
select 'D1 group of 8 opening a date is stored as exclusive',
       booking_type = 'exclusive',
       'stored as ' || booking_type
from public.bookings where lead_email = 'derive@example.com';
savepoint sp; rollback to sp;

insert into public.bookings
  (start_date, end_date, group_size, booking_type, catering, lead_name, lead_email, status,
   total_cents, amount_due_cents, currency, processor, processor_reference)
values
  (date '2027-09-13', date '2027-09-16', 2, 'exclusive', 'catered', 'Derive2', 'derive2@example.com',
   'pending', 0, 0, 'ZAR', 'test', 'derive2_' || gen_random_uuid());
insert into t_res
select 'D2 a caller asserting exclusive at size 2 is corrected to shared',
       booking_type = 'shared',
       'stored as ' || booking_type
from public.bookings where lead_email = 'derive2@example.com';
savepoint sp; rollback to sp;

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
