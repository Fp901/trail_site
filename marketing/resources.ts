// Find Managed Agents resources by name. The sync script creates them and the runner looks them up
// with the same names (config.ts), so no IDs are stored anywhere. list() has no name filter, so each
// helper walks the pages.
import Anthropic from '@anthropic-ai/sdk';
import { EMPLOYEE_KEYS, PLAYBOOK_STORE_NAME, notebookStoreName } from './config';

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

export function anthropic(): Anthropic {
  return new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
}

export const ALL_STORE_NAMES = [PLAYBOOK_STORE_NAME, ...EMPLOYEE_KEYS.map(notebookStoreName)];

export async function findAgent(client: Anthropic, name: string) {
  for await (const a of client.beta.agents.list()) {
    if (a.name === name && !a.archived_at) return a;
  }
  return null;
}

export async function findEnvironment(client: Anthropic, name: string) {
  for await (const e of client.beta.environments.list()) {
    if (e.name === name && !e.archived_at) return e;
  }
  return null;
}

export async function findVault(client: Anthropic, name: string) {
  for await (const v of client.beta.vaults.list()) {
    if (v.display_name === name && !v.archived_at) return v;
  }
  return null;
}

export async function findMemoryStores(client: Anthropic): Promise<Record<string, string>> {
  const wanted = new Set(ALL_STORE_NAMES);
  const ids: Record<string, string> = {};
  for await (const s of client.beta.memoryStores.list()) {
    if (wanted.has(s.name) && !s.archived_at && !ids[s.name]) ids[s.name] = s.id;
  }
  return ids;
}
