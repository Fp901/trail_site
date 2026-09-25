-- The Rooiberg Wander — departure_inventory without a SECURITY DEFINER view (25 September 2026)
--
-- WHY
--   Supabase's security advisor flags public.departure_inventory as "Security Definer View"
--   (Critical). The view was deliberately definer-rights: the anon booking calendar needs per-date
--   availability, but RLS denies anon every row of bookings, so the view read the table as its
--   owner and returned only PII-free aggregates. The advisor cannot tell that apart from an
--   accidental leak, and a view in the exposed public schema is the pattern it warns about.
--
-- WHAT THIS CHANGES (same data, same six columns, same client contract)
--   1. The owner-rights query moves into private.departure_inventory_rows(), a SECURITY DEFINER
--      function in a `private` schema that PostgREST does not expose. Its search_path is empty
--      and every name is schema-qualified, so it cannot be hijacked through search_path.
--   2. public.departure_inventory becomes an ordinary SECURITY INVOKER view over that function.
--      The widget keeps reading /rest/v1/departure_inventory exactly as before.
--   anon still cannot read bookings or blocked_dates directly (RLS default-deny is unchanged).
--
-- CHECK AFTER APPLYING (in the SQL editor):
--   begin; set local role anon; select count(*) from public.departure_inventory; rollback;
--     -> returns a number (the calendar still works)
--   begin; set local role anon; select count(*) from public.bookings; rollback;
--     -> 0 rows or permission denied (bookings still closed to anon)
--   Then re-run the Security Advisor: the Security Definer View finding should be gone.
--
-- Safe to re-run.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.departure_inventory_rows()
returns table (
  start_date date,
  seats_taken int,
  seats_left int,
  rooms_taken int,
  locked_catering text,
  is_blocked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with active as (
    -- Rows that actually hold inventory: confirmed, or pending with a live hold.
    select start_date, catering, group_size, rooms
    from public.bookings
    where status = 'confirmed'
       or (status = 'pending' and hold_expires_at > now())
  ),
  blocked as (
    -- Operator-blocked windows expanded from ranges to individual days, because the calendar
    -- reasons in days. `distinct` guards against overlapping blocked ranges double-counting.
    select distinct gs::date as start_date
    from public.blocked_dates b
    cross join lateral generate_series(b.start_date, b.end_date, interval '1 day') as gs
    where b.removed_at is null
  ),
  booked as (
    -- All active rows on a date share one catering (the slot guard enforces it), so min() simply
    -- reads the locked value rather than choosing between competing ones.
    select
      start_date,
      sum(group_size)::int as seats_taken,
      sum(rooms)::int      as rooms_taken,
      min(catering)        as locked_catering
    from active
    group by start_date
  ),
  dated as (
    select start_date from blocked
    union
    select start_date from booked
  )
  select
    d.start_date,
    coalesce(k.seats_taken, 0)::int as seats_taken,
    -- Remaining walker capacity out of 8. Forced to 0 when the date cannot take another booking at
    -- all, so "does this party fit" is a single comparison client-side regardless of the reason.
    case
      when b.start_date is not null then 0                        -- operator-blocked
      else greatest(0, 8 - coalesce(k.seats_taken, 0))
    end::int                        as seats_left,
    -- Rooms held on the date, out of 4. The calendar fits a party by rooms first.
    coalesce(k.rooms_taken, 0)::int as rooms_taken,
    k.locked_catering,                                            -- null = not yet opened
    (b.start_date is not null)      as is_blocked
  from dated d
  left join booked  k on k.start_date = d.start_date
  left join blocked b on b.start_date = d.start_date;
$$;

revoke all on function private.departure_inventory_rows() from public;
grant execute on function private.departure_inventory_rows() to anon, authenticated;

comment on function private.departure_inventory_rows() is
  'Owner-rights aggregate behind public.departure_inventory. PII-FREE by construction: a date, '
  'seat and room counts, a catering label and a boolean. Lives in the unexposed private schema; '
  'search_path is empty and every name is schema-qualified. Do not add PII columns.';

drop view if exists public.departure_inventory;

create view public.departure_inventory
  with (security_invoker = on)
as
  select start_date, seats_taken, seats_left, rooms_taken, locked_catering, is_blocked
  from private.departure_inventory_rows();

grant select on public.departure_inventory to anon, authenticated;

comment on view public.departure_inventory is
  'SECURITY INVOKER view for the anon booking calendar over private.departure_inventory_rows(). '
  'Derived from bookings + blocked_dates on every read, never materialised, so it cannot drift '
  'from the rows it describes. PII-FREE by construction: a date, seat and room counts, a catering '
  'label and a boolean. CLIENT CONTRACT: the view is SPARSE. A start_date absent from it has no '
  'state at all, meaning no seats or rooms taken, all 8 places and 4 rooms free, no catering lock, '
  'not blocked. Rows only exist for dates carrying a booking or an operator block. seats_left is '
  'forced to 0 on a blocked date so a single comparison answers "does this party fit"; '
  'seats_taken and rooms_taken still report the real counts. locked_catering is null until the '
  'first booking on a date sets it. Do not add PII columns.';
