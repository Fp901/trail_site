-- bookings_window_guard conformance harness (migration 0014).
--
-- NOT YET EXECUTED. Migrations 0013 and 0014 have never been applied to Supabase, so nothing in
-- this file has run. Apply both, then paste this whole file into the Supabase SQL editor.
-- Everything is wrapped in a transaction that rolls back, so no test rows survive.
--
-- Boundary cases are computed RELATIVE TO TODAY so the harness stays valid whenever it is run,
-- rather than hardcoding dates that expire. It skips the launch-gate floor by testing against
-- v_earliest (the trigger's own floor) rather than assuming today + 7 is the binding constraint —
-- before 2027-01-15 the gate binds, after it the T-7 lead binds, and the harness must pass either
-- way.

begin;

create temporary table w_res(label text, ok boolean, detail text);

create or replace function w_try(
  p_label text, p_start date, p_catering text, p_type text, p_size int,
  p_should_fail boolean, p_expect_code text default null, p_processor text default 'paystack'
) returns void language plpgsql as $fn$
declare v_err text;
begin
  begin
    insert into public.bookings
      (start_date, end_date, group_size, booking_type, catering, lead_name, lead_email,
       status, total_cents, amount_due_cents, currency, processor, processor_reference)
    values
      (p_start, p_start + 3, p_size, p_type, p_catering, 'WHarness', 'wharness@example.com',
       'pending', 0, 0, 'ZAR', p_processor, 'wharness_' || gen_random_uuid());
    v_err := null;
  exception when others then v_err := SQLERRM;
  end;

  if p_should_fail then
    if v_err is null then
      insert into w_res values (p_label, false, 'expected rejection, insert SUCCEEDED');
    elsif p_expect_code is not null and position(p_expect_code in v_err) = 0 then
      insert into w_res values (p_label, false, 'wrong error: ' || v_err);
    else
      insert into w_res values (p_label, true, 'correctly rejected');
    end if;
  else
    if v_err is null then insert into w_res values (p_label, true, 'correctly accepted');
    else insert into w_res values (p_label, false, 'expected acceptance, got: ' || v_err);
    end if;
  end if;
end;
$fn$;

-- Resolve the trigger's own boundaries so the tests target the real edges.
do $$
declare
  v_today    date := (now() at time zone 'Africa/Johannesburg')::date;
  v_open     date := date '2027-01-15';
  v_earliest date := greatest(v_today + 7, v_open);
  v_anchor   date := greatest(v_today, v_open);
  v_lat_un   date := (v_anchor + interval '8 months')::date;
  v_lat_cat  date := (v_anchor + interval '18 months')::date;
  v_shared   date;
begin
  raise notice 'today=%  earliest=%  latest(uncatered)=%  latest(catered)=%',
    v_today, v_earliest, v_lat_un, v_lat_cat;

  -- ==========================================================================================
  -- A. THE T-7 / FLOOR BOUNDARY. The four cases requested: just inside, just outside,
  --    exactly at the boundary, and one day further in.
  --    Each uses a date shifted to a shared (non-Wed/Thu) day so the slot guard does not
  --    interfere; we are testing the WINDOW guard, not the day-of-week rule.
  -- ==========================================================================================
  -- helper: nudge a date forward to the next non-Wed/Thu day
  v_shared := v_earliest;
  while extract(isodow from v_shared) in (3, 4) loop v_shared := v_shared + 1; end loop;
  perform w_try('A1 exactly AT the floor -> ACCEPT', v_shared, 'uncatered', 'shared', 4, false);

  v_shared := v_earliest + 1;
  while extract(isodow from v_shared) in (3, 4) loop v_shared := v_shared + 1; end loop;
  perform w_try('A2 one day INSIDE the window -> ACCEPT', v_shared, 'uncatered', 'shared', 4, false);

  v_shared := v_earliest - 1;
  while extract(isodow from v_shared) in (3, 4) loop v_shared := v_shared - 1; end loop;
  perform w_try('A3 one day BEFORE the floor -> reject', v_shared, 'uncatered', 'shared', 4, true, 'RW_WINDOW_TOO_SOON');

  v_shared := v_earliest - 2;
  while extract(isodow from v_shared) in (3, 4) loop v_shared := v_shared - 1; end loop;
  perform w_try('A4 two days BEFORE the floor -> reject', v_shared, 'uncatered', 'shared', 4, true, 'RW_WINDOW_TOO_SOON');

  perform w_try('A5 yesterday -> reject', v_today - 1, 'uncatered', 'shared', 4, true, 'RW_WINDOW_TOO_SOON');

  -- ==========================================================================================
  -- B. THE PER-CATERING CEILING. 8 months self-catered, 18 catered.
  -- ==========================================================================================
  v_shared := v_lat_un;
  while extract(isodow from v_shared) in (3, 4) loop v_shared := v_shared - 1; end loop;
  perform w_try('B1 self-catered AT the 8-month ceiling -> ACCEPT', v_shared, 'uncatered', 'shared', 4, false);
  perform w_try('B2 self-catered 1 day PAST the ceiling -> reject', v_lat_un + 1, 'uncatered', 'shared', 4, true, 'RW_WINDOW_TOO_FAR');

  -- The same date that is too far for self-catered is comfortably inside the catered window:
  -- this is the asymmetry that makes the ceiling per-catering rather than global.
  perform w_try('B3 catered on that SAME date -> ACCEPT', v_lat_un + 1, 'catered', 'shared', 2, false);

  v_shared := v_lat_cat;
  while extract(isodow from v_shared) in (3, 4) loop v_shared := v_shared - 1; end loop;
  perform w_try('B4 catered AT the 18-month ceiling -> ACCEPT', v_shared, 'catered', 'shared', 2, false);
  perform w_try('B5 catered 1 day PAST the ceiling -> reject', v_lat_cat + 1, 'catered', 'shared', 2, true, 'RW_WINDOW_TOO_FAR');

  -- ==========================================================================================
  -- C. THE THREE EXEMPTIONS. Each guards a regression documented in 0014's header.
  -- ==========================================================================================
  -- C1: comp bookings bypass the floor (adminCreateCompBooking books from today).
  perform w_try('C1 COMP booking inside the floor -> ACCEPT (exemption 2)',
                v_today + 1, 'catered', 'shared', 2, false, null, 'comp');

  -- C2: a cancelled row is not window-checked.
  begin
    insert into public.bookings
      (start_date, end_date, group_size, booking_type, catering, lead_name, lead_email, status,
       total_cents, amount_due_cents, currency, processor, processor_reference)
    values (v_today - 30, v_today - 27, 4, 'shared', 'uncatered', 'WH', 'wh@example.com',
            'cancelled', 0, 0, 'ZAR', 'paystack', 'wh_' || gen_random_uuid());
    insert into w_res values ('C2 cancelled row in the past -> ACCEPT (exemption on status)', true, 'correctly accepted');
  exception when others then
    insert into w_res values ('C2 cancelled row in the past -> ACCEPT (exemption on status)', false, SQLERRM);
  end;
end $$;

-- ==============================================================================================
-- C3: THE CRITICAL ONE. A pending booking must still be able to confirm (UPDATE) even once its
--     start date has fallen inside the window. If this fails, a guest who has PAID cannot have
--     their booking confirmed by the webhook. Simulated by inserting a comp row (bypasses the
--     floor), moving it inside the floor, then confirming it.
-- ==============================================================================================
do $$
declare
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_id uuid;
  v_err text;
begin
  insert into public.bookings
    (start_date, end_date, group_size, booking_type, catering, lead_name, lead_email, status,
     total_cents, amount_due_cents, currency, processor, processor_reference)
  values (v_today + 2, v_today + 5, 4, 'shared', 'uncatered', 'WH', 'wh2@example.com',
          'pending', 0, 0, 'ZAR', 'comp', 'wh2_' || gen_random_uuid())
  returning id into v_id;

  begin
    update public.bookings set status = 'confirmed', processor = 'paystack' where id = v_id;
    v_err := null;
  exception when others then v_err := SQLERRM;
  end;

  if v_err is null then
    insert into w_res values ('C3 confirm a PAID booking inside the window -> ACCEPT (exemption 1)', true, 'correctly accepted');
  else
    insert into w_res values ('C3 confirm a PAID booking inside the window -> ACCEPT (exemption 1)', false,
      'REGRESSION: paid booking could not confirm: ' || v_err);
  end if;
end $$;

-- ==============================================================================================
select
  case when bool_and(ok) then 'ALL WINDOW-TRIGGER CHECKS PASSED' else 'FAILURES PRESENT' end as verdict,
  count(*) filter (where not ok) as failures,
  count(*) as total
from w_res;

select label, ok, detail from w_res order by label;

rollback;  -- leaves no test rows behind
