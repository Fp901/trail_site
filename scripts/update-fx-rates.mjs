// Monthly FX snapshot for the /rates currency tabs.
// Run: node scripts/update-fx-rates.mjs          (writes src/data/rates.ts)
//      node scripts/update-fx-rates.mjs --dry    (prints what it would write, changes nothing)
//
// Fetches the European Central Bank reference rates (via Frankfurter, no API key) for ZAR into
// EUR/GBP/USD and rewrites the two constants in src/data/rates.ts: FX_RATES_AS_OF and
// ZAR_TO_FOREIGN. The site then rebuilds with the new figures baked in, so the page itself still
// makes no FX request at runtime (scripts/verify-currency.mjs §1 holds that line).
//
// Scheduled by .github/workflows/update-fx-rates.yml on the 1st of each month. ZAR is the only
// charged currency; nothing here reaches lib/pricing.ts or checkout.
import { readFileSync, writeFileSync } from 'node:fs';

const RATES_FILE = new URL('../src/data/rates.ts', import.meta.url);
const SOURCE = 'https://api.frankfurter.dev/v1/latest?base=ZAR&symbols=EUR,GBP,USD';
const CURRENCIES = ['EUR', 'GBP', 'USD'];
// A monthly move bigger than this is far more likely a bad feed than the rand. Refuse it and let
// the failed workflow run flag it for a human, rather than publish a wrong price.
const MAX_MONTHLY_MOVE = 0.25;
const dry = process.argv.includes('--dry');

const fail = (msg) => {
  console.error(`update-fx-rates: ${msg}`);
  process.exit(1);
};

const res = await fetch(SOURCE, { signal: AbortSignal.timeout(15_000) });
if (!res.ok) fail(`feed returned HTTP ${res.status}`);
const body = await res.json();

if (body.base !== 'ZAR') fail(`unexpected base currency ${body.base}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) fail(`unexpected date ${body.date}`);

const src = readFileSync(RATES_FILE, 'utf8');
const blockRe = /(export const ZAR_TO_FOREIGN: Record<ForeignCurrency, number> = \{\n)([\s\S]*?)(\n\};)/;
const dateRe = /export const FX_RATES_AS_OF = '\d{4}-\d{2}-\d{2}';/;
const block = src.match(blockRe);
if (!block || !dateRe.test(src)) fail('could not find the FX constants in src/data/rates.ts');

const next = {};
for (const cur of CURRENCIES) {
  const rate = body.rates?.[cur];
  if (typeof rate !== 'number' || !(rate > 0)) fail(`missing or invalid ${cur} rate`);
  const prev = Number(block[2].match(new RegExp(`${cur}: ([\\d.]+)`))?.[1]);
  if (prev > 0 && Math.abs(rate / prev - 1) > MAX_MONTHLY_MOVE) {
    fail(`${cur} moved from ${prev} to ${rate} (over ${MAX_MONTHLY_MOVE * 100}%); check the feed by hand`);
  }
  next[cur] = rate;
}

const lines = CURRENCIES.map((c) => `  ${c}: ${next[c]},`).join('\n');
const out = src
  .replace(dateRe, `export const FX_RATES_AS_OF = '${body.date}';`)
  .replace(blockRe, `$1${lines}$3`);

console.log(`ECB reference rates for ${body.date}: ${CURRENCIES.map((c) => `${c} ${next[c]}`).join(', ')}`);
if (out === src) {
  console.log('No change.');
} else if (dry) {
  console.log('Dry run: src/data/rates.ts not written.');
} else {
  writeFileSync(RATES_FILE, out);
  console.log('Updated src/data/rates.ts.');
}
