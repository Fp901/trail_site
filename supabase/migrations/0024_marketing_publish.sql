-- The Rooiberg Wander: the owner's Post button (October 2026, CLAUDE.md Part 18)
--
-- WHAT
--   The owner can post an approved Instagram or Facebook draft from /admin/marketing with one
--   click (adminPublishDraft). The agents still cannot post anything: the tool server has no
--   publish tool, and only an admin session reaches this action.
--
--   1. marketing.posts gets one row per draft and channel. The row is inserted BEFORE Meta is
--      called, as a claim: the unique index below means a double click, or two admins at once,
--      cannot post the same draft to the same channel twice. published_at stays null until Meta
--      confirms; a failed post deletes its claim so the owner can try again.
--   2. admin_audit learns 'marketing_post_publish', one row per channel posted.
--
-- Additive: no existing row changes. RLS and grants are unchanged (0021: default-deny, service
-- role only).
create unique index if not exists posts_draft_channel_key on marketing.posts (draft_id, channel);

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
    'marketing_post_publish'
  ));
