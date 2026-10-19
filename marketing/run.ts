// Run one scheduled marketing job (CLAUDE.md Part 18). Called by
// .github/workflows/marketing-team.yml:
//
//   npx tsx marketing/run.ts weekly_review   Sunday: Researcher, Analyst, then Head of Marketing (playbook)
//   npx tsx marketing/run.ts plan_and_write  Monday: Head of Marketing plans, Copywriter drafts, Editor checks
//   npx tsx marketing/run.ts research        Manual only: the Researcher on its own, for testing its brief
//
// Each hand-over (design doc section 3, marketing/contracts.ts) is checked in code before the next
// employee starts. A failing hand-over goes back to its employee once with the reasons; a second
// failure stops what depends on it, and the job exits non-zero so GitHub Actions reports it.
//
// DRY_RUN is true unless it is exactly "false": a dry run prints the plan and makes no network
// call. Nothing here publishes or sends anything. Every session carries a hard budget (the
// employee's RUN_CAP_CENTS), and no session starts once the last 7 days of spend reach
// WEEKLY_CAP_CENTS.
//
// Needs ANTHROPIC_API_KEY, PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY when live.
import type Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { employee } from './agents';
import {
  ENVIRONMENT_NAME,
  HARD_RUN_CAP_CENTS,
  RESEARCH_ENVIRONMENT_NAME,
  RUN_CAP_CENTS,
  RUN_TIMEOUT_MINUTES,
  PLAYBOOK_STORE_NAME,
  SCHEDULES,
  TEAM_TAG,
  VAULT_NAME,
  WEEKLY_CAP_CENTS,
  agentName,
  notebookStoreName,
  type EmployeeKey,
  type JobKey,
} from './config';
import {
  BRIEF_PATH,
  PLAN_PATH,
  PLAYBOOK_PATH,
  checkBrief,
  checkDrafts,
  LAUNCH_SLOTS,
  LAUNCH_SLOT_PREFIX,
  type LaunchSlot,
  checkPlan,
  blogDue,
  PLAN_MIN_TREND_SLOTS,
  checkPlaybook,
  cycleWeek,
  fixPrompt,
  parseItems,
  photoIdsFromSource,
  photoLodgesFromSource,
  PHOTO_LIBRARY_SOURCES,
  PHOTO_USED_STATUSES,
  PHOTOS_LOW_WARNING,
  UPLOAD_PHOTO_PREFIX,
  type PlanSlot,
} from './contracts';
import { readFileSync } from 'node:fs';
import { memoryPlan, memoryResources } from './build';
import { anthropic, findAgent, findEnvironment, findMemoryStores, findVault, requireEnv } from './resources';
import { checkDraft, describeViolations } from '../src/lib/brand-rules';
import { metaResults } from './meta';
import { inspiration, inspirationSummary, type Inspiration } from './inspiration';
import { photosById } from './photos';
import { searchResults } from './search-console';

// Everything the team reads about how we are doing out there: our own Instagram and Facebook posts,
// then Google searches. Both read-only and best-effort (a problem is a note, not a stop).
const channelResults = async () => [await metaResults(), await searchResults()].join('\n\n');
import type { MarketingDraftKind, MarketingPostFormat } from '../src/lib/db.types';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const EDITOR_BATCH = 20;
const FEEDBACK_KEEP_LINES = 200;

// ---- Prompts -------------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

// Which drafts end with the facts pack's booking line: the blog and at most one post a week.
const bookingLineNote = (slots: PlanSlot[]) => {
  const on = slots.filter((s) => s.cta).map((s) => s.id);
  return on.length
    ? `End ${on.join(' and ')} with the facts pack's call_to_action; every other draft ends without it, on the moment itself. `
    : `No draft this week ends with the booking line; end each one on the moment itself. `;
};

// The manual check jobs fail when their source cannot be read, and leave a one-line annotation on
// the run, so the outcome shows on the run's page without opening the log. The line carries the
// reader's own cleaned note (never a token) or the per-account counts, never post text.
function reportCheck(job: string, out: string) {
  const first = out.split('\n')[0].replace(/[\r\n%]/g, ' ').slice(0, 300);
  const failed = /^(Meta results|Search Console results|Creator inspiration) unavailable/.test(out);
  const unreadable = (out.match(/could not be read/g) ?? []).length;
  if (failed) {
    console.log(`::error title=${job}::${first}`);
    process.exitCode = 1;
  } else if (job === 'inspiration_check') {
    const lines = out.split('\n').filter((l) => /^Account \d+:/.test(l));
    console.log(`::notice title=${job}::${lines.length - unreadable} of ${lines.length} accounts readable${unreadable ? `; not readable: ${lines.filter((l) => /could not be read/.test(l)).map((l) => l.split(':')[0]).join(', ')}` : ''}`);
  } else {
    console.log(`::notice title=${job}::read OK`);
  }
}

const PROMPTS = {
  research: (week: string, creators = '') =>
    `Today is ${today()}, Sunday research for cycle week ${week}. Write ${BRIEF_PATH} in your notebook exactly in the format your instructions give, with ids R-${week}-1 upwards, then update /history.md and /learnings.md. Reply with the headlines.` +
    (creators ? `\n\n${creators}` : ''),
  plan: (week: string, research: { ids: string[]; trends: string[] }, withBlog: boolean, results = '') =>
    `Today is ${today()}, Monday planning for cycle week ${week}. Write ${PLAN_PATH} in the team playbook exactly in the format your instructions give, with ids P-${week}-1 upwards. ` +
    (research.ids.length
      ? `This week's research items are ${research.ids.join(', ')} in the Researcher's ${BRIEF_PATH}` +
        (research.trends.length ? `; the trend items are ${research.trends.join(', ')}, and at least ${Math.min(PLAN_MIN_TREND_SLOTS, research.trends.length)} post slots must be based on one.` : '.') +
        ` Every slot${withBlog ? ', the blog included,' : ''} must be based on one of these research items.`
      : `There is no research brief for this week, so base every slot on "facts: ..." from get_facts_pack.`) +
    (withBlog
      ? ` This week has a blog: the plan has exactly one blog slot.`
      : ` This week has no blog (one every second week, and the last was written recently): plan the three posts only.`) +
    ` Reply with the plan's headline ideas.` +
    (results ? `\n\n${results}` : ''),
  write: (week: string, slots: PlanSlot[], search = '') =>
    `Today is ${today()}. Write and save one draft for each slot in ${PLAN_PATH} (cycle week ${week}): ${slots.map((s) => `${s.id} (${s.channel})`).join(', ')}. Put "Plan slot: <id>" in each draft's notes. ` +
    slots
      .filter((s) => s.searchTerms)
      .map((s) => `The blog slot ${s.id} is written to be found for these searches: ${s.searchTerms}. Use the first in the title and in the opening paragraph, and the others in at least one "## " heading, in natural words; never repeat a phrase just to repeat it. `)
      .join('') +
    bookingLineNote(slots) +
    `Reply with a list of what you saved.` +
    (search && slots.some((s) => s.searchTerms) ? `\n\n${search}` : ''),
  review: (drafts: { id: string; kind: string; title: string | null; body: string; notes: string | null; format: string | null; photo_ids: string[] }[]) =>
    `Review these ${drafts.length} new drafts against the facts pack and the brand. Check each draft's photos with get_photo_library, passing its photo_ids as ids: every photo on a saved draft is used, so it is missing from the full list by design. Record each verdict with submit_review (one call per draft), then reply with one line of totals.\n\n` +
    JSON.stringify(drafts, null, 2),
  fix: (drafts: { id: string; kind: string; format: string | null; title: string | null; body: string; notes: string | null; photo_ids: string[]; editor_notes: string | null }[]) =>
    `The Editor flagged ${drafts.length} of your drafts. Fix each one now: save a corrected version with save_draft, passing the flagged draft's id as "replaces" and keeping its kind, format, plan slot note, departure and photos unless the Editor's notes say to change them. Fix exactly what the notes name; if a fact is not in get_facts_pack, take it out rather than reword it. This is the only round: the owner sees your fix and the Editor's second opinion. Reply with one line per draft.\n\n` +
    JSON.stringify(drafts, null, 2),
  launch: (slots: readonly LaunchSlot[]) =>
    `Today is ${today()}. Rooiberg Wander's Instagram and Facebook accounts are new and empty. Write ${slots.length} of the nine opening posts that will fill the profile grid, one draft per slot below, as channel instagram (the owner posts the same text to Facebook). A stranger reads them first, so introduce rather than assume they know us. Take every fact from get_facts_pack. Choose the photos yourself from get_photo_library, reading each alt text so the photos show what the slot is about: a single takes exactly 1 photo, a carousel 3 to 5; never use one photo twice. Put "Plan slot: <id>" in each draft's notes. Leave the booking line off: these posts introduce the trail, and the profile link takes people to the rates page. Reply with a list of what you saved.\n\n` +
    slots.map((s) => `${s.id} (${s.format}): ${s.angle}`).join('\n'),
  analyse: (results: string) =>
    `Today is ${today()}, Sunday. Write this week's report as your instructions describe. Reply with its headline.\n\n${results}`,
  playbook: (results: string) =>
    `Today is ${today()}, Sunday review. Read the results, the Analyst's notebook, the Researcher's ${BRIEF_PATH} and every notebook, then rewrite ${PLAYBOOK_PATH} with the sections your instructions give. Reply with what changed.\n\n${results}`,
};

// ---- Supabase (service role, marketing schema only) ---------------------------------------

function db(): SupabaseClient<any, 'marketing'> {
  return createClient(requireEnv('PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'marketing' },
  });
}

async function weeklySpendCents(sb: SupabaseClient<any, 'marketing'>): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb.from('spend_log').select('list_cost_cents').gte('created_at', since);
  if (error) throw new Error(`spend_log read failed: ${error.message}`);
  return (data ?? []).reduce((sum, r: { list_cost_cents: number }) => sum + (r.list_cost_cents ?? 0), 0);
}

// ---- One session --------------------------------------------------------------------------

interface Ctx {
  client: Anthropic;
  sb: SupabaseClient<any, 'marketing'>;
  job: JobKey;
  storeIds: Record<string, string>;
  envIds: Record<string, string>;
  vaultId: string;
  // Hand-overs that failed their check twice. The job still finishes what it can, then exits
  // non-zero so the failure shows in GitHub Actions.
  failures: string[];
}

interface RunResult {
  text: string;
  costCents: number;
  sessionId: string;
  stopReason: string;
  // Every URL the employee opened with web_fetch in this session.
  fetchedUrls: string[];
  // True when the hand-over passed its check (or there was no check).
  ok: boolean;
}

// Checks one employee's hand-over after a turn. Returns the problems, or none.
type HandOverCheck = (run: { fetchedUrls: string[]; startedAt: string }) => Promise<{ path: string; errors: string[] }>;

function capFor(key: EmployeeKey): number {
  return Math.min(RUN_CAP_CENTS[key], HARD_RUN_CAP_CENTS);
}

// Send one message and wait for the session to go idle. Idle events from earlier turns (seen) are
// skipped in case the stream replays them.
// Photos (ours or a creator's) go with a task as labelled images, so the agent sees the picture
// and not only its description.
type TaskImage = { label: string; url: string };

async function turn(client: Anthropic, sessionId: string, prompt: string, seen: Set<string>, images: TaskImage[] = []): Promise<string> {
  // Open the stream before sending, so no event is missed.
  const stream = await client.beta.sessions.events.stream(sessionId);
  let timedOut = false;
  const timer = setTimeout(async () => {
    timedOut = true;
    try {
      await client.beta.sessions.events.send(sessionId, { events: [{ type: 'user.interrupt' }] });
    } catch {
      /* the session may already be idle */
    }
    stream.controller.abort();
  }, RUN_TIMEOUT_MINUTES * 60 * 1000);

  const text = { type: 'text' as const, text: prompt };
  const withImages = [
    text,
    ...images.flatMap((im) => [
      { type: 'text' as const, text: im.label },
      { type: 'image' as const, source: { type: 'url' as const, url: im.url } },
    ]),
  ];
  try {
    await client.beta.sessions.events.send(sessionId, { events: [{ type: 'user.message', content: withImages }] });
  } catch (err) {
    // A photo that cannot be fetched must not cost the week's work: send the task without them.
    if (images.length === 0) throw err;
    console.log(`  ${images.length} photo(s) could not be attached; sending the task as text only.`);
    await client.beta.sessions.events.send(sessionId, { events: [{ type: 'user.message', content: [text] }] });
  }

  let stopReason = 'unknown';
  try {
    for await (const event of stream) {
      if (event.type === 'session.status_idle') {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        stopReason = event.stop_reason.type;
        if (event.stop_reason.type === 'requires_action') {
          // Every tool on this team is always_allow, so nothing should ask. If something does,
          // refuse it rather than letting it run unreviewed.
          await client.beta.sessions.events.send(sessionId, {
            events: event.stop_reason.event_ids.map((id) => ({
              type: 'user.tool_confirmation' as const,
              tool_use_id: id,
              result: 'deny' as const,
            })),
          });
          continue;
        }
        break;
      }
      if (event.type === 'session.status_terminated') {
        stopReason = 'terminated';
        break;
      }
      if (event.type === 'session.error') {
        // Anthropic's error type and message only: they name the failing tool server or model
        // problem and never carry our secrets.
        const e = event.error;
        console.error(`  session error: ${e.type}${'message' in e && e.message ? `: ${e.message}` : ''}`);
      }
    }
  } catch (err) {
    if (!timedOut) throw err;
  } finally {
    clearTimeout(timer);
  }
  return timedOut ? 'timeout' : stopReason;
}

// The session's event log so far (authoritative, unlike a partially read stream).
async function readLog(client: Anthropic, sessionId: string, seen: Set<string>) {
  const texts: string[] = [];
  const toolCalls: string[] = [];
  const fetchedUrls: string[] = [];
  let toolErrors = 0;
  for await (const e of client.beta.sessions.events.list(sessionId)) {
    if (e.type === 'session.status_idle') seen.add(e.id);
    if (e.type === 'agent.message') {
      for (const block of e.content) if (block.type === 'text') texts.push(block.text);
    }
    if (e.type === 'agent.mcp_tool_use' || e.type === 'agent.tool_use') toolCalls.push(e.name);
    if (e.type === 'agent.tool_use' && e.name === 'web_fetch' && typeof e.input.url === 'string') fetchedUrls.push(e.input.url);
    if ((e.type === 'agent.mcp_tool_result' || e.type === 'agent.tool_result') && e.is_error) toolErrors++;
  }
  return { texts, toolCalls, fetchedUrls, toolErrors };
}

// Run one employee. With a check, the runner reads the hand-over after the first turn; if it
// fails, the employee gets the problems and one chance to fix them in the same session.
async function runEmployee(ctx: Ctx, key: EmployeeKey, prompt: string, check?: HandOverCheck, images: TaskImage[] = []): Promise<RunResult> {
  const { client, sb } = ctx;
  const spent = await weeklySpendCents(sb);
  const cap = capFor(key);
  if (spent + cap > WEEKLY_CAP_CENTS) {
    throw new Error(
      `Weekly cap: ${spent} of ${WEEKLY_CAP_CENTS} cents spent in the last 7 days; a ${cap} cent run could pass it. Not starting ${key}.`,
    );
  }

  const agent = await findAgent(client, agentName(key));
  if (!agent) throw new Error(`Agent not found: ${agentName(key)}. Run marketing:sync first.`);
  const emp = employee(key);
  const environmentId = ctx.envIds[emp.web ? RESEARCH_ENVIRONMENT_NAME : ENVIRONMENT_NAME];

  const startedAt = new Date().toISOString();
  const session = await client.beta.sessions.create({
    agent: agent.id,
    environment_id: environmentId,
    budget: { type: 'limit', max_list_cost: { amount: String(cap), currency: 'USD' } },
    resources: memoryResources(emp, ctx.storeIds),
    vault_ids: [ctx.vaultId],
    title: `${agentName(key)}: ${ctx.job} ${today()}`,
    metadata: { team: TEAM_TAG, job: ctx.job, employee: key },
  });
  console.log(`  session ${session.id} (${agentName(key)}, cap ${cap} cents)`);

  const seen = new Set<string>();
  let stopReason = await turn(client, session.id, prompt, seen, images);
  let log = await readLog(client, session.id, seen);
  let ok = true;
  // A check that throws (a read failed) counts as a failed hand-over, so the spend below is
  // still logged.
  const safeCheck: HandOverCheck | undefined = check
    ? async (run) => {
        try {
          return await check(run);
        } catch (err) {
          return { path: 'the hand-over', errors: [`The runner could not read it: ${err instanceof Error ? err.message : err}`] };
        }
      }
    : undefined;
  if (safeCheck && stopReason === 'end_turn') {
    let result = await safeCheck({ fetchedUrls: log.fetchedUrls, startedAt });
    if (result.errors.length) {
      console.log(`  ${result.path} failed its check (${result.errors.length}); asking for one fix`);
      stopReason = await turn(client, session.id, fixPrompt(result.path, result.errors), seen);
      log = await readLog(client, session.id, seen);
      result = await safeCheck({ fetchedUrls: log.fetchedUrls, startedAt });
    }
    if (result.errors.length) {
      ok = false;
      ctx.failures.push(`${key}: ${result.path} failed its check`);
      console.error(`  ${result.path} still fails its check:\n${result.errors.map((e) => `    - ${e}`).join('\n')}`);
    } else {
      console.log(`  ${result.path} passed its check`);
    }
  } else if (check) {
    ok = false;
    ctx.failures.push(`${key}: stopped (${stopReason}) before its hand-over could be checked`);
  }

  // What the employee did, so a run can be judged from the Actions log alone. Tool names, the
  // pages it opened and its own summary only: no tool inputs, which can hold draft text.
  console.log(`  tools used: ${log.toolCalls.length ? log.toolCalls.join(', ') : 'none'}${log.toolErrors ? ` (${log.toolErrors} returned an error)` : ''}`);
  if (log.fetchedUrls.length) console.log(`  pages opened: ${log.fetchedUrls.length}`);
  const summary = log.texts.at(-1)?.trim();
  if (summary) console.log(`  summary:\n${summary.slice(0, 2000).replace(/^/gm, '    ')}`);
  const final = await client.beta.sessions.retrieve(session.id);
  const costCents = Number(final.usage?.list_cost?.amount ?? 0) || 0;

  const { error } = await sb.from('spend_log').insert({
    employee: key,
    job: ctx.job,
    session_id: session.id,
    list_cost_cents: costCents,
    input_tokens: final.usage?.input_tokens ?? 0,
    output_tokens: final.usage?.output_tokens ?? 0,
  });
  if (error) console.error(`  spend_log insert failed: ${error.message}`);

  console.log(`  ${key}: stop=${stopReason} cost=${costCents} cents`);
  if (stopReason === 'timeout') throw new Error(`${key} did not finish within ${RUN_TIMEOUT_MINUTES} minutes.`);
  return { text: log.texts.join('\n\n'), costCents, sessionId: session.id, stopReason, fetchedUrls: log.fetchedUrls, ok };
}

// ---- Hand-over files --------------------------------------------------------------------

// One memory file by its exact path, with its content. path_prefix must be a directory ending in
// "/", so list the file's directory one level deep, then read the match by id.
async function findMemory(client: Anthropic, storeId: string, path: string): Promise<{ id: string; content: string; sha: string } | null> {
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  for await (const m of client.beta.memoryStores.memories.list(storeId, { path_prefix: dir, depth: 1 })) {
    if (m.type === 'memory' && m.path === path) {
      const full = await client.beta.memoryStores.memories.retrieve(m.id, { memory_store_id: storeId, view: 'full' });
      return { id: full.id, content: full.content ?? '', sha: full.content_sha256 };
    }
  }
  return null;
}

async function readMemory(ctx: Ctx, storeName: string, path: string): Promise<string | null> {
  const storeId = ctx.storeIds[storeName];
  if (!storeId) throw new Error(`Memory store missing: ${storeName}. Run marketing:sync first.`);
  return (await findMemory(ctx.client, storeId, path))?.content ?? null;
}

const missing = (path: string) => ({ path, errors: [`${path} does not exist. Write it.`] });

// This cycle's research item ids: empty when the brief is missing or from an earlier week (the plan
// then rests on the facts pack alone). Sunday's run already checked the brief's format and
// sources; a brief that failed is reported there.
async function briefIds(ctx: Ctx, week: string): Promise<{ ids: string[]; trends: string[] }> {
  const md = await readMemory(ctx, notebookStoreName('researcher'), BRIEF_PATH);
  if (!md) return { ids: [], trends: [] };
  const items = parseItems(md).filter((i) => i.id.startsWith(`R-${week}-`));
  return {
    ids: items.map((i) => i.id),
    trends: items.filter((i) => (i.fields.type ?? '').toLowerCase() === 'trend').map((i) => i.id),
  };
}

async function photoIds(ctx: Ctx): Promise<Set<string>> {
  // The site photos' ids, read from the source: the module itself imports images, which only load
  // inside Vite. verify-marketing.mjs checks this reads the same ids as the module.
  const ids = new Set(PHOTO_LIBRARY_SOURCES.flatMap((f) => photoIdsFromSource(readFileSync(f, 'utf8'))));
  const { data, error } = await ctx.sb.from('photos').select('id');
  if (error) throw new Error(`photos read failed: ${error.message}`);
  for (const r of (data ?? []) as { id: string }[]) ids.add(UPLOAD_PHOTO_PREFIX + r.id);
  return ids;
}

// Each photo's lodge (site and shoot photos from the source, uploads from marketing.photos), so the
// plan check can hold a post to one lodge. Names are normalised to the upload keys.
const LODGE_KEY: Record<string, string> = { T: 'temmincks', O: 'oukraal', R: 'rustwood' };
async function photoLodges(ctx: Ctx): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const f of PHOTO_LIBRARY_SOURCES) {
    for (const [id, l] of photoLodgesFromSource(readFileSync(f, 'utf8'))) map.set(id, l ? (LODGE_KEY[l] ?? l) : null);
  }
  const { data, error } = await ctx.sb.from('photos').select('id, lodge');
  if (error) throw new Error(`photos read failed: ${error.message}`);
  for (const r of (data ?? []) as { id: string; lodge: string | null }[]) map.set(UPLOAD_PHOTO_PREFIX + r.id, r.lodge);
  return map;
}

// Photos already on a pending or approved draft: never planned again (a photo is used once).
// The newest blog draft that is pending or approved, for the every-second-week rule (blogDue).
async function lastBlogAt(ctx: Ctx): Promise<Date | null> {
  const { data, error } = await ctx.sb
    .from('drafts')
    .select('created_at')
    .eq('kind', 'blog_draft')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`drafts read failed: ${error.message}`);
  const row = ((data ?? []) as { created_at: string }[])[0];
  return row ? new Date(row.created_at) : null;
}

// A photo the owner banned at /admin/marketing (0026) counts as used too. Before the migration is
// applied the table is missing, which means no bans.
async function usedPhotos(ctx: Ctx): Promise<Set<string>> {
  const { data, error } = await ctx.sb.from('drafts').select('photo_ids').in('status', [...PHOTO_USED_STATUSES]);
  if (error) throw new Error(`drafts read failed: ${error.message}`);
  const used = new Set(((data ?? []) as { photo_ids: string[] | null }[]).flatMap((r) => r.photo_ids ?? []));
  const bans = await ctx.sb.from('photo_bans').select('photo_id');
  if (bans.error && !/42P01|PGRST205/.test(bans.error.code ?? '') && !/does not exist|could not find the table/i.test(bans.error.message)) {
    throw new Error(`photo bans read failed: ${bans.error.message}`);
  }
  for (const r of (bans.data ?? []) as { photo_id: string }[]) used.add(r.photo_id);
  return used;
}

const checks = {
  // creatorPosts: the creators' post addresses the runner gave the Researcher, citable as sources.
  brief: (ctx: Ctx, week: string, creatorPosts: string[] = []): HandOverCheck => async ({ fetchedUrls }) => {
    const md = await readMemory(ctx, notebookStoreName('researcher'), BRIEF_PATH);
    if (md === null) return missing(BRIEF_PATH);
    return { path: BRIEF_PATH, errors: checkBrief(md, week, [...fetchedUrls, ...creatorPosts]).errors };
  },
  plan: (ctx: Ctx, week: string, research: { ids: string[]; trends: string[] }, photos: Set<string>, used: Set<string>, withBlog: boolean, out: PlanSlot[]): HandOverCheck => async () => {
    const md = await readMemory(ctx, PLAYBOOK_STORE_NAME, PLAN_PATH);
    if (md === null) return missing(PLAN_PATH);
    const r = checkPlan(md, week, research.ids, photos, research.trends, used, withBlog, await photoLodges(ctx));
    out.splice(0, out.length, ...r.slots);
    return { path: PLAN_PATH, errors: r.errors };
  },
  drafts: (ctx: Ctx, slots: PlanSlot[]): HandOverCheck => async ({ startedAt }) => {
    const { data, error } = await ctx.sb
      .from('drafts')
      .select('kind, notes, format, photo_ids')
      .eq('author', 'copywriter')
      .gte('created_at', startedAt);
    if (error) throw new Error(`drafts read failed: ${error.message}`);
    return { path: 'this week\'s drafts', errors: checkDrafts(slots, data ?? []) };
  },
  playbook: (ctx: Ctx): HandOverCheck => async () => {
    const md = await readMemory(ctx, PLAYBOOK_STORE_NAME, PLAYBOOK_PATH);
    if (md === null) return missing(PLAYBOOK_PATH);
    return { path: PLAYBOOK_PATH, errors: checkPlaybook(md) };
  },
};

// ---- Owner feedback into the Copywriter's notebook ---------------------------------------

async function syncFeedback(ctx: Ctx): Promise<number> {
  const { client, sb } = ctx;
  const { data: rows, error } = await sb
    .from('feedback')
    .select('id, created_at, decision, reason, draft_id, drafts(kind, title, body)')
    .is('synced_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`feedback read failed: ${error.message}`);
  if (!rows || rows.length === 0) return 0;

  const lines = rows.map((r: any) => {
    const d = Array.isArray(r.drafts) ? r.drafts[0] : r.drafts;
    const what = d ? `${d.kind}${d.title ? ` "${d.title}"` : ''}` : 'draft';
    const reason = (r.reason ?? '').replace(/\s+/g, ' ').trim() || 'no reason given';
    const edited = r.decision === 'edited' && d ? ` Final text: ${d.body.replace(/\s+/g, ' ').slice(0, 280)}` : '';
    return `- ${String(r.created_at).slice(0, 10)} ${r.decision} ${what}: ${reason}.${edited}`;
  });

  const storeId = ctx.storeIds[notebookStoreName('copywriter')];
  const existing = await findMemory(client, storeId, '/feedback.md');
  const header = '# Owner feedback\n\nNewest last. Approve, edit and reject reasons from /admin/marketing.\n';
  const previous = existing ? existing.content.split('\n').filter((l) => l.startsWith('- ')) : [];
  const kept = [...previous, ...lines].slice(-FEEDBACK_KEEP_LINES);
  const content = `${header}\n${kept.join('\n')}\n`;

  if (existing) {
    await client.beta.memoryStores.memories.update(existing.id, {
      memory_store_id: storeId,
      content,
      precondition: { type: 'content_sha256', content_sha256: existing.sha },
    });
  } else {
    await client.beta.memoryStores.memories.create(storeId, { path: '/feedback.md', content });
  }

  const ids = rows.map((r: any) => r.id);
  const { error: upErr } = await sb.from('feedback').update({ synced_at: new Date().toISOString() }).in('id', ids);
  if (upErr) throw new Error(`feedback mark failed: ${upErr.message}`);
  return rows.length;
}

// The creators' best recent posts, for the Researcher. Logged as a count only: captions are other
// people's words and the workflow log is public.
async function creatorInspiration(): Promise<Inspiration> {
  const ins = await inspiration();
  const n = (ins.text.match(/^- C\d+ /gm) ?? []).length;
  console.log(`  creator inspiration: ${n} post(s), ${ins.images.length} photo(s)${n === 0 ? `: ${ins.text.split('\n')[0]}` : ''}`);
  return ins;
}

// ---- Photos the agents see -------------------------------------------------------------------

// Each photo labelled with what it belongs to and its id, in order.
async function seenPhotos(groups: { label: string; ids: string[] }[]): Promise<TaskImage[]> {
  const found = new Map((await photosById(groups.flatMap((g) => g.ids))).map((p) => [p.id, p]));
  const images = groups.flatMap((g) =>
    g.ids.flatMap((id, n) => (found.has(id) ? [{ label: `${g.label}, photo ${n + 1} of ${g.ids.length} (${id}):`, url: found.get(id)!.url }] : [])),
  );
  console.log(`  photos shown: ${images.length} of ${groups.reduce((t, g) => t + g.ids.length, 0)}`);
  return images;
}

// ---- The fix round: flagged drafts go back to their author once ---------------------------

async function fixRound(ctx: Ctx, since: string): Promise<void> {
  const { data, error } = await ctx.sb
    .from('drafts')
    .select('id, kind, format, title, body, notes, photo_ids, editor_notes')
    .eq('author', 'copywriter')
    .eq('status', 'pending')
    .eq('editor_status', 'flagged')
    .is('replaces', null)
    .gte('created_at', since);
  if (error) throw new Error(`flagged drafts read failed: ${error.message}`);
  const flagged = data ?? [];
  if (flagged.length === 0) {
    console.log('  fix round: nothing flagged');
    return;
  }
  console.log(`  fix round: ${flagged.length} flagged draft(s) back to the Copywriter`);
  await runEmployee(ctx, 'copywriter', PROMPTS.fix(flagged), undefined, await seenPhotos(flagged.map((d) => ({ label: `Draft ${d.id}`, ids: d.photo_ids ?? [] }))));
  const { data: left } = await ctx.sb.from('drafts').select('id').in('id', flagged.map((d) => d.id)).eq('status', 'pending');
  console.log(`  fix round: ${flagged.length - (left?.length ?? 0)} of ${flagged.length} replaced`);
  // The Editor's second opinion on the fixes; whatever it says, the owner sees them next.
  await editorReview(ctx);
}

// ---- Editor: code rules first, then the agent ---------------------------------------------

async function editorReview(ctx: Ctx): Promise<void> {
  const { sb } = ctx;
  const { data, error } = await sb
    .from('drafts')
    .select('id, kind, title, body, notes, format, photo_ids')
    .eq('status', 'pending')
    .eq('editor_status', 'unchecked')
    .order('created_at', { ascending: true })
    .limit(EDITOR_BATCH);
  if (error) throw new Error(`drafts read failed: ${error.message}`);
  const drafts = (data ?? []) as { id: string; kind: MarketingDraftKind; title: string | null; body: string; notes: string | null; format: MarketingPostFormat | null; photo_ids: string[] }[];
  if (drafts.length === 0) {
    console.log('  editor: nothing to review');
    return;
  }

  // The code rules again: a draft can only reach here through save_draft, but the rules may have
  // tightened since it was saved.
  const forAgent: typeof drafts = [];
  for (const d of drafts) {
    const v = checkDraft(`${d.title ?? ''}\n${d.body}`, d.kind, d.format);
    if (v.length) {
      await sb.from('drafts').update({ editor_status: 'flagged', editor_notes: `Code rules: ${describeViolations(v)}` }).eq('id', d.id);
    } else {
      forAgent.push(d);
    }
  }
  if (forAgent.length === 0) return;

  // The Editor records each verdict itself through submit_review (the tool server's fixed-format,
  // Editor-only tool), so there is no free text to parse here. Count what landed.
  await runEmployee(ctx, 'editor', PROMPTS.review(forAgent), undefined, await seenPhotos(forAgent.map((d) => ({ label: `Draft ${d.id}`, ids: d.photo_ids ?? [] }))));
  const { data: after, error: afterErr } = await sb
    .from('drafts')
    .select('id, editor_status')
    .in('id', forAgent.map((d) => d.id));
  if (afterErr) throw new Error(`drafts re-read failed: ${afterErr.message}`);
  const reviewed = (after ?? []).filter((d: { editor_status: string }) => d.editor_status !== 'unchecked').length;
  console.log(`  editor: ${reviewed} of ${forAgent.length} reviewed`);
}

// ---- Jobs ---------------------------------------------------------------------------------

const JOBS: Record<JobKey, { steps: string[]; run: (ctx: Ctx) => Promise<void> }> = {
  research: {
    steps: ['researcher (brief checked)'],
    run: async (ctx) => {
      const week = cycleWeek(new Date());
      const ins = await creatorInspiration();
      await runEmployee(ctx, 'researcher', PROMPTS.research(week, ins.text), checks.brief(ctx, week, ins.sources), ins.images);
    },
  },
  weekly_review: {
    steps: ['researcher (brief checked)', 'analyst', 'head_of_marketing (playbook checked)'],
    run: async (ctx) => {
      const week = cycleWeek(new Date());
      // The research brief is for Monday's plan; a failure is reported but does not stop the review.
      const ins = await creatorInspiration();
      await runEmployee(ctx, 'researcher', PROMPTS.research(week, ins.text), checks.brief(ctx, week, ins.sources), ins.images);
      // How our own posts did on Instagram and Facebook, and what people searched for in Google.
      const results = await channelResults();
      for (const line of results.split('\n').filter((l) => /^(## |Meta results unavailable|Search Console results unavailable)/.test(l))) console.log(`  ${line}`);
      await runEmployee(ctx, 'analyst', PROMPTS.analyse(results));
      await runEmployee(ctx, 'head_of_marketing', PROMPTS.playbook(results), checks.playbook(ctx));
    },
  },
  inspiration_check: {
    steps: ['read the creators\' recent posts (no agents, nothing written)'],
    run: async () => {
      console.log(inspirationSummary(await inspiration()));
    },
  },
  meta_check: {
    steps: ['read Meta results (no agents, nothing written)'],
    run: async () => {
      console.log(await metaResults());
    },
  },
  search_check: {
    steps: ['read Search Console results (no agents, nothing written)'],
    run: async () => {
      console.log(await searchResults());
    },
  },
  // One-off (owner request, 14 October 2026): the nine opening posts. In sessions of three, so
  // each stays well inside the Copywriter's per-run budget. A slot that already has a waiting or
  // approved draft is kept and skipped (an approved draft cannot be rejected), so a rerun writes
  // only the missing posts; refused only when every slot is covered.
  launch_set: {
    steps: [
      'feedback -> copywriter notebook',
      'copywriter (the missing launch posts, three per session, checked)',
      'editor (after the code rules)',
      'copywriter (fix round: each flagged draft once)',
      'editor (second opinion on the fixes)',
    ],
    run: async (ctx) => {
      const { data: existing, error } = await ctx.sb
        .from('drafts')
        .select('notes')
        .in('status', [...PHOTO_USED_STATUSES])
        .like('notes', `%Plan slot: ${LAUNCH_SLOT_PREFIX}%`);
      if (error) throw new Error(`drafts read failed: ${error.message}`);
      // \b stops L-1 matching a note for L-10.
      const have = new Set<string>();
      for (const d of existing ?? []) {
        for (const m of String(d.notes ?? '').matchAll(/Plan slot: (L-\d+)\b/g)) have.add(m[1]);
      }
      const missing = LAUNCH_SLOTS.filter((s) => !have.has(s.id));
      if (have.size > 0) console.log(`  kept (already waiting or approved): ${[...have].sort().join(', ')}`);
      if (missing.length === 0) {
        ctx.failures.push('launch_set: every launch post is already waiting or approved; reject the ones to rewrite at /admin/marketing first.');
        return;
      }
      console.log(`  writing: ${missing.map((s) => s.id).join(', ')}`);
      const n = await syncFeedback(ctx);
      console.log(`  feedback: ${n} new decision(s) synced`);
      const writingFrom = new Date().toISOString();
      for (let i = 0; i < missing.length; i += 3) {
        const batch = missing.slice(i, i + 3);
        await runEmployee(ctx, 'copywriter', PROMPTS.launch(batch), checks.drafts(ctx, [...batch]));
      }
      await editorReview(ctx);
      await fixRound(ctx, writingFrom);
    },
  },
  plan_and_write: {
    steps: [
      'head_of_marketing (plan checked)',
      'feedback -> copywriter notebook',
      'copywriter (one draft per slot checked)',
      'editor (after the code rules)',
      'copywriter (fix round: each flagged draft once)',
      'editor (second opinion on the fixes)',
    ],
    run: async (ctx) => {
      const week = cycleWeek(new Date());
      const research = await briefIds(ctx, week);
      const slots: PlanSlot[] = [];
      const [all, used] = [await photoIds(ctx), await usedPhotos(ctx)];
      const withBlog = blogDue(await lastBlogAt(ctx), new Date());
      console.log(`  blog: ${withBlog ? 'due this week' : 'not this week (one every second week)'}`);
      const left = [...all].filter((id) => !used.has(id)).length;
      console.log(`  photos: ${left} never used, of ${all.size}`);
      if (left < PHOTOS_LOW_WARNING) {
        console.log(`  WARNING: only ${left} unused photos left. Upload new photos at /admin/marketing; a used photo is never used again.`);
      }
      const plan = await runEmployee(
        ctx,
        'head_of_marketing',
        PROMPTS.plan(week, research, withBlog, await channelResults()),
        checks.plan(ctx, week, research, all, used, withBlog, slots),
      );
      // No valid plan, no drafts: the Copywriter would only guess.
      if (!plan.ok) return;
      const n = await syncFeedback(ctx);
      console.log(`  feedback: ${n} new decision(s) synced`);
      const writingFrom = new Date().toISOString();
      await runEmployee(ctx, 'copywriter', PROMPTS.write(week, slots, await searchResults()), checks.drafts(ctx, slots), await seenPhotos(slots.map((sl) => ({ label: `Slot ${sl.id}`, ids: sl.photos ?? [] }))));
      await editorReview(ctx);
      await fixRound(ctx, writingFrom);
    },
  },
};

async function main() {
  const job = process.argv[2] as JobKey;
  if (!job || !(job in JOBS)) {
    console.error(`Usage: tsx marketing/run.ts <${Object.keys(JOBS).join('|')}>`);
    process.exit(2);
  }
  const plan = JOBS[job];
  const when = job in SCHEDULES ? `cron ${SCHEDULES[job as keyof typeof SCHEDULES]}` : 'manual only';
  console.log(`Job ${job} (${when}), cycle week ${cycleWeek(new Date())}: ${plan.steps.join(' -> ')}`);

  // Read-only and free (no agents): run even in a dry run, to check the Meta token and the Google key.
  if (job === 'inspiration_check') {
    const out = inspirationSummary(await inspiration());
    console.log(out);
    reportCheck(job, out);
    return;
  }
  if (job === 'meta_check' || job === 'search_check') {
    const out = job === 'meta_check' ? await metaResults() : await searchResults();
    console.log(out);
    reportCheck(job, out);
    return;
  }

  if (DRY_RUN) {
    for (const step of plan.steps) {
      const key = step.split(' ')[0] as EmployeeKey;
      if (key in RUN_CAP_CENTS) {
        const mounts = memoryPlan(employee(key)).map((m) => `${m.name}(${m.access})`).join(', ');
        console.log(`  would run ${agentName(key)} with a ${capFor(key)} cent budget; memory: ${mounts}`);
      } else {
        console.log(`  would ${step}`);
      }
    }
    console.log('\nDRY RUN: no session started, nothing written. Set DRY_RUN=false to run.');
    return;
  }

  const client = anthropic();
  const sb = db();
  const [env, researchEnv, vault, storeIds] = await Promise.all([
    findEnvironment(client, ENVIRONMENT_NAME),
    findEnvironment(client, RESEARCH_ENVIRONMENT_NAME),
    findVault(client, VAULT_NAME),
    findMemoryStores(client),
  ]);
  if (!env || !researchEnv || !vault) throw new Error('Team resources missing. Run marketing:sync first.');

  const failures: string[] = [];
  await plan.run({
    client,
    sb,
    job,
    storeIds,
    envIds: { [ENVIRONMENT_NAME]: env.id, [RESEARCH_ENVIRONMENT_NAME]: researchEnv.id },
    vaultId: vault.id,
    failures,
  });
  if (failures.length) {
    console.error(`\nFinished with ${failures.length} failed hand-over(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    process.exit(1);
  }
  console.log('\nDone. Drafts wait at /admin/marketing.');
}

// Only run when executed directly (verify-marketing imports this module's exports).
if (process.argv[1] && /marketing[\\/]run\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
