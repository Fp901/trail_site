// Marketing team configuration (CLAUDE.md Part 18). One place for the seven employees' models,
// their per-run spend caps, the weekly ceiling and the schedule. Nothing here is a secret.
//
// Money is in US cents because Managed Agents session budgets are priced in USD list cost
// ("2500" = $25.00). A per-run cap becomes the session's hard `budget`: the platform pauses the
// session when it is reached. The weekly ceiling is checked by the runner against
// marketing.spend_log before any session starts.

export const EMPLOYEE_KEYS = [
  'head_of_marketing',
  'researcher',
  'copywriter',
  'editor',
  'community_manager',
  'sales_assistant',
  'analyst',
] as const;
export type EmployeeKey = (typeof EMPLOYEE_KEYS)[number];

// Model per employee, as agreed with the owner. The Researcher moved from Haiku to Sonnet with the
// system design (October 2026): its job is judging which finding is worth a post, and one weekly
// Sonnet run costs about what seven daily Haiku runs did.
export const MODELS: Record<EmployeeKey, string> = {
  head_of_marketing: 'claude-opus-5-5',
  researcher: 'claude-sonnet-5-5',
  copywriter: 'claude-sonnet-5-5',
  editor: 'claude-haiku-5-5',
  community_manager: 'claude-sonnet-5-5',
  sales_assistant: 'claude-sonnet-5-5',
  analyst: 'claude-sonnet-5-5',
};

// Hard per-run cap, in US cents of list cost. Every value must stay at or below HARD_RUN_CAP_CENTS
// (scripts/verify-marketing.mjs fails the build otherwise).
export const HARD_RUN_CAP_CENTS = 500;
export const RUN_CAP_CENTS: Record<EmployeeKey, number> = {
  head_of_marketing: 300,
  researcher: 150,
  copywriter: 200,
  editor: 30,
  community_manager: 100,
  sales_assistant: 100,
  analyst: 100,
};

// The runner refuses to start a session once the last 7 days of spend_log reach this.
export const WEEKLY_CAP_CENTS = 2500;

// A session that has not gone idle after this long is interrupted and the run fails.
export const RUN_TIMEOUT_MINUTES = 20;

// The weekly rhythm. Cron in UTC (SAST is UTC+2, no DST). These strings are mirrored in
// .github/workflows/marketing-team.yml and verify-marketing.mjs checks they still match.
// Nothing scheduled here publishes or sends anything: every output is a pending draft or a
// memory note, and a person approves each draft at /admin/marketing.
// One cycle a week (design doc section 2): research and review on Sunday, plan and drafts on
// Monday, owner review Monday to Wednesday. There is no daily research run.
export const SCHEDULES = {
  // Sunday 14:00 SAST: Researcher writes the brief, Analyst reports, Head of Marketing rewrites the playbook.
  weekly_review: '0 12 * * 0',
  // Monday 07:00 SAST: Head of Marketing plans the week, then Copywriter drafts, then Editor checks.
  plan_and_write: '0 5 * * 1',
} as const;
export type ScheduleKey = keyof typeof SCHEDULES;
// Jobs that run only when started by hand (GitHub Actions > Run workflow): the Researcher alone,
// for trying out a change to its brief.
export const MANUAL_JOBS = ['research'] as const;
export type JobKey = ScheduleKey | (typeof MANUAL_JOBS)[number];

// Managed Agents resource names. The sync script finds or creates each by name; the runner looks
// them up by the same names, so no IDs need to be stored anywhere.
export const TEAM_TAG = 'rooiberg-marketing';
export const ENVIRONMENT_NAME = 'rooiberg-marketing';
export const RESEARCH_ENVIRONMENT_NAME = 'rooiberg-marketing-research';
export const VAULT_NAME = 'rooiberg-marketing';
export const PLAYBOOK_STORE_NAME = 'rooiberg-team-playbook';
export const notebookStoreName = (key: EmployeeKey) => `rooiberg-notebook-${key.replace(/_/g, '-')}`;
export const TITLES: Record<EmployeeKey, string> = {
  head_of_marketing: 'Head of Marketing',
  researcher: 'Researcher',
  copywriter: 'Copywriter',
  editor: 'Editor',
  community_manager: 'Community Manager',
  sales_assistant: 'Sales Assistant',
  analyst: 'Analyst',
};
export const agentName = (key: EmployeeKey) => `Rooiberg ${TITLES[key]}`;

// The Rooiberg tool server (src/pages/api/marketing/mcp/[employee].ts) and its MCP server name on
// each agent. TOOL_NAMES mirrors the server's registry (verify-marketing.mjs checks both lists agree).
// There is deliberately no publish or send tool.
export const TOOL_NAMES = [
  'get_open_departures',
  'get_facts_pack',
  'get_photo_library',
  'get_results',
  'save_draft',
  'submit_review',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// Which tools each employee may call. ONE list, read twice: marketing/agents/*.ts switch on exactly
// these tools in the agent's MCP toolset, and the tool server refuses any other tool for that
// employee (each employee reaches the server on its own URL with its own derived bearer token, so
// the server knows who is calling). submit_review is the Editor's alone; save_draft never is.
export const TOOL_ACCESS: Record<EmployeeKey, readonly ToolName[]> = {
  head_of_marketing: ['get_open_departures', 'get_facts_pack', 'get_photo_library', 'get_results'],
  researcher: ['get_facts_pack'],
  copywriter: ['get_open_departures', 'get_facts_pack', 'get_photo_library', 'save_draft'],
  editor: ['get_facts_pack', 'submit_review'],
  community_manager: ['get_open_departures', 'get_facts_pack', 'get_photo_library', 'save_draft'],
  sales_assistant: ['get_open_departures', 'get_facts_pack', 'save_draft'],
  analyst: ['get_results', 'save_draft'],
};

export const isEmployeeKey = (v: string): v is EmployeeKey => (EMPLOYEE_KEYS as readonly string[]).includes(v);

export const TOOL_SERVER_NAME = 'rooiberg';
export const TOOL_SERVER_PATH = '/api/marketing/mcp';
// One URL per employee: /api/marketing/mcp/<employee key>.
export const toolServerUrl = (siteUrl: string, key: EmployeeKey) =>
  `${siteUrl.replace(/\/$/, '')}${TOOL_SERVER_PATH}/${key}`;

// The Researcher's allowed sites are listed in its brief, marketing/briefs/researcher.md (read by
// marketing/brief.ts), so the owner edits them in one place with the rest of its instructions.
