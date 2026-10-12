// The AI marketing team (CLAUDE.md Part 18): the guarantees that must never drift.
// Run: npx tsx scripts/verify-marketing.mjs   (or npm run verify:marketing)
//
//   1. The Editor's code rules (src/lib/brand-rules.ts) pass clean copy and hard-fail every
//      broken brand rule, one sample per rule.
//   2. Migration 0021's marketing tables match db.types.ts, and every one is default-deny.
//   3. The Rooiberg tool server exposes exactly five tools, no publish or send, behind a
//      constant-time bearer check, and save_draft can only insert a pending draft.
//   4. The employees: the agreed models, caps under the hard cap, no shell, web for the
//      Researcher only, save_draft never given to the Editor.
//   5. The schedule: dry run by default, a budget on every session, crons that match config.ts.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { checkDraft, publishedRates } from '../src/lib/brand-rules.ts';
import {
  MARKETING_AUTHORS,
  MARKETING_CHANNELS,
  MARKETING_DECISIONS,
  MARKETING_DRAFT_COLUMNS,
  MARKETING_DRAFT_KINDS,
  MARKETING_DRAFT_STATUSES,
  MARKETING_EDITOR_STATUSES,
  MARKETING_FEEDBACK_COLUMNS,
  MARKETING_LEAD_TOUCH_COLUMNS,
  MARKETING_METRIC_COLUMNS,
  MARKETING_OBJECTION_COLUMNS,
  MARKETING_POST_COLUMNS,
  MARKETING_SPEND_COLUMNS,
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
assert('an internal weekly report is not held to the public copy rules', rulesOf('SADC share of enquiries rose — margin up.', 'weekly_report').length === 0);
assert('every rule has a failing sample', sameSet(
  [...new Set([...cases.map((c) => c[0]), 'x_length', 'empty'])],
  ['empty', 'dash', 'per_night', 'sadc', 'hidden_product', 'internals', 'old_lodge_name', 'braai', 'departure_line', 'unpublished_price', 'two_man_rule', 'x_length'],
));

// ---------------------------------------------------------------------------------------------
section('2. Migration 0021: marketing tables === db.types.ts, all default-deny');

const migPath = 'supabase/migrations/0021_marketing.sql';
assert('0021_marketing.sql exists', existsSync(new URL(`../${migPath}`, import.meta.url)));
const migFiles = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
assert('0021 is the latest migration', migFiles[migFiles.length - 1] === '0021_marketing.sql');
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
for (const [constraint, tuple] of [
  ['drafts_author_check', MARKETING_AUTHORS],
  ['drafts_kind_check', MARKETING_DRAFT_KINDS],
  ['drafts_status_check', MARKETING_DRAFT_STATUSES],
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

const actions = read('src/actions/index.ts');
assert('createInquiry validates the opt-in with zod, default false', /marketingOptIn: z\.boolean\(\)\.optional\(\)\.default\(false\)/.test(actions));
assert('createInquiry stores only an explicit true', /marketing_opt_in: input\.marketingOptIn === true/.test(actions));
const form = read('src/components/InquiryForm.astro');
assert('the enquiry form has an opt-in checkbox', /type="checkbox" name="marketingOptIn"/.test(form));
assert('the opt-in checkbox is unticked by default', !/name="marketingOptIn"[^>]*\bchecked\b/.test(form));

// ---------------------------------------------------------------------------------------------
section('3. Rooiberg tool server: five tools, no publish or send, constant-time auth');

const route = read('src/pages/api/marketing/mcp.ts');
const tools = read('src/lib/marketing-tools.ts');
const toolNames = [...tools.matchAll(/^\s{4}name: '([a-z_]+)',$/gm)].map((m) => m[1]);
assert(`exactly the five agreed tools (${toolNames.join(', ')})`, sameSet(toolNames, [
  'get_open_departures', 'get_facts_pack', 'get_photo_library', 'get_results', 'save_draft',
]));
assert('no tool name or handler publishes, posts, sends or emails', !/name: '[a-z_]*(publish|post|send|email|tweet)[a-z_]*'/.test(tools));
assert('the tool module never imports the email or payments libraries', !/from '\.\/(email|payments|balance)'/.test(tools));
assert('the route is server-rendered (prerender = false)', /export const prerender = false;/.test(route));
assert('the bearer is MARKETING_TOOLS_TOKEN', /import\.meta\.env\.MARKETING_TOOLS_TOKEN/.test(route));
assert('auth fails closed when the token is unset', /if \(!secret\) return false;/.test(route));
assert('the bearer is compared in constant time', /crypto\.timingSafeEqual\(/.test(route));
assert('auth runs before the body is read', route.indexOf('authorized(request)') < route.indexOf('request.text()'));
assert('the request body is size-capped', /MAX_BODY_BYTES/.test(route));
assert('the route only dispatches to the tool registry', /callTool\(name, msg\.params\?\.arguments\)/.test(route));
assert('tool inputs are zod-validated (unknown keys refused)', /\.safeParse\(args \?\? \{\}\)/.test(tools) && (tools.match(/\.strict\(\)/g) || []).length >= 5);
assert('the tool module never updates or deletes a row', !/\.(update|delete|upsert)\(/.test(tools));
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

// Sections 4 and 5 are appended as the employees and the schedule land.

console.log(failed === 0 ? '\nALL MARKETING CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
