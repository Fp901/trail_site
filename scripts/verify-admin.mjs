// Operator dashboard: schema mapping + mobile-first invariants.
// Run: npx tsx scripts/verify-admin.mjs
//
// Two jobs, both guarding failures that are SILENT in this codebase:
//
//   1. SCHEMA. src/lib/db.types.ts is a hand-written mirror of supabase/migrations/*.sql. Section
//      1 replays every migration statement and asserts the tuples match the real columns, so a
//      migration that drifts from the types fails here instead of at runtime in production. This
//      is the assertion that makes db.types.ts trustworthy rather than a fourth hand-copy.
//
//   2. RESPONSIVE. The admin table renders as stacked cards on mobile via `td::before {
//      content: attr(data-label) }`. Before this pass the data-label attributes existed in the
//      markup and the CSS did not, while a comment claimed otherwise — so the dashboard silently
//      compressed 8 columns into a 332px box. Sections 6-8 make that contract enforceable.
//
// NOT asserted: the no-em-dash house rule. The admin pages use '—' as an empty-value placeholder
// (index.astro fmtMoney, [id].astro fmtDateTime, dates/inquiries). That rule targets user-facing
// marketing prose; this portal is internal and the character is typographic, not copy. Adding the
// sweep would fail on day one. Do not "complete" it.
import { readFileSync, readdirSync } from 'node:fs';
import {
  ADMIN_ACTIONS,
  ADMIN_AUDIT_COLUMNS,
  BLOCKED_DATE_COLUMNS,
  BOOKING_COLUMNS,
  BOOKING_STATUSES,
  BOOKING_TYPES,
  CATERINGS,
  INQUIRY_COLUMNS,
  PAYMENT_EVENT_COLUMNS,
  PAYMENT_EVENT_TYPES,
  PAYMENT_PLANS,
  PRETRIP_DETAIL_COLUMNS,
  RATE_LIMIT_COLUMNS,
  RESIDENCIES,
} from '../src/lib/db.types.ts';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 66 - t.length))}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sameSet = (a, b) => {
  const A = [...new Set(a)].sort();
  const B = [...new Set(b)].sort();
  return A.length === B.length && A.every((v, i) => v === B[i]);
};
const diff = (a, b) => [...new Set(a)].filter((v) => !new Set(b).has(v));

// ---------------------------------------------------------------------------------------------
section('1. db.types.ts column tuples === the applied migrations');

// Strip SQL comments first: 0008 interleaves `-- ...` lines between add-column clauses, so a
// naive comma split would pick up prose.
const stripSqlComments = (s) => s.replace(/--[^\n]*/g, '');

const migDir = new URL('../supabase/migrations/', import.meta.url);
const migFiles = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
assert(`found the migration set (${migFiles.length} files)`, migFiles.length >= 15);

/** table name -> ordered column list, replayed across every migration */
const schema = {};
const unmodelled = [];

for (const f of migFiles) {
  const raw = readFileSync(new URL(f, migDir), 'utf8');
  const sql = stripSqlComments(raw);

  // create table if not exists public.X ( ... );
  for (const m of sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\s*\);/g)) {
    const [, table, body] = m;
    const cols = [];
    let depth = 0;
    let line = '';
    // Split the body on top-level commas so multi-line CHECKs (status, admin_audit.action) and
    // `primary key (a, b)` do not fragment.
    for (const ch of body) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        cols.push(line);
        line = '';
      } else line += ch;
    }
    cols.push(line);
    schema[table] = cols
      .map((c) => c.trim())
      .filter(Boolean)
      .filter((c) => !/^(constraint|primary key|unique|check|exclude|foreign key)\b/i.test(c))
      .map((c) => c.split(/\s+/)[0]);
  }

  // alter table public.X add column if not exists <name> ... (possibly several per statement)
  for (const m of sql.matchAll(/alter table public\.(\w+)\s*([\s\S]*?);/g)) {
    const [, table, body] = m;
    if (!/add column|rename column|alter column|drop column|add constraint|drop constraint/i.test(body)) continue;

    for (const a of body.matchAll(/add column(?: if not exists)?\s+(\w+)/gi)) {
      schema[table] ??= [];
      if (!schema[table].includes(a[1])) schema[table].push(a[1]);
    }
    for (const r of body.matchAll(/rename column\s+(\w+)\s+to\s+(\w+)/gi)) {
      const i = (schema[table] ?? []).indexOf(r[1]);
      if (i >= 0) schema[table][i] = r[2];
    }
    // Statement forms this parser does NOT model would silently under-report columns. Fail loudly
    // rather than let the script itself go stale. `alter column ... drop not null` (0013) and
    // constraint add/drop change no column list, so they are safe to skip.
    if (/drop column/i.test(body)) unmodelled.push(`${f}: drop column`);
    if (/alter column\s+\w+\s+type/i.test(body)) unmodelled.push(`${f}: alter column type`);
  }
}

assert(
  `no unmodelled migration statement forms${unmodelled.length ? ` (${unmodelled.join('; ')})` : ''}`,
  unmodelled.length === 0,
);

const tableTuples = {
  bookings: BOOKING_COLUMNS,
  inquiries: INQUIRY_COLUMNS,
  blocked_dates: BLOCKED_DATE_COLUMNS,
  pretrip_details: PRETRIP_DETAIL_COLUMNS,
  payment_events: PAYMENT_EVENT_COLUMNS,
  admin_audit: ADMIN_AUDIT_COLUMNS,
  rate_limits: RATE_LIMIT_COLUMNS,
};

for (const [table, tuple] of Object.entries(tableTuples)) {
  const sqlCols = schema[table] ?? [];
  const missing = diff(sqlCols, tuple); // in SQL, absent from TS
  const extra = diff(tuple, sqlCols); // in TS, absent from SQL
  const detail = [
    missing.length ? `missing from db.types: ${missing.join(', ')}` : '',
    extra.length ? `not in SQL: ${extra.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
  assert(
    `${table}: ${tuple.length} columns match the SQL${detail ? ` — ${detail}` : ''}`,
    sameSet(sqlCols, tuple),
  );
}

assert('bookings carries exactly 34 columns', BOOKING_COLUMNS.length === 34);
assert('no column is listed twice in any tuple', Object.values(tableTuples).every((t) => new Set(t).size === t.length));
// The columns 0013 added are the ones the dashboard was blind to; pin them explicitly.
assert('booking_type and catering (0013) are modelled', BOOKING_COLUMNS.includes('booking_type') && BOOKING_COLUMNS.includes('catering'));
assert('the 0007 rename was replayed, not the pre-rename names',
  BOOKING_COLUMNS.includes('pretrip_reminder_day3_sent') &&
  !BOOKING_COLUMNS.includes('pretrip_reminder_24h_sent'));

// ---------------------------------------------------------------------------------------------
section('2. Enum unions === the SQL CHECK constraints');

const allSql = stripSqlComments(migFiles.map((f) => readFileSync(new URL(f, migDir), 'utf8')).join('\n'));
// Last definition wins: 0012 drops and re-adds admin_audit_action_check with an extra value.
function checkValues(col) {
  const hits = [...allSql.matchAll(new RegExp(`check\\s*\\(\\s*${col}\\s+in\\s*\\(([\\s\\S]*?)\\)\\s*\\)`, 'g'))];
  if (!hits.length) return null;
  return hits[hits.length - 1][1].match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
}

for (const [col, tuple] of [
  ['status', BOOKING_STATUSES],
  ['booking_type', BOOKING_TYPES],
  ['catering', CATERINGS],
  ['payment_plan', PAYMENT_PLANS],
  ['residency', RESIDENCIES],
  ['action', ADMIN_ACTIONS],
]) {
  const sqlVals = checkValues(col);
  assert(`${col}: CHECK found in SQL`, sqlVals !== null);
  if (sqlVals) {
    assert(
      `${col}: [${tuple.join('|')}] matches the CHECK`,
      sameSet(sqlVals, tuple),
    );
  }
}
assert('admin_audit CHECK picked up 0012’s create_comp_booking', ADMIN_ACTIONS.includes('create_comp_booking'));

// payment_events.event_type has no CHECK, so the code is the source of truth instead.
const srcFiles = ['src/pages/api/payments/webhook.ts', 'src/actions/index.ts', 'src/lib/audit.ts'];
const emitted = new Set();
for (const f of srcFiles) {
  for (const m of read(f).matchAll(/eventType:\s*'([^']+)'/g)) emitted.add(m[1]);
}
const unlisted = [...emitted].filter((e) => !PAYMENT_EVENT_TYPES.includes(e));
assert(
  `every emitted eventType is in PAYMENT_EVENT_TYPES (${emitted.size} emitted)${unlisted.length ? ` — stray: ${unlisted.join(', ')}` : ''}`,
  unlisted.length === 0,
);

// ---------------------------------------------------------------------------------------------
section('3. No dead columns; catering is surfaced');

const adminPages = {
  'src/pages/admin/index.astro': 'bookings',
  'src/pages/admin/inquiries.astro': 'inquiries',
  'src/pages/admin/dates.astro': 'blocked_dates',
  'src/pages/admin/bookings/[id].astro': 'bookings',
};

// A column that is selected but never referenced in the file body is dead weight — it was how
// end_date and payment_events.detail survived. This generic rule catches every future one.
for (const [path, _table] of Object.entries(adminPages)) {
  const src = read(path);
  const selected = [];
  for (const m of src.matchAll(/\.select\(\s*'([^']+)'\s*\)/g)) {
    if (m[1].trim() === '*') continue;
    for (const c of m[1].split(',')) selected.push(c.trim());
  }
  const known = new Set([
    ...BOOKING_COLUMNS, ...INQUIRY_COLUMNS, ...BLOCKED_DATE_COLUMNS,
    ...PRETRIP_DETAIL_COLUMNS, ...PAYMENT_EVENT_COLUMNS, ...ADMIN_AUDIT_COLUMNS,
  ]);
  const unknown = selected.filter((c) => !known.has(c));
  assert(`${path}: every selected column exists in the schema${unknown.length ? ` — ${unknown.join(', ')}` : ''}`, unknown.length === 0);

  // Strip the select strings themselves before looking for real uses.
  const body = src.replace(/\.select\(\s*'[^']+'\s*\)/g, '');
  const dead = selected.filter((c) => !new RegExp(`\\b${c}\\b`).test(body));
  assert(`${path}: no column is selected but never used${dead.length ? ` — dead: ${dead.join(', ')}` : ''}`, dead.length === 0);
}

const listPage = read('src/pages/admin/index.astro');
assert('the bookings list requests catering', /'catering'/.test(listPage));
assert('the bookings list renders a Catering cell', /<td data-label="Catering">/.test(listPage));
assert('the bookings list has a matching Catering header', /<th scope="col">Catering<\/th>/.test(listPage));
assert('end_date is no longer selected by the list (it was never rendered)', !/'end_date'/.test(listPage));
assert('payment_events.detail is no longer selected', !/created_at, event_type, amount_cents, detail/.test(read('src/pages/admin/bookings/[id].astro')));

// ---------------------------------------------------------------------------------------------
section('4. No untyped rows in the admin surface');

const allAdmin = [...Object.keys(adminPages), 'src/pages/admin/bookings/new.astro', 'src/pages/admin/login.astro'];
for (const p of allAdmin) {
  assert(`${p}: no Record<string, any>`, !/Record<string,\s*any>/.test(read(p)));
}
const detail = read('src/pages/admin/bookings/[id].astro');
assert('[id].astro types its select(‘*’) result as BookingRow', /as BookingRow \| null/.test(detail));
assert('[id].astro imports its row shapes from db.types', /from '\.\.\/\.\.\/\.\.\/lib\/db\.types'/.test(detail));
for (const p of Object.keys(adminPages)) {
  assert(`${p}: no locally re-declared row interface`, !/^interface (Row|Block|Inquiry)\b/m.test(read(p)));
}

// ---------------------------------------------------------------------------------------------
section('5. Label maps are exhaustive BY TYPE, not by luck');

assert('paymentLabels is Record<PaymentEventType, string>', /const paymentLabels: Record<PaymentEventType, string>/.test(detail));
for (const a of ADMIN_ACTIONS) {
  assert(`auditLabel handles '${a}'`, new RegExp(`case '${a}':`).test(detail));
}
assert('auditLabel has a never-typed default (a new action breaks the build)', /const unhandled: never = action/.test(detail));

// ---------------------------------------------------------------------------------------------
section('6. The data-label contract that the mobile cards depend on');

const css = read('src/styles/global.css');
assert('the CSS actually prints the label', /content:\s*attr\(data-label\)/.test(css));

const tablePages = ['src/pages/admin/index.astro', 'src/pages/admin/dates.astro'];
for (const p of tablePages) {
  const src = read(p);
  const tds = (src.match(/<td\b/g) || []).length;
  const labels = (src.match(/data-label=/g) || []).length;
  assert(`${p}: every <td> carries a data-label (${tds} cells)`, tds > 0 && tds === labels);
}

// Positional equality of headers and labels. This is what stops the mobile card labels drifting
// away from the desktop headers — precisely the drift that produced the original broken state.
for (const p of tablePages) {
  const src = read(p);
  const tables = [...src.matchAll(/<thead>([\s\S]*?)<\/thead>([\s\S]*?)<\/tbody>/g)];
  assert(`${p}: found its table(s)`, tables.length > 0);
  tables.forEach(([, head, body], i) => {
    const headers = [...head.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map(([, inner]) =>
      inner.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '').replace(/\s+/g, ' ').trim(),
    );
    const firstRow = body.match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
    const labels = firstRow ? [...firstRow[1].matchAll(/data-label="([^"]*)"/g)].map((m) => m[1]) : [];
    assert(
      `${p} table ${i + 1}: ${headers.length} headers match their data-labels positionally` +
        (headers.join('|') === labels.join('|') ? '' : ` — [${headers.join('|')}] vs [${labels.join('|')}]`),
      headers.length > 0 && headers.join('|') === labels.join('|'),
    );
  });
}

// ---------------------------------------------------------------------------------------------
section('7. Mobile-first: the admin block escalates, never de-escalates');

const start = css.indexOf('/* === ADMIN: start');
const end = css.indexOf('/* === ADMIN: end');
assert('the admin block is sentinel-bracketed', start > -1 && end > start);
const block = css.slice(start, end);

for (const c of [
  '.admin-table', '.admin-tablewrap', '.admin-nav', '.admin-filters',
  '.admin-card', '.admin-inq', '.admin-timeline', '.admin-dl', '.admin-stats',
]) {
  // The component must appear inside at least one min-width query — as itself, or as one of its
  // BEM children (.x__el / .x--mod), which are part of the same component. The trailing
  // (?![a-zA-Z]) stops `.admin-table` being satisfied by `.admin-tablewrap`, a different one.
  // Before this pass, seven of these nine appeared in ZERO media queries and rendered
  // identically at 380px and 1920px.
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inQuery = [...block.matchAll(/@media \(min-width: \d+px\) \{([\s\S]*?)\n  \}/g)].some(([, b]) =>
    new RegExp(`${esc}(?:__[\\w-]+|--[\\w-]+)?(?![a-zA-Z])`).test(b),
  );
  assert(`${c} has a min-width escalation`, inQuery);
}

assert('zero max-width queries in the admin block (house rule is mobile-first)', !/@media \(max-width/.test(block));
const bps = [...new Set([...block.matchAll(/@media \(min-width: (\d+)px\)/g)].map((m) => +m[1]))].sort((a, b) => a - b);
assert(`breakpoints ⊆ the house ladder (found ${bps.join(', ')})`, bps.every((b) => [480, 560, 640, 768, 1024].includes(b)));

assert('the un-stacked narrow table declares a min-width so overflow-x can engage', /\.admin-table:not\(\.admin-table--wide\) \{[\s\S]{0,200}min-width: 34rem/.test(block));
assert('the un-stacked wide table declares a min-width too', /\.admin-table--wide \{[\s\S]{0,200}min-width: 56rem/.test(block));
assert('the stacked base hides thead', /\.admin-table thead \{\s*display: none;/.test(block));
assert('no 10-19rem min-width floor survives (the old 14rem search field overflowed 380px)', !/min-width:\s*1[0-9]rem/.test(block));

// ---------------------------------------------------------------------------------------------
section('8. Touch targets ≥44px and inputs ≥16px');

const minHeights = [...block.matchAll(/min-height:\s*([\d.]+)rem/g)].map((m) => parseFloat(m[1]));
const tooSmall = minHeights.filter((v) => v < 2.75);
assert(
  `every min-height in the admin block is ≥2.75rem (${minHeights.length} found)${tooSmall.length ? ` — ${tooSmall.join(', ')}rem` : ''}`,
  minHeights.length > 0 && tooSmall.length === 0,
);

for (const sel of [
  '.admin-nav__link', '.admin-nav__out', '.admin-filters__tab', '.admin-remove__summary',
  '.admin-rowlink', '.admin-backlink', '.admin-inq__toggle', '.admin-remove__panel .btn',
]) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert(`${sel} declares a 44px target`, new RegExp(`${esc} \\{[\\s\\S]{0,400}min-height: 2\\.75rem`).test(block));
}

// <16px on a focused input makes iOS Safari zoom the whole page. Anchors are exempt (no focus
// zoom), which is why only real form controls are swept here.
const inputRules = [...block.matchAll(/([^{}]*(?:input|select|textarea)[^{}]*)\{([^}]*)\}/g)];
const smallInputs = inputRules
  .map(([, selText, body]) => [selText.trim(), body.match(/font-size:\s*([\d.]+)rem/)])
  .filter(([, fs]) => fs && parseFloat(fs[1]) < 1);
assert(
  `every admin input font-size is ≥1rem${smallInputs.length ? ` — ${smallInputs.map(([s]) => s).join('; ')}` : ''}`,
  smallInputs.length === 0,
);
assert('the search field lost its 14rem floor and grows instead', /\.admin-filters__search input\[type='search'\] \{[\s\S]{0,300}flex: 1 1 auto/.test(block));

// ---------------------------------------------------------------------------------------------
section('9. Docs describe the schema that actually exists');

for (const doc of ['README.md', 'CLAUDE.md']) {
  const d = read(doc);
  for (const stale of ['unavailable_windows', 'shared_slot_availability', 'bookings_no_overlap']) {
    assert(`${doc} no longer references the dropped ${stale}`, !new RegExp(stale).test(d));
  }
}
assert('CLAUDE.md names departure_inventory instead', /departure_inventory/.test(read('CLAUDE.md')));
assert('README.md tells you to run every migration, not just 0001', /every.{0,40}supabase\/migrations/is.test(read('README.md')));

console.log(failed === 0 ? '\nALL ADMIN CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
