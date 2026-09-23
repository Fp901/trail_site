-- bookings_window_guard conformance harness (migration 0017: the 12-month ceiling follows
-- sadc_count > 0 rather than the stored band).
--
-- Apply migrations through 0017, then paste this whole file into the Supabase SQL editor.
-- Everything is wrapped in a transaction that rolls back, so no test rows survive.
--
-- Boundary cases are computed RELATIVE TO TODAY so the harness stays valid whenever it is run,
-- rather than hardcoding dates that expire. It skips the launch-gate floor by testing against
-- v_earliest (the trigger's own floor) rather than assuming today + 7 is the binding constraint —
-- before 2027-04-01 the gate binds, after it the T-7 lead binds, and the harness must pass either
-- way.

begin;

create temporary table w_res(label text, ok boolean, detail text);
-- Session-private and rolled back at the end, so no client can ever reach it. RLS is enabled
-- only so the Supabase SQL editor does not stop to ask; the owner running this is not bound by it.
alter table w_res enable row level security;

create or replace function w_try(
  p_label text, p_start date, p_catering text, p_type text, p_size int,
  p_should_fail boolean, p_expect_code text default null, p_processor text default 'paystack',
  p_sadc int default null
) returns void language plpgsql as $fn$
declare v_err text;
begin
  begin
    -- Self-catered is always 8 SADC; catered defaults to no SADC guests unless p_sadc says so.
    -- Parties here are even, so single_rooms 0 is a valid mix.
    insert into public.bookings
      (start_date, end_date, group_size, single_rooms, sadc_count, booking_type, catering,
       lead_name, lead_email, status, total_cents, amount_due_cents, currency, processor,
       processor_reference)
    values
      (p_start, p_start + 3, p_size, 0,
       coalesce(p_sadc, case when p_catering = 'uncatered' then p_size else 0 end),
       p_type, p_catering, 'WHarness', 'wharness@example.com',
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
  v_open     date := date '2027-04-01';
  v_earliest date := greatest(v_today + 7, v_open);
  v_anchor   date := greatest(v_today, v_open);
  v_lat_un   date := (v_anchor + interval '12 months')::date;   -- any SADC guest, and self-catered
  v_lat_cat  date := (v_anchor + interval '24 months')::date;   -- catered, no SADC guests
  v_shared   date;
begin
  raise notice 'today=%  earliest=%  latest(sadc)=%  latest(intl catered)=%',
    v_today, v_earliest, v_lat_un, v_lat_cat;

  -- ==========================================================================================
  -- A. THE T-7 / FLOOR BOUNDARY. The four cases requested: just inside, just outside,
  --    exactly at the boundary, and one day further in.
  --    Each uses a date shifted off a taper day (Tue/Wed/Sat), so the taper check inside this
  --    same trigger does not fire first and mask the window result being tested.
  -- ==========================================================================================
  -- helper: nudge a date off a taper day (Tue/Wed/Sat) to the next real start day
  v_shared := v_earliest;
  while extract(isodow from v_shared) in (2, 3, 6) loop v_shared := v_shared + 1; end loop;
  perform w_try('A1 exactly AT the floor -> ACCEPT', v_shared, 'catered', 'shared', 2, false);

  v_shared := v_earliest + 1;
  while extract(isodow from v_shared) in (2, 3, 6) loop v_shared := v_shared + 1; end loop;
  perform w_try('A2 one day INSIDE the window -> ACCEPT', v_shared, 'catered', 'shared', 2, false);

  v_shared := v_earliest - 1;
  while extract(isodow from v_shared) in (2, 3, 6) loop v_shared := v_shared - 1; end loop;
  perform w_try('A3 one day BEFORE the floor -> reject', v_shared, 'catered', 'shared', 2, true, 'RW_WINDOW_TOO_SOON');

  v_shared := v_earliest - 2;
  while extract(isodow from v_shared) in (2, 3, 6) loop v_shared := v_shared - 1; end loop;
  perform w_try('A4 two days BEFORE the floor -> reject', v_shared, 'catered', 'shared', 2, true, 'RW_WINDOW_TOO_SOON');

  -- Stepped back off a taper day like the others: the taper check runs first, so on a Tuesday,
  -- Wednesday or Saturday "yesterday" would be refused as RW_TAPER_DAY and mask this test.
  v_shared := v_today - 1;
  while extract(isodow from v_shared) in (2, 3, 6) loop v_shared := v_shared - 1; end loop;
  perform w_try('A5 a past start day -> reject', v_shared, 'catered', 'shared', 2, true, 'RW_WINDOW_TOO_SOON');

  -- ==========================================================================================
  -- B. THE CEILING. 12 months as soon as anyone is counted as SADC (always, self-catered); 24
  --    for a catered party with no SADC guests.
  -- ==========================================================================================
  v_shared := v_lat_un;
  while extract(isodow from v_shared) in (2, 3, 6) loop v_shared := v_shared - 1; end loop;
  perform w_try('B1 SADC self-catered AT the 12-month ceiling -> ACCEPT', v_shared, 'uncatered', 'shared', 8, false);
  perform w_try('B2 SADC self-catered 1 day PAST the ceiling -> reject', v_lat_un + 1, 'uncatered', 'shared', 8, true, 'RW_WINDOW_TOO_FAR');

  -- The same date that is too far for self-catered is comfortably inside the catered window:
  -- this is the asymmetry that makes the ceiling per-catering rather than global.
  perform w_try('B3 catered, no SADC guests, on that SAME date -> ACCEPT', v_lat_un + 1, 'catered', 'shared', 2, false);
  -- One SADC guest is enough to bring the 12-month ceiling in (13 to 24 months out -> refused).
  perform w_try('B6 catered with 1 SADC guest on that SAME date -> reject', v_lat_un + 1, 'catered', 'shared', 2,
                true, 'RW_WINDOW_TOO_FAR', 'paystack', 1);
  -- Its own date just inside the ceiling: B1's self-catered group has locked the ceiling date.
  v_shared := v_lat_un - 7;
  while extract(isodow from v_shared) in (2, 3, 6) loop v_shared := v_shared - 1; end loop;
  perform w_try('B7 catered with 1 SADC guest just inside the 12-month ceiling -> ACCEPT', v_shared, 'catered', 'shared', 2,
                false, null, 'paystack', 1);

  v_shared := v_lat_cat;
  while extract(isodow from v_shared) in (2, 3, 6) loop v_shared := v_shared - 1; end loop;
  perform w_try('B4 international catered AT the 24-month ceiling -> ACCEPT', v_shared, 'catered', 'shared', 2, false);
  perform w_try('B5 international catered 1 day PAST the ceiling -> reject', v_lat_cat + 1, 'catered', 'shared', 2, true, 'RW_WINDOW_TOO_FAR');

  -- ==========================================================================================
  -- C. THE EXEMPTIONS. Each guards a regression documented in 0016's header (kept in 0017).
  -- ==========================================================================================
  -- C1: comp bookings bypass the floor (adminCreateCompBooking books from today).
  perform w_try('C1 COMP booking inside the floor -> ACCEPT (exemption 2)',
                v_today + 1, 'catered', 'shared', 2, false, null, 'comp');

  -- C2: a cancelled row is not window-checked.
  begin
    insert into public.bookings
      (start_date, end_date, group_size, booking_type, catering, lead_name, lead_email, status,
       total_cents, amount_due_cents, currency, processor, processor_reference)
    values (v_today - 30, v_today - 27, 2, 'shared', 'catered', 'WH', 'wh@example.com',
            'cancelled', 0, 0, 'ZAR', 'paystack', 'wh_' || gen_random_uuid());
    insert into w_res values ('C2 cancelled row in the past -> ACCEPT (exemption on status)', true, 'correctly accepted');
  exception when others then
    insert into w_res values ('C2 cancelled row in the past -> ACCEPT (exemption on status)', false, SQLERRM);
  end;
  -- ==========================================================================================
  -- D. THE TAPERED START. Tuesday, Wednesday and Saturday are not start days up to 2028-12-31;
  --    every weekday opens from 2029. Uses dates inside the booking window so the taper, not the
  --    window, is what decides.
  -- ==========================================================================================
  -- The first Tuesday, Wednesday and Saturday at least 30 days out and inside the SADC window.
  v_shared := greatest(v_earliest, v_today + 30);
  while extract(isodow from v_shared) <> 2 loop v_shared := v_shared + 1; end loop;
  if v_shared <= date '2028-12-31' then
    perform w_try('D1 Tuesday before the taper ends -> reject', v_shared, 'catered', 'shared', 2, true, 'RW_TAPER_DAY');
  end if;
  v_shared := greatest(v_earliest, v_today + 30);
  while extract(isodow from v_shared) <> 3 loop v_shared := v_shared + 1; end loop;
  if v_shared <= date '2028-12-31' then
    perform w_try('D2 Wednesday before the taper ends -> reject', v_shared, 'catered', 'shared', 2, true, 'RW_TAPER_DAY');
  end if;
  v_shared := greatest(v_earliest, v_today + 30);
  while extract(isodow from v_shared) <> 6 loop v_shared := v_shared + 1; end loop;
  if v_shared <= date '2028-12-31' then
    perform w_try('D3 Saturday before the taper ends -> reject', v_shared, 'catered', 'shared', 2, true, 'RW_TAPER_DAY');
  end if;
  -- Thursday is a start day throughout.
  v_shared := greatest(v_earliest, v_today + 30);
  while extract(isodow from v_shared) <> 4 loop v_shared := v_shared + 1; end loop;
  perform w_try('D4 Thursday -> ACCEPT', v_shared, 'catered', 'shared', 2, false);
  -- A comp booking may use a taper day: the operator decides, and it is audit-logged.
  v_shared := greatest(v_earliest, v_today + 30);
  while extract(isodow from v_shared) <> 3 loop v_shared := v_shared + 1; end loop;
  if v_shared <= date '2028-12-31' then
    perform w_try('D5 COMP booking on a taper day -> ACCEPT (exemption)',
                  v_shared, 'catered', 'shared', 2, false, null, 'comp');
  end if;
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
  -- Catered 4: a self-catered 4 would be refused by the SLOT guard (it opens at 8), which is not
  -- what this test is about.
  values (v_today + 2, v_today + 5, 4, 'shared', 'catered', 'WH', 'wh2@example.com',
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
