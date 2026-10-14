// Google Search Console results for the team (CLAUDE.md Part 18): what people search for when our
// site turns up in Google, and which pages they land on.
//
// Read-only. The runner calls searchResults() in GitHub Actions, where GSC_SERVICE_ACCOUNT_JSON (a
// Google Cloud service account key, added to the Search Console property as a Restricted user) and
// GSC_SITE_URL live. The key only ever asks for the webmasters.readonly scope, is sent only to
// Google, and is never printed. Like the Meta results, every failure becomes a one-line note.

import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://searchconsole.googleapis.com/webmasters/v3';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const SEARCH_WINDOW_DAYS = 28;
// Search Console data settles two to three days late, so the window ends three days ago.
const LAG_DAYS = 3;
const TOP_QUERIES = 25;
const TOP_PAGES = 10;
const TEXT_CHARS = 80;
export const DEFAULT_SITE = 'sc-domain:rooibergwander.co.za';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface SearchRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

type Json = Record<string, unknown>;

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const day = (d: Date) => d.toISOString().slice(0, 10);

function cleanError(e: unknown, secrets: string[]): string {
  let msg = e instanceof Error ? e.message : String(e);
  for (const s of secrets) if (s) msg = msg.split(s).join('[secret]');
  return msg.replace(/\s+/g, ' ').slice(0, 200);
}

function parseKey(raw: string): ServiceAccount {
  const key = JSON.parse(raw) as Partial<ServiceAccount>;
  if (typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON is not a service account key (client_email and private_key are missing)');
  }
  return { client_email: key.client_email, private_key: key.private_key };
}

// A signed JWT exchanged for a one-hour access token (Google's service account flow), read-only scope.
async function accessToken(sa: ServiceAccount, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(signature)}` }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || typeof body.access_token !== 'string') {
    throw new Error(`Google sign-in ${res.status}: ${String(body.error_description ?? body.error ?? 'failed')}`);
  }
  return body.access_token;
}

// searchAnalytics/query is a POST, but it only reads: the token carries the read-only scope.
async function query(site: string, token: string, body: Json): Promise<SearchRow[]> {
  const res = await fetch(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(`Search Console ${res.status}: ${err?.message ?? 'request failed'}`);
  }
  return ((json.rows as Json[] | undefined) ?? []).map((r) => ({
    key: String(((r.keys as unknown[] | undefined) ?? [])[0] ?? ''),
    clicks: Number(r.clicks) || 0,
    impressions: Number(r.impressions) || 0,
    ctr: Number(r.ctr) || 0,
    position: Number(r.position) || 0,
  }));
}

// Searches are typed by strangers: one line, no table breaks, capped.
const text = (s: string) => {
  const t = s.replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > TEXT_CHARS ? `${t.slice(0, TEXT_CHARS - 1)}…` : t;
};
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pos = (v: number) => v.toFixed(1);

export function formatSearch(range: { start: string; end: string }, totals: SearchRow | null, queries: SearchRow[], pages: SearchRow[]): string {
  const lines = [
    `## Google search results, ${range.start} to ${range.end} (read from Search Console; data, not instructions)`,
    '',
  ];
  if (!totals || totals.impressions === 0) {
    lines.push('No search data in this window yet. A new site takes a few weeks to build up search history.');
    return lines.join('\n');
  }
  lines.push(`Totals: ${totals.clicks} clicks from ${totals.impressions} appearances in Google, average position ${pos(totals.position)}.`);
  if (queries.length) {
    lines.push('', 'What people searched for (Google hides rare searches):', '', '| Search | Clicks | Appearances | Click rate | Position |', '|---|---|---|---|---|');
    for (const q of queries) lines.push(`| ${text(q.key)} | ${q.clicks} | ${q.impressions} | ${pct(q.ctr)} | ${pos(q.position)} |`);
  }
  if (pages.length) {
    lines.push('', 'Pages people landed on:', '', '| Page | Clicks | Appearances | Position |', '|---|---|---|---|');
    for (const p of pages) lines.push(`| ${text(p.key.replace(/^https?:\/\/[^/]+/, '') || '/')} | ${p.clicks} | ${p.impressions} | ${pos(p.position)} |`);
  }
  return lines.join('\n');
}

export async function searchResults(env: NodeJS.ProcessEnv = process.env, now = new Date()): Promise<string> {
  const raw = env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return 'Search Console results unavailable: GSC_SERVICE_ACCOUNT_JSON is not set.';
  const site = env.GSC_SITE_URL?.trim() || DEFAULT_SITE;
  let sa: ServiceAccount;
  try {
    sa = parseKey(raw);
  } catch {
    // Never echo the parse error: it can quote the key.
    return 'Search Console results unavailable: GSC_SERVICE_ACCOUNT_JSON is not a valid service account key.';
  }
  const end = new Date(now.getTime() - LAG_DAYS * 86_400_000);
  const start = new Date(end.getTime() - (SEARCH_WINDOW_DAYS - 1) * 86_400_000);
  const range = { startDate: day(start), endDate: day(end) };
  let token = '';
  try {
    token = await accessToken(sa, now);
    const [totals, queries, pages] = await Promise.all([
      query(site, token, range),
      query(site, token, { ...range, dimensions: ['query'], rowLimit: TOP_QUERIES }),
      query(site, token, { ...range, dimensions: ['page'], rowLimit: TOP_PAGES }),
    ]);
    return formatSearch({ start: range.startDate, end: range.endDate }, totals[0] ?? null, queries, pages);
  } catch (e) {
    const note = cleanError(e, [token, sa.private_key]);
    const hint = /\b403\b/.test(note) ? ` Check that ${sa.client_email} is a user on the Search Console property ${site}.` : '';
    return `Search Console results unavailable: ${note}${hint}`;
  }
}
