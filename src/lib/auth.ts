// Operator-dashboard auth (Part 3). Supabase Auth, email+password, a single admin account created
// manually in the Supabase dashboard. No new dependency: we use the existing @supabase/supabase-js
// anon client to sign in and to VERIFY the access token server-side on every admin request.
//
// Session is stored in two httpOnly, SameSite=Lax cookies (never readable by JS, so XSS cannot
// exfiltrate them). Every admin page calls getAdminUser() server-side — there is NO client-side-only
// gate. If ADMIN_EMAIL is set, only that address may sign in (defence-in-depth: even a stray
// Supabase Auth user cannot reach the dashboard).
import type { AstroCookies } from 'astro';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const ACCESS = 'sb-access-token';
const REFRESH = 'sb-refresh-token';

// Anon client with session persistence/refresh OFF — we manage tokens via cookies ourselves and
// run entirely server-side. Built lazily so the build never depends on the keys being present.
function authClient(): SupabaseClient {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase auth is not configured.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cookieOpts(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: import.meta.env.PROD, // allow http://localhost in dev; Secure in production
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function setSessionCookies(
  cookies: AstroCookies,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number | undefined,
): void {
  cookies.set(ACCESS, accessToken, cookieOpts(expiresInSeconds ?? 3600));
  cookies.set(REFRESH, refreshToken, cookieOpts(60 * 60 * 24 * 30)); // 30 days
}

export function clearSessionCookies(cookies: AstroCookies): void {
  cookies.delete(ACCESS, { path: '/' });
  cookies.delete(REFRESH, { path: '/' });
}

// Returns true only if no ADMIN_EMAIL(S) is set (any auth user allowed) or the signed-in email is
// in the comma-separated allow-list (case-insensitive). Supports both ADMIN_EMAILS (preferred) and
// the legacy ADMIN_EMAIL single-value variable.
function isAllowedAdmin(email: string | undefined): boolean {
  const raw = (import.meta.env.ADMIN_EMAILS ?? import.meta.env.ADMIN_EMAIL ?? '').trim();
  if (!raw) return true;
  const allowed = raw.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) return true;
  return !!email && allowed.includes(email.trim().toLowerCase());
}

// Sign in with email+password. On success sets the session cookies and returns the user; on bad
// credentials or a disallowed email returns null (caller shows a generic error — no enumeration).
export async function signInAdmin(
  cookies: AstroCookies,
  email: string,
  password: string,
): Promise<User | null> {
  const supabase = authClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) return null;
  if (!isAllowedAdmin(data.user.email)) return null;
  setSessionCookies(
    cookies,
    data.session.access_token,
    data.session.refresh_token,
    data.session.expires_in,
  );
  return data.user;
}

// Verify the current request's session SERVER-SIDE. Validates the access token against Supabase
// Auth; if it has expired but a refresh token is present, transparently refreshes and re-sets the
// cookies. Returns the authenticated admin User, or null if there is no valid session.
export async function getAdminUser(cookies: AstroCookies): Promise<User | null> {
  const access = cookies.get(ACCESS)?.value;
  const refresh = cookies.get(REFRESH)?.value;
  if (!access && !refresh) return null;

  let supabase: SupabaseClient;
  try {
    supabase = authClient();
  } catch {
    return null; // auth not configured
  }

  if (access) {
    const { data, error } = await supabase.auth.getUser(access);
    if (!error && data.user && isAllowedAdmin(data.user.email)) return data.user;
  }

  if (refresh) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refresh });
    if (!error && data.session && data.user && isAllowedAdmin(data.user.email)) {
      setSessionCookies(
        cookies,
        data.session.access_token,
        data.session.refresh_token,
        data.session.expires_in,
      );
      return data.user;
    }
  }

  return null;
}

// Ending the session = clearing the httpOnly cookies. The tokens are never persisted server-side,
// so once the cookies are gone the browser cannot present them again.
export function signOutAdmin(cookies: AstroCookies): void {
  clearSessionCookies(cookies);
}
