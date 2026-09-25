-- Discount code conformance harness (migration 0020).
--
-- HOW TO RUN
--   1. Apply supabase/migrations/0020_discount_codes.sql
--   2. Paste this whole file into the Supabase SQL editor and run it
--   3. The last two result sets print the verdict and one row per check.
-- It wraps everything in a transaction and ROLLS BACK, so it never leaves test rows behind.
--
-- COVERS: reserve_discount_code() claims an available code exactly once; a lapsed reservation can
-- be claimed again, a live one cannot; redeemed, void, expired and unknown codes are refused; the
-- percent and bookings.discount_percent CHECKs; and anon can neither read the table nor call the
-- claim function. The hashes here are labels, not real SHA-256 values: the function only
-- compares text.
--
-- THE RACE ("two checkouts claim one code at once: exactly one wins") needs two sessions. Seed an
-- available code with hash 'race', then in two SQL editor tabs:
--   tab 1:  begin; select * from public.reserve_discount_code('race', now() + interval '1 hour');
--   tab 2:  begin; select * from public.reserve_discount_code('race', now() + interval '1 hour');  -- blocks
--   tab 1:  commit;   -- tab 2 now returns NO row
-- Roll back / delete the seed afterwards.

begin;

create temporary table t_res(label text, ok boolean, detail text);
-- Session-private and rolled back at the end. RLS is enabled only so the Supabase SQL editor does
-- not stop to ask; the owner running this is not bound by it.
alter table t_res enable row level security;

insert into public.discount_codes (code_hash, code_hint, percent, status, reserved_until, expires_at, redeemed_at) values
  ('h_available',   'AVL1', 50,  'available', null,                         null,                         null),
  ('h_hundred',     'HND1', 100, 'available', null,                         now() + interval '30 days',   null),
  ('h_expired',     'EXP1', 50,  'available', null,                         now() - interval '1 minute',  null),
  ('h_void',        'VOI1', 50,  'void',      null,                         null,                         null),
  ('h_redeemed',    'RED1', 100, 'redeemed',  null,                         null,                         now()),
  ('h_lapsed',      'LAP1', 50,  'reserved',  now() - interval '1 minute',  null,                         null),
  ('h_live',        'LIV1', 50,  'reserved',  now() + interval '30 minutes', null,                        null);

create or replace function t_claim(p_label text, p_hash text, p_expect_percent int)
returns void language plpgsql as $fn$
declare
  v_n int;
  v_pct int;
begin
  select count(*), max(r.percent) into v_n, v_pct
    from public.reserve_discount_code(p_hash, now() + interval '1 hour') r;
  if p_expect_percent is null then
    insert into t_res values (p_label, v_n = 0,
      case when v_n = 0 then 'correctly refused' else 'expected refusal, CLAIMED' end);
  else
    insert into t_res values (p_label, v_n = 1 and v_pct = p_expect_percent,
      case when v_n = 1 and v_pct = p_expect_percent then 'correctly claimed'
           else format('expected one row at %s%%, got %s row(s) at %s', p_expect_percent, v_n, v_pct) end);
  end if;
end;
$fn$;

-- A. Claiming
select t_claim('A1 an available code is claimed, with its percent',      'h_available', 50);
select t_claim('A2 the same code cannot be claimed twice',              'h_available', null);
select t_claim('A3 a 100% code with a future expiry is claimed',        'h_hundred',   100);
select t_claim('A4 an expired code is refused',                         'h_expired',   null);
select t_claim('A5 a void code is refused',                             'h_void',      null);
select t_claim('A6 a redeemed code is refused',                         'h_redeemed',  null);
select t_claim('A7 a lapsed reservation can be claimed again',          'h_lapsed',    50);
select t_claim('A8 a live reservation cannot be claimed',               'h_live',      null);
select t_claim('A9 an unknown code is refused',                         'h_nope',      null);

insert into t_res
select 'A10 a claim sets status reserved with a future reserved_until',
       status = 'reserved' and reserved_until > now(), status || ' until ' || coalesce(reserved_until::text, 'null')
  from public.discount_codes where code_hash = 'h_available';

-- B. CHECK constraints
do $$
begin
  begin
    insert into public.discount_codes (code_hash, code_hint, percent) values ('h_bad', 'BAD1', 75);
    insert into t_res values ('B1 a 75% code is rejected', false, 'insert SUCCEEDED');
  exception when check_violation then
    insert into t_res values ('B1 a 75% code is rejected', true, 'correctly rejected');
  end;
  begin
    insert into public.discount_codes (code_hash, code_hint, percent, status) values ('h_bad2', 'BAD2', 50, 'used');
    insert into t_res values ('B2 an unknown status is rejected', false, 'insert SUCCEEDED');
  exception when check_violation then
    insert into t_res values ('B2 an unknown status is rejected', true, 'correctly rejected');
  end;
  begin
    insert into public.discount_codes (code_hash, code_hint, percent) values ('h_hundred', 'DUP1', 50);
    insert into t_res values ('B3 a duplicate hash is rejected', false, 'insert SUCCEEDED');
  exception when unique_violation then
    insert into t_res values ('B3 a duplicate hash is rejected', true, 'correctly rejected');
  end;
  begin
    insert into public.bookings
      (start_date, end_date, group_size, single_rooms, sadc_count, booking_type, catering,
       lead_name, lead_email, status, total_cents, amount_due_cents, currency, processor,
       processor_reference, discount_percent)
    values (date '2028-11-02', date '2028-11-05', 2, 0, 0, 'shared', 'catered', 'Harness',
       'harness@example.com', 'pending', 0, 0, 'ZAR', 'comp', 'harness_' || gen_random_uuid(), 30);
    insert into t_res values ('B4 bookings.discount_percent 30 is rejected', false, 'insert SUCCEEDED');
  exception when others then
    -- The slot guard (a BEFORE trigger) runs first, so name the constraint rather than trust any error.
    insert into t_res values ('B4 bookings.discount_percent 30 is rejected',
      position('bookings_discount_percent_check' in SQLERRM) > 0, SQLERRM);
  end;
end;
$$;

-- C. Anon has no way in. The result is captured in a variable and written after RESET ROLE,
-- because anon cannot write to t_res either.
do $$
declare
  v_read text;
  v_call text;
begin
  execute 'set local role anon';
  begin
    perform 1 from public.discount_codes limit 1;
    v_read := 'anon READ the table';
  exception when insufficient_privilege then
    v_read := null;
  end;
  begin
    perform 1 from public.reserve_discount_code('h_hundred', now() + interval '1 hour');
    v_call := 'anon CALLED the claim function';
  exception when insufficient_privilege then
    v_call := null;
  end;
  execute 'reset role';
  insert into t_res values ('C1 anon cannot read discount_codes', v_read is null, coalesce(v_read, 'permission denied'));
  insert into t_res values ('C2 anon cannot call reserve_discount_code', v_call is null, coalesce(v_call, 'permission denied'));
end;
$$;

-- ============================================================================================
-- RESULTS
-- ============================================================================================
select
  case when bool_and(ok) then 'ALL DISCOUNT CHECKS PASSED' else 'FAILURES PRESENT' end as verdict,
  count(*) filter (where not ok) as failures,
  count(*) as total
from t_res;

select label, ok, detail from t_res order by label;

rollback;  -- leaves no test rows behind
