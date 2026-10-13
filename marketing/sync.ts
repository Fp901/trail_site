// Create or update the marketing team on Managed Agents (CLAUDE.md Part 18). Idempotent: every
// resource is found by name and updated in place, so it is safe to run after any change to
// marketing/agents/*.ts, config.ts or the brand skill.
//
//   DRY_RUN=true  npx tsx marketing/sync.ts          prints the plan, makes no API call (the default)
//   DRY_RUN=false npx tsx marketing/sync.ts          creates or updates everything
//   npx tsx marketing/sync.ts --check                read-only: fails unless the live brand skill
//                                                    matches SKILL.md and every agent pins it
//
// The brand skill (.claude/skills/rooiberg-brand/SKILL.md) goes up once through the Skills API and
// is attached to every employee by id. A new skill version is uploaded only when the file's
// sha256 differs from the one recorded in the latest version's description.
//
// Needs ANTHROPIC_API_KEY, MARKETING_TOOLS_TOKEN and PUBLIC_SITE_URL when live; --check needs only
// ANTHROPIC_API_KEY.
import { toFile } from '@anthropic-ai/sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { EMPLOYEES } from './agents';
import {
  ENVIRONMENT_NAME,
  RESEARCH_ENVIRONMENT_NAME,
  TEAM_TAG,
  TOOL_SERVER_PATH,
  VAULT_NAME,
  toolServerUrl,
} from './config';
import { RESEARCH_HOSTS } from './brief';
import {
  SKILL_DISPLAY_NAME,
  SKILL_NAME,
  agentParams,
  environmentSpecs,
  brandSkillBody,
  brandSkillFile,
  hashFromVersionDescription,
  seedMemories,
  skillContentHash,
  skillUploadContent,
  type SkillRef,
} from './build';
import { employeeToolToken } from '../src/lib/marketing-auth';
import {
  ALL_STORE_NAMES,
  anthropic,
  findAgent,
  findEnvironment,
  findMemoryStores,
  findSkill,
  findVault,
  requireEnv,
} from './resources';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const CHECK = process.argv.includes('--check');
const siteUrl = process.env.PUBLIC_SITE_URL || 'https://www.rooibergwander.co.za';
const skillFile = brandSkillFile();
const skillHash = skillContentHash(skillFile);
const skillBody = brandSkillBody();

function isConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === 409;
}

const skillUpload = () =>
  toFile(Buffer.from(skillUploadContent(skillFile), 'utf8'), `${SKILL_NAME}/SKILL.md`, { type: 'text/markdown' });

// The live brand skill and the hash its latest version was uploaded from (null if none).
async function liveSkill(client: Anthropic): Promise<{ ref: SkillRef; liveHash: string | null } | null> {
  const found = await findSkill(client, SKILL_DISPLAY_NAME);
  if (!found) return null;
  const latest = await client.skills.versions.retrieve(found.latest_version_id, { skill_id: found.id });
  return { ref: { skill_id: found.id, version: latest.id }, liveHash: hashFromVersionDescription(latest.description) };
}

// Upload the skill once, then a new version only when SKILL.md changed.
async function ensureSkill(client: Anthropic): Promise<SkillRef> {
  const live = await liveSkill(client);
  if (!live) {
    const created = await client.skills.create({ display_name: SKILL_DISPLAY_NAME, files: [await skillUpload()] });
    console.log(`Brand skill uploaded: ${created.id} (sha256 ${skillHash.slice(0, 12)})`);
    return { skill_id: created.id, version: created.latest_version_id };
  }
  if (live.liveHash === skillHash) {
    console.log(`Brand skill unchanged: ${live.ref.skill_id} version ${live.ref.version}`);
    return live.ref;
  }
  const version = await client.skills.versions.create(live.ref.skill_id, { files: [await skillUpload()] });
  console.log(`Brand skill new version: ${version.id} (sha256 ${skillHash.slice(0, 12)})`);
  return { skill_id: live.ref.skill_id, version: version.id };
}

// --check: read-only. Fails when the live skill differs from SKILL.md or an agent does not pin it.
async function check(): Promise<void> {
  const client = anthropic();
  const problems: string[] = [];
  const live = await liveSkill(client);
  if (!live) {
    problems.push(`No skill named "${SKILL_DISPLAY_NAME}". Run the sync job.`);
  } else {
    if (live.liveHash !== skillHash) {
      problems.push(`Live brand skill (sha256 ${live.liveHash?.slice(0, 12) ?? 'unknown'}) differs from SKILL.md (sha256 ${skillHash.slice(0, 12)}).`);
    }
    for (const e of EMPLOYEES) {
      const name = agentParams(e, siteUrl, live.ref).name;
      const agent = await findAgent(client, name);
      const pinned = agent?.skills?.some((s) => s.type === 'custom' && s.skill_id === live.ref.skill_id && s.version === live.ref.version);
      if (!pinned) problems.push(`${name} does not use the latest brand skill version.`);
    }
  }
  if (problems.length) {
    for (const p of problems) console.error(`FAIL  ${p}`);
    process.exit(1);
  }
  console.log(`PASS  the live brand skill matches SKILL.md (sha256 ${skillHash.slice(0, 12)}) and every agent pins it.`);
}

async function main() {
  if (CHECK) return check();
  const seeds = seedMemories(skillBody);

  if (DRY_RUN) {
    const agents = EMPLOYEES.map((e) => agentParams(e, siteUrl, { skill_id: '<brand skill id>', version: '<latest>' }));
    console.log('DRY RUN: nothing is created or changed. Set DRY_RUN=false to apply.\n');
    console.log(`Brand skill: "${SKILL_DISPLAY_NAME}" from SKILL.md (sha256 ${skillHash.slice(0, 12)}), uploaded only if it changed, attached to every agent`);
    console.log(`Tool server: ${siteUrl.replace(/\/$/, '')}${TOOL_SERVER_PATH}/<employee>, one URL and derived token each`);
    console.log(`Environments: ${ENVIRONMENT_NAME}, ${RESEARCH_ENVIRONMENT_NAME} (Researcher: open web search and fetch; starting points: ${RESEARCH_HOSTS.join(', ')})`);
    console.log(`Vault: ${VAULT_NAME} (static bearer for the tool server)`);
    console.log(`Memory stores: ${ALL_STORE_NAMES.join(', ')}`);
    for (const a of agents) {
      const mcp = a.tools?.find((t) => t.type === 'mcp_toolset');
      const tools = mcp && 'configs' in mcp ? (mcp.configs ?? []).map((c) => c.name).join(', ') : '';
      console.log(`Agent: ${a.name} [${typeof a.model === 'string' ? a.model : a.model.id}] tools: ${tools}`);
    }
    return;
  }

  const client = anthropic();
  const token = requireEnv('MARKETING_TOOLS_TOKEN');

  // 1. Environments (environmentSpecs in build.ts): the team's limited one, and the Researcher's
  //    open one.
  for (const spec of environmentSpecs()) {
    const found = await findEnvironment(client, spec.name);
    if (found) {
      await client.beta.environments.update(found.id, { config: spec.config });
      console.log(`Environment updated: ${spec.name}`);
    } else {
      await client.beta.environments.create({ name: spec.name, config: spec.config, metadata: { team: TEAM_TAG } });
      console.log(`Environment created: ${spec.name}`);
    }
  }

  // 2. Vault holding the tool server's bearer tokens: one credential per employee, for that
  //    employee's own URL, holding its token derived from MARKETING_TOOLS_TOKEN
  //    (src/lib/marketing-auth.ts). The server works out who is calling from the URL and the
  //    token, and refuses every tool outside that employee's TOOL_ACCESS. No token ever appears in
  //    an agent or a session; the platform injects it when the agent calls the tool server.
  let vault = await findVault(client, VAULT_NAME);
  if (!vault) {
    vault = await client.beta.vaults.create({ display_name: VAULT_NAME, metadata: { team: TEAM_TAG } });
    console.log(`Vault created: ${VAULT_NAME}`);
  }
  const wanted = new Map(EMPLOYEES.map((e) => [toolServerUrl(siteUrl, e.key), e.key] as const));
  const existing = new Map<string, string>();
  const serverBase = siteUrl.replace(/\/$/, '') + TOOL_SERVER_PATH;
  for await (const c of client.beta.vaults.credentials.list(vault.id)) {
    if (c.archived_at || c.auth.type !== 'static_bearer') continue;
    const url = c.auth.mcp_server_url;
    if (wanted.has(url) && !existing.has(url)) {
      existing.set(url, c.id);
    } else if (url === serverBase || url.startsWith(serverBase + '/')) {
      // The milestone 1 shared credential (or a duplicate): retire it so no shared token remains.
      await client.beta.vaults.credentials.archive(c.id, { vault_id: vault.id });
      console.log(`Retired tool server credential for ${url}`);
    }
  }
  for (const [url, key] of wanted) {
    const derived = employeeToolToken(token, key);
    const id = existing.get(url);
    if (id) {
      await client.beta.vaults.credentials.update(id, { vault_id: vault.id, auth: { type: 'static_bearer', token: derived } });
      console.log(`Tool server credential rotated: ${key}`);
    } else {
      await client.beta.vaults.credentials.create(vault.id, {
        display_name: `Rooiberg tool server (${key})`,
        auth: { type: 'static_bearer', mcp_server_url: url, token: derived },
      });
      console.log(`Tool server credential created: ${key}`);
    }
  }

  // 3. Memory stores, seeded once. A seed whose path already exists is left alone (409), so the
  //    team's own notes are never overwritten by a sync.
  const storeIds = await findMemoryStores(client);
  for (const name of ALL_STORE_NAMES) {
    if (!storeIds[name]) {
      const store = await client.beta.memoryStores.create({ name, metadata: { team: TEAM_TAG } });
      storeIds[name] = store.id;
      console.log(`Memory store created: ${name}`);
    }
    for (const seed of seeds[name] ?? []) {
      try {
        await client.beta.memoryStores.memories.create(storeIds[name], seed);
        console.log(`  seeded ${name}${seed.path}`);
      } catch (err) {
        if (!isConflict(err)) throw err;
      }
    }
  }

  // 4. The brand skill, then the agents. Each agent update creates a new agent version; sessions
  //    pin the latest at start, and every agent pins the brand skill version verified here.
  const skillRef = await ensureSkill(client);
  const agents = EMPLOYEES.map((e) => agentParams(e, siteUrl, skillRef));
  for (const params of agents) {
    const found = await findAgent(client, params.name);
    if (found) {
      await client.beta.agents.update(found.id, { ...params, version: found.version });
      console.log(`Agent updated: ${params.name}`);
    } else {
      await client.beta.agents.create(params);
      console.log(`Agent created: ${params.name}`);
    }
  }
  console.log('\nSync complete.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
