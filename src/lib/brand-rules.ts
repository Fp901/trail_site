// The Editor's code rules (CLAUDE.md Part 12 + Part 18). A deterministic checker that HARD-FAILS a
// marketing draft breaking a brand rule. It runs in three places:
//   1. the tool server's save_draft, which refuses a failing draft and returns the reasons,
//   2. the marketing runner, before the Editor agent sees a draft,
//   3. adminDecideDraft, when the owner edits a draft before approving it.
// The Editor agent is a second opinion on tone and accuracy; it never overrides these rules.
// scripts/verify-marketing.mjs exercises every rule with a passing and a failing sample.
//
// No rate is typed here: the allowed rand amounts are derived from data/rates.ts, the same
// constants the rates table and the booking engine use.
import { rateRows, FROM_PP_TRIP, MAX_GROUP_SIZE } from '../data/rates';
import type { MarketingDraftKind, MarketingPostFormat } from './db.types';

export type BrandRule =
  | 'empty'
  | 'dash'
  | 'per_night'
  | 'sadc'
  | 'hidden_product'
  | 'internals'
  | 'old_lodge_name'
  | 'braai'
  | 'departure_line'
  | 'unpublished_price'
  | 'two_man_rule'
  | 'x_length'
  | 'story_length';

export interface RuleViolation {
  rule: BrandRule;
  message: string;
}

// Internal, owner-only kinds. The owner reads them; they are never published, so only the
// emptiness check applies.
const INTERNAL_KINDS: ReadonlySet<MarketingDraftKind> = new Set(['weekly_report']);

export const X_MAX_CHARS = 280;
// A story has no caption: its text is the short line on the photo, read in a second or two.
export const STORY_MAX_CHARS = 125;

// The exact memo line (Part 17.4), with the counts filled in from get_open_departures.
export const DEPARTURE_LINE = /Guaranteed Departure: ([1-8]) of 8 spots booked\. ([0-8]) spots available\./g;

// Every rand figure a public draft may quote: the flagship (international, catered) high and low
// season rates for each published year, and the "from" price. Nothing SADC, nothing self-catered.
export function publishedRates(): Set<number> {
  const set = new Set<number>([FROM_PP_TRIP]);
  for (const row of rateRows) {
    set.add(row.high);
    set.add(row.low);
  }
  return set;
}

const formatRand = (n: number) => 'R' + n.toLocaleString('en-US');

export function checkDraft(text: string, kind: MarketingDraftKind, format?: MarketingPostFormat | null): RuleViolation[] {
  const v: RuleViolation[] = [];
  const add = (rule: BrandRule, message: string) => v.push({ rule, message });

  if (!text.trim()) {
    add('empty', 'The draft is empty.');
    return v;
  }
  if (INTERNAL_KINDS.has(kind)) return v;

  if (/[‒–—―]/.test(text)) {
    add('dash', 'Uses an em-dash or en-dash. Use a colon, a comma or a full stop.');
  }

  if (
    /\bper[\s-]+night\b|\/\s*night\b|\bnightly\s+(?:rate|price|cost|fee)\b|\bp\.?p\.?p\.?n\b|\bR\s?[\d,]+\s*(?:pp\s*)?(?:a|per|each)\s+night\b/i.test(
      text,
    )
  ) {
    add('per_night', 'Quotes a per-night price. Prices are per person, sharing, for the whole 3-night trail.');
  }

  if (/\bSADC\b|\bresidents?(?:'s)?\s+(?:rate|discount|price)\b/i.test(text)) {
    add('sadc', 'Mentions the SADC resident rate, which lives only in the rates table and the FAQ.');
  }

  if (/sadc-slackpacking|\bself[\s-]?cater(?:ed|ing)?\b|\buncatered\b/i.test(text)) {
    add('hidden_product', 'Mentions the self-catered option or its page. The public product is the all-inclusive safari only.');
  }

  if (
    /\b(?:owner(?:'s|s)?|profit)\s+split\b|\bmargins?\b|\bstaffing\s+costs?\b|\blevy\s+projections?\b|\bbusiness\s+plan\b|\bFrancois\b/i.test(
      text,
    )
  ) {
    add('internals', 'Uses business-plan internals (splits, margins, costs, the plan itself, or a named individual from it).');
  }

  if (/\bRotavi\b|\bVier\s*van\s*Acht\b|\bBlackwood\b/i.test(text)) {
    add('old_lodge_name', "Uses a retired lodge name. The lodges are Temminck's Lodge, Oukraal and Rustwood.");
  }

  if (/\bbraai/i.test(text)) {
    add('braai', 'Write "barbeque", not "braai".');
  }

  // Joined departures: only the exact memo line, with counts that add up. Strip every valid line,
  // then anything left that still talks about spots or a guaranteed departure is a paraphrase.
  let rest = text;
  for (const m of text.matchAll(DEPARTURE_LINE)) {
    const taken = Number(m[1]);
    const available = Number(m[2]);
    if (taken + available > MAX_GROUP_SIZE) {
      add('departure_line', `"${m[0]}" adds up to more than ${MAX_GROUP_SIZE} spots.`);
    }
    rest = rest.replace(m[0], '');
  }
  if (/guaranteed\s+departure|\bspots?\s+(?:booked|available|left|remaining)\b|\bplaces?\s+(?:left|available|remaining)\b/i.test(rest)) {
    add(
      'departure_line',
      'Describes a departure in its own words. Use the exact line from get_open_departures, e.g. "Guaranteed Departure: 2 of 8 spots booked. 6 spots available."',
    );
  }

  const allowed = publishedRates();
  for (const m of text.matchAll(/(?:\bR|\bZAR\s?)\s?(\d{1,3}(?:[ ,]\d{3})+|\d{4,})\b/g)) {
    const amount = Number(m[1].replace(/[ ,]/g, ''));
    if (!allowed.has(amount)) {
      add(
        'unpublished_price',
        `${formatRand(amount)} is not a published flagship rate. Quote only rates from get_facts_pack (${[...allowed].sort((a, b) => a - b).map(formatRand).join(', ')}).`,
      );
    }
  }

  const mentionsSafety = /\bsafe(?:ty|ly)?\b|\bdanger(?:ous)?\b/i.test(text);
  const hasRule = /Two-Man Rule/.test(text);
  const misspelt = text.replace(/Two-Man Rule/g, '').match(/two[\s-]?man\s+rule/i);
  if (misspelt) add('two_man_rule', 'Write the safety rule exactly as "Two-Man Rule".');
  else if (mentionsSafety && !hasRule) {
    add('two_man_rule', 'Talks about safety without the Two-Man Rule: two FGASA qualified trail guides with the group at all times.');
  }

  if (kind === 'x_post' && [...text].length > X_MAX_CHARS) {
    add('x_length', `An X post is at most ${X_MAX_CHARS} characters (this one is ${[...text].length}).`);
  }
  if (format === 'story' && [...text.trim()].length > STORY_MAX_CHARS) {
    add('story_length', `A story's text is at most ${STORY_MAX_CHARS} characters (this one is ${[...text.trim()].length}).`);
  }

  return v;
}

// One line per violation, for tool errors and the admin page.
export function describeViolations(v: RuleViolation[]): string {
  return v.map((x) => `- [${x.rule}] ${x.message}`).join('\n');
}
