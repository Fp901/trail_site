-- The Rooiberg Wander — admin tools (dashboard overhaul, v1)
--
-- WHY: staff assist customers through the portal (edit contact, move dates, cancel, resend
-- emails, mark balance paid, block dates, handle enquiries). Hard requirements from the
-- operator: no permanent deletes anywhere, and a per-admin append-only log of every change.
--
-- 1. admin_audit — append-only who/what/when/before/after log. RLS default-deny; only the
--    server (service role) writes; NOTHING ever updates or deletes rows here.
-- 2. inquiries — handled tracking (handled_at / handled_by) for the new enquiries page.
-- 3. blocked_dates — soft-remove (removed_at) + created_by, so "unblocking" never deletes
--    the row; the availability view is recreated to ignore soft-removed blocks.

-- ---------------------------------------------------------------------------
-- 1. Admin audit log (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  admin_email  text not null,
  action       text not null check (action in (
    'note',
    'update_contact',
    'move_dates',
    'cancel_booking',
    'resend_email',
    'mark_balance_paid',
    'block_dates',
    'unblock_dates',
    'inquiry_handled'
  )),
  booking_id   uuid references public.bookings(id) on delete set null,
  before       jsonb,
  after        jsonb,
  note         text
);

alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

create index if not exists admin_audit_booking_idx on public.admin_audit (booking_id);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);

comment on table public.admin_audit is
  'Append-only per-admin change log. Writes only via the server (service role) with the admin '
  'email taken from the verified session. No code path may ever update or delete rows here.';

-- ---------------------------------------------------------------------------
-- 2. Enquiries: handled tracking
-- ---------------------------------------------------------------------------
alter table public.inquiries
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by text;

-- ---------------------------------------------------------------------------
-- 3. Blocked dates: soft-remove + attribution
-- ---------------------------------------------------------------------------
alter table public.blocked_dates
  add column if not exists removed_at timestamptz,
  add column if not exists created_by text;

comment on column public.blocked_dates.removed_at is
  'Soft remove: an "unblocked" window gets removed_at set (never deleted). The availability '
  'view ignores rows where removed_at is not null.';

-- Recreate the availability view to ignore soft-removed blocks. Same single-start-date shape,
-- grants and SECURITY DEFINER rationale as migration 0009.
drop view if exists public.unavailable_windows;

create view public.unavailable_windows as
  select start_date from public.bookings
    where status = 'confirmed'
       or (status = 'pending' and hold_expires_at > now())
  union
  select gs::date as start_date
    from public.blocked_dates b
    cross join lateral generate_series(b.start_date, b.end_date, interval '1 day') as gs
    where b.removed_at is null;

grant select on public.unavailable_windows to anon, authenticated;

comment on view public.unavailable_windows is
  'Intentional SECURITY DEFINER gateway: exposes ONLY blocked START dates (no PII, no ranges) so the '
  'anon availability calendar can tell which days a new booking may NOT start on, without any direct '
  'access to bookings. Staggered-groups model — a date inside an existing trip but not itself a start '
  'date remains bookable. Soft-removed blocked_dates rows (removed_at set) are ignored. Do not add '
  'PII columns here.';
