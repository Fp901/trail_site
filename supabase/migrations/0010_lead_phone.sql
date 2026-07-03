-- Add lead_phone to bookings — collected at checkout so operators can contact the group lead
-- by phone if needed (especially useful during an active trail). Nullable so existing rows
-- (created before this migration) are unaffected.
alter table public.bookings
  add column if not exists lead_phone text;
