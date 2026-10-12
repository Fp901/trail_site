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

// Model per employee, as agreed with the owner.
export const MODELS: Record<EmployeeKey, string> = {
  head_of_marketing: 'claude-opus-5-5',
  researcher: 'claude-haiku-5-5',
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
  researcher: 100,
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
export const SCHEDULES = {
  // Researcher: daily trends and competitor notes, 06:00 SAST.
  research: '0 4 * * *',
  // Monday 07:00 SAST: Head of Marketing plans the week, then Copywriter drafts, then Editor checks.
  plan_and_write: '0 5 * * 1',
  // Sunday 16:00 SAST: Analyst reads results, then Head of Marketing rewrites the playbook.
  weekly_review: '0 14 * * 0',
} as const;
export type ScheduleKey = keyof typeof SCHEDULES;

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

// The Rooiberg tool server (src/pages/api/marketing/mcp.ts) and its MCP server name on each agent.
// TOOL_NAMES mirrors the server's registry (verify-marketing.mjs checks both lists agree). There is
// deliberately no publish or send tool.
export const TOOL_NAMES = [
  'get_open_departures',
  'get_facts_pack',
  'get_photo_library',
  'get_results',
  'save_draft',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
export const TOOL_SERVER_NAME = 'rooiberg';
export const TOOL_SERVER_PATH = '/api/marketing/mcp';
export const toolServerUrl = (siteUrl: string) => siteUrl.replace(/\/$/, '') + TOOL_SERVER_PATH;

// The only hosts the Researcher's web_search / web_fetch may reach (also the research
// environment's allowed_hosts). Edit this list to widen the research; keep it short. Plain
// hostnames only, subdomains are covered.
export const RESEARCH_HOSTS = [
  'rooibergwander.co.za',
  'tripadvisor.com',
  'safaribookings.com',
  'getaway.co.za',
  'sanparks.org',
  'waterberg.net',
  'instagram.com',
  'facebook.com',
] as const;
