-- The Rooiberg Wander: the blog and its Publish button (October 2026, CLAUDE.md Part 18)
--
-- WHAT
--   The owner can publish an approved blog draft to rooibergwander.co.za/blog from
--   /admin/marketing with one click (adminPublishBlog), the same way the Post button sends a
--   social draft to Instagram and Facebook. The agents still cannot publish anything: the tool
--   server has no publish tool, and only an admin session reaches this action.
--
--   1. marketing.blog_posts holds each published article: a copy of the approved title and text
--      taken at the moment of publishing, so a later change to the draft row never changes what
--      is live. The public /blog pages read it on the server with the service role.
--   2. The publish claims marketing.posts (draft_id, 'blog') first, through the unique index from
--      0024, so a double click cannot publish one draft twice.
--   3. admin_audit learns 'marketing_blog_publish'.
--
-- Additive: no existing row changes. Default-deny like the rest of the schema (0021): RLS on, no
-- policies, nothing granted to anon or authenticated.
create table if not exists marketing.blog_posts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  draft_id        uuid not null unique references marketing.drafts(id),
  slug            text not null unique constraint blog_posts_slug_check
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title           text not null check (char_length(title) between 1 and 200),
  description     text not null check (char_length(description) between 1 and 200),
  body            text not null check (char_length(body) between 1 and 20000),
  cover_photo_id  text,
  cover_alt       text check (cover_alt is null or char_length(cover_alt) <= 300),
  published_at    timestamptz not null default now(),
  published_by    text not null
);

create index if not exists blog_posts_published_idx on marketing.blog_posts (published_at desc);

alter table marketing.blog_posts enable row level security;
revoke all on marketing.blog_posts from anon, authenticated;
grant select, insert, update, delete on marketing.blog_posts to service_role;

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
    'marketing_blog_publish'
  ));
