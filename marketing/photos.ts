// The actual photos, not just their alt text (owner request, 16 October 2026). The runner looks up
// a slot's or a draft's photos on the Rooiberg tool server, as the Copywriter (the same
// get_photo_library tool and per-employee token the agents use, so nothing new is exposed), and
// attaches them to the Copywriter's and the Editor's task as images. Seeing the photo is what lets
// the words and the picture tell one moment.
//
// Best-effort: without MARKETING_TOOLS_TOKEN or when the server cannot answer, the task goes out
// with the photo ids only, as before.
import { employeeToolToken } from '../src/lib/marketing-auth';

const PER_CALL = 10; // get_photo_library accepts at most 10 ids

export interface SeenPhoto {
  id: string;
  url: string;
  alt: string;
}

export async function photosById(ids: string[], env: NodeJS.ProcessEnv = process.env): Promise<SeenPhoto[]> {
  const secret = env.MARKETING_TOOLS_TOKEN;
  const wanted = [...new Set(ids)];
  if (!secret || wanted.length === 0) return [];
  const site = (env.PUBLIC_SITE_URL || 'https://www.rooibergwander.co.za').replace(/\/$/, '');
  const found = new Map<string, SeenPhoto>();
  for (let i = 0; i < wanted.length; i += PER_CALL) {
    try {
      const res = await fetch(`${site}/api/marketing/mcp/copywriter`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${employeeToolToken(secret, 'copywriter')}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get_photo_library', arguments: { ids: wanted.slice(i, i + PER_CALL) } },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await res.json()) as { result?: { content?: { text?: string }[] } };
      const data = JSON.parse(body.result?.content?.[0]?.text ?? '{}') as { photos?: { id?: unknown; url?: unknown; alt?: unknown }[] };
      for (const p of data.photos ?? []) {
        if (typeof p.id === 'string' && typeof p.url === 'string' && p.url.startsWith('https://')) {
          found.set(p.id, { id: p.id, url: p.url, alt: typeof p.alt === 'string' ? p.alt : '' });
        }
      }
    } catch {
      // Best-effort: the agent still has the ids and can look them up itself.
    }
  }
  return wanted.flatMap((id) => (found.has(id) ? [found.get(id)!] : []));
}
