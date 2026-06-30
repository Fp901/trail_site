-- The Rooiberg Wander — pre-trip details + token (dependency for the reminder/escalation system)
--
-- WHY: confirmed guests must complete a short pre-trip details form. The reminder/escalation system
-- (0004 + api/cron/pretrip-reminders) needs two things that did not yet exist in the schema:
--   (a) a stable, unguessable per-booking token for the pre-trip form link, and
--   (b) a place to record submission (submitted_at) so reminders can be skipped once completed.
-- NOTE: the pre-trip FORM PAGE/endpoint that WRITES submitted_at is a separate piece of work and is
-- NOT created here — this migration only provides the schema the reminder system depends on.

-- Stable token used in the pre-trip form link. Set automatically on every booking via the default,
-- so the existing insert path (actions/index.ts) needs no change. Unguessable (random uuid).
alter table public.bookings
  add column if not exists pretrip_token uuid not null default gen_random_uuid();

create unique index if not exists bookings_pretrip_token_idx on public.bookings (pretrip_token);

-- One pre-trip submission per booking. submitted_at is the authoritative "completed" marker the
-- reminder cron checks; a row with submitted_at IS NULL (or no row) means "not yet submitted".
create table if not exists public.pretrip_details (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null unique references public.bookings(id) on delete cascade,
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  details      jsonb
);

create index if not exists pretrip_details_booking_idx on public.pretrip_details (booking_id);

-- RLS default-deny: only the server (service-role key) reads/writes these; no anon/authenticated
-- access. The (future) pre-trip form runs server-side and looks a booking up by its token.
alter table public.pretrip_details enable row level security;
revoke all on public.pretrip_details from anon, authenticated;
