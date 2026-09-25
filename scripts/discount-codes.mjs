// One-time discount codes: generate, list and void (migration 0020). Operator tool, run locally.
//
//   npx tsx --env-file=.env scripts/discount-codes.mjs generate --percent 50 --count 10
//   npx tsx --env-file=.env scripts/discount-codes.mjs generate --percent 100 --count 10 --expires 2027-12-31 --note "Launch gifts"
//   npx tsx --env-file=.env scripts/discount-codes.mjs list [--status available|reserved|redeemed|void]
//   npx tsx --env-file=.env scripts/discount-codes.mjs void --hint ABCD
//
// `generate` prints each code ONCE. Only a SHA-256 hash of it is stored, so a lost code cannot be
// recovered: void it and generate another. Keep the printed list somewhere private.
//
// Uses SUPABASE_SERVICE_ROLE_KEY from .env. This script runs on your machine only; it is not part
// of the site and never ships to a browser.
import { createClient } from '@supabase/supabase-js';
import {
  generateCode,
  hashCode,
  codeHint,
  formatCode,
} from '../src/lib/discount-code-format.ts';

const PERCENTS = [50, 100];
const MAX_COUNT = 100;
const STATUSES = ['available', 'reserved', 'redeemed', 'void'];

function fail(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      out[key] = next && !next.startsWith('--') ? (i++, next) : true;
    } else out._.push(a);
  }
  return out;
}

function client() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Run with --env-file=.env.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function generate(opts) {
  const percent = Number(opts.percent);
  if (!PERCENTS.includes(percent)) fail('--percent must be 50 or 100.');
  const count = Number(opts.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    fail(`--count must be a whole number from 1 to ${MAX_COUNT}.`);
  }
  let expiresAt = null;
  if (opts.expires) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.expires)) fail('--expires must be a date like 2027-12-31.');
    // Valid through the whole of that day, South African time (UTC+2).
    expiresAt = new Date(`${opts.expires}T23:59:59+02:00`).toISOString();
    if (Date.parse(expiresAt) <= Date.now()) fail('--expires must be in the future.');
  }
  const note = typeof opts.note === 'string' ? opts.note.slice(0, 200) : null;

  const codes = Array.from({ length: count }, () => generateCode());
  const rows = codes.map((c) => ({
    code_hash: hashCode(c),
    code_hint: codeHint(c),
    percent,
    expires_at: expiresAt,
    note,
  }));

  const { error } = await client().from('discount_codes').insert(rows);
  if (error) fail(`Could not save the codes: ${error.message}. Nothing was created.`);

  console.log(`\n  ${count} x ${percent}% codes${expiresAt ? `, valid until ${opts.expires}` : ', no expiry'}${note ? ` (${note})` : ''}:\n`);
  for (const c of codes) console.log(`    ${formatCode(c)}`);
  console.log('\n  These are shown ONCE and cannot be recovered. Store them somewhere private now.\n');
}

async function list(opts) {
  let q = client()
    .from('discount_codes')
    .select('code_hint, percent, status, expires_at, reserved_until, redeemed_at, booking_id, note, created_at')
    .order('created_at', { ascending: true });
  if (opts.status) {
    if (!STATUSES.includes(opts.status)) fail(`--status must be one of: ${STATUSES.join(', ')}.`);
    q = q.eq('status', opts.status);
  }
  const { data, error } = await q;
  if (error) fail(`Could not read the codes: ${error.message}`);
  if (!data.length) return console.log('\n  No codes.\n');
  const now = Date.now();
  console.table(
    data.map((r) => ({
      ends: `...${r.code_hint}`,
      percent: `${r.percent}%`,
      // A reservation that has lapsed is free again; say so rather than show a stale 'reserved'.
      status:
        r.status === 'reserved' && r.reserved_until && Date.parse(r.reserved_until) < now
          ? 'available (hold lapsed)'
          : r.expires_at && Date.parse(r.expires_at) <= now && r.status === 'available'
            ? 'expired'
            : r.status,
      expires: r.expires_at ? r.expires_at.slice(0, 10) : '',
      redeemed: r.redeemed_at ? r.redeemed_at.slice(0, 10) : '',
      booking: r.booking_id ?? '',
      note: r.note ?? '',
    })),
  );
}

async function voidCode(opts) {
  const hint = typeof opts.hint === 'string' ? opts.hint.toUpperCase() : '';
  if (!/^[A-Z0-9]{4}$/.test(hint)) fail('--hint must be the last 4 characters of the code.');
  const supabase = client();
  const { data: matches, error } = await supabase
    .from('discount_codes')
    .select('id, percent, status')
    .eq('code_hint', hint)
    .in('status', ['available', 'reserved']);
  if (error) fail(`Could not read the codes: ${error.message}`);
  if (!matches.length) fail(`No unused code ends in ${hint}.`);
  if (matches.length > 1) {
    fail(`${matches.length} unused codes end in ${hint}. Void by hand in the Supabase table editor.`);
  }
  const { error: upErr } = await supabase
    .from('discount_codes')
    .update({ status: 'void' })
    .eq('id', matches[0].id)
    .in('status', ['available', 'reserved']);
  if (upErr) fail(`Could not void the code: ${upErr.message}`);
  console.log(`\n  Voided the ${matches[0].percent}% code ending ${hint}.\n`);
}

const opts = args(process.argv.slice(2));
const command = opts._[0];
if (command === 'generate') await generate(opts);
else if (command === 'list') await list(opts);
else if (command === 'void') await voidCode(opts);
else {
  console.log(`
  Usage:
    npx tsx --env-file=.env scripts/discount-codes.mjs generate --percent 50|100 --count N [--expires YYYY-MM-DD] [--note "..."]
    npx tsx --env-file=.env scripts/discount-codes.mjs list [--status available|reserved|redeemed|void]
    npx tsx --env-file=.env scripts/discount-codes.mjs void --hint ABCD
`);
  process.exit(command ? 1 : 0);
}
