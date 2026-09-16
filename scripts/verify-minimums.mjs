// Group-formation rules: TypeScript vs the 0016 slot-guard trigger.
// Run: npx tsx scripts/verify-minimums.mjs
//
// The trigger cannot import from src/, so migration 0016 re-implements the group rules in SQL.
// That duplication is unavoidable at the DB layer, but it can be policed: this script parses the
// numbers back out of the migration and asserts they match the TypeScript. If someone raises the
// catered minimum in data/rates.ts and not in the trigger, the app would accept a booking the
// database then rejects (or worse, the other way round).
//
// It does NOT test the trigger's logic — that needs a live database, see scripts/verify-trigger.sql.
import { readFileSync } from 'node:fs';
import {
  MIN_PARTY_CATERED,
  MIN_PARTY_UNCATERED,
  MIN_TO_JOIN,
  MAX_GROUP_SIZE,
  minPartySize,
} from '../src/data/rates.ts';
import { bookingTypeFor } from '../src/lib/pricing.ts';

let failed = 0;
function assert(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) {
    if (detail) console.log(`        ${detail}`);
    failed++;
  }
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 66 - t.length))}`);

const sql = readFileSync(new URL('../supabase/migrations/0016_commercial_v4.sql', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../src/actions/index.ts', import.meta.url), 'utf8');
const pick = (re) => { const m = sql.match(re); return m ? Number(m[1]) : null; };

section('1. The TypeScript rules');
assert(`catered opens from ${MIN_PARTY_CATERED}`, minPartySize('catered') === MIN_PARTY_CATERED);
assert(`self-catered opens from ${MIN_PARTY_UNCATERED} (a full group)`, minPartySize('uncatered') === MIN_PARTY_UNCATERED);
assert(`joining an open date takes ${MIN_TO_JOIN}`, MIN_TO_JOIN === 2);
assert(`capacity is ${MAX_GROUP_SIZE} (two guides to eight walkers)`, MAX_GROUP_SIZE === 8);
assert('self-catered minimum equals capacity, so it is always a whole-trail booking',
  MIN_PARTY_UNCATERED === MAX_GROUP_SIZE);

section('2. The same numbers inside the 0016 trigger');
const sqlCapacity = pick(/c_capacity\s+constant int := (\d+)/);
const sqlCatered = pick(/c_min_catered\s+constant int := (\d+)/);
const sqlUncatered = pick(/c_min_uncatered\s+constant int := (\d+)/);
const sqlJoin = pick(/c_min_join\s+constant int := (\d+)/);
assert(`capacity: SQL ${sqlCapacity} === TS ${MAX_GROUP_SIZE}`, sqlCapacity === MAX_GROUP_SIZE);
assert(`catered minimum: SQL ${sqlCatered} === TS ${MIN_PARTY_CATERED}`, sqlCatered === MIN_PARTY_CATERED);
assert(`self-catered minimum: SQL ${sqlUncatered} === TS ${MIN_PARTY_UNCATERED}`, sqlUncatered === MIN_PARTY_UNCATERED);
assert(`join minimum: SQL ${sqlJoin} === TS ${MIN_TO_JOIN}`, sqlJoin === MIN_TO_JOIN);

section('3. The trigger enforces one rule per date, and derives booking_type');
assert('counts EVERY active row on the date, not only the shared ones',
  !/booking_type = 'shared'/.test(sql), 'a booking_type filter would re-create the v3 split inventory');
assert('serialises concurrent seat-grabs under an advisory lock',
  /pg_advisory_xact_lock\(hashtext\('departure:' \|\| new\.start_date/.test(sql));
assert('booking_type is assigned by the trigger, not trusted from the caller',
  /new\.booking_type := case/.test(sql));
assert('exclusivity means opening a date with every place',
  /when v_seats = 0 and new\.group_size >= c_capacity then 'exclusive'/.test(sql));
assert('TS derives exclusivity the same way',
  bookingTypeFor(MAX_GROUP_SIZE, 0) === 'exclusive' &&
  bookingTypeFor(MAX_GROUP_SIZE - 1, 0) === 'shared' &&
  bookingTypeFor(MAX_GROUP_SIZE, 1) === 'shared');

section('4. Every guard raises a code the app maps to a sentence');
for (const code of ['RW_OPEN_MIN', 'RW_TOPUP_MIN', 'RW_CATERING_LOCKED', 'RW_FULL', 'RW_GROUP_TOO_LARGE']) {
  assert(`${code}: raised in SQL and mapped in createCheckout`,
    new RegExp(code).test(sql) && new RegExp(code).test(actions));
}

section('5. The app checks the same rules BEFORE the insert, for a friendly message');
assert('createCheckout reads minPartySize rather than hardcoding a number',
  /minPartySize\(input\.catering\)/.test(actions));
assert('createCheckout uses MIN_TO_JOIN for the join case', /input\.groupSize < MIN_TO_JOIN/.test(actions));
assert('createCheckout caps at MAX_GROUP_SIZE', /seatsTaken \+ input\.groupSize > MAX_GROUP_SIZE/.test(actions));

console.log(
  failed === 0
    ? '\nALL GROUP-RULE CHECKS PASSED\n(Trigger behaviour still needs scripts/verify-trigger.sql against a live DB.)'
    : `\n${failed} CHECK(S) FAILED`,
);
process.exit(failed === 0 ? 0 : 1);
