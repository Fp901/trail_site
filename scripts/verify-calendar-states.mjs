// Calendar cell-state contract (§5, §7) — REVISED: cells show NO wording or price (the operator's
// explicit request). Colour + a legend now carry the state visually.
// Run: npx tsx scripts/verify-calendar-states.mjs
//
// The house rule this used to enforce ("never colour alone, always a text badge") has been
// deliberately reversed by the operator: "Remove the wording and pricing from the calendar dates
// ... just use clear colour coding with colour key at the bottom." That instruction still comes
// with an accessibility condition attached ("change colours to improve accessibility if
// necessary"), so §5's underlying concern is still real, just solved a different way:
//   1. NO cell shows badge text, price, or a last-minute percentage any more.
//   2. Every one of the five states still carries a NON-COLOUR cue (border width, border style,
//      or a hatch texture) in addition to its fill, so a colour-blind viewer is not left with hue
//      as the only signal.
//   3. The full detail that used to be visible (seats, price, reason, last-minute) survives
//      UNCHANGED in every cell's aria-label, so a screen-reader user loses nothing.
//   4. The legend at the bottom is now the primary VISIBLE explanation for sighted users, and its
//      swatches must mirror the cell styling exactly (same border width/style), not just colour.
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

section('2. NO wording or price is rendered on the cell face (operator request)');
assert('no badge element is created in the cell renderer', !/bcal__seats/.test(widget));
assert('no price element is created in the cell renderer', !/bcal__price/.test(widget));
assert('the retired badge/price CSS classes are gone too', !/\.bcal__seats\b/.test(css) && !/\.bcal__price\b/.test(css));
assert('the last-minute corner badge is gone from the grid (still spoken via aria-label)',
  !/function lastMinuteBadge/.test(widget) && !/\.bcal__lm\b/.test(css));
assert('the only visible text left on a cell is the day number', /dayNum\.className = 'bcal__daynum'/.test(widget));

section('3. Every state still carries a NON-COLOUR cue, not colour alone');
// Border WIDTH is itself a non-colour, non-textual signal: open vs started must differ in it,
// not merely in how saturated the same green is.
assert('open uses a 1px border', /\.bcal__cell--open \{[\s\S]{0,200}border-width: 1px/.test(css));
assert('started uses a visibly thicker (2px) border, not just a denser fill',
  /\.bcal__cell--started \{[\s\S]{0,200}border-width: 2px/.test(css));
assert('exclusive is a different hue family (gold) from open/started (green), not just darker',
  /\.bcal__cell--exclusive \{[\s\S]{0,200}var\(--color-ochre\)/.test(css));
assert('locked keeps its DASHED border — a pattern cue independent of hue perception',
  /\.bcal__cell--locked \{[\s\S]{0,240}border-style: dashed/.test(css));
assert('unavailable carries a hatch TEXTURE, not just a muted colour',
  /\.bcal__cell--unavailable \{[\s\S]{0,300}repeating-linear-gradient/.test(css));
assert('selection still adds weight + a ring, not fill alone',
  /\.bcal__cell\.is-selected \{[\s\S]{0,220}font-weight: 700/.test(css));

section('4. Every cell STILL states date, status, price and places — in its aria-label only');
assert('open/started/exclusive label carries price and status', /cell\.setAttribute\('aria-label', `\$\{human\}\$\{what\}\$\{catWord\}\$\{priceWord\}/.test(widget));
assert('locked label names the product, rate, places AND the switch action',
  /already running as \$\{label\.toLowerCase\(\)\}[\s\S]{0,200}place\(s\) left[\s\S]{0,120}Activate to switch/.test(widget));
assert('unavailable label states the reason', /cell\.setAttribute\('aria-label', `\$\{human\}, \$\{reason\}`\)/.test(widget));
assert('disabled cells are marked aria-disabled', /aria-disabled', 'true'/.test(widget));
const cellRenderer = widget.slice(widget.indexOf('function calRender()'), widget.indexOf('calPrevBtn?.addEventListener'));
assert('the cell renderer was located', cellRenderer.length > 800);
assert('both actionable cell branches expose aria-pressed, and only those two',
  (cellRenderer.match(/aria-pressed/g) || []).length === 2);
// Closed cells must stay FOCUSABLE. The disabled attribute removes a button from the focus order
// entirely, which would make the reason §5 requires unreachable to a keyboard user.
assert('no cell uses the disabled attribute', !/cell\.disabled = true/.test(widget));
assert('closed cells are marked inert by class instead', /cell\.classList\.add\('is-inert'\)/.test(widget));
const inertBranch = widget.slice(widget.indexOf("cell.classList.add('is-inert')"), widget.indexOf("aria-disabled', 'true'"));
assert('the closed branch uses aria-disabled rather than aria-pressed',
  inertBranch.length > 0 && !/aria-pressed/.test(inertBranch));

section('5. Catering-locked is ACTIONABLE, never a wall');
const lockedBranch = cellRenderer.slice(
  cellRenderer.indexOf("c.state === 'cateringLocked'"),
  cellRenderer.indexOf('} else {', cellRenderer.indexOf("c.state === 'cateringLocked'")),
);
assert('the locked branch was located', lockedBranch.length > 100);
assert('locked cells carry a click handler', /cell\.addEventListener\('click'/.test(lockedBranch));
assert('locked cells are never rendered inert', !/is-inert/.test(lockedBranch));
assert('selecting a locked date switches STYLE, not just the resolved catering', /style = otherCat;/.test(widget));
assert('the style radio is kept in sync', /input\[name="style"\]\[value="\$\{otherCat\}"\]/.test(widget));
assert('the switch is announced', /Switched to \$\{label\.toLowerCase\(\)\} to book/.test(widget));
// The product used to be NAMED on the cell face; that visible label is gone on request, but the
// aria-label must still name it, since a screen-reader user has no colour to read at all.
assert('the product name no longer appears as a visible badge', !/badge\.textContent = otherCat === 'catered'/.test(widget));
assert('the aria-label still names which product is running', /already running as \$\{label\.toLowerCase\(\)\}/.test(widget));

section('6. §5 price semantics survive in the SPOKEN form: a buyout is the TOTAL FOR 8');
// Cells never show a price at all now, visibly — but the figures still have to be computed
// correctly for the aria-label, and the sharing (never per-night) rule still applies there.
assert('the per-night rate is converted to a per-person SHARING figure before use',
  /const sharingRate = perNightRate \* R\.nights/.test(widget));
assert('exclusive cells multiply the SHARING rate out to the group total',
  /const shownCents = isExcl \? sharingRate \* R\.exclusiveSize : sharingRate/.test(widget));
assert('exclusive labels say "total for N", not "per person"', /total for \$\{R\.exclusiveSize\}/.test(widget));
assert('no cell aria-label claims a per-night price', !/per person per night/.test(widget));
assert('joinable and locked cells state "per person sharing" instead',
  /\$\{fmtR\(shownCents\)\} per person sharing/.test(widget) &&
  /\$\{fmtR\(sharingOther\)\} per person sharing/.test(widget));
assert('two eligible caterings are marked "from" in the spoken label, never a fixed price',
  (widget.match(/ambiguous \? 'from ' : ''/g) || []).length >= 2);

section('7. The legend is now the PRIMARY visible key, and mirrors the cells exactly');
for (const k of ['open', 'started', 'exclusive', 'locked', 'out']) {
  assert(`legend key --${k} present`, new RegExp(`bcal__key--${k}\\b`).test(widget));
}
assert('legend is aria-hidden (screen-reader users already get everything via aria-label)',
  /class="bcal__legend" aria-hidden="true"/.test(widget));
// The swatches must reproduce the SAME non-colour cues as the real cells, or the key would teach
// a viewer the wrong thing to look for.
assert('the open swatch matches the 1px border width used on the real cell',
  /\.bcal__key--open::before \{[\s\S]{0,160}border-width: 1px/.test(css));
assert('the started swatch matches the 2px border width used on the real cell',
  /\.bcal__key--started::before \{[\s\S]{0,160}border-width: 2px/.test(css));
assert('the locked swatch keeps the dashed pattern',
  /\.bcal__key--locked::before \{[\s\S]{0,200}border-style: dashed/.test(css));
assert('the unavailable swatch carries the same hatch texture as the real cell',
  /\.bcal__key--out::before \{[\s\S]{0,260}repeating-linear-gradient/.test(css));
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
