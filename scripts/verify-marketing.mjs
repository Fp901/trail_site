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
import { fileURLToPath } from 'node:url';
import {
  EMPLOYEE_KEYS,
  HARD_RUN_CAP_CENTS,
  MODELS,
  RESEARCH_HOSTS,
  RUN_CAP_CENTS,
  SCHEDULES,
  TEAM_TAG,
  TOOL_NAMES,
  TOOL_SERVER_PATH,
  WEEKLY_CAP_CENTS,
  notebookStoreName,
} from '../marketing/config.ts';
import { EMPLOYEES, employee } from '../marketing/agents/index.ts';
import { TEAM_PREAMBLE } from '../marketing/agents/types.ts';
import { agentParams, brandSkillBody, memoryPlan, seedMemories } from '../marketing/build.ts';
import { parseReviews } from '../marketing/run.ts';
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

// ---------------------------------------------------------------------------------------------
section('4. The employees');

const SKILL = brandSkillBody(fileURLToPath(new URL('../.claude/skills/rooiberg-brand/SKILL.md', import.meta.url)));
const AGREED_MODELS = {
  head_of_marketing: 'claude-opus-5-5',
  copywriter: 'claude-sonnet-5-5',
  community_manager: 'claude-sonnet-5-5',
  sales_assistant: 'claude-sonnet-5-5',
  analyst: 'claude-sonnet-5-5',
  researcher: 'claude-haiku-5-5',
  editor: 'claude-haiku-5-5',
};
assert('one employee definition per EMPLOYEE_KEYS entry', sameSet(EMPLOYEES.map((e) => e.key), [...EMPLOYEE_KEYS]));
assert('the models are the agreed ones', EMPLOYEE_KEYS.every((k) => MODELS[k] === AGREED_MODELS[k]) && sameSet(Object.keys(MODELS), Object.keys(AGREED_MODELS)));
assert(`every per-run cap is above 0 and at most HARD_RUN_CAP_CENTS (${HARD_RUN_CAP_CENTS})`, EMPLOYEE_KEYS.every((k) => RUN_CAP_CENTS[k] > 0 && RUN_CAP_CENTS[k] <= HARD_RUN_CAP_CENTS));
assert('the weekly cap covers at least one run of each scheduled employee', WEEKLY_CAP_CENTS >= RUN_CAP_CENTS.head_of_marketing * 2 + RUN_CAP_CENTS.copywriter + RUN_CAP_CENTS.editor + RUN_CAP_CENTS.analyst + RUN_CAP_CENTS.researcher);
assert('config TOOL_NAMES match the tool server registry', sameSet([...TOOL_NAMES], toolNames));
assert('the SKILL body was read (voice and hard rules present)', /## Voice/.test(SKILL) && SKILL.length > 500);

for (const emp of EMPLOYEES) {
  const a = agentParams(emp, 'https://example.test', SKILL);
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
  assert(`${label}: the tool server URL is the configured path`, a.mcp_servers.length === 1 && a.mcp_servers[0].url === 'https://example.test' + TOOL_SERVER_PATH);
  assert(`${label}: the instructions carry the team preamble and the brand skill`, a.system.includes(TEAM_PREAMBLE) && a.system.includes(SKILL));
  assert(`${label}: the instructions contain no em or en dash`, !/[–—]/.test(a.system));
  assert(`${label}: at most 8 memory stores per session`, memoryPlan(emp).length <= 8);
  assert(`${label}: tagged with the team metadata`, a.metadata.team === TEAM_TAG && a.metadata.key === label);
}
const researcherWeb = agentParams(employee('researcher'), 'https://example.test', SKILL).tools[0].configs.filter((c) => c.name.startsWith('web_'));
assert('the Researcher\'s web tools are limited to RESEARCH_HOSTS', researcherWeb.length === 2 && researcherWeb.every((c) => sameSet(c.allowed_domains, [...RESEARCH_HOSTS])));
assert('save_draft is never given to the Head of Marketing, the Researcher or the Editor', ['head_of_marketing', 'researcher', 'editor'].every((k) => !employee(k).tools.includes('save_draft')));
assert('only the Head of Marketing writes the playbook', EMPLOYEES.every((e) => (e.memory.playbook === 'read_write') === (e.key === 'head_of_marketing')));
const seeds = seedMemories(SKILL);
assert('every memory store has a seed (playbook and seven notebooks)', Object.keys(seeds).length === 8);
assert('the Copywriter notebook is seeded with /feedback.md', seeds[notebookStoreName('copywriter')].some((m) => m.path === '/feedback.md'));
assert('seeds carry the brand summary and no em or en dash', Object.values(seeds).flat().every((m) => /## Voice/.test(m.content) || m.path !== '/notebook.md') && !/[–—]/.test(JSON.stringify(seeds)));
assert('editor replies parse: pass and flag kept, junk dropped', JSON.stringify(parseReviews('Here: {"reviews":[{"id":"a","verdict":"pass","notes":"ok"},{"id":"b","verdict":"maybe"}]}')) === JSON.stringify([{ id: 'a', verdict: 'pass', notes: 'ok' }]) && parseReviews('not json').length === 0);

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
assert('the runner never approves or publishes a draft', !/status: 'approved'|\.from\('posts'\)/.test(runTs));
assert('the run jobs are exactly the scheduled ones', sameSet([...runTs.matchAll(/^  ([a-z_]+): \{\n    steps:/gm)].map((m) => m[1]), Object.keys(SCHEDULES)));

const page = read('src/pages/admin/marketing.astro');
const decide = actions.slice(actions.indexOf('adminDecideDraft:'), actions.indexOf('adminCreateCompBooking:'));
assert('/admin/marketing is server-rendered and gated by admin auth', /export const prerender = false;/.test(page) && /getAdminUser\(Astro\.cookies\)/.test(page) && /Astro\.redirect\(withBase\('\/admin\/login'\)\)/.test(page));
assert('adminDecideDraft requires an admin and is rate-limited', /requireAdmin\(ctx\)/.test(decide) && /adminActionRate\(admin\.email\)/.test(decide));
assert('an edited draft runs the code rules before it is saved', decide.indexOf('checkDraft(') > -1 && decide.indexOf('checkDraft(') < decide.indexOf('.update(update)'));
assert('a decision is a compare-and-set on pending', /\.update\(update\)\s*\.eq\('id', input\.draftId\)\s*\.eq\('status', 'pending'\)/.test(decide));
assert('the reason is recorded in marketing.feedback', /from\('feedback'\)\.insert\(\{[\s\S]*?reason,/.test(decide));
assert('the agent text is kept when the owner edits', /update\.original_body = draft\.body/.test(decide));
assert('the admin nav links the marketing page', /id: 'marketing'.*href: '\/admin\/marketing'/.test(read('src/components/AdminNav.astro')));
const digest = read('src/pages/api/cron/marketing-drafts.ts');
assert('the digest cron is scheduled in vercel.json', JSON.parse(read('vercel.json')).crons.some((c) => c.path === '/api/cron/marketing-drafts'));
assert('the digest route is CRON_SECRET-gated in constant time', /import\.meta\.env\.CRON_SECRET/.test(digest) && /crypto\.timingSafeEqual\(/.test(digest) && /if \(!secret\) return false;/.test(digest));
assert('the digest goes to ADMIN_EMAILS through the existing email helper', /adminEmailList\(\)/.test(digest) && /sendMarketingDraftsDigest/.test(read('src/lib/email.ts')));
assert('the digest never emails draft text', !/select\('[^']*body/.test(digest));
const envEx = read('.env.example');
assert('.env.example documents the team credentials, all blank', ['ANTHROPIC_API_KEY', 'MARKETING_TOOLS_TOKEN', 'X_API_KEY', 'X_API_SECRET', 'X_BEARER_TOKEN', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET', 'META_ACCESS_TOKEN', 'META_PAGE_ID', 'EMAIL_API_KEY', 'EMAIL_FROM'].every((k) => new RegExp(`^${k}=`, 'm').test(envEx)) && ['ANTHROPIC_API_KEY', 'MARKETING_TOOLS_TOKEN', 'X_API_KEY', 'META_ACCESS_TOKEN'].every((k) => new RegExp(`^${k}=""`, 'm').test(envEx)));

console.log(failed === 0 ? '\nALL MARKETING CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
