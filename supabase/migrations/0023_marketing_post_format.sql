-- The Rooiberg Wander: marketing post formats (October 2026, CLAUDE.md Part 18)
--
-- WHAT
--   marketing.drafts.format: which kind of social post a draft is, so the owner gets a mix.
--     single    one photo and a caption, in the Instagram or Facebook feed
--     carousel  3 to 10 photos the reader swipes through, and a caption
--     story     one upright photo with a short line on it, gone after 24 hours
--   Null for anything that is not an Instagram or Facebook post (blog drafts, reports, replies).
--   The photo counts and the story's length are enforced by save_draft (lib/marketing-tools.ts);
--   this check only keeps the column to the three names.
--
-- Additive and nullable: existing drafts keep null, nothing else changes. RLS and grants are
-- unchanged (0021: default-deny, service role only).
alter table marketing.drafts
  add column if not exists format text
  constraint drafts_format_check check (format is null or format = any (array['single', 'carousel', 'story']));
