// Run one scheduled marketing job (CLAUDE.md Part 18). Called by
// .github/workflows/marketing-team.yml:
//
//   npx tsx marketing/run.ts research        Researcher: daily notes
//   npx tsx marketing/run.ts plan_and_write  Head of Marketing plans, Copywriter drafts, Editor checks
//   npx tsx marketing/run.ts weekly_review   Analyst reports, Head of Marketing rewrites the playbook
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
  SCHEDULES,
  TEAM_TAG,
  VAULT_NAME,
  WEEKLY_CAP_CENTS,
  agentName,
  notebookStoreName,
  type EmployeeKey,
  type ScheduleKey,
} from './config';
import { memoryPlan, memoryResources } from './build';
import { anthropic, findAgent, findEnvironment, findMemoryStores, findVault, requireEnv } from './resources';
import { checkDraft, describeViolations } from '../src/lib/brand-rules';
import type { MarketingDraftKind } from '../src/lib/db.types';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const EDITOR_BATCH = 20;
const FEEDBACK_KEEP_LINES = 200;

// ---- Prompts -------------------------------------------------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

const PROMPTS = {
  research: () =>
    `Today is ${today()}. Do your daily research and update your notebook. Reply with a three-line summary.`,
  plan: () =>
    `Today is ${today()}, Monday planning. Write this week's /weekly-plan.md in the team playbook as your instructions describe. Reply with the plan's headline ideas.`,
  write: () =>
    `Today is ${today()}. Write and save this week's drafts from /weekly-plan.md as your instructions describe. Reply with a list of what you saved.`,
  review: (drafts: { id: string; kind: string; title: string | null; body: string }[]) =>
    `Review these ${drafts.length} new drafts against the facts pack and the brand. Record each verdict with submit_review (one call per draft), then reply with one line of totals.\n\n` +
    JSON.stringify(drafts, null, 2),
  analyse: () =>
    `Today is ${today()}, Sunday. Write this week's report as your instructions describe. Reply with its headline.`,
  playbook: () =>
    `Today is ${today()}, Sunday review. Read the results and every notebook, then rewrite /playbook.md as your instructions describe. Reply with what changed.`,
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
  job: ScheduleKey;
  storeIds: Record<string, string>;
  envIds: Record<string, string>;
  vaultId: string;
}

interface RunResult {
  text: string;
  costCents: number;
  sessionId: string;
  stopReason: string;
}

function capFor(key: EmployeeKey): number {
  return Math.min(RUN_CAP_CENTS[key], HARD_RUN_CAP_CENTS);
}

async function runEmployee(ctx: Ctx, key: EmployeeKey, prompt: string): Promise<RunResult> {
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

  // Open the stream before sending, so no event is missed.
  const stream = await client.beta.sessions.events.stream(session.id);
  let timedOut = false;
  const timer = setTimeout(async () => {
    timedOut = true;
    try {
      await client.beta.sessions.events.send(session.id, { events: [{ type: 'user.interrupt' }] });
    } catch {
      /* the session may already be idle */
    }
    stream.controller.abort();
  }, RUN_TIMEOUT_MINUTES * 60 * 1000);

  await client.beta.sessions.events.send(session.id, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: prompt }] }],
  });

  let stopReason = 'unknown';
  try {
    for await (const event of stream) {
      if (event.type === 'session.status_idle') {
        stopReason = event.stop_reason.type;
        if (event.stop_reason.type === 'requires_action') {
          // Every tool on this team is always_allow, so nothing should ask. If something does,
          // refuse it rather than letting it run unreviewed.
          await client.beta.sessions.events.send(session.id, {
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
  if (timedOut) stopReason = 'timeout';

  // The agent's replies, from the event log (authoritative, unlike a partially read stream).
  const texts: string[] = [];
  const toolCalls: string[] = [];
  let toolErrors = 0;
  for await (const e of client.beta.sessions.events.list(session.id)) {
    if (e.type === 'agent.message') {
      for (const block of e.content) if (block.type === 'text') texts.push(block.text);
    }
    if (e.type === 'agent.mcp_tool_use' || e.type === 'agent.tool_use') toolCalls.push(e.name);
    if ((e.type === 'agent.mcp_tool_result' || e.type === 'agent.tool_result') && e.is_error) toolErrors++;
  }
  // What the employee did, so a run can be judged from the Actions log alone. Tool names and
  // the agent's own summary only: no tool inputs, which can hold draft text or URLs.
  console.log(`  tools used: ${toolCalls.length ? toolCalls.join(', ') : 'none'}${toolErrors ? ` (${toolErrors} returned an error)` : ''}`);
  const summary = texts.at(-1)?.trim();
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
  return { text: texts.join('\n\n'), costCents, sessionId: session.id, stopReason };
}

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
  let existing: { id: string; content: string; sha: string } | null = null;
  for await (const m of client.beta.memoryStores.memories.list(storeId, { path_prefix: '/feedback.md', view: 'full' })) {
    if (m.type === 'memory' && m.path === '/feedback.md') {
      existing = { id: m.id, content: m.content ?? '', sha: m.content_sha256 };
      break;
    }
  }
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

// ---- Editor: code rules first, then the agent ---------------------------------------------

async function editorReview(ctx: Ctx): Promise<void> {
  const { sb } = ctx;
  const { data, error } = await sb
    .from('drafts')
    .select('id, kind, title, body')
    .eq('status', 'pending')
    .eq('editor_status', 'unchecked')
    .order('created_at', { ascending: true })
    .limit(EDITOR_BATCH);
  if (error) throw new Error(`drafts read failed: ${error.message}`);
  const drafts = (data ?? []) as { id: string; kind: MarketingDraftKind; title: string | null; body: string }[];
  if (drafts.length === 0) {
    console.log('  editor: nothing to review');
    return;
  }

  // The code rules again: a draft can only reach here through save_draft, but the rules may have
  // tightened since it was saved.
  const forAgent: typeof drafts = [];
  for (const d of drafts) {
    const v = checkDraft(`${d.title ?? ''}\n${d.body}`, d.kind);
    if (v.length) {
      await sb.from('drafts').update({ editor_status: 'flagged', editor_notes: `Code rules: ${describeViolations(v)}` }).eq('id', d.id);
    } else {
      forAgent.push(d);
    }
  }
  if (forAgent.length === 0) return;

  // The Editor records each verdict itself through submit_review (the tool server's fixed-format,
  // Editor-only tool), so there is no free text to parse here. Count what landed.
  await runEmployee(ctx, 'editor', PROMPTS.review(forAgent));
  const { data: after, error: afterErr } = await sb
    .from('drafts')
    .select('id, editor_status')
    .in('id', forAgent.map((d) => d.id));
  if (afterErr) throw new Error(`drafts re-read failed: ${afterErr.message}`);
  const reviewed = (after ?? []).filter((d: { editor_status: string }) => d.editor_status !== 'unchecked').length;
  console.log(`  editor: ${reviewed} of ${forAgent.length} reviewed`);
}

// ---- Jobs ---------------------------------------------------------------------------------

const JOBS: Record<ScheduleKey, { steps: string[]; run: (ctx: Ctx) => Promise<void> }> = {
  research: {
    steps: ['researcher'],
    run: async (ctx) => {
      await runEmployee(ctx, 'researcher', PROMPTS.research());
    },
  },
  plan_and_write: {
    steps: ['head_of_marketing (plan)', 'feedback -> copywriter notebook', 'copywriter', 'editor (after the code rules)'],
    run: async (ctx) => {
      await runEmployee(ctx, 'head_of_marketing', PROMPTS.plan());
      const n = await syncFeedback(ctx);
      console.log(`  feedback: ${n} new decision(s) synced`);
      await runEmployee(ctx, 'copywriter', PROMPTS.write());
      await editorReview(ctx);
    },
  },
  weekly_review: {
    steps: ['analyst', 'head_of_marketing (playbook)'],
    run: async (ctx) => {
      await runEmployee(ctx, 'analyst', PROMPTS.analyse());
      await runEmployee(ctx, 'head_of_marketing', PROMPTS.playbook());
    },
  },
};

async function main() {
  const job = process.argv[2] as ScheduleKey;
  if (!job || !(job in JOBS)) {
    console.error(`Usage: tsx marketing/run.ts <${Object.keys(JOBS).join('|')}>`);
    process.exit(2);
  }
  const plan = JOBS[job];
  console.log(`Job ${job} (cron ${SCHEDULES[job]}): ${plan.steps.join(' -> ')}`);

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

  await plan.run({
    client,
    sb,
    job,
    storeIds,
    envIds: { [ENVIRONMENT_NAME]: env.id, [RESEARCH_ENVIRONMENT_NAME]: researchEnv.id },
    vaultId: vault.id,
  });
  console.log('\nDone. Drafts wait at /admin/marketing.');
}

// Only run when executed directly (verify-marketing imports this module's exports).
if (process.argv[1] && /marketing[\\/]run\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
