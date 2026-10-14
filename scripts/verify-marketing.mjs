// The AI marketing team (CLAUDE.md Part 18): the guarantees that must never drift.
// Run: npx tsx scripts/verify-marketing.mjs   (or npm run verify:marketing)
//
//   1. The Editor's code rules (src/lib/brand-rules.ts) pass clean copy and hard-fail every
//      broken brand rule, one sample per rule.
//   2. Migrations 0021 and 0022: the marketing tables match db.types.ts, every one is default-deny,
//      and the marketing-photos bucket is private.
//   3. The Rooiberg tool server exposes exactly six tools, no publish or send, behind a
//      per-employee constant-time bearer check; each employee may call only its TOOL_ACCESS
//      tools; save_draft can only insert a pending draft and submit_review (Editor only) can only
//      record a verdict, never change a draft's status.
//   4. The employees: the agreed models, caps under the hard cap, no shell, web for the
//      Researcher only, save_draft never given to the Editor.
//   5. The schedule: dry run by default, a budget on every session, crons that match config.ts;
//      the owner review, its admin_audit entries (0022) and the daily digest.
//   6. The photo library covers every site photo but the logos, and owner uploads are checked
//      (type from magic bytes, size, the no-hunting-trophies tick) into a private bucket.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { checkDraft, publishedRates } from '../src/lib/brand-rules.ts';
import { fileURLToPath } from 'node:url';
import {
  EMPLOYEE_KEYS,
  HARD_RUN_CAP_CENTS,
  MANUAL_JOBS,
  MODELS,
  RUN_CAP_CENTS,
  SCHEDULES,
  TEAM_TAG,
  TOOL_ACCESS,
  TOOL_NAMES,
  TOOL_SERVER_PATH,
  WEEKLY_CAP_CENTS,
  notebookStoreName,
} from '../marketing/config.ts';
import { EMPLOYEES, employee } from '../marketing/agents/index.ts';
import { TEAM_PREAMBLE } from '../marketing/agents/types.ts';
import { RESEARCH_HOSTS, briefText } from '../marketing/brief.ts';
import {
  HARD_RULES_SUMMARY,
  SKILL_NAME,
  agentParams,
  brandSkillBody,
  environmentSpecs,
  hashFromVersionDescription,
  memoryPlan,
  seedMemories,
  skillContentHash,
  skillUploadContent,
} from '../marketing/build.ts';
import { employeeToolToken } from '../src/lib/marketing-auth.ts';
import * as contracts from '../marketing/contracts.ts';
import { register } from 'node:module';

// The tool registry imports site photos (astro:assets image imports). Outside Vite, stand each one
// in as a tiny metadata object so the registry itself can be exercised below with no network.
// Each JPEG's real size (from its SOF marker), so photo orientation is tested on the true shapes.
const jpegSize = (b) => {
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
};
const imageSizes = {};
for (const dir of ['', 'lodges/']) {
  const base = new URL(`../src/assets/images/${dir}`, import.meta.url);
  for (const f of readdirSync(base).filter((f) => /\.jpe?g$/i.test(f))) {
    const size = jpegSize(readFileSync(new URL(f, base)));
    if (size) imageSizes[f] = size;
  }
}
register(
  'data:text/javascript,' +
    encodeURIComponent(`const SIZES = ${JSON.stringify(imageSizes)};
    export async function load(url, context, next) {
      if (/\\.(jpe?g|png|webp|avif)$/i.test(url)) {
        const name = url.split('/').pop();
        const size = SIZES[name] ?? { width: 1600, height: 1067 };
        return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify({ src: '/_astro/' + name, ...size, format: 'jpg' }) };
      }
      return next(url, context);
    }`),
);
const { listTools, callTool, staticPhotoLibrary } = await import('../src/lib/marketing-tools.ts');
const { photoLibrary: SITE_PHOTOS, MARKETING_EXCLUDED_PHOTOS, PHOTO_CATEGORIES, PHOTO_LODGES, PHOTO_LODGE_BY_KEY, PHOTO_UPLOAD_MAX_BYTES, PHOTO_UPLOAD_TYPES } = await import('../src/data/photo-library.ts');
const { sniffImageType, checkPhotoUpload } = await import('../src/lib/marketing-photos.ts');
import {
  MARKETING_AUTHORS,
  MARKETING_CHANNELS,
  MARKETING_DECISIONS,
  MARKETING_DRAFT_COLUMNS,
  MARKETING_POST_FORMATS,
  MARKETING_DRAFT_KINDS,
  MARKETING_DRAFT_STATUSES,
  MARKETING_EDITOR_STATUSES,
  MARKETING_FEEDBACK_COLUMNS,
  MARKETING_LEAD_TOUCH_COLUMNS,
  MARKETING_METRIC_COLUMNS,
  MARKETING_OBJECTION_COLUMNS,
  MARKETING_POST_COLUMNS,
  MARKETING_SPEND_COLUMNS,
  MARKETING_PHOTO_CATEGORIES,
  MARKETING_PHOTO_COLUMNS,
  MARKETING_PHOTO_LODGES,
  MARKETING_PHOTO_TYPES,
  INQUIRY_COLUMNS,
} from '../src/lib/db.types.ts';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 66 - t.length))}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sameSet = (a, b) => {
  const A = [...new Set(a)].sort();
  const B = [...new Set(b)].sort();
  return A.length === B.length && A.every((x, i) => x === B[i]);
};
const rulesOf = (text, kind = 'instagram_caption') => checkDraft(text, kind).map((v) => v.rule);
const syncTsEarly = read('marketing/sync.ts');

// ---------------------------------------------------------------------------------------------
section('1. Editor code rules: clean copy passes, each broken rule hard-fails');

const clean =
  "Three days on foot through a private Big 5 reserve in the Waterberg. From R12,720 per person " +
  "sharing for the whole trail, all-inclusive. Two FGASA qualified trail guides walk with you at " +
  "all times under the Two-Man Rule, so you can be safe and still feel the wild. Nights at " +
  "Temminck's Lodge, Oukraal and Rustwood, with a barbeque around the boma fire. " +
  'Guaranteed Departure: 2 of 8 spots booked. 6 spots available.';
assert('a clean caption passes every rule', rulesOf(clean).length === 0);
assert('the 2027 high season rate (R15,900) is quotable', rulesOf('Book from R15,900 per person sharing.').length === 0);
assert('the 2028 low season rate (R13,737) is quotable', rulesOf('In 2028, low season is R13,737 per person sharing.').length === 0);
assert('published rates are derived (R12,720 and R17,172 present)', publishedRates().has(12720) && publishedRates().has(17172));
assert('published rates exclude the SADC rate (R11,130)', !publishedRates().has(11130));

const cases = [
  ['dash', 'An em-dash', 'Walk the ridge — then rest.'],
  ['dash', 'An en-dash', 'Walk 15–20 km a day.'],
  ['per_night', '"per night"', 'Only R5,300 per night.'],
  ['per_night', '"/night"', 'Lodges from R5,300/night.'],
  ['per_night', 'a nightly rate', 'Our nightly rate is lower than you think.'],
  ['per_night', 'pppn', 'From R5,300 pppn.'],
  ['sadc', 'SADC named', 'SADC residents get 30% off.'],
  ['sadc', 'resident rate', 'Ask about our resident rate.'],
  ['hidden_product', 'the hidden page', 'See rooibergwander.co.za/sadc-slackpacking for more.'],
  ['hidden_product', 'self-catering', 'A self-catering option is also available.'],
  ['hidden_product', 'self catered', 'Try the self catered trail.'],
  ['internals', 'an owner split', 'The owner split keeps prices fair.'],
  ['internals', 'a margin', 'Our margin is small.'],
  ['internals', 'the business plan', 'As the business plan says, walking is the future.'],
  ['internals', 'a named individual from the plan', 'Francois walked it first.'],
  ['old_lodge_name', 'Rotavi', 'Start at Rotavi.'],
  ['old_lodge_name', 'VierVanAcht', 'Sleep at VierVanAcht.'],
  ['old_lodge_name', 'Blackwood', 'Sunset at Blackwood.'],
  ['braai', 'braai', 'Dinner is a braai under the stars.'],
  ['departure_line', 'a paraphrased departure', 'Only 6 spots left on 12 April!'],
  ['departure_line', 'guaranteed departure without the exact line', 'This is a guaranteed departure, join now.'],
  ['departure_line', 'counts that add to more than 8', 'Guaranteed Departure: 4 of 8 spots booked. 6 spots available.'],
  ['unpublished_price', 'an invented rand amount', 'Now only R9,999 per person sharing.'],
  ['unpublished_price', 'the SADC rate figure without the word', 'From R11,130 per person sharing.'],
  ['two_man_rule', 'safety without the Two-Man Rule', 'Walking here is perfectly safe.'],
  ['two_man_rule', 'a misspelt Two-Man Rule', 'We follow the two man rule.'],
];
for (const [rule, label, text] of cases) {
  const got = rulesOf(text);
  assert(`${rule}: ${label} is refused`, got.includes(rule));
}
assert('x_length: an X post over 280 characters is refused', rulesOf('Walk. '.repeat(60), 'x_post').includes('x_length'));
assert('x_length: the same text as a blog draft is allowed', !rulesOf('Walk. '.repeat(60), 'blog_draft').includes('x_length'));
assert('empty: an empty draft is refused', rulesOf('   ').includes('empty'));
assert('story_length: a story over 125 characters is refused', checkDraft('Walk. '.repeat(22), 'instagram_caption', 'story').some((v) => v.rule === 'story_length'));
assert('story_length: the same text as a single post is allowed', !checkDraft('Walk. '.repeat(22), 'instagram_caption', 'single').some((v) => v.rule === 'story_length'));
assert('an internal weekly report is not held to the public copy rules', rulesOf('SADC share of enquiries rose — margin up.', 'weekly_report').length === 0);
assert('every rule has a failing sample', sameSet(
  [...new Set([...cases.map((c) => c[0]), 'x_length', 'empty', 'story_length'])],
  ['empty', 'dash', 'per_night', 'sadc', 'hidden_product', 'internals', 'old_lodge_name', 'braai', 'departure_line', 'unpublished_price', 'two_man_rule', 'x_length', 'story_length'],
));

// ---------------------------------------------------------------------------------------------
section('2. Migrations 0021 and 0022: marketing tables === db.types.ts, all default-deny');

const migPath = 'supabase/migrations/0021_marketing.sql';
assert('0021_marketing.sql exists', existsSync(new URL(`../${migPath}`, import.meta.url)));
const migFiles = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
assert('0023 is the latest migration', migFiles[migFiles.length - 1] === '0023_marketing_post_format.sql');
const sql = read(migPath).replace(/--[^\n]*/g, '');

const tables = {};
for (const m of sql.matchAll(/create table if not exists marketing\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const [, table, body] = m;
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  tables[table] = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^(constraint|primary key|unique|check|foreign key)\b/i.test(p))
    .map((p) => p.split(/\s+/)[0]);
}
// Columns later migrations add to a 0021 table (0023: drafts.format).
for (const f of migFiles.filter((f) => f > '0021')) {
  const later = read(`supabase/migrations/${f}`).replace(/--[^\n]*/g, '');
  for (const m of later.matchAll(/alter table marketing\.(\w+)\s+add column if not exists (\w+)/g)) {
    if (tables[m[1]]) tables[m[1]].push(m[2]);
  }
}
const sql23 = read('supabase/migrations/0023_marketing_post_format.sql').replace(/--[^\n]*/g, '');
{
  const m = sql23.match(/constraint drafts_format_check check \(format is null or format = any \(array\[([\s\S]*?)\]\)\)/);
  const vals = m ? m[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1)) : null;
  assert(`0023 drafts_format_check matches db.types (${MARKETING_POST_FORMATS.join('|')}) and allows null`, vals !== null && sameSet(vals, MARKETING_POST_FORMATS));
  assert('0023 matches the plan formats in contracts.ts', sameSet(MARKETING_POST_FORMATS, contracts.POST_FORMATS));
  assert('0023 adds no policy and grants nothing', !/create policy/i.test(sql23) && !/\bgrant\b/i.test(sql23));
}
const tuples = {
  drafts: MARKETING_DRAFT_COLUMNS,
  feedback: MARKETING_FEEDBACK_COLUMNS,
  posts: MARKETING_POST_COLUMNS,
  metrics: MARKETING_METRIC_COLUMNS,
  spend_log: MARKETING_SPEND_COLUMNS,
  lead_touches: MARKETING_LEAD_TOUCH_COLUMNS,
  objections: MARKETING_OBJECTION_COLUMNS,
};
assert(`0021 creates exactly the seven modelled tables (${Object.keys(tables).join(', ')})`, sameSet(Object.keys(tables), Object.keys(tuples)));
for (const [t, tuple] of Object.entries(tuples)) {
  assert(`marketing.${t}: ${tuple.length} columns match the SQL`, sameSet(tables[t] ?? [], tuple));
  assert(`marketing.${t}: RLS enabled`, new RegExp(`alter table marketing\\.${t}\\s+enable row level security`).test(sql));
  assert(`marketing.${t}: revoked from anon and authenticated`, new RegExp(`revoke all on marketing\\.${t}\\s+from anon, authenticated`).test(sql));
}
assert('no policy is created (default-deny)', !/create policy/i.test(sql));
assert('nothing is granted to anon or authenticated', !/grant[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i.test(sql));
assert('the schema itself is revoked from anon and authenticated', /revoke all on schema marketing from public, anon, authenticated/.test(sql));

const enumOf = (name) => {
  const m = sql.match(new RegExp(`constraint ${name} check \\(\\w+ = any \\(array\\[([\\s\\S]*?)\\]\\)\\)`));
  return m ? m[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)) : null;
};
{
  const all = migFiles.filter((f) => f >= '0021').map((f) => read(`supabase/migrations/${f}`).replace(/--[^\n]*/g, '')).join('\n');
  const defs = [...all.matchAll(/constraint drafts_status_check check \(status = any \(array\[([\s\S]*?)\]\)\)/g)];
  const vals = defs.length ? defs[defs.length - 1][1].match(/'([^']+)'/g).map((x) => x.slice(1, -1)) : null;
  assert(`the latest drafts_status_check matches db.types (${MARKETING_DRAFT_STATUSES.join('|')})`, vals !== null && sameSet(vals, MARKETING_DRAFT_STATUSES));
  assert('0023 keeps every earlier draft status', ['pending', 'approved', 'rejected'].every((x) => vals?.includes(x)));
}
for (const [constraint, tuple] of [
  ['drafts_author_check', MARKETING_AUTHORS],
  ['drafts_kind_check', MARKETING_DRAFT_KINDS],
  ['drafts_editor_status_check', MARKETING_EDITOR_STATUSES],
  ['feedback_decision_check', MARKETING_DECISIONS],
  ['posts_channel_check', MARKETING_CHANNELS],
]) {
  const vals = enumOf(constraint);
  assert(`${constraint} matches db.types (${tuple.join('|')})`, vals !== null && sameSet(vals, tuple));
}
assert('drafts default to pending', /status\s+text not null default 'pending'/.test(sql));
assert('enum checks avoid the `status in (...)` form verify-admin reads as the bookings enum', !/check\s*\(\s*status\s+in\s*\(/i.test(sql));
assert('inquiries.marketing_opt_in is not null, default false', /add column if not exists marketing_opt_in boolean not null default false/.test(sql));
assert('db.types models inquiries.marketing_opt_in', INQUIRY_COLUMNS.includes('marketing_opt_in'));

// ---- 0022: marketing.photos and the private bucket ----
const sql22 = read('supabase/migrations/0022_marketing_photos_audit.sql').replace(/--[^\n]*/g, '');
const photosBody = sql22.match(/create table if not exists marketing\.photos\s*\(([\s\S]*?)\n\);/)?.[1] ?? '';
{
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of photosBody) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  const cols = parts.map((x) => x.trim()).filter(Boolean).filter((x) => !/^(constraint|primary key|unique|check|foreign key)\b/i.test(x)).map((x) => x.split(/\s+/)[0]);
  assert(`marketing.photos: ${MARKETING_PHOTO_COLUMNS.length} columns match the SQL`, sameSet(cols, MARKETING_PHOTO_COLUMNS));
}
assert('marketing.photos: RLS enabled', /alter table marketing\.photos enable row level security/.test(sql22));
assert('marketing.photos: revoked from anon and authenticated', /revoke all on marketing\.photos from anon, authenticated/.test(sql22));
assert('0022 creates no policy (table or storage): default-deny', !/create policy/i.test(sql22));
assert('0022 grants nothing to anon or authenticated', !/grant[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i.test(sql22));
assert('the no-trophies confirmation is required on every photo row', /no_trophies_confirmed_at\s+timestamptz not null/.test(sql22));
const enum22 = (name) => {
  const m = sql22.match(new RegExp(`constraint ${name} check \\(\\w+ = any \\(array\\[([\\s\\S]*?)\\]\\)\\)`));
  return m ? m[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1)) : null;
};
assert('photos_category_check === db.types === data/photo-library', sameSet(enum22('photos_category_check') ?? [], MARKETING_PHOTO_CATEGORIES) && sameSet(PHOTO_CATEGORIES, MARKETING_PHOTO_CATEGORIES));
assert('photos_lodge_check === db.types === the lodge key map', sameSet(enum22('photos_lodge_check') ?? [], MARKETING_PHOTO_LODGES) && sameSet(Object.keys(PHOTO_LODGE_BY_KEY), MARKETING_PHOTO_LODGES));
assert('photos_content_type_check === db.types === the upload types', sameSet(enum22('photos_content_type_check') ?? [], MARKETING_PHOTO_TYPES) && sameSet(PHOTO_UPLOAD_TYPES, MARKETING_PHOTO_TYPES));
const bucket = sql22.match(/insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)\s*values \('marketing-photos', 'marketing-photos', (\w+), (\d+), array\[([^\]]*)\]\)/);
assert('the marketing-photos bucket is private', bucket?.[1] === 'false' && /on conflict \(id\) do update\s+set public = false/.test(sql22));
assert('the bucket size limit and the photos_bytes_check equal PHOTO_UPLOAD_MAX_BYTES', Number(bucket?.[2]) === PHOTO_UPLOAD_MAX_BYTES && new RegExp(`bytes between 1 and ${PHOTO_UPLOAD_MAX_BYTES}`).test(sql22));
assert('the bucket accepts only the upload types', sameSet((bucket?.[3] ?? '').match(/'([^']+)'/g)?.map((x) => x.slice(1, -1)) ?? [], MARKETING_PHOTO_TYPES));
assert('4 MB stays under Vercel\'s 4.5 MB request ceiling and the action body limit', PHOTO_UPLOAD_MAX_BYTES <= 4 * 1024 * 1024 && /actionBodySizeLimit: 4\.5 \* 1024 \* 1024/.test(read('astro.config.mjs')));

const actions = read('src/actions/index.ts');
assert('createInquiry validates the opt-in with zod, default false', /marketingOptIn: z\.boolean\(\)\.optional\(\)\.default\(false\)/.test(actions));
assert('createInquiry stores only an explicit true', /marketing_opt_in: input\.marketingOptIn === true/.test(actions));
const form = read('src/components/InquiryForm.astro');
assert('the enquiry form has an opt-in checkbox', /type="checkbox" name="marketingOptIn"/.test(form));
assert('the opt-in checkbox is unticked by default', !/name="marketingOptIn"[^>]*\bchecked\b/.test(form));

// ---------------------------------------------------------------------------------------------
section('3. Rooiberg tool server: six tools, no publish or send, per-employee auth');

const route = read('src/pages/api/marketing/mcp/[employee].ts');
const auth = read('src/lib/marketing-auth.ts');
const tools = read('src/lib/marketing-tools.ts');
const toolNames = [...tools.matchAll(/^\s{4}name: '([a-z_]+)',$/gm)].map((m) => m[1]);
assert(`exactly the six agreed tools (${toolNames.join(', ')})`, sameSet(toolNames, [
  'get_open_departures', 'get_facts_pack', 'get_photo_library', 'get_results', 'save_draft', 'submit_review',
]));
assert('the old shared-token route is gone', !existsSync(new URL('../src/pages/api/marketing/mcp.ts', import.meta.url)));
assert('no tool name or handler publishes, posts, sends or emails', !/name: '[a-z_]*(publish|post|send|email|tweet)[a-z_]*'/.test(tools));
assert('the tool module never imports the email or payments libraries', !/from '\.\/(email|payments|balance)'/.test(tools));
assert('the route is server-rendered (prerender = false)', /export const prerender = false;/.test(route));
assert('the bearer derives from MARKETING_TOOLS_TOKEN', /import\.meta\.env\.MARKETING_TOOLS_TOKEN/.test(route) && /employeeToolToken\(secret, employee\)/.test(route));
assert('auth fails closed when the token is unset', /if \(!secret\) return null;/.test(route));
assert('auth fails closed for an unknown employee in the path', /if \(!employee \|\| !isEmployeeKey\(employee\)\) return null;/.test(route));
assert('the bearer is compared in constant time', /sameSecret\(/.test(route) && /crypto\.timingSafeEqual\(/.test(auth));
assert('auth runs before the body is read', route.indexOf('authorized(request, params.employee)') > -1 && route.indexOf('authorized(request, params.employee)') < route.indexOf('request.text()'));
assert('the request body is size-capped', /MAX_BODY_BYTES/.test(route));
assert('the route only dispatches to the tool registry, as the authenticated caller', /callTool\(name, msg\.params\?\.arguments, caller\)/.test(route) && /listTools\(caller\)/.test(route));
const tokens = EMPLOYEE_KEYS.map((k) => employeeToolToken('test-secret', k));
assert('each employee gets its own derived token, never the raw secret', new Set(tokens).size === EMPLOYEE_KEYS.length && !tokens.includes('test-secret'));
assert('tool inputs are zod-validated (unknown keys refused)', /\.safeParse\(args \?\? \{\}\)/.test(tools) && (tools.match(/\.strict\(\)/g) || []).length >= 6);
assert('the tool module never deletes or upserts a row', !/\.(delete|upsert)\(/.test(tools));
const reviewFn = tools.slice(tools.indexOf('async function submitReview('), tools.indexOf('// ---- The registry'));
{
  const saveFn = tools.slice(tools.indexOf('async function saveDraft('), tools.indexOf('const saveDraftInput'));
  assert('the tool module updates in only two places: submit_review\'s verdict and save_draft\'s supersede', (tools.match(/\.update\(/g) || []).length === 2 && /\.update\(/.test(reviewFn) && /\.update\(\{ status: 'superseded' \}\)/.test(saveFn));
  assert('save_draft supersedes only a pending draft the Editor flagged, the caller\'s own', /old\.author !== caller \|\| old\.status !== 'pending' \|\| old\.editor_status !== 'flagged'/.test(saveFn) && /\.eq\('id', input\.replaces\)\s*\.eq\('status', 'pending'\)/.test(saveFn));
  const reUnknown = await callTool('save_draft', { author: 'copywriter', kind: 'blog_draft', body: 'A walk.', replaces: 'not-a-uuid' }, 'copywriter');
  assert('save_draft refuses a malformed replaces id', reUnknown.isError === true && /Invalid input/.test(reUnknown.text));
}
assert('submit_review writes editor_status and editor_notes only (never status)', /\.update\(\{ editor_status: input\.verdict === 'pass' \? 'passed' : 'flagged', editor_notes: input\.notes \}\)/.test(reviewFn) && !/[^_]status:/.test(reviewFn.slice(reviewFn.indexOf('.update('), reviewFn.indexOf('.select('))));
assert('submit_review touches only pending, unreviewed drafts', /\.eq\('status', 'pending'\)\s*\.eq\('editor_status', 'unchecked'\)/.test(reviewFn));
assert('submit_review refuses anyone but the Editor (server side)', /if \(caller !== 'editor'\) return fail\(/.test(reviewFn));
assert('submit_review input is draft_id (uuid), verdict pass|flag, capped notes', /draft_id: z\.string\(\)\.uuid\(\)/.test(tools) && /verdict: z\.enum\(\['pass', 'flag'\]\)/.test(tools) && /notes: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(1000\)/.test(tools));
assert('submit_review is rate-limited', /rateLimit\('marketing:submit_review'/.test(reviewFn));
assert('save_draft is saved under the caller\'s own name', /if \(input\.author !== caller\) return fail\(/.test(tools));

// Runtime: the registry itself, as each employee sees it (no network: refusals happen before any query).
for (const k of EMPLOYEE_KEYS) {
  const listed = listTools(k).map((t) => t.name);
  assert(`${k}: tools/list shows exactly TOOL_ACCESS (${listed.join(', ')})`, sameSet(listed, [...TOOL_ACCESS[k]]));
}
for (const k of EMPLOYEE_KEYS.filter((x) => x !== 'editor')) {
  const r = await callTool('submit_review', { draft_id: '00000000-0000-4000-8000-000000000000', verdict: 'pass', notes: 'x' }, k);
  assert(`${k}: calling submit_review is refused`, r.isError === true && /Unknown tool/.test(r.text));
}
{
  const save = (over) => callTool('save_draft', { author: 'copywriter', kind: 'instagram_caption', body: 'The ridge at first light.', photo_ids: ['trail-bushveld-path'], ...over }, 'copywriter');
  const noFormat = await save({});
  assert('save_draft: an Instagram or Facebook post without a format is refused', noFormat.isError === true && /needs a format/.test(noFormat.text));
  const blogFormat = await save({ kind: 'blog_draft', format: 'single' });
  assert('save_draft: a format on a blog draft is refused', blogFormat.isError === true && /Only Instagram and Facebook/.test(blogFormat.text));
  const thinCarousel = await save({ format: 'carousel' });
  assert('save_draft: a carousel with one photo is refused', thinCarousel.isError === true && /3 to 5 photos/.test(thinCarousel.text));
  const wideStory = await save({ format: 'story', photo_ids: ['rooiberg-sunset-grassland'] });
  assert('save_draft: a story with a landscape site photo is refused', wideStory.isError === true && /portrait photo/.test(wideStory.text));
  const longStory = await save({ format: 'story', photo_ids: ['temmincks-giraffe'], body: 'Walk. '.repeat(22) });
  assert('save_draft: a story over 125 characters is refused by the brand rules', longStory.isError === true && /story_length/.test(longStory.text));
}
{
  const pack = JSON.parse((await callTool('get_facts_pack', {}, 'copywriter')).text);
  assert('the facts pack states the route in one line: three lodges, ending back at Temminck\'s', /Night 1 at Temminck's Lodge, night 2 at Oukraal, night 3 at Rustwood\. Day 4 walks back to Temminck's Lodge/.test(pack.route));
  assert('the facts pack carries one call to action, to the rates page', /\/rates$/.test(pack.call_to_action.url));
  assert('the facts pack says booking is open now, for start dates from the opening date', /^Online booking is open now, for start dates from /.test(pack.booking.book_online) && !('opens_online' in pack.booking));
}
assert('the library marks the portrait photos a story can use', staticPhotoLibrary().filter((p) => p.orientation === 'portrait').length >= 3 && staticPhotoLibrary().find((p) => p.id === 'rooiberg-sunset-grassland')?.orientation === 'landscape');
const editorSave = await callTool('save_draft', { author: 'editor', kind: 'x_post', body: 'x' }, 'editor');
assert('editor: calling save_draft is refused', editorSave.isError === true && /Unknown tool/.test(editorSave.text));
const statusSmuggle = await callTool('submit_review', { draft_id: '00000000-0000-4000-8000-000000000000', verdict: 'pass', notes: 'x', status: 'approved' }, 'editor');
assert('submit_review refuses an extra status field (strict input)', statusSmuggle.isError === true && /Invalid input/.test(statusSmuggle.text));
const badVerdict = await callTool('submit_review', { draft_id: '00000000-0000-4000-8000-000000000000', verdict: 'approve', notes: 'x' }, 'editor');
assert('submit_review refuses any verdict but pass or flag', badVerdict.isError === true && /Invalid input/.test(badVerdict.text));
const longNotes = await callTool('submit_review', { draft_id: '00000000-0000-4000-8000-000000000000', verdict: 'flag', notes: 'x'.repeat(1001) }, 'editor');
assert('submit_review caps notes at 1000 characters', longNotes.isError === true && /Invalid input/.test(longNotes.text));
assert("save_draft inserts with status 'pending'", /\.from\('drafts'\)\s*\.insert\(\{[\s\S]*?status: 'pending',/.test(tools));
assert('save_draft runs the brand rules before inserting', tools.indexOf('checkDraft(') < tools.indexOf(".insert({"));
assert('save_draft is rate-limited', /rateLimit\('marketing:save_draft'/.test(tools));
assert('the Editor cannot save drafts', /input\.author === 'editor'/.test(tools));
assert('the facts pack never exposes the SADC rows or self-catered rates', !/sadcRateRows|sadcSelfCateredRates|uncateredInclusions|uncateredExclusions|SADC_DISCOUNT/.test(tools));
assert('the facts pack drops the SADC FAQ', /f\.id !== 'sadc-resident'/.test(tools));
assert('the facts pack reads src/data (never typed facts)', /from '\.\.\/data\/rates'/.test(tools) && /from '\.\.\/data\/itinerary'/.test(tools) && /from '\.\.\/data\/sanctuaries'/.test(tools));
assert('departures read the anon-readable departure_inventory view only', /getSupabaseAnon\(\)\s*\.from\('departure_inventory'\)/.test(tools));
assert('departures promote the catered product only', /locked_catering === 'catered'/.test(tools));
assert('the departure line is the memo wording', /`Guaranteed Departure: \$\{taken\} of \$\{MAX_GROUP_SIZE\} spots booked\. \$\{available\} spots available\.`/.test(tools));
assert('MARKETING_TOOLS_TOKEN is typed in env.d.ts', /MARKETING_TOOLS_TOKEN\?: string/.test(read('src/env.d.ts')));

// ---------------------------------------------------------------------------------------------
section('4. The employees');

const SKILL = brandSkillBody(fileURLToPath(new URL('../.claude/skills/rooiberg-brand/SKILL.md', import.meta.url)));
const AGREED_MODELS = {
  head_of_marketing: 'claude-opus-5-5',
  copywriter: 'claude-sonnet-5-5',
  community_manager: 'claude-sonnet-5-5',
  sales_assistant: 'claude-sonnet-5-5',
  analyst: 'claude-sonnet-5-5',
  researcher: 'claude-sonnet-5-5',
  editor: 'claude-haiku-5-5',
};
assert('one employee definition per EMPLOYEE_KEYS entry', sameSet(EMPLOYEES.map((e) => e.key), [...EMPLOYEE_KEYS]));
assert('the models are the agreed ones', EMPLOYEE_KEYS.every((k) => MODELS[k] === AGREED_MODELS[k]) && sameSet(Object.keys(MODELS), Object.keys(AGREED_MODELS)));
assert(`every per-run cap is above 0 and at most HARD_RUN_CAP_CENTS (${HARD_RUN_CAP_CENTS})`, EMPLOYEE_KEYS.every((k) => RUN_CAP_CENTS[k] > 0 && RUN_CAP_CENTS[k] <= HARD_RUN_CAP_CENTS));
assert('the weekly cap covers at least one run of each scheduled employee', WEEKLY_CAP_CENTS >= RUN_CAP_CENTS.head_of_marketing * 2 + RUN_CAP_CENTS.copywriter + RUN_CAP_CENTS.editor + RUN_CAP_CENTS.analyst + RUN_CAP_CENTS.researcher);
assert('config TOOL_NAMES match the tool server registry', sameSet([...TOOL_NAMES], toolNames));
assert('every employee\'s tools are exactly its TOOL_ACCESS entry', EMPLOYEES.every((e) => sameSet([...e.tools], [...TOOL_ACCESS[e.key]])));
assert('submit_review is the Editor\'s alone', EMPLOYEE_KEYS.every((k) => TOOL_ACCESS[k].includes('submit_review') === (k === 'editor')));
assert('the SKILL body was read (voice and hard rules present)', /## Voice/.test(SKILL) && SKILL.length > 500);

// The brand skill goes up through the Skills API and is attached by id (no copy in the prompt).
const SKILL_RAW = readFileSync(new URL('../.claude/skills/rooiberg-brand/SKILL.md', import.meta.url), 'utf8');
const SKILL_REF = { skill_id: 'skill_test', version: 'skillver_test' };
const uploaded = skillUploadContent(SKILL_RAW);
const upDesc = uploaded.match(/^---\n(?:[^\n]*\n)*?description: ([^\n]*)\n/)?.[1] ?? '';
assert('the skill hash is the sha256 of SKILL.md as committed', skillContentHash(SKILL_RAW) === skillContentHash(SKILL_RAW) && /^[0-9a-f]{64}$/.test(skillContentHash(SKILL_RAW)) && skillContentHash(SKILL_RAW + ' ') !== skillContentHash(SKILL_RAW));
assert('the upload records that hash in the version description, and it reads back', hashFromVersionDescription(upDesc) === skillContentHash(SKILL_RAW));
assert('the upload changes nothing else in SKILL.md', uploaded.replace(/ \[content sha256 [0-9a-f]{64}\]/, '') === SKILL_RAW);
assert(`the upload keeps the skill name "${SKILL_NAME}" and a description under 1024 characters`, new RegExp(`^---\\nname: ${SKILL_NAME}\\n`).test(uploaded) && upDesc.length < 1024);
assert('a version this code did not upload reads as no hash (so sync uploads a new one)', hashFromVersionDescription('Voice and hard rules.') === null);
assert('the hard-rules summary has no em or en dash', !/[–—]/.test(HARD_RULES_SUMMARY));
assert('sync uploads with the stable Skills API (client.skills.*, not beta)', /client\.skills\.create\(/.test(syncTsEarly) && /client\.skills\.versions\.create\(/.test(syncTsEarly) && !/client\.beta\.skills/.test(syncTsEarly));
assert('sync uploads a new version only when the hash changed', /if \(live\.liveHash === skillHash\)/.test(syncTsEarly));
assert('sync has a read-only --check mode that exits non-zero on drift', /process\.argv\.includes\('--check'\)/.test(syncTsEarly) && /process\.exit\(1\)/.test(syncTsEarly.slice(syncTsEarly.indexOf('async function check('))));
assert('the workflow runs the live skill check after a live sync', /run: npx tsx marketing\/sync\.ts --check/.test(read('.github/workflows/marketing-team.yml')));

for (const emp of EMPLOYEES) {
  const a = agentParams(emp, 'https://example.test', SKILL_REF);
  const builtin = a.tools.find((t) => t.type === 'agent_toolset_20260401');
  const mcp = a.tools.find((t) => t.type === 'mcp_toolset');
  const enabled = (builtin.configs ?? []).filter((c) => c.enabled).map((c) => c.name);
  const mcpTools = (mcp.configs ?? []).filter((c) => c.enabled).map((c) => c.name);
  const label = emp.key;
  assert(`${label}: model is ${AGREED_MODELS[label]}`, a.model === AGREED_MODELS[label]);
  assert(`${label}: built-in tools default to off and bash is disabled`, builtin.default_config?.enabled === false && !enabled.includes('bash'));
  assert(`${label}: web tools only for the Researcher`, (enabled.includes('web_search') || enabled.includes('web_fetch')) === (label === 'researcher'));
  assert(`${label}: tool server tools default to off, the rest are known tools`, mcp.default_config?.enabled === false && mcpTools.every((t) => TOOL_NAMES.includes(t)));
  assert(`${label}: no tool asks for confirmation (nothing can hang a scheduled run)`, a.tools.every((t) => t.default_config?.permission_policy?.type === 'always_allow'));
  assert(`${label}: the tool server URL is its own per-employee path`, a.mcp_servers.length === 1 && a.mcp_servers[0].url === `https://example.test${TOOL_SERVER_PATH}/${label}`);
  assert(`${label}: the instructions carry the team preamble and the hard-rules summary`, a.system.includes(TEAM_PREAMBLE) && a.system.includes(HARD_RULES_SUMMARY));
  assert(`${label}: the brand skill is attached by id, not copied into the prompt`, !a.system.includes(SKILL) && a.skills?.length === 1 && a.skills[0].type === 'custom' && a.skills[0].skill_id === SKILL_REF.skill_id && a.skills[0].version === SKILL_REF.version);
  assert(`${label}: the read tool is on (attached skills need it)`, enabled.includes('read'));
  assert(`${label}: the instructions contain no em or en dash`, !/[–—]/.test(a.system));
  assert(`${label}: at most 8 memory stores per session`, memoryPlan(emp).length <= 8);
  assert(`${label}: tagged with the team metadata`, a.metadata.team === TEAM_TAG && a.metadata.key === label);
}
const researcherWeb = agentParams(employee('researcher'), 'https://example.test', SKILL_REF).tools[0].configs.filter((c) => c.name.startsWith('web_'));
assert('the Researcher\'s web is open (no allowed_domains; the brief\'s Sites are starting points)', researcherWeb.length === 2 && researcherWeb.every((c) => c.enabled && !c.allowed_domains));
assert('the Researcher\'s brief (marketing/briefs/researcher.md) lists at least one site', RESEARCH_HOSTS.length > 0);
const envs = Object.fromEntries(environmentSpecs().map((e) => [e.name, e.config.networking]));
assert('the team environment reaches no host but its tool server', envs['rooiberg-marketing']?.type === 'limited' && envs['rooiberg-marketing'].allowed_hosts.length === 0 && envs['rooiberg-marketing'].allow_mcp_servers === true);
assert('the research environment is unrestricted (limited networking would also bound web_search and web_fetch)', envs['rooiberg-marketing-research']?.type === 'unrestricted');
assert('only the Researcher uses the research environment', EMPLOYEES.every((e) => e.web === (e.key === 'researcher')));
for (const key of EMPLOYEE_KEYS) {
  const name = key.replace(/_/g, '-');
  assert(`${key}: instructions are marketing/briefs/${name}.md, word for word`, employee(key).instructions === briefText(name));
  assert(`${key}: the brief never names the SADC rate or the self-catered option`, !/sadc|self[- ]?cater|slackpacking/i.test(briefText(name)));
  assert(`${key}: the brief only names tools that exist`, [...briefText(name).matchAll(/\b(get_[a-z_]+|save_draft|submit_review)\b/g)].every((m) => TOOL_NAMES.includes(m[1])));
}
assert('save_draft is never given to the Head of Marketing, the Researcher or the Editor', ['head_of_marketing', 'researcher', 'editor'].every((k) => !employee(k).tools.includes('save_draft')));
assert('only the Head of Marketing writes the playbook', EMPLOYEES.every((e) => (e.memory.playbook === 'read_write') === (e.key === 'head_of_marketing')));
const seeds = seedMemories(SKILL);
assert('every memory store has a seed (playbook and seven notebooks)', Object.keys(seeds).length === 8);
assert('the Copywriter notebook is seeded with /feedback.md', seeds[notebookStoreName('copywriter')].some((m) => m.path === '/feedback.md'));
assert('seeds carry no em or en dash', !/[–—]/.test(JSON.stringify(seeds)));
assert('every notebook is seeded with /learnings.md (with the brand summary) and /history.md', EMPLOYEE_KEYS.every((k) => {
  const files = seeds[notebookStoreName(k)];
  return files.some((m) => m.path === contracts.LEARNINGS_PATH && /## Voice/.test(m.content)) && files.some((m) => m.path === contracts.HISTORY_PATH);
}));
assert('the Researcher\'s notebook is seeded with the weekly brief', seeds[notebookStoreName('researcher')].some((m) => m.path === contracts.BRIEF_PATH));
assert('the playbook seed passes its own hand-over check', contracts.checkPlaybook(seeds['rooiberg-team-playbook'].find((m) => m.path === contracts.PLAYBOOK_PATH).content).length === 0);
assert('the Editor answers through submit_review, not free text', /submit_review/.test(employee('editor').instructions) && !/Reply with JSON/i.test(employee('editor').instructions));

// ---------------------------------------------------------------------------------------------
section('5. The schedule, the runner and the owner review');

const wf = read('.github/workflows/marketing-team.yml');
const runTs = read('marketing/run.ts');
const syncTs = read('marketing/sync.ts');
const crons = [...wf.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
assert('workflow crons match SCHEDULES in config.ts', sameSet(crons, Object.values(SCHEDULES)));
assert('each cron maps to its job in the workflow', Object.entries(SCHEDULES).every(([job, cron]) => wf.includes(`'${cron}')`) && new RegExp(`'${cron.replace(/\*/g, '\\*')}'\\)\\s+JOB=${job} ;;`).test(wf)));
assert('DRY_RUN is true unless a manual run unticks it or MARKETING_LIVE is true', wf.includes("DRY_RUN: ${{ ((github.event_name == 'workflow_dispatch' && inputs.dry_run == false) || (github.event_name == 'schedule' && vars.MARKETING_LIVE == 'true')) && 'false' || 'true' }}"));
assert('the manual dry_run input defaults to true', /dry_run:[\s\S]*?default: true/.test(wf));
assert('the workflow never touches channel credentials', !/X_API|X_ACCESS|X_BEARER|META_/.test(wf));
assert('no workflow step publishes, posts or sends', !/^\s*- name: .*(publish|post|send|tweet)/im.test(wf));
assert('the workflow is read-only on the repository', /permissions:\s*\n\s*contents: read/.test(wf));
assert('run.ts and sync.ts are dry unless DRY_RUN is exactly "false"', runTs.includes("process.env.DRY_RUN !== 'false'") && syncTs.includes("process.env.DRY_RUN !== 'false'"));
assert('every session carries a hard budget from the per-run cap', /budget: \{ type: 'limit', max_list_cost: \{ amount: String\(cap\), currency: 'USD' \} \}/.test(runTs) && /Math\.min\(RUN_CAP_CENTS\[key\], HARD_RUN_CAP_CENTS\)/.test(runTs));
assert('the weekly spend guard runs before a session is created', runTs.indexOf('weeklySpendCents(sb)') > -1 && runTs.indexOf('weeklySpendCents(sb)') < runTs.indexOf('sessions.create('));
assert('the runner refuses tool confirmations instead of allowing them', /result: 'deny'/.test(runTs) && !/result: 'allow'/.test(runTs));
assert('the runner logs spend for every session', /from\('spend_log'\)\.insert\(/.test(runTs));
assert('the runner re-runs the code rules before the Editor', runTs.indexOf('checkDraft(') > -1 && runTs.indexOf('checkDraft(') < runTs.indexOf("runEmployee(ctx, 'editor'"));
assert('the runner no longer parses the Editor\'s free text', !/parseReviews|JSON\.parse/.test(runTs));
assert('the runner never writes an Editor verdict itself (only code-rule flags)', !/editor_status: r\.verdict/.test(runTs));
assert('sync stores one derived credential per employee URL', /employeeToolToken\(token, key\)/.test(syncTs) && /toolServerUrl\(siteUrl, e\.key\)/.test(syncTs));
assert('the runner never approves or publishes a draft', !/status: 'approved'|\.from\('posts'\)/.test(runTs));
assert('the run jobs are exactly the scheduled ones plus the manual ones', sameSet([...runTs.matchAll(/^  ([a-z_]+): \{\n    steps:/gm)].map((m) => m[1]), [...Object.keys(SCHEDULES), ...MANUAL_JOBS]));
assert('there is no daily research run any more', !Object.values(SCHEDULES).some((c) => /^\S+ \S+ \* \* \*$/.test(c)) && !('research' in SCHEDULES));
assert('the Sunday review runs before Monday planning, and research is its first step', SCHEDULES.weekly_review.split(' ')[4] === '0' && SCHEDULES.plan_and_write.split(' ')[4] === '1' && /weekly_review: \{\n    steps: \['researcher/.test(runTs));
assert('the manual jobs are offered in the workflow', MANUAL_JOBS.every((j) => new RegExp(`options: \\[[^\\]]*\\b${j}\\b`).test(wf)));
assert('every hand-over is checked: brief, plan, drafts and playbook', ['checks.brief(', 'checks.plan(', 'checks.drafts(', 'checks.playbook('].every((c) => runTs.includes(c)));
assert('a failed hand-over gets exactly one retry, in the same session', (runTs.match(/fixPrompt\(/g) ?? []).length === 1);
{
  const pw = runTs.slice(runTs.indexOf('  plan_and_write: {'));
  assert('no plan, no drafts: the Copywriter does not run after a failed plan', /if \(!plan\.ok\) return;/.test(pw) && pw.indexOf('if (!plan.ok) return;') < pw.indexOf("runEmployee(ctx, 'copywriter'"));
  assert('flagged drafts get one fix round after the Editor, then a second opinion', pw.indexOf('await editorReview(ctx);') < pw.indexOf('await fixRound(ctx, writingFrom);') && /async function fixRound[\s\S]*?\.is\('replaces', null\)[\s\S]*?runEmployee\(ctx, 'copywriter', PROMPTS\.fix\(flagged\)\)[\s\S]*?await editorReview\(ctx\);/.test(runTs));
}
assert('memory lists use a directory path_prefix (the API requires one ending in "/")', [...runTs.matchAll(/path_prefix: ([^,}]+)/g)].every((m) => m[1].trim() === 'dir') && /const dir = path\.slice\(0, path\.lastIndexOf\('\/'\) \+ 1\)/.test(runTs));
assert('a check that throws still lets the session\'s spend be logged', /safeCheck/.test(runTs) && runTs.indexOf('safeCheck') < runTs.indexOf(".from('spend_log').insert("));
assert('a job with a failed hand-over exits non-zero', /if \(failures\.length\) \{[\s\S]*?process\.exit\(1\)/.test(runTs));

const page = read('src/pages/admin/marketing.astro');
const decide = actions.slice(actions.indexOf('adminDecideDraft:'), actions.indexOf('adminCreateCompBooking:'));
assert('/admin/marketing is server-rendered and gated by admin auth', /export const prerender = false;/.test(page) && /getAdminUser\(Astro\.cookies\)/.test(page) && /Astro\.redirect\(withBase\('\/admin\/login'\)\)/.test(page));
assert('adminDecideDraft requires an admin and is rate-limited', /requireAdmin\(ctx\)/.test(decide) && /adminActionRate\(admin\.email\)/.test(decide));
assert('an edited draft runs the code rules before it is saved', decide.indexOf('checkDraft(') > -1 && decide.indexOf('checkDraft(') < decide.indexOf('.update(update)'));
assert('a decision is a compare-and-set on pending', /\.update\(update\)\s*\.eq\('id', input\.draftId\)\s*\.eq\('status', 'pending'\)/.test(decide));
assert('the reason is recorded in marketing.feedback', /from\('feedback'\)\.insert\(\{[\s\S]*?reason,/.test(decide));
assert('the agent text is kept when the owner edits', /update\.original_body = draft\.body/.test(decide));
assert('every decision is also written to admin_audit (approve, edit, reject)', /recordAdminEvent\(/.test(decide) && ['marketing_draft_approve', 'marketing_draft_edit', 'marketing_draft_reject'].every((x) => decide.includes(`'${x}'`)));
assert('the audit row carries ids and the decision, never the draft text', !/body/.test(decide.slice(decide.indexOf('recordAdminEvent('), decide.indexOf('return { ok: true, decision }'))));
{
  const sqlAll = migFiles.map((f) => read(`supabase/migrations/${f}`)).join('\n').replace(/--[^\n]*/g, '');
  const checks = [...sqlAll.matchAll(/check\s*\(\s*action\s+in\s*\(([\s\S]*?)\)\s*\)/g)].map((m) => m[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1)));
  const last = checks[checks.length - 1] ?? [];
  const prev = checks[checks.length - 2] ?? [];
  assert('0022 widens admin_audit: every earlier action kept, the four marketing actions added', prev.every((x) => last.includes(x)) && ['marketing_draft_approve', 'marketing_draft_edit', 'marketing_draft_reject', 'marketing_photo_upload'].every((x) => last.includes(x)) && /admin_audit_action_check check \(action in/.test(read('supabase/migrations/0022_marketing_photos_audit.sql')));
}
assert('the admin nav links the marketing page', /id: 'marketing'.*href: '\/admin\/marketing'/.test(read('src/components/AdminNav.astro')));
const digest = read('src/pages/api/cron/marketing-drafts.ts');
assert('the digest cron is scheduled in vercel.json', JSON.parse(read('vercel.json')).crons.some((c) => c.path === '/api/cron/marketing-drafts'));
assert('the digest route is CRON_SECRET-gated in constant time', /import\.meta\.env\.CRON_SECRET/.test(digest) && /crypto\.timingSafeEqual\(/.test(digest) && /if \(!secret\) return false;/.test(digest));
assert('the digest goes to ADMIN_EMAILS through the existing email helper', /adminEmailList\(\)/.test(digest) && /sendMarketingDraftsDigest/.test(read('src/lib/email.ts')));
assert('the digest never emails draft text', !/select\('[^']*body/.test(digest));
assert('the digest names drafts the Editor has not reviewed after 24 hours (title and kind only)', /UNREVIEWED_AFTER_MS = 24 \* 3600 \* 1000/.test(digest) && /editor_status === 'unchecked'/.test(digest) && /kind: r\.kind, title: r\.title/.test(digest));
assert('unreviewed titles are HTML-escaped in the email', /escapeHtml\(u\.title/.test(read('src/lib/email.ts')));
const envEx = read('.env.example');
assert('.env.example documents the team credentials, all blank', ['ANTHROPIC_API_KEY', 'MARKETING_TOOLS_TOKEN', 'X_API_KEY', 'X_API_SECRET', 'X_BEARER_TOKEN', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET', 'META_ACCESS_TOKEN', 'META_PAGE_ID', 'EMAIL_API_KEY', 'EMAIL_FROM'].every((k) => new RegExp(`^${k}=`, 'm').test(envEx)) && ['ANTHROPIC_API_KEY', 'MARKETING_TOOLS_TOKEN', 'X_API_KEY', 'META_ACCESS_TOKEN'].every((k) => new RegExp(`^${k}=""`, 'm').test(envEx)));

// ---------------------------------------------------------------------------------------------
section('5b. Hand-over contracts (marketing/contracts.ts)');

const C = contracts;
assert('a Sunday belongs to the next cycle week, a Monday to its own', C.cycleWeek(new Date('2026-10-11T12:00:00Z')) === '202642' && C.cycleWeek(new Date('2026-10-12T05:00:00Z')) === '202642' && C.cycleWeek(new Date('2026-10-18T12:00:00Z')) === '202643');
assert('ISO weeks across a year end', C.isoWeekKey(new Date('2026-12-31T00:00:00Z')) === '202653' && C.isoWeekKey(new Date('2027-01-04T00:00:00Z')) === '202701' && C.isoWeekKey(new Date('2021-01-03T00:00:00Z')) === '202053');
assert('URLs match without scheme, www, trailing slash or fragment', C.normaliseUrl('https://www.getaway.co.za/a/b/#x') === C.normaliseUrl('http://getaway.co.za/a/b'));

const W = '202642';
const item = (n, over = {}) => {
  const f = { type: 'pitch', headline: 'Getaway list leaves out Waterberg walking', fact: 'Getaway published a best hikes list with no Waterberg walk.', source: `https://getaway.co.za/p${n}`, date: '2026-10-05', 'why now': 'The list is new.', channel: 'none', ...over };
  return `## R-${W}-${n}\n` + Object.entries(f).filter(([, v]) => v !== null).map(([k, v]) => `- ${k}: ${v}`).join('\n');
};
const brief = (items) => `# Weekly brief\n\n${items.join('\n\n')}\n`;
const opened = ['https://www.getaway.co.za/p1/', 'https://getaway.co.za/p2', 'https://getaway.co.za/p3'];
const good = C.checkBrief(brief([item(1, { type: 'trend' }), item(2, { type: 'trend', channel: 'instagram' }), item(3, { type: 'trend' })]), W, opened);
assert('a well-formed, sourced brief passes and yields its ids and trend ids', good.errors.length === 0 && good.ids.join() === `R-${W}-1,R-${W}-2,R-${W}-3` && good.trendIds.length === 3);
assert('a brief with fewer than three trend items is refused (owner decision)', C.checkBrief(brief([item(1, { type: 'trend' }), item(2), item(3)]), W, opened).errors.some((e) => /at least 3 of the items must be wider industry trends/.test(e)));
assert('a source not opened this run is refused', C.checkBrief(brief([item(1, { source: 'https://getaway.co.za/old' })]), W, opened).errors.some((e) => /did not open/.test(e)));
assert('an empty brief is refused', C.checkBrief('# Weekly brief\n', W, opened).errors.length > 0);
assert('more than five items are refused', C.checkBrief(brief([1, 2, 3, 4, 5, 6].map((n) => item(n))), W, [1, 2, 3, 4, 5, 6].map((n) => `https://getaway.co.za/p${n}`)).errors.some((e) => /at most 5/.test(e)));
assert('ids must be this week, in order', C.checkBrief(brief([item(1).replace(`R-${W}-1`, 'R-202641-1')]), W, opened).errors.some((e) => /should be/.test(e)));
assert('a missing field is refused', C.checkBrief(brief([item(1, { 'why now': null })]), W, opened).errors.some((e) => /why now/.test(e)));
const notTrendCount = (e) => !/wider industry trends/.test(e);
assert('an unknown type or channel is refused', C.checkBrief(brief([item(1, { type: 'rumour', channel: 'x' })]), W, opened).errors.filter(notTrendCount).length === 2);
assert('an over-long field is refused', C.checkBrief(brief([item(1, { headline: 'a'.repeat(121) })]), W, opened).errors.some((e) => /headline/.test(e)));
assert('a long dash or the hidden products are refused', C.checkBrief(brief([item(1, { fact: 'A slackpacking trail \u2014 new.' })]), W, opened).errors.filter(notTrendCount).length === 2);

// Each slot defaults to its own photo (slot-n), since a photo may appear only once in a week's plan.
const photos = new Set(['rooiberg-sunset-grassland', 'upload-x', 'trail-bushveld-path', 'guide-reading-tracks', 'temmincks-giraffe', 'slot-1', 'slot-2', 'slot-3', 'slot-4']);
const three = 'trail-bushveld-path, guide-reading-tracks, rooiberg-sunset-grassland';
const slot = (n, over = {}) => {
  const f = { channel: 'instagram', format: 'single', angle: 'Walk to a new lodge each night.', 'based on': `R-${W}-1`, departure: 'none', photos: `slot-${n}`, 'call to action': 'See dates on the rates page.', ...over };
  return `## P-${W}-${n}\n` + Object.entries(f).filter(([, v]) => v !== null).map(([k, v]) => `- ${k}: ${v}`).join('\n');
};
const plan = (slots) => `# Weekly plan\n\nGoal: one line.\n\n${slots.join('\n\n')}\n`;
const okPlanMd = plan([slot(1), slot(2, { channel: 'facebook', format: 'carousel', photos: three, 'based on': 'facts: the itinerary' }), slot(3, { format: 'story', photos: 'temmincks-giraffe', departure: '2027-04-04' }), slot(4, { channel: 'blog', format: 'none' })]);
const okPlan = C.checkPlan(okPlanMd, W, [`R-${W}-1`], photos);
const mix = (a, b, c) => plan([slot(1, a), slot(2, b), slot(3, c)]);
{
  const trendIds = [`R-${W}-1`, `R-${W}-2`];
  const research = [`R-${W}-1`, `R-${W}-2`, `R-${W}-3`];
  const onTrends = mix({}, { format: 'carousel', photos: three, 'based on': `R-${W}-2` }, { format: 'story', 'based on': 'facts: the route' });
  assert('two post slots on trend items pass the trend rule', C.checkPlan(onTrends, W, research, photos, trendIds).errors.length === 0);
  const offTrends = mix({ 'based on': `R-${W}-3` }, { format: 'carousel', photos: three, 'based on': 'facts: the route' }, { format: 'story', 'based on': `R-${W}-1` });
  assert('a plan with fewer than two post slots on trends is refused', C.checkPlan(offTrends, W, research, photos, trendIds).errors.some((e) => /rest on a trend/.test(e)));
  assert('with no trend items (no valid brief) the trend rule is off', C.checkPlan(offTrends, W, research, photos, []).errors.length === 0);
}
assert('a well-formed plan passes and yields its slots', okPlan.errors.length === 0 && okPlan.slots.map((s) => s.channel).join() === 'instagram,facebook,instagram,blog');
assert('a plan slot carries its format', okPlan.slots.map((s) => s.format).join() === 'single,carousel,story,');
assert('the three post slots must be one single, one carousel and one story', C.checkPlan(mix({}, { format: 'carousel', photos: three }, {}), W, [`R-${W}-1`], photos).errors.some((e) => /missing: story/.test(e)));
assert('an unknown format, or a blog with a post format, is refused', C.checkPlan(plan([slot(1, { format: 'reel' }), slot(2, { format: 'carousel', photos: three }), slot(3, { format: 'story' }), slot(4, { channel: 'blog', format: 'single' })]), W, [`R-${W}-1`], photos).errors.some((e) => /"reel"/.test(e)) && C.checkPlan(plan([slot(1), slot(2, { format: 'carousel', photos: three }), slot(3, { format: 'story' }), slot(4, { channel: 'blog', format: 'single' })]), W, [`R-${W}-1`], photos).errors.some((e) => /blog slot has format "none"/.test(e)));
assert('photo counts per format: single and story 1, carousel 3 to 5', C.checkPlan(mix({ photos: three }, { format: 'carousel' }, { format: 'story' }), W, [`R-${W}-1`], photos).errors.filter((e) => /takes/.test(e)).length === 2 && C.photoCountError('carousel', 5) === null && C.photoCountError('carousel', 6) !== null && C.photoCountError('story', 1) === null);
assert('the plan needs exactly three Instagram or Facebook slots', C.checkPlan(plan([slot(1), slot(2)]), W, [`R-${W}-1`], photos).errors.some((e) => /exactly 3/.test(e)));
assert('the plan allows at most one blog slot', C.checkPlan(plan([slot(1), slot(2), slot(3), slot(4, { channel: 'blog' }), slot(5, { channel: 'blog' })]), W, [`R-${W}-1`], photos).errors.some((e) => /at most 1/.test(e)));
assert('a slot must rest on this week\'s research or a named fact', C.checkPlan(plan([slot(1, { 'based on': `R-${W}-9` }), slot(2, { 'based on': 'a hunch', format: 'carousel', photos: three }), slot(3, { format: 'story' })]), W, [`R-${W}-1`], photos).errors.length === 2);
assert('unknown photo ids and malformed departures are refused', C.checkPlan(plan([slot(1, { photos: 'nope' }), slot(2, { departure: 'next week', format: 'carousel', photos: three }), slot(3, { format: 'story' })]), W, [`R-${W}-1`], photos).errors.length === 2);
{
  const used = new Set(['trail-bushveld-path']);
  const reusePlan = C.checkPlan(okPlanMd, W, [`R-${W}-1`], photos, [], used);
  assert('a photo already used on a pending or approved draft is never planned again', reusePlan.errors.some((e) => /never used twice/.test(e)));
  assert('without used photos the same plan passes', C.checkPlan(okPlanMd, W, [`R-${W}-1`], photos, [], new Set()).errors.length === 0);
  const twice = C.checkPlan(plan([slot(1, { photos: 'temmincks-giraffe' }), slot(2, { channel: 'facebook', format: 'carousel', photos: three, 'based on': 'facts: the itinerary' }), slot(3, { format: 'story', photos: 'temmincks-giraffe' })]), W, [`R-${W}-1`], photos);
  assert('the same photo in two slots of one plan is refused', twice.errors.some((e) => /already in another slot/.test(e)));
  assert('used means pending or approved (rejected and superseded drafts never went out)', sameSet([...C.PHOTO_USED_STATUSES], ['pending', 'approved']));
  const lib = tools.slice(tools.indexOf('async function getPhotoLibrary('), tools.indexOf('// ---- get_results'));
  assert('get_photo_library lists only photos never used', /usedPhotoIds\(\)/.test(lib) && /filter\(\(p\) => !used\.has\(p\.id\)\)/.test(lib) && /unused_left/.test(lib));
  const saveFn = tools.slice(tools.indexOf('async function saveDraft('), tools.indexOf('const saveDraftInput'));
  assert('save_draft refuses a used photo, except on the flagged draft it replaces', /usedPhotoIds\(input\.replaces\)/.test(saveFn) && /never used twice/.test(saveFn));
  const runSrc = read('marketing/run.ts');
  assert('the runner checks the plan against used photos and warns when few are left', /checkPlan\(md, week, research\.ids, photos, research\.trends, used\)/.test(runSrc) && /PHOTOS_LOW_WARNING/.test(runSrc));
}
assert('X is no longer a planned channel (owner decision: Instagram and Facebook)', C.checkPlan(plan([slot(1, { channel: 'x' }), slot(2), slot(3)]), W, [`R-${W}-1`], photos).errors.some((e) => /channel "x"/.test(e)));

const slots = okPlan.slots;
const drafts = slots.map((s) => ({ kind: C.KIND_FOR_CHANNEL[s.channel], notes: `Plan slot: ${s.id}. Based on R-${W}-1.` }));
const withFormat = drafts.map((d, i) => ({ ...d, format: slots[i].format }));
assert('one draft of the right kind and format per slot passes', C.checkDrafts(slots, withFormat).length === 0);
assert('a draft saved in the wrong format is named', C.checkDrafts(slots, [{ ...withFormat[0], format: 'story' }, ...withFormat.slice(1)]).some((e) => /asks for a single/.test(e)));
assert('a missing or wrong-kind draft is named', C.checkDrafts(slots, withFormat.slice(1)).length === 1 && C.checkDrafts(slots, [{ ...withFormat[0], kind: 'x_post' }, ...withFormat.slice(1)]).length === 1);
assert('slot ids match exactly (P-...-1 is not P-...-10)', C.checkDrafts([{ id: `P-${W}-1`, channel: 'instagram' }], [{ kind: 'instagram_caption', notes: `Plan slot: P-${W}-10` }]).length === 1);
assert('the playbook needs every section', C.checkPlaybook('# Team playbook\n\n## What works\n\nx\n').length === C.PLAYBOOK_SECTIONS.length - 1);
assert('the drafts kinds the plan maps to all exist', Object.values(C.KIND_FOR_CHANNEL).every((k) => MARKETING_DRAFT_KINDS.includes(k)));
assert('the runner reads the same photo ids as the library module', sameSet(C.photoIdsFromSource(read('src/data/photo-library.ts')), SITE_PHOTOS.map((p) => p.id)));
assert('uploaded photo ids use the same prefix as the tool server', /export const UPLOAD_ID_PREFIX = '([^']+)'/.exec(read('src/lib/marketing-photos.ts'))?.[1] === C.UPLOAD_PHOTO_PREFIX);
assert('each brief that hands over states its format and the runner\'s field names', [['researcher', C.BRIEF_FIELDS], ['head-of-marketing', C.PLAN_FIELDS]].every(([name, fields]) => fields.every((f) => briefText(name).includes(`- ${f}:`))) && /Plan slot: /.test(briefText('copywriter')) && C.PLAYBOOK_SECTIONS.every((h) => briefText('head-of-marketing').includes(`## ${h}`)));
assert('the briefs\' format examples pass the checks they describe', (() => {
  const ex = (name) => briefText(name).match(/```\n([\s\S]*?)```/)[1];
  const b = C.checkBrief(ex('researcher'), '202642', ['https://getaway.co.za/example']);
  const pl = C.checkPlan(ex('head-of-marketing'), '202642', ['R-202642-1'], new Set(['trail-bushveld-path', 'guide-reading-tracks', 'rustwood-pool-sunset']));
  return b.errors.every((e) => /wider industry trends/.test(e)) && /type: trend/.test(ex('researcher')) && pl.errors.every((e) => /exactly 3/.test(e));
})());

section('6. The photo library and owner uploads');

const imgRoot = new URL('../src/assets/images/', import.meta.url);
const sitePhotoFiles = [
  ...readdirSync(imgRoot).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)),
  ...readdirSync(new URL('lodges/', imgRoot)).map((f) => `lodges/${f}`),
].filter((f) => !/logo/i.test(f));
const libSrc = read('src/data/photo-library.ts');
const imported = [...libSrc.matchAll(/from '\.\.\/assets\/images\/([^']+)'/g)].map((m) => m[1]);
const libraryFiles = sitePhotoFiles.filter((f) => !MARKETING_EXCLUDED_PHOTOS.includes(f));
assert(`every site photo except logos and trophy-excluded photos is in the library (${libraryFiles.length} files)`, sameSet(imported, libraryFiles));
assert('trophy-excluded photos are never in the library', MARKETING_EXCLUDED_PHOTOS.every((f) => !imported.includes(f)));
assert('no logo is in the library', !imported.some((f) => /logo/i.test(f)));
assert('every imported photo is used by exactly one entry', SITE_PHOTOS.length === imported.length);
assert('photo ids are unique', new Set(SITE_PHOTOS.map((p) => p.id)).size === SITE_PHOTOS.length);
assert('photo ids are lowercase slugs', SITE_PHOTOS.every((p) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)));
assert('every category is one of trail, lodge, landscape, wildlife, food, guide', SITE_PHOTOS.every((p) => PHOTO_CATEGORIES.includes(p.category)));
assert("lodges are only Temminck's Lodge, Oukraal and Rustwood", SITE_PHOTOS.every((p) => p.lodge === null || PHOTO_LODGES.includes(p.lodge)));
assert('every lodge-category photo names its lodge', SITE_PHOTOS.every((p) => p.category !== 'lodge' || p.lodge !== null));
assert('alt text is descriptive (at least 30 characters) and dash-free', SITE_PHOTOS.every((p) => p.alt.length >= 30 && !/[–—]/.test(p.alt + (p.note ?? ''))));
assert('the "temmnicks" filename typo never reaches an id or alt text', SITE_PHOTOS.every((p) => !/temmnick/i.test(p.id + p.alt)));
assert('no old lodge name and no trophy wording in the library', SITE_PHOTOS.every((p) => !/Rotavi|VierVanAcht|Blackwood|trophy|taxiderm|mounted head|skull/i.test(p.alt + (p.note ?? ''))));
assert('get_photo_library serves the static library with public URLs', staticPhotoLibrary().length === SITE_PHOTOS.length && staticPhotoLibrary().every((p) => p.url.startsWith('https://')));
const libResult = await callTool('get_photo_library', {}, 'copywriter');
assert('get_photo_library refuses rather than offer photos it cannot check are unused', libResult.isError === true && /which photos have been used/.test(libResult.text));
const toolsSrc = read('src/lib/marketing-tools.ts');
assert('get_photo_library merges the uploads (signed URLs)', /uploadedPhotos\(\)/.test(toolsSrc) && /createSignedUrls\(/.test(read('src/lib/marketing-photos.ts')));
assert('save_draft accepts upload ids only when the upload exists', /existingUploadIds\(/.test(toolsSrc));

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const webp = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));
const gif = new Uint8Array([...'GIF89a'].map((c) => c.charCodeAt(0)));
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
assert('file type comes from the magic bytes: JPEG, PNG and WebP accepted', sniffImageType(jpeg) === 'image/jpeg' && sniffImageType(png) === 'image/png' && sniffImageType(webp) === 'image/webp');
assert('GIF and SVG are refused', sniffImageType(gif) === null && checkPhotoUpload(svg).ok === false);
assert('an empty file is refused', checkPhotoUpload(new Uint8Array()).ok === false);
const tooBig = new Uint8Array(PHOTO_UPLOAD_MAX_BYTES + 1);
tooBig.set(jpeg);
assert('a file over the size cap is refused', checkPhotoUpload(tooBig).ok === false);
const okUpload = checkPhotoUpload(jpeg);
assert('the object path is server-generated (uploads/<uuid>.<ext>), never the uploaded name', okUpload.ok && /^uploads\/[0-9a-f-]{36}\.jpg$/.test(okUpload.path));

const upload = actions.slice(actions.indexOf('adminUploadMarketingPhoto:'), actions.indexOf('adminCreateCompBooking:'));
assert('the upload action requires an admin and is rate-limited', /requireAdmin\(ctx\)/.test(upload) && /adminActionRate\(admin\.email\)/.test(upload));
assert('the upload requires the no-hunting-trophies tick', /noTrophies: z\.boolean\(\)/.test(upload) && /if \(input\.noTrophies !== true\)/.test(upload));
assert('the upload validates category, lodge and alt text with zod', /category: z\.enum\(MARKETING_PHOTO_CATEGORIES\)/.test(upload) && /lodge: z\.enum\(MARKETING_PHOTO_LODGES\)\.optional\(\)/.test(upload) && /alt: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(300\)/.test(upload));
assert('the file is checked (type and size) before it is stored', upload.indexOf('checkPhotoUpload(') > -1 && upload.indexOf('checkPhotoUpload(') < upload.indexOf('.upload('));
assert('the file goes to the private bucket under the server path, never overwriting', /\.from\(MARKETING_PHOTO_BUCKET\)\s*\.upload\(checked\.path, bytes, \{ contentType: checked\.type, upsert: false \}\)/.test(upload));
assert('a failed row insert removes the stored file', /\.remove\(\[checked\.path\]\)/.test(upload));
assert('the upload is written to admin_audit after the row is saved', upload.indexOf("action: 'marketing_photo_upload'") > upload.indexOf(".from('photos')"));
assert('the upload records the trophy confirmation time and the uploader', /no_trophies_confirmed_at: new Date\(\)\.toISOString\(\)/.test(upload) && /uploaded_by: admin\.email/.test(upload));
assert('the admin page has the upload form with the required trophy tick', /data-photo-upload/.test(page) && /name="noTrophies" type="checkbox" required/.test(page) && /This photo shows no hunting trophies/.test(page));
assert('the admin page never renders an uploaded image (CSP img-src is self only)', !/<img[^>]*(signed|storage|supabase)/i.test(page) && !/img-src[^"]*supabase/.test(read('astro.config.mjs')));

console.log(failed === 0 ? '\nALL MARKETING CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
