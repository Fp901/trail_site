-- ============================================================================================
-- CLEAR-DOWN — wipes all operational data. DESTRUCTIVE.
--
-- The operator has confirmed this database contains ONLY test data: nothing in it is required
-- to run the business. This script is therefore a straight wipe, with no reconciliation step.
-- If that ever stops being true, STOP and reconcile against Paystack first (the database cannot
-- tell a test charge from a live one — the webhook never stored Paystack's `data.domain`).
--
-- HOW TO RUN
--   Supabase SQL editor -> paste -> Ctrl-A -> Run.  ALWAYS Ctrl-A, never a highlighted
--   selection: a part-run of a begin;...rollback; file commits what it should have discarded,
--   which is how the harness rows in scripts/verify-*-trigger.sql escaped in the first place.
--
--   This file ends in `rollback;`. First run changes nothing and just prints the row counts.
--   Read them, then swap `rollback;` for `commit;` and run again.
--
-- SCOPE — everything. All seven tables are emptied, for a genuinely clean slate.
--   payment_events and admin_audit are deleted FIRST, before bookings, so the two
--   `on delete set null` foreign keys never fire and there is no pointless nulling pass.
--
-- NOT deleted, and must never be: auth.users (your admin login), the pg_cron jobs, and every
-- table/view/trigger/index/grant. This removes rows only.
-- ============================================================================================

begin;

-- Cheap sanity check: nobody should be mid-checkout. Costs nothing and prevents an "oops"
-- if someone happens to be clicking through the widget while you run this.
do $$
declare n int;
begin
  select count(*) into n from public.bookings
   where status = 'pending' and hold_expires_at > now();
  if n > 0 then
    raise exception 'ABORT: % booking(s) hold a LIVE checkout slot right now.', n;
  end if;
end $$;

-- Order matters: the two tables holding a booking_id FK go first, so the `on delete set null`
-- never fires. Then pretrip_details (which would cascade anyway), then bookings, then the
-- three standalone tables.
with d as (delete from public.payment_events returning 1)
  select 'payment_events'  as tbl, count(*) as deleted from d;

with d as (delete from public.admin_audit returning 1)
  select 'admin_audit'     as tbl, count(*) as deleted from d;

with d as (delete from public.pretrip_details returning 1)
  select 'pretrip_details' as tbl, count(*) as deleted from d;

with d as (delete from public.bookings returning 1)
  select 'bookings'        as tbl, count(*) as deleted from d;

with d as (delete from public.inquiries returning 1)
  select 'inquiries'       as tbl, count(*) as deleted from d;

with d as (delete from public.blocked_dates returning 1)
  select 'blocked_dates'   as tbl, count(*) as deleted from d;

with d as (delete from public.rate_limits returning 1)
  select 'rate_limits'     as tbl, count(*) as deleted from d;

-- --------------------------------------------------------------------------------------------
rollback;    -- <<<< FIRST RUN: leave this. Read the counts above.
-- commit;   -- <<<< SECOND RUN: swap the two lines, Ctrl-A, Run.
-- --------------------------------------------------------------------------------------------


-- ============================================================================================
-- VERIFY — run after the commit.
-- ============================================================================================
-- select t.tbl,
--        (xpath('/row/c/text()',
--               query_to_xml(format('select count(*) as c from public.%I', t.tbl),
--                            false, true, '')))[1]::text::bigint as rows
-- from (values ('bookings'), ('inquiries'), ('blocked_dates'), ('pretrip_details'),
--              ('payment_events'), ('admin_audit'), ('rate_limits')) as t(tbl)
-- where to_regclass('public.' || t.tbl) is not null
-- order by 1;
--
-- Zero rows here is CORRECT, not a fault: 0015 documents the view as SPARSE, so "no rows"
-- means "every date wide open".
-- select count(*) as inventory_rows from public.departure_inventory;
--
-- Structure must be untouched:
-- select jobname, active from cron.job order by jobname;                    -- 2 rows, active
-- select tgname from pg_trigger
--   where tgrelid='public.bookings'::regclass and not tgisinternal;         -- slot + window guard
-- select count(*) from auth.users;                                          -- UNCHANGED
--
-- Then: /rates calendar opens on Jan 2027 - /admin all zeros - /admin/inquiries and
-- /admin/dates empty.
-- ============================================================================================


-- ============================================================================================
-- HARNESS RESIDUE — only if scripts/db-survey.sql §4 found these. Both harness files
-- `create or replace function` unqualified, so a part-run leaves them sitting in public.
-- Copy the exact argument list from the survey output.
--
--   drop function if exists public.t_try(...);
--   drop function if exists public.w_try(...);
-- ============================================================================================
