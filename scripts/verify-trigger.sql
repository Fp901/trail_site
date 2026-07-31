-- bookings_slot_guard conformance harness — Booking & Pricing Policy, 30 July 2026.
--
-- WHY THIS IS A .sql FILE AND NOT PART OF THE tsx SCRIPTS
-- The trigger is the last line of defence and deliberately re-implements the rules in plpgsql,
-- independently of src/lib/pricing.ts. It therefore cannot be tested from Node. Migration 0013
-- has never been applied to Supabase, so NOTHING in this file has been executed yet.
--
-- HOW TO RUN
--   1. Apply supabase/migrations/0013_booking_v2.sql
--   2. Paste this whole file into the Supabase SQL editor and run it
--   3. Every block prints PASS or raises. Any FAIL/exception is a real conformance failure.
-- It wraps everything in a transaction and ROLLS BACK, so it never leaves test rows behind.
--
-- COVERS: the per-catering opening minimum (step 2). The booking-window and T-7 assertions are
-- NOT here — that logic is added in its own migration (step 3) and gets its own harness.

begin;

-- Deterministic dates. isodow: Mon=1 .. Sun=7. Wed=3, Thu=4 are exclusive-only.
-- 2027-06-07 is a MONDAY (shared/open day), safely inside any booking window.
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
-- A. OPENING MINIMUM SPLITS BY CATERING (policy §3.1) — the whole point of step 2.
--    Each subtest opens on a FRESH date so v_seats = 0 and the opening branch is the one tested.
-- ============================================================================================

-- Catered opens from 2.
select t_try('A1 catered, size 2, fresh date -> ACCEPT',      date '2027-06-07', 2, 'catered',   'shared', false);
savepoint sp; rollback to sp;
select t_try('A2 catered, size 1, fresh date -> reject',      date '2027-06-14', 1, 'catered',   'shared', true, 'RW_SHARED_OPEN_MIN');
savepoint sp; rollback to sp;

-- A1 IS THE REGRESSION GUARD. The old trigger applied a flat minimum of 4 to both products, so
-- A1 (catered, size 2) would have been REJECTED. It must now be accepted. A3-A5 behave the same
-- before and after the fix and are here to prove the self-catered floor did not move.
select t_try('A3 self-catered, size 2, fresh -> reject',      date '2027-06-21', 2, 'uncatered', 'shared', true, 'RW_SHARED_OPEN_MIN');
savepoint sp; rollback to sp;
select t_try('A4 self-catered, size 3, fresh -> reject',      date '2027-06-28', 3, 'uncatered', 'shared', true, 'RW_SHARED_OPEN_MIN');
savepoint sp; rollback to sp;
select t_try('A5 self-catered, size 4, fresh -> ACCEPT',      date '2027-07-05', 4, 'uncatered', 'shared', false);
savepoint sp; rollback to sp;

-- ============================================================================================
-- B. JOINING MINIMUM IS 2 FOR BOTH, and catering must match the lock.
-- ============================================================================================
-- Seed a self-catered date with 4, then test top-ups against it.
insert into public.bookings
  (start_date, end_date, group_size, booking_type, catering, lead_name, lead_email, status,
   total_cents, amount_due_cents, currency, processor, processor_reference)
values
  (date '2027-08-02', date '2027-08-05', 4, 'shared', 'uncatered', 'Seed', 'seed@example.com',
   'confirmed', 0, 0, 'ZAR', 'test', 'seed_' || gen_random_uuid());

select t_try('B1 join self-catered date with 2 -> ACCEPT',    date '2027-08-02', 2, 'uncatered', 'shared', false);
savepoint sp; rollback to sp;
select t_try('B2 join with 1 -> reject',                      date '2027-08-02', 1, 'uncatered', 'shared', true, 'RW_SHARED_TOPUP_MIN');
savepoint sp; rollback to sp;
select t_try('B3 join with MISMATCHED catering -> reject',     date '2027-08-02', 2, 'catered',   'shared', true, 'RW_SHARED_CATERING_LOCKED');
savepoint sp; rollback to sp;
select t_try('B4 join with 5 (would total 9) -> reject',       date '2027-08-02', 5, 'uncatered', 'shared', true, 'RW_SHARED_FULL');
savepoint sp; rollback to sp;
select t_try('B5 join with 4 (totals exactly 8) -> ACCEPT',    date '2027-08-02', 4, 'uncatered', 'shared', false);
savepoint sp; rollback to sp;

-- ============================================================================================
-- C. EXCLUSIVE DAYS — unchanged by step 2, asserted so the split did not disturb them.
--    2027-06-09 is a WEDNESDAY, 2027-06-10 a THURSDAY.
-- ============================================================================================
select t_try('C1 Wed exclusive, size 8 -> ACCEPT',             date '2027-06-09', 8, 'catered',   'exclusive', false);
savepoint sp; rollback to sp;
select t_try('C2 Wed exclusive, size 7 -> reject',             date '2027-06-09', 7, 'catered',   'exclusive', true, 'RW_EXCLUSIVE_SIZE_8');
savepoint sp; rollback to sp;
select t_try('C3 Thu exclusive, size 8 -> ACCEPT',             date '2027-06-10', 8, 'uncatered', 'exclusive', false);
savepoint sp; rollback to sp;
select t_try('C4 shared booking on a Wed -> reject',           date '2027-06-09', 4, 'uncatered', 'shared',    true, 'RW_SHARED_NOT_WED_THU');
savepoint sp; rollback to sp;
select t_try('C5 exclusive on a Monday -> reject',             date '2027-06-07', 8, 'catered',   'exclusive', true, 'RW_EXCLUSIVE_WED_THU_ONLY');
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
