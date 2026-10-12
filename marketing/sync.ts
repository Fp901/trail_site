// Create or update the marketing team on Managed Agents (CLAUDE.md Part 18). Idempotent: every
// resource is found by name and updated in place, so it is safe to run after any change to
// marketing/agents/*.ts, config.ts or the brand skill.
//
//   DRY_RUN=true  npx tsx marketing/sync.ts   prints the plan, makes no API call (the default)
//   DRY_RUN=false npx tsx marketing/sync.ts   creates or updates everything
//
// Needs ANTHROPIC_API_KEY, MARKETING_TOOLS_TOKEN and PUBLIC_SITE_URL when live.
import { EMPLOYEES } from './agents';
import {
  ENVIRONMENT_NAME,
  RESEARCH_ENVIRONMENT_NAME,
  RESEARCH_HOSTS,
  TEAM_TAG,
  VAULT_NAME,
  toolServerUrl,
} from './config';
import { agentParams, brandSkillBody, seedMemories } from './build';
import {
  ALL_STORE_NAMES,
  anthropic,
  findAgent,
  findEnvironment,
  findMemoryStores,
  findVault,
  requireEnv,
} from './resources';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const siteUrl = process.env.PUBLIC_SITE_URL || 'https://www.rooibergwander.co.za';
const skill = brandSkillBody();

function isConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === 409;
}

async function main() {
  const agents = EMPLOYEES.map((e) => agentParams(e, siteUrl, skill));
  const seeds = seedMemories(skill);

  if (DRY_RUN) {
    console.log('DRY RUN: nothing is created or changed. Set DRY_RUN=false to apply.\n');
    console.log(`Tool server: ${toolServerUrl(siteUrl)}`);
    console.log(`Environments: ${ENVIRONMENT_NAME}, ${RESEARCH_ENVIRONMENT_NAME} (web: ${RESEARCH_HOSTS.join(', ')})`);
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

  // 1. Environments. Both cloud with limited networking; MCP traffic is allowed so the agents can
  //    reach the tool server. Only the research environment can reach RESEARCH_HOSTS.
  const envSpecs = [
    { name: ENVIRONMENT_NAME, allowed_hosts: [] as string[] },
    { name: RESEARCH_ENVIRONMENT_NAME, allowed_hosts: [...RESEARCH_HOSTS] },
  ];
  for (const spec of envSpecs) {
    const config = {
      type: 'cloud' as const,
      networking: { type: 'limited' as const, allow_mcp_servers: true, allowed_hosts: spec.allowed_hosts },
    };
    const found = await findEnvironment(client, spec.name);
    if (found) {
      await client.beta.environments.update(found.id, { config });
      console.log(`Environment updated: ${spec.name}`);
    } else {
      await client.beta.environments.create({ name: spec.name, config, metadata: { team: TEAM_TAG } });
      console.log(`Environment created: ${spec.name}`);
    }
  }

  // 2. Vault holding the tool server's bearer token. The token never appears in an agent or a
  //    session; the platform injects it when the agent calls the tool server.
  const mcpUrl = toolServerUrl(siteUrl);
  let vault = await findVault(client, VAULT_NAME);
  if (!vault) {
    vault = await client.beta.vaults.create({ display_name: VAULT_NAME, metadata: { team: TEAM_TAG } });
    console.log(`Vault created: ${VAULT_NAME}`);
  }
  let credentialId: string | null = null;
  for await (const c of client.beta.vaults.credentials.list(vault.id)) {
    if (!c.archived_at && c.auth.type === 'static_bearer' && c.auth.mcp_server_url === mcpUrl) {
      credentialId = c.id;
      break;
    }
  }
  if (credentialId) {
    await client.beta.vaults.credentials.update(credentialId, {
      vault_id: vault.id,
      auth: { type: 'static_bearer', token },
    });
    console.log('Tool server credential rotated.');
  } else {
    await client.beta.vaults.credentials.create(vault.id, {
      display_name: 'Rooiberg tool server',
      auth: { type: 'static_bearer', mcp_server_url: mcpUrl, token },
    });
    console.log('Tool server credential created.');
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

  // 4. Agents. Each update creates a new agent version; sessions pin the latest at start.
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
