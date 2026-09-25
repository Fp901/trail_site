// One-time discount codes: static security checks (migration 0020, Part 11).
// Run: npx tsx scripts/verify-discounts.mjs
//
// The behaviour of the claim itself (one UPDATE, so a code cannot be claimed twice) needs a live
// database: run scripts/verify-discount.sql in the Supabase SQL editor. This script guards the
// properties that live in source and could quietly regress in a later edit:
//   A. the code format is unguessable and only hashes are stored;
//   B. the table is default-deny and the claim function is service-role only;
//   C. the browser can never set the percentage;
//   D. every code attempt is rate limited, and every refusal reads the same;
//   E. a free booking is processor 'code', not 'comp', so the booking windows still apply;
//   F. no discount code logic or hash reaches the client bundle.
import { readFileSync } from 'node:fs';
import {
  CODE_ALPHABET,
  CODE_BODY_LENGTH,
  generateCode,
  normaliseCode,
  isWellFormed,
  hashCode,
  formatCode,
} from '../src/lib/discount-code-format.ts';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 66 - t.length))}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const sql = read('supabase/migrations/0020_discount_codes.sql');
const actions = read('src/actions/index.ts');
const discounts = read('src/lib/discounts.ts');
const widget = read('src/components/BookingWidget.astro');
const script = read('scripts/discount-codes.mjs');

// The createCheckout block alone, so checks below cannot be satisfied by another action.
const checkoutSrc = actions.slice(actions.indexOf('createCheckout: defineAction'), actions.indexOf('checkDiscountCode: defineAction'));
const previewSrc = actions.slice(actions.indexOf('checkDiscountCode: defineAction'), actions.indexOf('checkBookingStatus: defineAction'));
const checkoutInput = checkoutSrc.slice(checkoutSrc.indexOf('input: z.object({'), checkoutSrc.indexOf('handler:'));

section('A. Format and storage');
const bits = CODE_BODY_LENGTH * Math.log2(CODE_ALPHABET.length);
assert(`a code carries at least 64 random bits (has ${bits.toFixed(1)})`, bits >= 64);
assert('the alphabet has no look-alikes (0, O, 1, I, L)', !/[01OIL]/.test(CODE_ALPHABET));
const sample = Array.from({ length: 2000 }, () => generateCode());
assert('2,000 generated codes are all well formed and all distinct',
  sample.every(isWellFormed) && new Set(sample).size === sample.length);
const c = sample[0];
assert('input is forgiving: lower case, spaces and dashes normalise to the same code',
  normaliseCode(formatCode(c).toLowerCase().replace(/-/g, ' ')) === c);
assert('junk and near-misses are refused before any database call',
  !isWellFormed(normaliseCode('RW-0000-0000-0000-0000')) && !isWellFormed(normaliseCode(c.slice(0, -1))) &&
  !isWellFormed(normaliseCode(`${c}A`)));
assert('the hash is SHA-256 hex', /^[0-9a-f]{64}$/.test(hashCode(c)));
assert('the table stores a hash and a 4-character hint, never the code',
  /code_hash\s+text not null unique/.test(sql) && /code_hint/.test(sql) && !/\bcode\s+text\b/.test(sql));
assert('the generator inserts only hash, hint, percent, expiry and note',
  /code_hash: hashCode\(c\)/.test(script) && !/code:\s*c\b/.test(script));

section('B. Database access');
assert('RLS is enabled on discount_codes', /alter table public\.discount_codes enable row level security/.test(sql));
assert('anon and authenticated have no table access', /revoke all on public\.discount_codes from anon, authenticated/.test(sql));
assert('no RLS policy grants anyone access', !/create policy/i.test(sql));
assert('the percent can only be 50 or 100', /percent\s+int\s+not null check \(percent in \(50, 100\)\)/.test(sql));
assert('the claim is one UPDATE that only takes an available or lapsed, unexpired code',
  /update public\.discount_codes c/.test(sql) &&
  /c\.status = 'available' or \(c\.status = 'reserved' and c\.reserved_until < now\(\)\)/.test(sql) &&
  /c\.expires_at is null or c\.expires_at > now\(\)/.test(sql));
assert('the claim function pins search_path and is executable by service_role only',
  /set search_path = ''/.test(sql) &&
  /revoke all on function public\.reserve_discount_code\(text, timestamptz\) from public, anon, authenticated/.test(sql) &&
  /grant execute on function public\.reserve_discount_code\(text, timestamptz\) to service_role/.test(sql));

section('C. The browser never sets the percentage');
assert('createCheckout accepts a code string and nothing named percent or discount amount',
  /discountCode: z\.string\(\)\.trim\(\)\.max\(40\)\.optional\(\)/.test(checkoutInput) &&
  !/percent|discountCents|discount_cents/i.test(checkoutInput.replace(/\/\/.*$/gm, '')));
assert('the checkout reprices with the percentage from the claimed row',
  /computeQuote\(\{ \.\.\.quoteInput, discountPercent: code\.percent \}\)/.test(checkoutSrc));
assert('the widget sends the code, and no percentage, in the payload',
  /discountCode: appliedCode \|\| undefined/.test(widget) && !/discountPercent:/.test(widget.slice(widget.indexOf('const payload = {'))
    .slice(0, 1200)));

section('D. Rate limits and one message');
assert('the shared code limit is 5 a minute and 20 a day per IP',
  /rateLimit\(`discount:min:\$\{ip\}`, 5, 60\)/.test(discounts) && /rateLimit\(`discount:day:\$\{ip\}`, 20, 86_400\)/.test(discounts));
assert('createCheckout checks the code limit before any code lookup',
  checkoutSrc.indexOf('codeAttemptAllowed(ip)') > -1 &&
  checkoutSrc.indexOf('codeAttemptAllowed(ip)') < checkoutSrc.indexOf('reserveCode('));
assert('the preview checks the code limit before any lookup',
  previewSrc.indexOf('codeAttemptAllowed(') > -1 && previewSrc.indexOf('codeAttemptAllowed(') < previewSrc.indexOf('previewCode('));
assert('the preview returns one message for every kind of failure',
  (previewSrc.match(/message: CODE_REJECTED_MESSAGE/g) ?? []).length === 1 && !/expired|redeemed|void/i.test(previewSrc.replace(/\/\/.*$/gm, '')));
assert('checkout refusals use the same one message', (checkoutSrc.match(/CODE_REJECTED_MESSAGE/g) ?? []).length >= 2);
assert('a failed booking insert gives the claimed code back', /if \(\(error \|\| !data\) && code\) await releaseCode\(code\.id\)/.test(checkoutSrc));

section('E. Free bookings');
assert("a fully covered booking is processor 'code', never 'comp' (so the booking window guard applies)",
  /processor: 'code'/.test(checkoutSrc) && !/processor: 'comp'/.test(checkoutSrc));
assert('a free booking is only possible when a code was claimed and the total is R0',
  /const isFree = !!code && quote\.totalCents === 0;/.test(checkoutSrc));
assert('the webhook redeems the code when payment is confirmed',
  /redeemCode\(booking\.discount_code_id, booking\.id\)/.test(read('src/pages/api/payments/webhook.ts')));
assert('the cancel page gives a still-reserved code back',
  /releaseCode\(updated\.discount_code_id\)/.test(read('src/pages/booking/cancel.astro')));

section('F. Nothing leaks to the client');
const clientScript = widget.slice(widget.indexOf('<script>'));
assert('the widget script imports no discount module and hashes nothing',
  !/discount-code-format|lib\/discounts|createHash|sha256/i.test(clientScript));
assert('lib/discounts.ts is server-only (service-role client)', /getSupabaseAdmin/.test(discounts));

console.log(`\n${failed === 0 ? 'ALL DISCOUNT CHECKS PASSED' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
