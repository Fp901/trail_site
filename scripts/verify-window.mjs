// Booking-window constants: TypeScript vs the 0014 trigger migration.
// Run: npx tsx scripts/verify-window.mjs
//
// The trigger cannot import from src/, so 0014 hardcodes four values that also live in
// src/data/rates.ts. That duplication is unavoidable at the SQL layer but it CAN be policed:
// this script parses the constants back out of the migration and asserts they match the
// TypeScript. If someone changes BOOKING_OPEN_DATE or a window length in one place only, this
// fails rather than the two layers silently disagreeing in production.
//
// It does NOT test the trigger's logic — that needs a live database, see
// scripts/verify-window-trigger.sql.
import { readFileSync } from 'node:fs';
import {
  BOOKING_OPEN_DATE,
  CATERED_WINDOW_MONTHS,
  UNCATERED_WINDOW_MONTHS,
} from '../src/data/rates.ts';
import { earliestBookableDate, latestBookableDate, todaySast } from '../src/lib/pricing.ts';

let failed = 0;
function assert(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) {
    if (detail) console.log(`        ${detail}`);
    failed++;
  }
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 66 - t.length))}`);

const sql = readFileSync(new URL('../supabase/migrations/0014_booking_window_guard.sql', import.meta.url), 'utf8');
const pick = (re) => { const m = sql.match(re); return m ? m[1] : null; };

section('1. Constants in 0014 match src/data/rates.ts');
const sqlOpen = pick(/c_booking_open\s+constant date := date '([\d-]+)'/);
const sqlLead = pick(/c_min_lead_days\s+constant int\s+:= (\d+)/);
const sqlCat = pick(/c_months_catered\s+constant int\s+:= (\d+)/);
const sqlUncat = pick(/c_months_uncatered\s+constant int\s+:= (\d+)/);

assert(`BOOKING_OPEN_DATE: SQL ${sqlOpen} === TS ${BOOKING_OPEN_DATE}`, sqlOpen === BOOKING_OPEN_DATE);
assert(`catered window: SQL ${sqlCat} === TS ${CATERED_WINDOW_MONTHS}`, Number(sqlCat) === CATERED_WINDOW_MONTHS);
assert(`self-catered window: SQL ${sqlUncat} === TS ${UNCATERED_WINDOW_MONTHS}`, Number(sqlUncat) === UNCATERED_WINDOW_MONTHS);
assert(`lead days: SQL ${sqlLead} === 7 (the flagged T-7 reading)`, Number(sqlLead) === 7);

section('2. The SQL floor/ceiling agree with the TS helpers for today');
// Recompute what the trigger would allow today, using the SQL constants, and compare against the
// application's own helpers. Catches a logic divergence, not just a constant one.
const today = todaySast();
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const max = (a, b) => (a > b ? a : b);

const sqlEarliest = max(addDays(today, Number(sqlLead)), sqlOpen);
assert(`floor: SQL ${sqlEarliest} === earliestBookableDate() ${earliestBookableDate()}`,
  sqlEarliest === earliestBookableDate());

for (const [catering, months] of [['catered', Number(sqlCat)], ['uncatered', Number(sqlUncat)]]) {
  const sqlLatest = addMonths(max(today, sqlOpen), months);
  const tsLatest = latestBookableDate(catering);
  assert(`ceiling (${catering}): SQL ${sqlLatest} === latestBookableDate() ${tsLatest}`, sqlLatest === tsLatest);
}

section('3. The exemptions that keep admin paths and paid bookings working');
assert('window guard is INSERT-only (would otherwise block paid bookings from confirming)',
  /tg_op <> 'INSERT'/.test(sql));
assert("comp bookings are exempt (adminCreateCompBooking books from today)",
  /coalesce\(new\.processor, ''\) = 'comp'/.test(sql));
assert('cancelled rows are exempt', /new\.status not in \('pending', 'confirmed'\)/.test(sql));
assert('uses SAST, not the server timezone', /at time zone 'Africa\/Johannesburg'/.test(sql));
assert('ceiling is anchored to greatest(today, launch gate), not today alone',
  /v_anchor := greatest\(v_today, c_booking_open\)/.test(sql));

section('4. Error codes the app maps');
const actions = readFileSync(new URL('../src/actions/index.ts', import.meta.url), 'utf8');
assert('0014 raises RW_WINDOW_TOO_SOON', /RW_WINDOW_TOO_SOON/.test(sql));
assert('0014 raises RW_WINDOW_TOO_FAR', /RW_WINDOW_TOO_FAR/.test(sql));
assert('createCheckout maps RW_WINDOW_TOO_SOON', /RW_WINDOW_TOO_SOON/.test(actions));
assert('createCheckout maps RW_WINDOW_TOO_FAR', /RW_WINDOW_TOO_FAR/.test(actions));

console.log(
  failed === 0
    ? '\nALL WINDOW-CONSTANT CHECKS PASSED\n(Trigger logic still needs scripts/verify-window-trigger.sql against a live DB.)'
    : `\n${failed} CHECK(S) FAILED`,
);
process.exit(failed === 0 ? 0 : 1);
