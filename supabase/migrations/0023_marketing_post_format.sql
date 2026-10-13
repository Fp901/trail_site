-- The Rooiberg Wander: marketing post formats and the fix round (October 2026, CLAUDE.md Part 18)
--
-- WHAT
--   1. marketing.drafts.format: which kind of social post a draft is, so the owner gets a mix.
--        single    one photo and a caption, in the Instagram or Facebook feed
--        carousel  3 to 10 photos the reader swipes through, and a caption
--        story     one upright photo with a short line on it, gone after 24 hours
--      Null for anything that is not an Instagram or Facebook post (blog drafts, reports, replies).
--      The photo counts and the story's length are enforced by save_draft (lib/marketing-tools.ts);
--      this check only keeps the column to the three names.
--
--   2. The fix round. When the Editor flags a draft, the runner hands it back to its author once.
--      The corrected draft is a NEW row whose `replaces` names the flagged one, and save_draft
--      moves the flagged row to the new status 'superseded', so the owner only sees the fix.
--      'superseded' is set by the server alone; the owner's decisions stay approved/rejected.
--
-- Additive: existing drafts keep null in both columns, and every earlier status is kept. RLS and
-- grants are unchanged (0021: default-deny, service role only).
alter table marketing.drafts
  add column if not exists format text
  constraint drafts_format_check check (format is null or format = any (array['single', 'carousel', 'story']));

alter table marketing.drafts
  add column if not exists replaces uuid references marketing.drafts (id);

alter table marketing.drafts drop constraint if exists drafts_status_check;
alter table marketing.drafts
  add constraint drafts_status_check check (status = any (array['pending', 'approved', 'rejected', 'superseded']));
