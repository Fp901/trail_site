// Hand-over contracts between the marketing employees (design doc section 3). Each employee hands
// the next one a file with a fixed shape, and the runner checks that shape in code before the next
// employee starts. Pure functions only: no network, so scripts/verify-marketing.mjs can unit test
// them.
//
// The cycle week: research and review run on Sunday, planning and drafting on Monday. A Sunday
// belongs to the week that starts the next day, so the Researcher's ids (R-...) and the Head of
// Marketing's ids (P-...) for one cycle share the same week number.

export const BRIEF_PATH = '/weekly-brief.md';
export const PLAN_PATH = '/weekly-plan.md';
export const PLAYBOOK_PATH = '/playbook.md';
export const LEARNINGS_PATH = '/learnings.md';
export const HISTORY_PATH = '/history.md';

export const BRIEF_MAX_ITEMS = 5;
export const BRIEF_ITEM_TYPES = ['angle', 'competitor', 'pitch', 'hook', 'site issue'] as const;
export const CHANNELS = ['instagram', 'facebook', 'blog'] as const;
export const POST_CHANNELS = ['instagram', 'facebook'] as const;
// Owner decision (design doc section 8): three Instagram or Facebook posts a week, plus at most
// one blog post (one a month, which the Head of Marketing judges from get_results).
export const PLAN_POSTS_PER_WEEK = 3;
export const PLAN_MAX_BLOGS = 1;
export const PLAYBOOK_SECTIONS = [
  'What works',
  'What does not work',
  'Voice',
  'Questions for the owner',
  'Notes for each role',
] as const;

// Length caps keep each field to what it is for, and keep text fetched from the open web from
// carrying long instructions into the planner's context.
const CAPS: Record<string, number> = {
  headline: 120,
  fact: 400,
  'why now': 300,
  angle: 300,
  'call to action': 160,
};

// ---- Weeks --------------------------------------------------------------------------------

// ISO 8601 week of a UTC date, as "YYYYWW" (the ISO week-numbering year).
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}${String(week).padStart(2, '0')}`;
}

// The cycle a run belongs to: Sunday counts as the start of the next week.
export const cycleWeek = (date: Date): string => isoWeekKey(new Date(date.getTime() + 86_400_000));

// ---- Photos -------------------------------------------------------------------------------

// The ids in src/data/photo-library.ts, read from its source text (that module imports images,
// which load only inside Vite).
export const photoIdsFromSource = (src: string): string[] => [...src.matchAll(/^\s+id: '([^']+)',$/gm)].map((m) => m[1]);

// An uploaded photo's id is this prefix and its marketing.photos row id (UPLOAD_ID_PREFIX in
// src/lib/marketing-photos.ts, which verify-marketing.mjs checks is the same).
export const UPLOAD_PHOTO_PREFIX = 'upload-';

// ---- Parsing ------------------------------------------------------------------------------

export interface Item {
  id: string;
  fields: Record<string, string>;
}

// "## <id>" headings, each followed by "- key: value" lines. Anything else is ignored, so a file
// can carry a title or a short intro.
export function parseItems(md: string): Item[] {
  const items: Item[] = [];
  let current: Item | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const h = line.match(/^##\s+(\S+)\s*$/);
    if (h) {
      current = { id: h[1], fields: {} };
      items.push(current);
      continue;
    }
    if (line.startsWith('#')) {
      current = null;
      continue;
    }
    const f = line.match(/^[-*]\s+([A-Za-z ]+?)\s*:\s*(.*)$/);
    if (current && f) current.fields[f[1].toLowerCase()] = f[2].trim();
  }
  return items;
}

// Same URL for our purposes: scheme, "www.", a trailing slash and the fragment do not count.
export function normaliseUrl(u: string): string {
  try {
    const url = new URL(u.trim());
    url.hash = '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    return `${host}${path}${url.search}`;
  } catch {
    return u.trim().toLowerCase();
  }
}

function required(item: Item, keys: readonly string[], errors: string[]) {
  for (const k of keys) {
    if (!item.fields[k]) errors.push(`${item.id}: "${k}" is missing.`);
  }
  for (const [k, cap] of Object.entries(CAPS)) {
    const v = item.fields[k];
    if (v && v.length > cap) errors.push(`${item.id}: "${k}" is ${v.length} characters; keep it under ${cap}.`);
  }
}

const DASH = /[–—]/;
const HIDDEN = /sadc|self[- ]?cater|slackpacking/i;

function commonText(md: string, errors: string[]) {
  if (DASH.test(md)) errors.push('Uses a long dash. Use a colon, a comma or a full stop.');
  if (HIDDEN.test(md)) errors.push('Mentions SADC, self-catering or slackpacking. The team never promotes them.');
}

// ---- Researcher: /weekly-brief.md ---------------------------------------------------------

export const BRIEF_FIELDS = ['type', 'headline', 'fact', 'source', 'date', 'why now', 'channel'] as const;

export interface BriefCheck {
  errors: string[];
  ids: string[];
}

// fetchedUrls: every URL the Researcher opened with web_fetch in this session. A source it did not
// open this run is stale or a search snippet, never a finding.
export function checkBrief(md: string, week: string, fetchedUrls: readonly string[]): BriefCheck {
  const errors: string[] = [];
  const items = parseItems(md);
  const opened = new Set(fetchedUrls.map(normaliseUrl));
  if (items.length === 0) errors.push('No items. Add at least one "## R-<week>-<n>" item.');
  if (items.length > BRIEF_MAX_ITEMS) errors.push(`${items.length} items; at most ${BRIEF_MAX_ITEMS}. Keep the strongest.`);
  const seen = new Set<string>();
  items.forEach((item, i) => {
    const want = `R-${week}-${i + 1}`;
    if (item.id !== want) errors.push(`Item ${i + 1} is "${item.id}"; it should be "${want}".`);
    if (seen.has(item.id)) errors.push(`${item.id} is used twice.`);
    seen.add(item.id);
    required(item, BRIEF_FIELDS, errors);
    const f = item.fields;
    if (f.type && !(BRIEF_ITEM_TYPES as readonly string[]).includes(f.type.toLowerCase())) {
      errors.push(`${item.id}: type "${f.type}" must be one of ${BRIEF_ITEM_TYPES.join(', ')}.`);
    }
    if (f.channel && ![...CHANNELS, 'none'].includes(f.channel.toLowerCase())) {
      errors.push(`${item.id}: channel "${f.channel}" must be one of ${[...CHANNELS, 'none'].join(', ')}.`);
    }
    if (f.date && !/^(\d{4}-\d{2}(-\d{2})?|unknown)$/.test(f.date)) {
      errors.push(`${item.id}: date "${f.date}" must be YYYY-MM-DD, YYYY-MM or "unknown".`);
    }
    if (f.source) {
      if (!/^https:\/\/\S+$/.test(f.source)) errors.push(`${item.id}: source must be one https URL.`);
      else if (!opened.has(normaliseUrl(f.source))) {
        errors.push(`${item.id}: you did not open ${f.source} with web_fetch in this run. Open it now, or drop the item.`);
      }
    }
  });
  commonText(md, errors);
  return { errors, ids: errors.length ? [] : items.map((i) => i.id) };
}

// ---- Head of Marketing (Monday): /weekly-plan.md -----------------------------------------

export const PLAN_FIELDS = ['channel', 'format', 'angle', 'based on', 'departure', 'photos', 'call to action'] as const;

// The three kinds of Instagram or Facebook post (migration 0023), and how many photos each takes.
// The week's three post slots use one of each, so the owner always gets the mix.
export const POST_FORMATS = ['single', 'carousel', 'story'] as const;
export type PostFormat = (typeof POST_FORMATS)[number];
export const FORMAT_PHOTOS: Record<PostFormat, { min: number; max: number }> = {
  single: { min: 1, max: 1 },
  carousel: { min: 3, max: 10 },
  story: { min: 1, max: 1 },
};
export const photoCountError = (format: PostFormat, n: number): string | null => {
  const { min, max } = FORMAT_PHOTOS[format];
  if (n >= min && n <= max) return null;
  return min === max
    ? `a ${format} takes exactly ${min} photo (it has ${n}).`
    : `a ${format} takes ${min} to ${max} photos (it has ${n}).`;
};

export interface PlanSlot {
  id: string;
  channel: string;
  format: PostFormat | null;
}

export interface PlanCheck {
  errors: string[];
  slots: PlanSlot[];
}

// briefIds: this cycle's valid research item ids (empty when the brief failed its check).
// photoIds: every id get_photo_library can return.
export function checkPlan(
  md: string,
  week: string,
  briefIds: readonly string[],
  photoIds: ReadonlySet<string>,
): PlanCheck {
  const errors: string[] = [];
  const items = parseItems(md);
  const briefs = new Set(briefIds);
  items.forEach((item, i) => {
    const want = `P-${week}-${i + 1}`;
    if (item.id !== want) errors.push(`Slot ${i + 1} is "${item.id}"; it should be "${want}".`);
    required(item, PLAN_FIELDS, errors);
    const f = item.fields;
    if (f.channel && !(CHANNELS as readonly string[]).includes(f.channel.toLowerCase())) {
      errors.push(`${item.id}: channel "${f.channel}" must be one of ${CHANNELS.join(', ')}.`);
    }
    const basis = f['based on'];
    if (basis) {
      const r = basis.match(/^R-\d{6}-\d+$/);
      if (r && !briefs.has(basis)) {
        errors.push(`${item.id}: "${basis}" is not an item in this week's research brief.`);
      } else if (!r && !/^facts:\s*\S/.test(basis)) {
        errors.push(`${item.id}: "based on" must be a research item id (R-${week}-n) or "facts: <what in the facts pack>".`);
      }
    }
    const isPost = (POST_CHANNELS as readonly string[]).includes((f.channel ?? '').toLowerCase());
    const fmt = (f.format ?? '').toLowerCase();
    if (f.format && isPost && !(POST_FORMATS as readonly string[]).includes(fmt)) {
      errors.push(`${item.id}: format "${f.format}" must be one of ${POST_FORMATS.join(', ')}.`);
    } else if (f.format && !isPost && fmt !== 'none') {
      errors.push(`${item.id}: a blog slot has format "none".`);
    }
    if (f.departure && !/^(\d{4}-\d{2}-\d{2}|none)$/.test(f.departure)) {
      errors.push(`${item.id}: departure must be a start date (YYYY-MM-DD) from get_open_departures, or "none".`);
    }
    if (f.photos) {
      const ids = f.photos.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) errors.push(`${item.id}: name at least one photo id.`);
      for (const id of ids) if (!photoIds.has(id)) errors.push(`${item.id}: unknown photo id "${id}".`);
      if (isPost && (POST_FORMATS as readonly string[]).includes(fmt)) {
        const e = photoCountError(fmt as PostFormat, ids.length);
        if (e) errors.push(`${item.id}: ${e}`);
      }
    }
  });
  const channels = items.map((i) => (i.fields.channel ?? '').toLowerCase());
  const posts = channels.filter((c) => (POST_CHANNELS as readonly string[]).includes(c)).length;
  const blogs = channels.filter((c) => c === 'blog').length;
  if (posts !== PLAN_POSTS_PER_WEEK) errors.push(`${posts} Instagram or Facebook slots; the owner wants exactly ${PLAN_POSTS_PER_WEEK}.`);
  if (blogs > PLAN_MAX_BLOGS) errors.push(`${blogs} blog slots; at most ${PLAN_MAX_BLOGS}.`);
  const formats = items
    .filter((i) => (POST_CHANNELS as readonly string[]).includes((i.fields.channel ?? '').toLowerCase()))
    .map((i) => (i.fields.format ?? '').toLowerCase());
  const missingFormats = POST_FORMATS.filter((f) => !formats.includes(f));
  if (posts === PLAN_POSTS_PER_WEEK && missingFormats.length) {
    errors.push(`The ${PLAN_POSTS_PER_WEEK} post slots must be one single, one carousel and one story; missing: ${missingFormats.join(', ')}.`);
  }
  commonText(md, errors);
  return { errors, slots: errors.length ? [] : items.map((i) => {
    const channel = i.fields.channel.toLowerCase();
    const format = (POST_CHANNELS as readonly string[]).includes(channel) ? (i.fields.format.toLowerCase() as PostFormat) : null;
    return { id: i.id, channel, format };
  }) };
}

// ---- Copywriter: one draft per slot ------------------------------------------------------

export const KIND_FOR_CHANNEL: Record<(typeof CHANNELS)[number], string> = {
  instagram: 'instagram_caption',
  facebook: 'facebook_post',
  blog: 'blog_draft',
};

// The Copywriter names the slot in each draft's notes ("Plan slot: P-202642-1"). Returns one line
// per slot with no draft of the right kind.
export function checkDrafts(
  slots: readonly PlanSlot[],
  drafts: readonly { kind: string; notes: string | null; format?: string | null }[],
): string[] {
  const errors: string[] = [];
  for (const slot of slots) {
    const want = KIND_FOR_CHANNEL[slot.channel as keyof typeof KIND_FOR_CHANNEL];
    const mine = drafts.filter((d) => d.kind === want && new RegExp(`\\b${slot.id}\\b`).test(d.notes ?? ''));
    if (mine.length === 0) errors.push(`${slot.id}: no ${want} draft with "Plan slot: ${slot.id}" in its notes.`);
    else if (slot.format && !mine.some((d) => d.format === slot.format)) {
      errors.push(`${slot.id}: the plan asks for a ${slot.format}; save the draft with format "${slot.format}".`);
    }
  }
  return errors;
}

// ---- Head of Marketing (Sunday): /playbook.md ---------------------------------------------

export function checkPlaybook(md: string): string[] {
  const errors: string[] = [];
  const headings = new Set([...md.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1].toLowerCase()));
  for (const s of PLAYBOOK_SECTIONS) {
    if (!headings.has(s.toLowerCase())) errors.push(`Missing the "## ${s}" section.`);
  }
  commonText(md, errors);
  return errors;
}

// The message sent back to an employee whose hand-over failed its check.
export const fixPrompt = (path: string, errors: readonly string[]) =>
  `The runner checked ${path} and it does not meet the hand-over format in your instructions:\n` +
  errors.map((e) => `- ${e}`).join('\n') +
  `\n\nFix ${path} now and reply when done. This is the only retry.`;
