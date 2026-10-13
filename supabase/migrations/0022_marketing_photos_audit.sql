-- The Rooiberg Wander: marketing team, batch A (October 2026, CLAUDE.md Part 18)
--
-- WHAT
--   1. marketing.photos: the photos the owner uploads at /admin/marketing for the team to use,
--      one row per file. RLS on, no policies, nothing granted to anon or authenticated: only the
--      server (service role) reads or writes it, like every other marketing table (0021).
--   2. The private Storage bucket `marketing-photos` that holds those files. public = false and
--      NO storage.objects policies, so anon and authenticated can neither list, read nor write it;
--      the server uploads with the service role and hands the agents short-lived signed URLs.
--      The bucket itself refuses anything over 4 MB or not JPEG, PNG or WebP, a second wall behind
--      the server's own checks (magic bytes, size).
--
--   3. admin_audit learns the marketing actions, so every owner decision on a draft and every photo
--      upload is in the append-only audit log as well as in marketing.feedback / marketing.photos:
--        marketing_draft_approve, marketing_draft_edit, marketing_draft_reject, marketing_photo_upload
--      The constraint is dropped and re-added with every earlier action kept (as 0012 did).
--
-- NO HUNTING TROPHIES. Every upload requires the owner to tick "This photo shows no hunting
-- trophies"; the tick's time is stored (no_trophies_confirmed_at, NOT NULL), so a row cannot exist
-- without it.
--
-- CHECK SYNTAX. The marketing enum checks use `col = any (array[...])`, as in 0021: verify-admin.mjs
-- reads the last `check (status in (...))` in the migration set as the bookings status enum. The
-- admin_audit check below keeps the `action in (...)` form on purpose: verify-admin.mjs reads the
-- LAST such check as the ADMIN_ACTIONS enum.
--
-- AFTER APPLYING. Nothing new to expose: the `marketing` schema is already exposed (0021).
--   Check: begin; set local role anon; select count(*) from marketing.photos; rollback;
--     -> permission denied
--   Check: select public, file_size_limit, allowed_mime_types from storage.buckets
--          where id = 'marketing-photos';  -> false, 4194304, {image/jpeg,image/png,image/webp}
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. marketing.photos
-- ---------------------------------------------------------------------------
create table if not exists marketing.photos (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  -- Object path inside the marketing-photos bucket; server-generated, never the uploaded filename.
  storage_path              text not null unique constraint photos_path_format check (storage_path ~ '^uploads/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  category                  text not null constraint photos_category_check check (category = any (array[
                              'trail', 'lodge', 'landscape', 'wildlife', 'food', 'guide'])),
  -- A lodge key, mapped to the name in src/data/photo-library.ts. Null when no lodge applies.
  lodge                     text constraint photos_lodge_check check (lodge = any (array[
                              'temmincks', 'oukraal', 'rustwood'])),
  alt                       text not null constraint photos_alt_len check (char_length(alt) between 10 and 300),
  content_type              text not null constraint photos_content_type_check check (content_type = any (array[
                              'image/jpeg', 'image/png', 'image/webp'])),
  bytes                     integer not null constraint photos_bytes_check check (bytes between 1 and 4194304),
  -- When the owner ticked "This photo shows no hunting trophies". Required.
  no_trophies_confirmed_at  timestamptz not null,
  uploaded_by               text not null
);

create index if not exists photos_created_idx on marketing.photos (created_at desc);

alter table marketing.photos enable row level security;
revoke all on marketing.photos from anon, authenticated;
grant select, insert, update, delete on marketing.photos to service_role;

comment on table marketing.photos is
  'Photos the owner uploaded at /admin/marketing for the marketing team. Files live in the private '
  'marketing-photos bucket; agents only ever see short-lived signed URLs. Every row carries the '
  'owner''s no-hunting-trophies confirmation. Server (service role) only.';

-- ---------------------------------------------------------------------------
-- 2. The private bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-photos', 'marketing-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 3. admin_audit: the marketing actions
-- ---------------------------------------------------------------------------
alter table public.admin_audit
  drop constraint if exists admin_audit_action_check;

alter table public.admin_audit
  add constraint admin_audit_action_check check (action in (
    'note',
    'update_contact',
    'move_dates',
    'cancel_booking',
    'resend_email',
    'mark_balance_paid',
    'block_dates',
    'unblock_dates',
    'inquiry_handled',
    'create_comp_booking',
    'marketing_draft_approve',
    'marketing_draft_edit',
    'marketing_draft_reject',
    'marketing_photo_upload'
  ));
