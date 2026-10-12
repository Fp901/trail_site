// The Rooiberg tool server (CLAUDE.md Part 18): one authenticated MCP endpoint (Streamable HTTP,
// JSON responses, no server-sent stream) that the marketing agents reach through their Managed
// Agents vault. prerender=false.
//
// AUTH. `Authorization: Bearer <MARKETING_TOOLS_TOKEN>`, compared in constant time over SHA-256
// digests so neither the value nor its length leaks through timing. FAILS CLOSED: with the token
// unset, every request is refused, the same convention as CRON_SECRET.
//
// SURFACE. Exactly the five tools in lib/marketing-tools.ts. Four read; save_draft only inserts a
// pending draft. No tool publishes, posts, emails or sends, and none can change or delete a row.
import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { listTools, callTool } from '../../../lib/marketing-tools';

export const prerender = false;

const SERVER_INFO = { name: 'rooiberg-tools', version: '1.0.0' };
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY_BYTES = 64 * 1024;

function authorized(request: Request): boolean {
  const secret = import.meta.env.MARKETING_TOOLS_TOKEN;
  if (!secret) return false;
  const digest = (v: string) => crypto.createHash('sha256').update(v).digest();
  return crypto.timingSafeEqual(
    digest(request.headers.get('authorization') ?? ''),
    digest(`Bearer ${secret}`),
  );
}

type JsonRpcId = string | number | null;
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
const result = (id: JsonRpcId, value: unknown) => reply({ jsonrpc: '2.0', id, result: value });
const rpcError = (id: JsonRpcId, code: number, message: string, status = 200) =>
  reply({ jsonrpc: '2.0', id, error: { code, message } }, status);

export const POST: APIRoute = async ({ request }) => {
  if (!authorized(request)) return new Response('Unauthorized', { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return rpcError(null, -32600, 'Request too large', 413);

  let msg: { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };
  try {
    msg = JSON.parse(raw);
  } catch {
    return rpcError(null, -32700, 'Parse error', 400);
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(null, -32600, 'Invalid request', 400);
  }

  // Notifications (no id) are acknowledged and need no body.
  if (msg.id === undefined) return new Response(null, { status: 202 });
  const id = msg.id;

  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '');
      return result(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Rooiberg Wander marketing tools. Read facts fresh with get_facts_pack; save work with save_draft. Nothing here publishes or sends.',
      });
    }
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, { tools: listTools() });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const out = await callTool(name, msg.params?.arguments);
      return result(id, { content: [{ type: 'text', text: out.text }], isError: out.isError === true });
    }
    default:
      return rpcError(id, -32601, 'Method not found');
  }
};

// No server-initiated stream and no session to end.
export const GET: APIRoute = () => new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
export const DELETE: APIRoute = () => new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
