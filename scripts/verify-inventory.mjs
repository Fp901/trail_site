// departure_inventory view contract (migration 0015) + the client that consumes it.
// Run: npx tsx scripts/verify-inventory.mjs
//
// The view itself needs a live database (see the SQL harnesses), so this asserts the two things
// that CAN be checked statically and that break silently if they drift:
//   1. The view's shape and its PII-free / sparse guarantees, from the SQL text.
//   2. That the widget reads exactly that shape, applies the sparse contract in ONE place, and
//      no longer reads the two retired views.
import { readFileSync } from 'node:fs';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 66 - t.length))}`);

const sql = readFileSync(new URL('../supabase/migrations/0015_departure_inventory.sql', import.meta.url), 'utf8');
const widget = readFileSync(new URL('../src/components/BookingWidget.astro', import.meta.url), 'utf8');

section('1. The view is DERIVED, not materialised');
assert('creates a view, not a table', /create view public\.departure_inventory/.test(sql));
assert('no create table anywhere in the migration', !/create table/i.test(sql));
assert('selects from bookings as the source of truth', /from public\.bookings/.test(sql));
assert('expands blocked_dates ranges to days', /generate_series\(b\.start_date, b\.end_date/.test(sql));

section('2. The §10 record shape, plus the one flagged addition');
for (const col of ['start_date', 'seats_left', 'locked_catering', 'is_exclusive', 'is_blocked']) {
  assert(`exposes ${col}`, new RegExp(`\\b${col}\\b`).test(sql));
}
assert('seats_left is forced to 0 for exclusive-held dates', /when e\.start_date is not null then 0/.test(sql));
assert('seats_left is forced to 0 for blocked dates', /when b\.start_date is not null then 0/.test(sql));
assert('locked_catering read via min() (all rows on a date share one)', /min\(catering\)\s+as locked_catering/.test(sql));
assert('only rows with a live hold or confirmed status count', /status = 'confirmed'\s*\n\s*or \(status = 'pending' and hold_expires_at > now\(\)\)/.test(sql));

section('3. PII-free and anon-readable, matching the existing view pattern');
assert('granted to anon + authenticated', /grant select on public\.departure_inventory to anon, authenticated;/.test(sql));
for (const pii of ['lead_name', 'lead_email', 'lead_phone', 'processor_reference', 'pretrip_token']) {
  assert(`does NOT expose ${pii}`, !new RegExp(`\\b${pii}\\b`).test(sql));
}
assert('carries the SECURITY DEFINER / contract comment for the linter', /comment on view public\.departure_inventory is/.test(sql));
assert('the comment documents the SPARSE contract', /SPARSE/.test(sql));

section('4. The two overlapping views are retired');
assert('drops unavailable_windows', /drop view if exists public\.unavailable_windows;/.test(sql));
assert('drops shared_slot_availability', /drop view if exists public\.shared_slot_availability;/.test(sql));
assert('widget no longer fetches unavailable_windows', !/unavailable_windows\?select/.test(widget));
assert('widget no longer fetches shared_slot_availability', !/shared_slot_availability\?select/.test(widget));

section('5. The client reads the new shape, once');
assert('fetches departure_inventory with all five columns',
  /departure_inventory\?select=start_date,seats_left,locked_catering,is_exclusive,is_blocked/.test(widget));
assert('cache: no-store retained (a cancellation must free the date immediately)',
  /cache: 'no-store'/.test(widget));
assert('defines a single OPEN_DEPARTURE fallback for absent dates', /const OPEN_DEPARTURE: Departure/.test(widget));
assert('sparse contract applied in exactly one accessor', (widget.match(/inventory\.get\(/g) || []).length === 1);
assert('everything downstream goes through departureFor()', (widget.match(/departureFor\(/g) || []).length >= 3);
assert('no stale sharedAvail/blockedDates identifiers survive', !/\bsharedAvail\b|\bblockedDates\b/.test(widget));

section('6. Ranking removed; join list ordered explicitly');
assert('no import of lib/ranking', !/from '\.\.\/lib\/ranking'/.test(widget));
assert('no rankDates call', !/rankDates\(/.test(widget));
// Ordering is now chronological BY CONSTRUCTION: the list walks forward day by day from the
// first bookable date and stops at OPEN_LIST_MAX, so it can neither inherit the view's row order
// nor need a sort. That is a stronger guarantee than sorting after the fact.
assert('soonest-available list walks forward from R.earliest (chronological by construction)',
  /let d = R\.earliest;[\s\S]{0,400}d = addDaysIso\(d, 1\);/.test(widget));
assert('list order never depends on inventory iteration order',
  !/Array\.from\(inventory\.entries\(\)\)[\s\S]{0,600}renderJoinList/.test(widget));
assert('list is capped to a short list, not the whole window', /OPEN_LIST_MAX = 3/.test(widget));
assert('the "Recommended" ranking badge is gone', !/Recommended/.test(widget));

console.log(
  failed === 0
    ? '\nALL INVENTORY-CONTRACT CHECKS PASSED\n(View behaviour still needs a live DB — apply 0013/0014/0015 then run the SQL harnesses.)'
    : `\n${failed} CHECK(S) FAILED`,
);
process.exit(failed === 0 ? 0 : 1);
