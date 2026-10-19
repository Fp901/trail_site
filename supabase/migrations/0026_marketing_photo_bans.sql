-- The Rooiberg Wander: photos the owner never wants used (October 2026, CLAUDE.md Part 18)
--
-- WHAT
--   The owner's top reason for rejecting drafts was the photo ("not good enough to post",
--   "scruffy", "leaves in the pool"). Rejecting a draft frees its photos, so the team picked the
--   same weak photos again. Now the owner can press "Never use this photo" under any photo on
--   /admin/marketing (adminBanMarketingPhoto), and the photo leaves the team's library for good.
--
--   1. marketing.photo_bans holds one row per banned photo id (a site photo, a shoot photo or an
--      upload, all as the team refers to them), with an optional reason.
--   2. A banned photo counts as used everywhere the team checks: get_photo_library leaves it out,
--      the plan check refuses it and save_draft refuses it.
--   3. admin_audit learns 'marketing_photo_ban'.
--
-- Additive: no existing row changes. Default-deny like the rest of the schema (0021): RLS on, no
-- policies, nothing granted to anon or authenticated.
create table if not exists marketing.photo_bans (
  photo_id    text primary key check (photo_id ~ '^[a-z0-9-]{1,120}$'),
  created_at  timestamptz not null default now(),
  reason      text check (reason is null or char_length(reason) <= 300),
  banned_by   text not null
);

alter table marketing.photo_bans enable row level security;
revoke all on marketing.photo_bans from anon, authenticated;
grant select, insert, update, delete on marketing.photo_bans to service_role;

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
    'marketing_photo_upload',
    'marketing_post_publish',
    'marketing_blog_publish',
    'marketing_photo_ban'
  ));
