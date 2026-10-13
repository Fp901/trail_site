// Owner-edited briefs (CLAUDE.md Part 18). marketing/briefs/<employee>.md is plain Markdown the
// owner edits directly: everything outside the leading <!-- editing help --> comment becomes the
// employee's instructions, and for the Researcher the bullet lines under "## Sites" are the only
// hosts its web_search / web_fetch may reach (also the research environment's allowed_hosts).
// Node only: the website never imports this file.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const briefPath = (name: string) => fileURLToPath(new URL(`./briefs/${name}.md`, import.meta.url));

// The brief as sent to the agent: the editing-help comment removed.
export function briefText(name: string): string {
  return readFileSync(briefPath(name), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
}

// A bare hostname: lower case, at least one dot, no scheme, path or "www.".
const HOST = /^(?!www\.)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

// The "- host (note)" lines under "## Sites". Throws on a line that is not a bare hostname, so a
// typo fails the sync and the verify script instead of silently dropping a site.
export function briefSites(name: string): string[] {
  const text = briefText(name);
  const section = text.match(/^## Sites\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!section) throw new Error(`marketing/briefs/${name}.md has no "## Sites" section.`);
  const hosts: string[] = [];
  for (const line of section[1].split('\n')) {
    const m = line.match(/^\s*[-*]\s+(\S+)/);
    if (!m) continue;
    const host = m[1].toLowerCase().replace(/[.,;:]+$/, '');
    if (!HOST.test(host)) {
      throw new Error(`marketing/briefs/${name}.md, Sites: "${m[1]}" is not a bare website name (write e.g. getaway.co.za).`);
    }
    if (!hosts.includes(host)) hosts.push(host);
  }
  if (hosts.length === 0) throw new Error(`marketing/briefs/${name}.md lists no sites under "## Sites".`);
  return hosts;
}

// The Researcher's allowed hosts, read from its brief.
export const RESEARCH_HOSTS: readonly string[] = briefSites('researcher');
