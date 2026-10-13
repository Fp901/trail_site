// Per-employee bearer tokens for the Rooiberg tool server (CLAUDE.md Part 18).
//
// Each marketing employee reaches the tool server on its own URL (/api/marketing/mcp/<employee>)
// with its own token, derived from the one MARKETING_TOOLS_TOKEN secret:
//
//   token(employee) = base64url(HMAC-SHA256(MARKETING_TOOLS_TOKEN, "rooiberg-tools:" + employee))
//
// marketing/sync.ts stores each derived token in the Managed Agents vault against that employee's
// URL; the route recomputes it and compares in constant time. So a request that proves it holds
// the Editor's token is the Editor, and the server can refuse every tool not in
// TOOL_ACCESS.editor. Only one secret is ever configured or rotated.
import crypto from 'node:crypto';

export function employeeToolToken(secret: string, employee: string): string {
  return crypto.createHmac('sha256', secret).update(`rooiberg-tools:${employee}`).digest('base64url');
}

// Constant-time equality over SHA-256 digests, so neither the value nor its length leaks.
export function sameSecret(got: string, want: string): boolean {
  const digest = (v: string) => crypto.createHash('sha256').update(v).digest();
  return crypto.timingSafeEqual(digest(got), digest(want));
}
