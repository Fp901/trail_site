// Supabase clients (Part 9.3 / 11.5). LAZY creation so the build never fails when secrets are
// absent — they are only read when a client is first used at runtime.
//   - admin: service-role key, SERVER ONLY (all booking writes go through this).
//   - anon : public anon key, limited by RLS to the availability view.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let admin: SupabaseClient | null = null;
let anon: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase admin client is not configured. Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  admin = createClient(url, key, { auth: { persistSession: false } });
  return admin;
}

export function getSupabaseAnon(): SupabaseClient {
  if (anon) return anon;
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase anon client is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  anon = createClient(url, key, { auth: { persistSession: false } });
  return anon;
}
