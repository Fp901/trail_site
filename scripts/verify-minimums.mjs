// Group-formation minimums against the Booking & Pricing Policy dated 30 July 2026.
// Run: npx tsx scripts/verify-minimums.mjs
//
// The policy splits the OPENING minimum by catering (4 self-catered, 2 catered) but not the
// JOINING minimum (2, both products). That is enforced in three independent layers:
//
//   1. src/lib/pricing.ts  -> minToOpen() / MIN_TO_JOIN / canOpen()   (checked here)
//   2. src/actions/index.ts -> createCheckout                          (source-asserted here)
//   3. bookings_slot_guard  -> SQL, cannot import from (1)             (see scripts/verify-trigger.sql)
//
// Layer 3 needs a live database. Migration 0013 has never been applied, so it CANNOT be verified
// from here — scripts/verify-trigger.sql is the harness to run once it is applied. This script
// asserts the SQL text encodes the same numbers, which catches a drifting constant but not a
// logic error in plpgsql.
import { readFileSync } from 'node:fs';
import { minToOpen, MIN_TO_JOIN, canOpen } from '../src/lib/pricing.ts';
import {
  SHARED_OPEN_MIN_CATERED,
  SHARED_OPEN_MIN_UNCATERED,
  SHARED_TOPUP_MIN,
  MIN_PARTY_SIZE,
  MAX_GROUP_SIZE,
  EXCLUSIVE_SIZE,
} from '../src/data/rates.ts';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 68 - t.length))}`);

// ============================================================================================
section('1. Constants match the policy');
assert('opening minimum, self-catered = 4', SHARED_OPEN_MIN_UNCATERED === 4);
assert('opening minimum, catered      = 2', SHARED_OPEN_MIN_CATERED === 2);
assert('joining minimum, both         = 2', SHARED_TOPUP_MIN === 2);
assert('smallest party with any route = 2', MIN_PARTY_SIZE === 2);
assert('capacity = 8 and exclusive = 8', MAX_GROUP_SIZE === 8 && EXCLUSIVE_SIZE === 8);

// ============================================================================================
section('2. minToOpen() splits by catering; MIN_TO_JOIN does not');
assert('minToOpen("uncatered") === 4', minToOpen('uncatered') === 4);
assert('minToOpen("catered")   === 2', minToOpen('catered') === 2);
assert('MIN_TO_JOIN === 2', MIN_TO_JOIN === 2);
assert('catered opening floor equals the joining floor', minToOpen('catered') === MIN_TO_JOIN);
assert('self-catered opening floor is STRICTLY above the joining floor', minToOpen('uncatered') > MIN_TO_JOIN);

// ============================================================================================
section('3. The headline consequence: a party of 2 can open catered, not self-catered');
assert('canOpen(2, "catered")   === true', canOpen(2, 'catered') === true);
assert('canOpen(2, "uncatered") === false', canOpen(2, 'uncatered') === false);
assert('canOpen(3, "catered")   === true', canOpen(3, 'catered') === true);
assert('canOpen(3, "uncatered") === false', canOpen(3, 'uncatered') === false);
assert('canOpen(4, "uncatered") === true', canOpen(4, 'uncatered') === true);

// Full truth table 2..8 x both caterings, so a future off-by-one shows up as a diff.
section('4. Full truth table (party size x catering -> can open?)');
console.log('       size |  catered  | self-catered');
for (let n = MIN_PARTY_SIZE; n <= MAX_GROUP_SIZE; n++) {
  const c = canOpen(n, 'catered'), u = canOpen(n, 'uncatered');
  const wantC = n >= 2, wantU = n >= 4;
  const ok = c === wantC && u === wantU;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}    ${n}   |   ${c ? 'open ' : 'join '}   |   ${u ? 'open ' : 'join '}`);
  if (!ok) failed++;
}

// ============================================================================================
section('5. createCheckout uses minToOpen(), not a flat constant');
const actions = readFileSync(new URL('../src/actions/index.ts', import.meta.url), 'utf8');
assert('imports minToOpen from lib/pricing', /minToOpen,?\s*\n?\s*} from '\.\.\/lib\/pricing'/.test(actions) || /minToOpen/.test(actions));
assert('calls minToOpen(input.catering) in the opening branch', /minToOpen\(input\.catering\)/.test(actions));
assert('no flat SHARED_OPEN_MIN identifier survives', !/\bSHARED_OPEN_MIN\b(?!_)/.test(actions));
assert('zod floor is MIN_PARTY_SIZE, not 1', /groupSize: z\.number\(\)\.int\(\)\.min\(MIN_PARTY_SIZE\)/.test(actions));
assert('joining branch still gates on SHARED_TOPUP_MIN', /input\.groupSize < SHARED_TOPUP_MIN/.test(actions));
assert('maps the generic RW_SHARED_OPEN_MIN trigger code', /RW_SHARED_OPEN_MIN(?!_)/.test(actions));

// ============================================================================================
section('6. The trigger SQL encodes the same split (text assertion only)');
const sql = readFileSync(new URL('../supabase/migrations/0013_booking_v2.sql', import.meta.url), 'utf8');
assert('declares v_min_open', /v_min_open\s+int;/.test(sql));
assert("sets it to 2 when catered else 4", /v_min_open\s*:=\s*case\s+when\s+new\.catering\s*=\s*'catered'\s+then\s+2\s+else\s+4\s+end;/i.test(sql));
assert('compares group_size against v_min_open', /new\.group_size\s*<\s*v_min_open/.test(sql));
assert('raises the generic RW_SHARED_OPEN_MIN', /RW_SHARED_OPEN_MIN(?!_4)/.test(sql));
assert('no hardcoded "group_size < 4" survives', !/new\.group_size\s*<\s*4\b/.test(sql));
assert('top-up minimum is still a literal 2', /new\.group_size\s*<\s*2\b/.test(sql));
assert('the numbers in SQL agree with rates.ts', /then 2 else 4 end/.test(sql) && SHARED_OPEN_MIN_CATERED === 2 && SHARED_OPEN_MIN_UNCATERED === 4);

console.log(
  failed === 0
    ? '\nALL MINIMUM CHECKS PASSED\n(Layer 3 logic still needs scripts/verify-trigger.sql against a live DB.)'
    : `\n${failed} CHECK(S) FAILED`,
);
process.exit(failed === 0 ? 0 : 1);
