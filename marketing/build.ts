// Pure builders shared by marketing/sync.ts, marketing/run.ts and scripts/verify-marketing.mjs.
// Nothing here touches the network: it turns the employees-as-code into the exact Managed Agents
// payloads, so the verify script can check what would be sent without any key.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import {
  ENVIRONMENT_NAME,
  MODELS,
  RESEARCH_ENVIRONMENT_NAME,
  PLAYBOOK_STORE_NAME,
  TEAM_TAG,
  TITLES,
  TOOL_SERVER_NAME,
  agentName,
  notebookStoreName,
  toolServerUrl,
  type EmployeeKey,
} from './config';
import { BRIEF_PATH, HISTORY_PATH, LEARNINGS_PATH, PLAN_PATH, PLAYBOOK_PATH, PLAYBOOK_SECTIONS } from './contracts';
import { TEAM_PREAMBLE, type Employee } from './agents/types';

type AgentCreate = Anthropic.Beta.Agents.AgentCreateParams;
type MemoryResource = Anthropic.Beta.Sessions.BetaManagedAgentsMemoryStoreResourceParam;

export const SKILL_PATH = '.claude/skills/rooiberg-brand/SKILL.md';
// The brand skill is uploaded once through the Skills API (marketing/sync.ts) and attached to every
// employee by id. Its slug comes from the SKILL.md frontmatter `name`; the display name is how sync
// finds it again.
export const SKILL_NAME = 'rooiberg-brand';
export const SKILL_DISPLAY_NAME = 'Rooiberg Wander brand';

// The skill file exactly as it is in the repository.
export function brandSkillFile(path = SKILL_PATH): string {
  return readFileSync(path, 'utf8');
}

// The brand skill without its YAML frontmatter.
export function brandSkillBody(path = SKILL_PATH): string {
  return brandSkillFile(path).replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

// Content hash of SKILL.md as committed. A skill version carries no metadata of its own, but its
// `description` is read back from the uploaded frontmatter, so the upload appends the hash there
// and sync compares it with the file to decide whether a new version is needed.
export const skillContentHash = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex');
const HASH_TAG = /\s*\[content sha256 ([0-9a-f]{64})\]\s*$/;

export function skillUploadContent(raw: string): string {
  const hash = skillContentHash(raw);
  const out = raw.replace(/^(---\n(?:[^\n]*\n)*?description:[^\n]*?)[ \t]*(?=\n)/, `$1 [content sha256 ${hash}]`);
  if (out === raw) throw new Error(`${SKILL_PATH} has no single-line description in its frontmatter.`);
  return out;
}

// The hash a live skill version was uploaded from, or null for a version this code did not upload.
export const hashFromVersionDescription = (description: string): string | null =>
  description.match(HASH_TAG)?.[1] ?? null;

export interface SkillRef {
  skill_id: string;
  version: string;
}

// The hard rules in one paragraph, kept in every system prompt so an agent sees them even before
// it opens the attached brand skill. The skill holds the full voice and rules; the code rules
// (src/lib/brand-rules.ts) enforce them regardless.
export const HARD_RULES_SUMMARY = `Brand: the rooiberg-brand skill is attached. Read it before you write or judge anything. Hard rules, enforced by code: no em or en dashes; no per-night price, only the published per person rates from get_facts_pack; never mention SADC, a resident rate, self-catering or /sadc-slackpacking; no business-plan internals or named individuals from the plan; safety copy names the Two-Man Rule; lodges are Temminck's Lodge, Oukraal and Rustwood; write barbeque, never braai; a joined departure only in the exact line from get_open_departures; X posts at most 280 characters.`;

export function systemPrompt(emp: Employee): string {
  return [TEAM_PREAMBLE, emp.instructions, HARD_RULES_SUMMARY].join('\n\n');
}

// The built-in toolset: file tools so the agent can read and write its mounted memory. bash is
// never enabled (nothing in this team needs a shell), and web search/fetch are on for the
// Researcher only. Its web is open (owner decision, October 2026): the Sites list in its brief is
// where it starts, not a fence. What it brings back is held to a strict, length-capped format by
// the runner (marketing/contracts.ts), every source must be a page it opened in the same run, and
// nothing it writes leaves the team without the owner's approval.
export function agentToolset(emp: Employee): Anthropic.Beta.Agents.BetaManagedAgentsAgentToolset20260401Params {
  const configs: Anthropic.Beta.Agents.BetaManagedAgentsAgentToolConfigParams[] = [
    { name: 'read', enabled: true },
    { name: 'write', enabled: true },
    { name: 'edit', enabled: true },
    { name: 'glob', enabled: true },
    { name: 'grep', enabled: true },
    { name: 'bash', enabled: false },
  ];
  if (emp.web) {
    configs.push({ name: 'web_search', enabled: true });
    configs.push({ name: 'web_fetch', enabled: true });
  }
  return {
    type: 'agent_toolset_20260401',
    default_config: { enabled: false, permission_policy: { type: 'always_allow' } },
    configs,
  };
}

// The two environments. The team's is limited: no hosts at all, only its MCP tool server. The
// Researcher's is unrestricted, because under limited networking allowed_hosts also bounds
// web_search and web_fetch, and its web is open. That sandbox has no bash and its file tools reach
// only its mounted memory, so the open network is used by the web tools alone.
export function environmentSpecs(): { name: string; config: Anthropic.Beta.Environments.EnvironmentCreateParams['config'] }[] {
  return [
    {
      name: ENVIRONMENT_NAME,
      config: { type: 'cloud', networking: { type: 'limited', allow_mcp_servers: true, allowed_hosts: [] } },
    },
    { name: RESEARCH_ENVIRONMENT_NAME, config: { type: 'cloud', networking: { type: 'unrestricted' } } },
  ];
}

// The Rooiberg tool server, with only this employee's tools switched on.
export function mcpToolset(emp: Employee): Anthropic.Beta.Agents.BetaManagedAgentsMCPToolsetParams {
  return {
    type: 'mcp_toolset',
    mcp_server_name: TOOL_SERVER_NAME,
    default_config: { enabled: false, permission_policy: { type: 'always_allow' } },
    configs: emp.tools.map((name) => ({ name, enabled: true })),
  };
}

export function agentParams(emp: Employee, siteUrl: string, skill: SkillRef): AgentCreate {
  return {
    name: agentName(emp.key),
    description: emp.description,
    model: MODELS[emp.key],
    system: systemPrompt(emp),
    mcp_servers: [{ type: 'url', name: TOOL_SERVER_NAME, url: toolServerUrl(siteUrl, emp.key) }],
    tools: [agentToolset(emp), mcpToolset(emp)],
    // The brand skill, pinned to the version sync just verified or uploaded.
    skills: [{ type: 'custom', skill_id: skill.skill_id, version: skill.version }],
    metadata: { team: TEAM_TAG, key: emp.key },
  };
}

// Memory mounts for one session of this employee: the team playbook, its own notebook
// (read-write) and the notebooks it may read. At most 8 per session (the platform limit).
export function memoryPlan(emp: Employee): { name: string; access: 'read_only' | 'read_write'; instructions: string }[] {
  return [
    {
      name: PLAYBOOK_STORE_NAME,
      access: emp.memory.playbook,
      instructions:
        emp.memory.playbook === 'read_write'
          ? `The shared team playbook. You own it: keep ${PLAYBOOK_PATH} and ${PLAN_PATH} accurate and short.`
          : `The shared team playbook, written by the Head of Marketing. Read ${PLAYBOOK_PATH} and ${PLAN_PATH} first.`,
    },
    {
      name: notebookStoreName(emp.key),
      access: 'read_write',
      instructions: `Your own notebook. Read ${LEARNINGS_PATH} and ${HISTORY_PATH} first. Lessons go in ${LEARNINGS_PATH}, one line per thing you produced in ${HISTORY_PATH}, and this week's hand-over file is replaced each run.`,
    },
    ...emp.memory.reads.map((k) => ({
      name: notebookStoreName(k),
      access: 'read_only' as const,
      instructions: `The ${TITLES[k]}'s notebook (read only).`,
    })),
  ];
}

export function memoryResources(
  emp: Employee,
  storeIds: Record<string, string>,
): MemoryResource[] {
  return memoryPlan(emp).map((m) => {
    const id = storeIds[m.name];
    if (!id) throw new Error(`Memory store missing: ${m.name}. Run marketing:sync first.`);
    return { type: 'memory_store', memory_store_id: id, access: m.access, instructions: m.instructions };
  });
}

// Seeds written once when a store is created; never overwritten by a later sync.
export function brandSummary(skill: string): string {
  // "Who we are" and "Voice" sections of the skill: enough for a fresh notebook to start from.
  const keep = skill.split(/\n(?=## )/).filter((s) => /^## (Who we are|Voice)/.test(s));
  return keep.join('\n\n').trim();
}

export function seedMemories(skill: string): Record<string, { path: string; content: string }[]> {
  const summary = brandSummary(skill);
  const sections = PLAYBOOK_SECTIONS.map((h) => `## ${h}\n\n${h === 'Voice' ? 'See the rooiberg-brand skill. Add only what the owner has taught us since.' : 'Nothing yet.'}`).join('\n\n');
  const seeds: Record<string, { path: string; content: string }[]> = {
    [PLAYBOOK_STORE_NAME]: [
      {
        path: PLAYBOOK_PATH,
        content: `# Team playbook\n\nOwned by the Head of Marketing, rewritten every Sunday.\n\n${sections}\n`,
      },
      {
        path: PLAN_PATH,
        content: '# Weekly plan\n\nNo plan yet. The Head of Marketing writes this every Monday.\n',
      },
    ],
  };
  // Every notebook has the same two lasting files (design doc section 4). The old /notebook.md is
  // left where it exists; each brief says to move its lasting lessons into learnings.md.
  for (const key of Object.keys(TITLES) as EmployeeKey[]) {
    const files = [
      {
        path: LEARNINGS_PATH,
        content: `# ${TITLES[key]}: learnings\n\nLessons that still hold, at most 100 lines. Rewrite rather than append. Never store secrets, guest names or contact details, and never a fact: facts come fresh from get_facts_pack or a page opened this run.\n\n${summary}\n\n## Lessons\n\nNothing yet.\n`,
      },
      {
        path: HISTORY_PATH,
        content: `# ${TITLES[key]}: history\n\nOne line per thing produced, newest first: id, date, headline, what happened to it. Keep 12 weeks. A line here is a reminder of what was looked at, never evidence.\n`,
      },
    ];
    if (key === 'researcher') {
      files.push({ path: BRIEF_PATH, content: '# Weekly brief\n\nNo brief yet. Replaced every Sunday.\n' });
    }
    if (key === 'copywriter') {
      files.push({
        path: '/feedback.md',
        content: '# Owner feedback\n\nThe runner appends every approve, edit and reject reason from /admin/marketing here.\n',
      });
    }
    seeds[notebookStoreName(key)] = files;
  }
  return seeds;
}
