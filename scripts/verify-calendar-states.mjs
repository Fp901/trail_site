// Calendar cell-state contract (§5, §7).
// Run: npx tsx scripts/verify-calendar-states.mjs
//
// Two things here are easy to regress silently and impossible to catch with a typecheck:
//   1. Conveying a state by COLOUR ALONE. §5 forbids it outright.
//   2. Collapsing the catering-locked state back into grey. That is the bug the brief calls the
//      single most damaging one in the build: a guest filtered to catered sees self-catered dates
//      greyed and concludes the trail is sold out, when those dates are wide open.
// Both are asserted structurally against the source rather than trusted to review.
import { readFileSync } from 'node:fs';

let failed = 0;
function assert(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed++;
}
const section = (t) => console.log(`\n--- ${t} ${'-'.repeat(Math.max(0, 62 - t.length))}`);

const widget = readFileSync(new URL('../src/components/BookingWidget.astro', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

const VISUALS = ['open', 'started', 'exclusive', 'locked', 'unavailable'];

section('1. Five appearances exist, and the six logical states map onto them');
assert('visualFor() maps state -> appearance', /function visualFor\(c: Classification, iso: string\): CellVisual/.test(widget));
assert('CellVisual is exactly the five of §5',
  /type CellVisual = 'open' \| 'started' \| 'exclusive' \| 'locked' \| 'unavailable'/.test(widget));
for (const v of VISUALS) {
  assert(`.bcal__cell--${v} is styled`, new RegExp(`\\.bcal__cell--${v}\\s*\\{`).test(css));
}
assert('logical state is still exposed via data-state', /cell\.dataset\.state = c\.state/.test(widget));
assert('no retired state class survives in CSS',
  !/bcal__cell--(joinable|catering-locked|buyout-only|needs-open|full|closed)\b/.test(css));

section('2. NO state is conveyed by colour alone');
// Every branch of the renderer must append a text badge before the cell is emitted.
const badgeAppends = (widget.match(/badge\.className = 'bcal__seats'/g) || []).length;
assert(`every render branch appends a text badge (found ${badgeAppends}, expect >= 3)`, badgeAppends >= 3);
assert('the unavailable branch has a NON-EMPTY default badge (no fall-through to bare colour)',
  /let badgeText = 'Unavailable'/.test(widget));
assert('the unavailable badge is appended unconditionally, not behind an if',
  !/if \(badgeText\) \{[\s\S]{0,120}bcal__seats/.test(widget));
assert('selection is marked by weight + fill, not fill alone', /\.bcal__cell\.is-selected[\s\S]{0,220}font-weight: 700/.test(css));

section('3. Every cell states date, status, price and places in its aria-label');
assert('open/started/exclusive label carries price and status', /cell\.setAttribute\('aria-label', `\$\{human\}\$\{what\}\$\{catWord\}\$\{priceWord\}/.test(widget));
assert('locked label names the product, rate, places AND the switch action',
  /already running as \$\{label\.toLowerCase\(\)\}[\s\S]{0,200}place\(s\) left[\s\S]{0,120}Activate to switch/.test(widget));
assert('unavailable label states the reason', /cell\.setAttribute\('aria-label', `\$\{human\}, \$\{reason\}`\)/.test(widget));
assert('disabled cells are marked aria-disabled', /aria-disabled', 'true'/.test(widget));
// Exactly two branches are actionable (sellable, and catering-locked-but-switchable); the third
// is disabled and correctly uses aria-disabled instead. Pinning the count catches both a new
// actionable branch that forgets aria-pressed and a disabled one that wrongly claims it.
const cellRenderer = widget.slice(widget.indexOf('function calRender()'), widget.indexOf('calPrevBtn?.addEventListener'));
assert('the cell renderer was located', cellRenderer.length > 1000);
assert('both actionable cell branches expose aria-pressed, and only those two',
  (cellRenderer.match(/aria-pressed/g) || []).length === 2);
// Closed cells must stay FOCUSABLE. The disabled attribute removes a button from the focus order
// entirely, which would make the reason §5 requires unreadable to a keyboard user — the exact
// group the reason exists for.
assert('no cell uses the disabled attribute', !/cell\.disabled = true/.test(widget));
assert('closed cells are marked inert by class instead', /cell\.classList\.add\('is-inert'\)/.test(widget));
const inertBranch = widget.slice(widget.indexOf("cell.classList.add('is-inert')"), widget.indexOf("aria-disabled', 'true'"));
assert('the closed branch uses aria-disabled rather than aria-pressed',
  inertBranch.length > 0 && !/aria-pressed/.test(inertBranch));

section('4. Catering-locked is ACTIONABLE, never a wall');
const lockedBranch = cellRenderer.slice(
  cellRenderer.indexOf("c.state === 'cateringLocked'"),
  cellRenderer.indexOf('} else {', cellRenderer.indexOf("c.state === 'cateringLocked'")),
);
assert('the locked branch was located', lockedBranch.length > 200);
assert('locked cells carry a click handler', /cell\.addEventListener\('click'/.test(lockedBranch));
assert('locked cells are never rendered inert', !/is-inert/.test(lockedBranch));
assert('selecting a locked date switches STYLE, not just the resolved catering', /style = otherCat;/.test(widget));
assert('the style radio is kept in sync', /input\[name="style"\]\[value="\$\{otherCat\}"\]/.test(widget));
assert('the grid re-filters after the switch', /style = otherCat;[\s\S]{0,600}calApplyFilter\(calGroupSize\)/.test(widget));
assert('the switch is announced', /Switched to \$\{label\.toLowerCase\(\)\} to book/.test(widget));
assert('locked cells NAME the product on the cell (§5 "with type label")',
  /badge\.textContent = otherCat === 'catered' \? 'Catered' : 'Self-cat\.'/.test(widget));
assert('sand is visually distinct from gold (different border style, not just hue)',
  /\.bcal__cell--locked \{[\s\S]{0,320}border-style: dashed/.test(css));

section('5. The last-minute badge rides ON TOP of a state, it is not a state');
assert('no --lastminute cell appearance exists', !/bcal__cell--last/.test(css));
assert('badge is positioned over the cell', /\.bcal__lm \{[\s\S]{0,160}position: absolute/.test(css));
assert('the cell is a positioning context', /\.bcal__cell \{\s*\n\s*position: relative/.test(css));
assert('badge percentage comes from the constant, not a literal',
  /Math\.round\(R\.lastMinuteDiscount \* 100\)/.test(widget) && !/textContent = `-22%`/.test(widget));
assert('badge is aria-hidden, with the discount spoken in the cell label instead',
  /b\.setAttribute\('aria-hidden', 'true'\)/.test(widget) && /function lastMinuteSpoken/.test(widget));
assert('it can land on a locked cell too, not only sellable ones', /if \(lmLocked\) cell\.appendChild\(lastMinuteBadge\(\)\)/.test(widget));

section('6. §5 price semantics: a buyout shows the TOTAL FOR 8, per person SHARING elsewhere');
// Cells never show a bare per-night figure: cellRateCents() returns the per-night rate, and the
// renderer must multiply by R.nights (the "sharing" total) before an exclusive cell multiplies
// again by group size, or a joinable/locked cell shows it pp.
assert('the per-night rate is converted to a per-person SHARING figure before use',
  /const sharingRate = perNightRate \* R\.nights/.test(widget));
assert('exclusive cells multiply the SHARING rate out to the group total',
  /const shownCents = isExcl \? sharingRate \* R\.exclusiveSize : sharingRate/.test(widget));
assert('exclusive labels say "total for N", not "per person"', /total for \$\{R\.exclusiveSize\}/.test(widget));
assert('no cell derives its shown price straight from a per-night figure without the sharing step',
  !/shownCents = isExcl \? perNight/.test(widget));
// The customer never chooses a nightly stay (all NIGHTS are mandatory), so no cell's spoken or
// visible price may be framed as a nightly rate — every figure is per person SHARING.
assert('no cell aria-label claims a per-night price', !/per person per night/.test(widget));
assert('joinable and locked cells state "per person sharing" instead',
  /\$\{fmtR\(shownCents\)\} per person sharing/.test(widget) &&
  /\$\{fmtR\(sharingOther\)\} per person sharing/.test(widget));
assert('two eligible caterings are marked "from", never presented as a fixed price',
  (widget.match(/ambiguous \? 'from ' : ''/g) || []).length >= 2);

section('7. Legend describes all five, and window copy uses constants');
for (const k of ['open', 'started', 'exclusive', 'locked', 'out']) {
  assert(`legend key --${k} present`, new RegExp(`bcal__key--${k}\\b`).test(widget));
}
assert('legend is aria-hidden (cells are the accessible source of truth)', /class="bcal__legend" aria-hidden="true"/.test(widget));
assert('window-ceiling copy reads months from constants, not literals',
  /R\.cateredMonths/.test(widget) && /R\.uncateredMonths/.test(widget));
assert('window-ceiling copy handles all three styles', /style === 'uncatered'[\s\S]{0,400}style === 'catered'[\s\S]{0,300}:/.test(widget));

section('8. Palette drawn from existing tokens, no new hues (§7)');
const cellCss = css.slice(css.indexOf('.bcal__cell--open'), css.indexOf('.bcal__legend'));
const hexes = [...new Set((cellCss.match(/#[0-9a-fA-F]{3,6}/g) || []))].filter((h) => h.toLowerCase() !== '#fff');
assert(`only the existing terracotta hex appears (found: ${hexes.join(', ') || 'none'})`,
  hexes.every((h) => h.toLowerCase() === '#9c5b3b'));
assert('green/ochre/cream/charcoal come from tokens',
  /var\(--color-green\)/.test(cellCss) && /var\(--color-ochre\)/.test(cellCss) &&
  /var\(--color-cream\)/.test(cellCss) && /var\(--color-charcoal\)/.test(cellCss));

console.log(failed === 0 ? '\nALL CALENDAR-STATE CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
