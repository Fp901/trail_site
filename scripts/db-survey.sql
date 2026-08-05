-- ============================================================================================
-- DATABASE SURVEY — READ ONLY. Nothing here writes, updates or deletes.
--
-- Run this BEFORE scripts/db-cleardown.sql. Its output is the evidence you delete against:
-- save every result (Download CSV) into a dated folder before touching anything.
--
-- HOW TO RUN
--   Supabase SQL editor -> paste -> Ctrl-A -> Run.
--   ALWAYS Ctrl-A. Running a highlighted fragment is what leaves harness rows behind
--   (see the note in §4) and it is the single most likely way to damage this database.
--
-- CONTEXT THAT MATTERS
--   * There is ONE Supabase project and it is production. There is no staging copy.
--   * The webhook never stored Paystack's `data.domain`, so this database CANNOT tell a
--     test-mode payment from a live one. §3 lists the rows you must reconcile by hand
--     against the Paystack dashboard BEFORE the old account changes hands.
-- ============================================================================================


-- --------------------------------------------------------------------------------------------
-- §0. CONFIRM THE SCHEMA IS WHAT YOU THINK IT IS.  <-- RUN THIS FIRST, READ IT FIRST
--
-- The operator confirms all 15 migrations are applied. This block proves it rather than
-- assuming it, because the repo docs disagreed: GO_LIVE_CHECKLIST.md:12,36 still records only
-- 0001-0009 as applied and leaves the "apply 0013" box (:193) unchecked. One of those two is
-- stale, and the cost of guessing wrong is a smoke test run against a schema the deployed
-- admin dashboard and booking widget cannot actually work with.
--
-- Expect applied = true on all 13 rows. Any false must be applied, in order, before going on.
-- --------------------------------------------------------------------------------------------
select * from (
  values
    ('0001_init',              to_regclass('public.bookings')            is not null),
    ('0002_hold_sweep',        exists (select 1 from cron.job where jobname = 'expire-stale-holds')),
    ('0003_pretrip_details',   to_regclass('public.pretrip_details')     is not null),
    ('0004+0007_pretrip_flags',exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='bookings'
                and column_name='pretrip_reminder_day3_sent')),
    ('0005_ratelimit_audit',   to_regclass('public.payment_events')      is not null),
    ('0008_split_payment',     exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='bookings' and column_name='payment_plan')),
    ('0009_startdate_unique',  exists (select 1 from pg_indexes
              where schemaname='public' and indexname='bookings_unique_start_date')),
    ('0010_lead_phone',        exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='bookings' and column_name='lead_phone')),
    ('0011_admin_tools',       to_regclass('public.admin_audit')         is not null),
    ('0012_comp_bookings',     exists (select 1 from pg_constraint
              where conname='admin_audit_action_check'
                and pg_get_constraintdef(oid) like '%create_comp_booking%')),
    ('0013_booking_v2',        exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='bookings' and column_name='catering')),
    ('0014_window_guard',      exists (select 1 from pg_trigger
              where tgname='bookings_window_guard')),
    ('0015_departure_inventory', to_regclass('public.departure_inventory') is not null)
) as t(migration, applied)
order by migration;


-- --------------------------------------------------------------------------------------------
-- §1. Row counts. Skips any table that does not exist yet, so it is safe at any schema version.
-- --------------------------------------------------------------------------------------------
select t.tbl,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', t.tbl),
                           false, true, '')))[1]::text::bigint as rows
from (values ('bookings'), ('inquiries'), ('blocked_dates'), ('pretrip_details'),
             ('payment_events'), ('admin_audit'), ('rate_limits'), ('departure_inventory')
     ) as t(tbl)
where to_regclass('public.' || t.tbl) is not null
order by 1;


-- --------------------------------------------------------------------------------------------
-- §2. THE MONEY QUERY — every booking bucketed by what it actually is.
-- This is the one screen that tells you what you are about to delete.
-- Uses only columns that exist from 0001, so it works at any schema version.
--
-- STOP if anything lands in bucket 9. Investigate before going further.
-- --------------------------------------------------------------------------------------------
select
  case
    when b.processor = 'test'                                          then '5. HARNESS (processor=test)'
    when b.processor_reference ~ '^(harness_|seed_|wharness_|wh_|wh2_)' then '5. HARNESS (reference residue)'
    when b.lead_email like '%@example.com'                             then '5. HARNESS (example.com email)'
    when b.processor = 'comp'
      or b.processor_reference like 'comp_%'                           then '1. COMP (admin gift, no money)'
    when b.processor_reference like 'rwb_%'                            then '3. BALANCE payment (Paystack)'
    when b.processor_reference like 'rw_%'                             then '2. GUEST CHECKOUT (Paystack)'
    else                                                                    '9. UNCLASSIFIED - INVESTIGATE'
  end                                            as bucket,
  b.status,
  count(*)                                       as rows,
  min(b.created_at)::date                        as first_seen,
  max(b.created_at)::date                        as last_seen,
  sum(coalesce(b.amount_paid_cents, 0))          as paid_cents,
  count(*) filter (where b.processor_txn_id is not null)  as with_paystack_txn
from public.bookings b
group by 1, 2
order by 1, 2;


-- Every booking, in full, so you can read them one by one. With a test-only dataset this is a
-- handful of rows. Read all of them.
select b.id, b.created_at, b.status, b.processor, b.processor_reference, b.processor_txn_id,
       b.start_date, b.group_size, b.lead_name, b.lead_email,
       b.payment_plan, b.total_cents, b.amount_paid_cents, b.confirmed_at, b.hold_expires_at
from public.bookings b
order by b.created_at;


-- --------------------------------------------------------------------------------------------
-- §3. THE PAYSTACK CROSS-CHECK LIST — rows this database CANNOT classify on its own.
--
-- The webhook stores processor_txn_id but never Paystack's `data.domain`, so a test-mode
-- charge is indistinguishable here from a live one. Every reference below must be looked up
-- in the OLD Paystack dashboard (in BOTH test and live mode) and marked by hand:
--     TEST | LIVE | NOT IN PAYSTACK
-- A LIVE match is a real customer. DO NOT DELETE IT.
--
-- Do this before the old Paystack account changes hands. Afterwards it is unrecoverable.
-- --------------------------------------------------------------------------------------------
select b.processor_reference, b.processor_txn_id, b.lead_email, b.status, b.start_date,
       b.total_cents, b.amount_paid_cents, b.confirmed_at
from public.bookings b
where coalesce(b.amount_paid_cents, 0) > 0
   or b.processor_txn_id is not null
order by b.confirmed_at nulls last;


-- --------------------------------------------------------------------------------------------
-- §4. HARNESS RESIDUE.
--
-- scripts/verify-trigger.sql and scripts/verify-window-trigger.sql both INSERT into bookings
-- inside begin;...rollback;. If anyone ever ran a HIGHLIGHTED SELECTION rather than the whole
-- file, the rollback never ran and those rows COMMITTED.
--
-- The trap: verify-window-trigger.sql:119 inserts with processor='paystack', and :146 runs
--   update public.bookings set status='confirmed', processor='paystack'
-- so harness residue can look exactly like a confirmed real booking. Match on the reference
-- prefix and the email, never on processor alone. Five prefixes, not two.
-- --------------------------------------------------------------------------------------------
select id, created_at, status, processor, processor_reference, lead_email, start_date
from public.bookings
where processor = 'test'
   or processor_reference ~ '^(harness_|seed_|wharness_|wh_|wh2_)'
   or lead_email in ('harness@example.com', 'seed@example.com',
                     'wharness@example.com', 'wh@example.com', 'wh2@example.com')
order by created_at;

-- Both harness files `create or replace function` UNQUALIFIED, so a partial run leaves them
-- sitting in public. Expect zero rows.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('t_try', 'w_try');


-- --------------------------------------------------------------------------------------------
-- §5. The other tables. (These assume 0011 is applied — confirm via §0.)
-- --------------------------------------------------------------------------------------------
select id, created_at, name, email, group_size, target_dates,
       left(coalesce(message, ''), 90) as message_head, handled_at, handled_by
from public.inquiries order by created_at;

select id, created_at, start_date, end_date, reason, created_by, removed_at
from public.blocked_dates order by start_date;

select pd.id, pd.booking_id, pd.created_at, pd.submitted_at,
       b.processor_reference, b.lead_email
from public.pretrip_details pd
left join public.bookings b on b.id = pd.booking_id
order by pd.created_at;

select id, created_at, event_type, booking_id, processor_reference, amount_cents
from public.payment_events order by created_at;

select split_part(key, ':', 1) as family, count(*) as keys, sum(count) as hits,
       min(window_start), max(window_start)
from public.rate_limits group by 1 order by 1;

-- Kept, not deleted. Record the count now so you can prove afterwards that only the
-- booking_id nulling touched it.
select id, created_at, admin_email, action, booking_id, note
from public.admin_audit order by created_at;


-- --------------------------------------------------------------------------------------------
-- §6. Structural facts. Record these now so §A-4 of the clear-down can prove nothing changed.
-- --------------------------------------------------------------------------------------------
-- No sequences anywhere (all PKs are uuid defaults) -> nothing to reset after a delete.
select c.relname from pg_class c
where c.relkind = 'S' and c.relnamespace = 'public'::regnamespace;   -- expect ZERO rows

-- Foreign keys. Expect exactly 3, all -> bookings(id): 'c' = cascade, 'n' = set null.
select con.conname, con.confdeltype, src.relname as child, tgt.relname as parent
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_class tgt on tgt.oid = con.confrelid
where con.contype = 'f' and con.connamespace = 'public'::regnamespace;

-- Cron jobs. These must SURVIVE the clear-down.
select jobid, jobname, schedule, active from cron.job order by jobname;

-- Triggers on bookings (0013/0014). Neither fires on DELETE.
select tgname from pg_trigger
where tgrelid = 'public.bookings'::regclass and not tgisinternal;

-- Admin accounts. These must SURVIVE — deleting them locks you out of /admin.
select id, email, created_at, last_sign_in_at from auth.users order by created_at;

-- Anyone mid-checkout right now? Must be 0 before you delete anything.
select count(*) as live_holds from public.bookings
where status = 'pending' and hold_expires_at > now();
