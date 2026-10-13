// Pure builders shared by marketing/sync.ts, marketing/run.ts and scripts/verify-marketing.mjs.
// Nothing here touches the network: it turns the employees-as-code into the exact Managed Agents
// payloads, so the verify script can check what would be sent without any key.
import { readFileSync } from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import {
  MODELS,
  PLAYBOOK_STORE_NAME,
  RESEARCH_HOSTS,
  TEAM_TAG,
  TITLES,
  TOOL_SERVER_NAME,
  agentName,
  notebookStoreName,
  toolServerUrl,
  type EmployeeKey,
} from './config';
import { TEAM_PREAMBLE, type Employee } from './agents/types';

type AgentCreate = Anthropic.Beta.Agents.AgentCreateParams;
type MemoryResource = Anthropic.Beta.Sessions.BetaManagedAgentsMemoryStoreResourceParam;

export const SKILL_PATH = '.claude/skills/rooiberg-brand/SKILL.md';

// The brand skill without its YAML frontmatter.
export function brandSkillBody(path = SKILL_PATH): string {
  const raw = readFileSync(path, 'utf8');
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

export function systemPrompt(emp: Employee, skill: string): string {
  return [TEAM_PREAMBLE, emp.instructions, skill].join('\n\n');
}

// The built-in toolset: file tools so the agent can read and write its mounted memory. bash is
// never enabled (nothing in this team needs a shell), and web search/fetch are on for the
// Researcher only, limited to RESEARCH_HOSTS.
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
    configs.push({ name: 'web_search', enabled: true, allowed_domains: [...RESEARCH_HOSTS] });
    configs.push({ name: 'web_fetch', enabled: true, allowed_domains: [...RESEARCH_HOSTS] });
  }
  return {
    type: 'agent_toolset_20260401',
    default_config: { enabled: false, permission_policy: { type: 'always_allow' } },
    configs,
  };
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

export function agentParams(emp: Employee, siteUrl: string, skill: string): AgentCreate {
  return {
    name: agentName(emp.key),
    description: emp.description,
    model: MODELS[emp.key],
    system: systemPrompt(emp, skill),
    mcp_servers: [{ type: 'url', name: TOOL_SERVER_NAME, url: toolServerUrl(siteUrl, emp.key) }],
    tools: [agentToolset(emp), mcpToolset(emp)],
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
          ? 'The shared team playbook. You own it: keep /playbook.md and /weekly-plan.md accurate and short.'
          : 'The shared team playbook, written by the Head of Marketing. Read /playbook.md and /weekly-plan.md first.',
    },
    {
      name: notebookStoreName(emp.key),
      access: 'read_write',
      instructions: 'Your own notebook. Read /notebook.md first and keep it short and current.',
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
  const seeds: Record<string, { path: string; content: string }[]> = {
    [PLAYBOOK_STORE_NAME]: [
      {
        path: '/playbook.md',
        content: `# Team playbook\n\nOwned by the Head of Marketing, rewritten every Sunday.\n\n${summary}\n\n## What works\n\nNothing yet: the team has just started.\n\n## What the owner approves and rejects\n\nNothing yet.\n\n## Questions for the owner\n\nNone yet.\n`,
      },
      {
        path: '/weekly-plan.md',
        content: '# Weekly plan\n\nNo plan yet. The Head of Marketing writes this every Monday.\n',
      },
    ],
  };
  for (const key of Object.keys(TITLES) as EmployeeKey[]) {
    const files = [
      {
        path: '/notebook.md',
        content: `# ${TITLES[key]} notebook\n\nKeep this short and current. Never store secrets, guest names or contact details.\n\n${summary}\n\n## Notes\n\nNothing yet.\n`,
      },
    ];
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
