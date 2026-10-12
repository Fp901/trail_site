-- The Rooiberg Wander — AI marketing team, milestone 1 (October 2026, CLAUDE.md Part 18)
--
-- WHY
--   Seven Claude agents draft marketing for the owner. They never publish or send: every output
--   is a row here that a person approves, edits or rejects at /admin/marketing. This migration
--   gives them a home that is walled off from the booking tables, and records enquirers' consent
--   to marketing email.
--
-- WHAT
--   1. A `marketing` schema with seven tables. RLS on every table and NO policies: only the
--      server (service role) reads or writes. Nothing is granted to anon or authenticated.
--        drafts       every draft an employee saves; status pending -> approved | rejected
--        feedback     the owner's approve / edit / reject decisions and reasons (the learning loop,
--                     synced into the Copywriter's notebook by the runner)
--        posts        what was published from an approved draft (empty until publishers exist)
--        metrics      per-post or per-channel results the Analyst reads
--        spend_log    list cost of every agent session, for the weekly spend ceiling
--        lead_touches marketing contact with an opted-in enquirer (empty until nurture exists)
--        objections   recurring objections heard in enquiries, for the Sales Assistant
--   2. inquiries.marketing_opt_in: false unless the enquirer ticked the opt-in, which is unticked
--      by default and stored server-side by createInquiry.
--
-- NOTE ON CHECK SYNTAX. Enum checks below use `col = any (array[...])` rather than
-- `col in (...)`. scripts/verify-admin.mjs reads the LAST `check (status in (...))` in the whole
-- migration set as the bookings status enum, so an `in` form here would silently shadow it.
-- scripts/verify-marketing.mjs parses the `any (array[...])` form instead.
--
-- AFTER APPLYING
--   Supabase dashboard -> Project Settings -> Data API -> Exposed schemas: add `marketing`, so the
--   server can reach these tables through supabase-js `.schema('marketing')`. Exposing the schema
--   is safe: anon and authenticated have no usage on it and every table is default-deny.
--   Check: begin; set local role anon; select count(*) from marketing.drafts; rollback;
--     -> permission denied
--
-- Safe to re-run.

create schema if not exists marketing;
revoke all on schema marketing from public, anon, authenticated;
grant usage on schema marketing to service_role;

-- ---------------------------------------------------------------------------
-- 1. drafts
-- ---------------------------------------------------------------------------
create table if not exists marketing.drafts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  author          text not null constraint drafts_author_check check (author = any (array[
                    'head_of_marketing', 'researcher', 'copywriter', 'editor',
                    'community_manager', 'sales_assistant', 'analyst'])),
  kind            text not null constraint drafts_kind_check check (kind = any (array[
                    'x_post', 'instagram_caption', 'facebook_post', 'blog_draft',
                    'enquiry_reply', 'weekly_report'])),
  title           text constraint drafts_title_len check (char_length(title) <= 200),
  body            text not null constraint drafts_body_len check (char_length(body) between 1 and 20000),
  photo_ids       text[] not null default '{}',
  departure_date  date,
  notes           text constraint drafts_notes_len check (char_length(notes) <= 2000),
  status          text not null default 'pending' constraint drafts_status_check check (status = any (array[
                    'pending', 'approved', 'rejected'])),
  editor_status   text not null default 'unchecked' constraint drafts_editor_status_check check (editor_status = any (array[
                    'unchecked', 'passed', 'flagged'])),
  editor_notes    text,
  decided_at      timestamptz,
  decided_by      text,
  decision_reason text constraint drafts_reason_len check (char_length(decision_reason) <= 1000),
  -- The agent's text, kept when the owner edits a draft before approving it.
  original_body   text
);

create index if not exists drafts_pending_idx on marketing.drafts (created_at desc) where status = 'pending';

comment on table marketing.drafts is
  'Every marketing draft an agent saves. Agents can only INSERT pending rows (via the tool '
  'server save_draft); only an admin at /admin/marketing moves a draft to approved or rejected. '
  'Nothing here is ever published automatically.';

-- ---------------------------------------------------------------------------
-- 2. feedback (the learning loop)
-- ---------------------------------------------------------------------------
create table if not exists marketing.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  draft_id    uuid not null references marketing.drafts(id) on delete cascade,
  decision    text not null constraint feedback_decision_check check (decision = any (array[
                'approved', 'edited', 'rejected'])),
  reason      text constraint feedback_reason_len check (char_length(reason) <= 1000),
  decided_by  text not null,
  -- Set when the runner has appended this row to the Copywriter's notebook.
  synced_at   timestamptz
);

create index if not exists feedback_unsynced_idx on marketing.feedback (created_at) where synced_at is null;

-- ---------------------------------------------------------------------------
-- 3. posts, metrics
-- ---------------------------------------------------------------------------
create table if not exists marketing.posts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  draft_id      uuid references marketing.drafts(id) on delete set null,
  channel       text not null constraint posts_channel_check check (channel = any (array[
                  'x', 'instagram', 'facebook', 'blog', 'email'])),
  external_id   text,
  url           text,
  published_at  timestamptz
);

create table if not exists marketing.metrics (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  post_id      uuid references marketing.posts(id) on delete cascade,
  channel      text not null,
  metric       text not null,
  value        numeric not null,
  measured_at  timestamptz not null default now()
);

create index if not exists metrics_measured_idx on marketing.metrics (measured_at desc);

-- ---------------------------------------------------------------------------
-- 4. spend_log
-- ---------------------------------------------------------------------------
create table if not exists marketing.spend_log (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  employee         text not null,
  job              text not null,
  session_id       text,
  -- US cents of list cost, as reported by the session's usage.
  list_cost_cents  integer not null default 0 constraint spend_log_cost_check check (list_cost_cents >= 0),
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0
);

create index if not exists spend_log_created_idx on marketing.spend_log (created_at desc);

-- ---------------------------------------------------------------------------
-- 5. lead_touches, objections
-- ---------------------------------------------------------------------------
create table if not exists marketing.lead_touches (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  inquiry_id  uuid not null references public.inquiries(id) on delete cascade,
  channel     text not null,
  draft_id    uuid references marketing.drafts(id) on delete set null,
  note        text
);

create table if not exists marketing.objections (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  inquiry_id  uuid references public.inquiries(id) on delete set null,
  category    text not null,
  summary     text not null constraint objections_summary_len check (char_length(summary) <= 1000)
);

-- ---------------------------------------------------------------------------
-- 6. Default-deny: RLS on, no policies, server (service role) only
-- ---------------------------------------------------------------------------
alter table marketing.drafts       enable row level security;
alter table marketing.feedback     enable row level security;
alter table marketing.posts        enable row level security;
alter table marketing.metrics      enable row level security;
alter table marketing.spend_log    enable row level security;
alter table marketing.lead_touches enable row level security;
alter table marketing.objections   enable row level security;

revoke all on marketing.drafts       from anon, authenticated;
revoke all on marketing.feedback     from anon, authenticated;
revoke all on marketing.posts        from anon, authenticated;
revoke all on marketing.metrics      from anon, authenticated;
revoke all on marketing.spend_log    from anon, authenticated;
revoke all on marketing.lead_touches from anon, authenticated;
revoke all on marketing.objections   from anon, authenticated;

grant select, insert, update, delete on all tables in schema marketing to service_role;
alter default privileges in schema marketing grant select, insert, update, delete on tables to service_role;

-- ---------------------------------------------------------------------------
-- 7. Enquiry opt-in (POPIA: explicit, unticked by default, stored server-side)
-- ---------------------------------------------------------------------------
alter table public.inquiries
  add column if not exists marketing_opt_in boolean not null default false;

comment on column public.inquiries.marketing_opt_in is
  'True only when the enquirer ticked the optional marketing box on the enquiry form (unticked by '
  'default). Never contact an enquirer for marketing unless this is true.';
