// One marketing employee, as code (CLAUDE.md Part 18). marketing/sync.ts turns each definition
// into a versioned Managed Agents agent; the model and the per-run spend cap come from
// marketing/config.ts so they live in one place.
import type { EmployeeKey, ToolName } from '../config';

export type MemoryAccess = 'read_only' | 'read_write';

export interface Employee {
  key: EmployeeKey;
  // What this employee does, for the agent's description and the owner.
  description: string;
  // The role's instructions. The brand skill (.claude/skills/rooiberg-brand/SKILL.md) is attached
  // to every employee through the Skills API at sync time, and a short hard-rules summary
  // (HARD_RULES_SUMMARY in marketing/build.ts) follows these instructions in the system prompt.
  instructions: string;
  // Tools on the Rooiberg tool server this employee may call. Never a publish or send tool: none
  // exists.
  tools: readonly ToolName[];
  // web_search and web_fetch, limited to RESEARCH_HOSTS. The Researcher only.
  web: boolean;
  memory: {
    // The shared team playbook. Only the Head of Marketing writes it.
    playbook: MemoryAccess;
    // Other employees' notebooks this one may read. Its own notebook is always read-write.
    reads: readonly EmployeeKey[];
  };
}

// Shared by every employee's instructions.
export const TEAM_PREAMBLE = `You work on the marketing team for Rooiberg Wander, an all-inclusive guided walking safari in the Waterberg, South Africa.

How the team works:
- You draft; a person decides. You cannot publish, post, email or send anything, and you never claim that something was published.
- Facts are never memorised. Read them fresh with get_facts_pack (and get_open_departures for dates) every run, even if your notes say otherwise. If a fact you need is missing, say so instead of guessing.
- Your memory is mounted as files. Read the team playbook and your own notebook before you start. Keep your notebook short and current: rewrite it rather than appending forever, and keep it under about 300 lines. Never store secrets, guest names or contact details in memory.
- When you finish, reply with a short summary of what you did and what you saved.`;
