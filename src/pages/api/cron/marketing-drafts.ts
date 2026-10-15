// Daily marketing digest (CLAUDE.md Part 18; Vercel Cron, see vercel.json). prerender=false.
// Emails MARKETING_NOTIFY_TO (else every admin in ADMIN_EMAILS) the number of marketing drafts waiting at /admin/marketing.
// Sends nothing when none are waiting. Counts, plus the title and channel (kind) of any draft the
// Editor has still not reviewed 24 hours after it was saved: never the draft text.
import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { marketingEmailList, sendMarketingDraftsDigest } from '../../../lib/email';

export const prerender = false;

const UNREVIEWED_AFTER_MS = 24 * 3600 * 1000;
const MAX_NAMED = 20;

// Same shared-secret gate as the other cron routes: fail closed, timing-safe compare.
function authorized(request: Request): boolean {
  const secret = import.meta.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export const GET: APIRoute = async ({ request }) => {
  if (!authorized(request)) return new Response('Unauthorized', { status: 401 });

  const mk = getSupabaseAdmin().schema('marketing');
  const { data, error } = await mk
    .from('drafts')
    .select('created_at, editor_status, kind, title')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) {
    console.error('[marketing-digest] query failed:', error.message);
    return new Response('query failed', { status: 500 });
  }

  const rows = (data ?? []) as { created_at: string; editor_status: string; kind: string; title: string | null }[];
  if (rows.length === 0) return new Response(JSON.stringify({ waiting: 0, sent: false }), { status: 200 });

  await sendMarketingDraftsDigest({
    tos: marketingEmailList(),
    waiting: rows.length,
    flagged: rows.filter((r) => r.editor_status === 'flagged').length,
    oldestCreatedAt: rows[0]?.created_at ?? null,
    unreviewed: rows
      .filter((r) => r.editor_status === 'unchecked' && Date.now() - Date.parse(r.created_at) > UNREVIEWED_AFTER_MS)
      .slice(0, MAX_NAMED)
      .map((r) => ({ kind: r.kind, title: r.title, createdAt: r.created_at })),
  });
  return new Response(JSON.stringify({ waiting: rows.length, sent: true }), { status: 200 });
};
