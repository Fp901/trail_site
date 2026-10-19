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
export const BRIEF_ITEM_TYPES = ['trend', 'angle', 'competitor', 'pitch', 'hook', 'site issue'] as const;
// Owner decision (13 October 2026): posts are inspired by the wider industry, not by our own site.
// So most of each brief is trends, and most post slots rest on one.
export const BRIEF_MIN_TRENDS = 3;
export const PLAN_MIN_TREND_SLOTS = 2;
export const CHANNELS = ['instagram', 'facebook', 'blog'] as const;
export const POST_CHANNELS = ['instagram', 'facebook'] as const;
// Owner decisions: three Instagram or Facebook posts a week (design doc section 8), plus one blog
// post every second week (15 October 2026, when the site gained its blog; it was one a month).
export const PLAN_POSTS_PER_WEEK = 3;
export const BLOG_EVERY_DAYS = 14;
// A blog is due unless one was written (pending or approved) in the last 10 days: the Mondays are 7
// and 14 days apart, so last week's blog skips this week and the one before it does not. A rejected
// blog never went out, so the next Monday writes another.
export const BLOG_RECENT_DAYS = 10;
export function blogDue(lastBlogAt: Date | null, now: Date): boolean {
  return !lastBlogAt || now.getTime() - lastBlogAt.getTime() >= BLOG_RECENT_DAYS * 86_400_000;
}
// A blog slot names exactly one photo: the article's cover on the website.
export const BLOG_PHOTOS = 1;
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
  'search terms': 160,
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

// Site photo ids, read from the source text of both files that hold them (the website's photos and
// the owner's photographs): photo-library.ts imports images, which load only inside Vite.
export const PHOTO_LIBRARY_SOURCES = ['src/data/photo-library.ts', 'src/data/photo-library-shoot.ts'] as const;
export const photoIdsFromSource = (src: string): string[] => [...src.matchAll(/^\s+id: '([^']+)',$/gm)].map((m) => m[1]);
// Each library photo's lodge as written in the source (T, O, R or null), for the one-lodge rule.
export const photoLodgesFromSource = (src: string): Map<string, string | null> =>
  new Map([...src.matchAll(/^\s+id: '([^']+)',\n\s+category: [^\n]+\n\s+lodge: ([^,\n]+),$/gm)].map((m) => [m[1], m[2] === 'null' ? null : m[2]]));

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
  trendIds: string[];
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
  const trends = items.filter((i) => (i.fields.type ?? '').toLowerCase() === 'trend');
  if (items.length > 0 && trends.length < BRIEF_MIN_TRENDS) {
    errors.push(
      `${trends.length} trend item(s); at least ${BRIEF_MIN_TRENDS} of the items must be wider industry trends (travel, walking, wellness, social media or seasonal), not competitors or our own site.`,
    );
  }
  commonText(md, errors);
  return {
    errors,
    ids: errors.length ? [] : items.map((i) => i.id),
    trendIds: errors.length ? [] : trends.map((i) => i.id),
  };
}

// ---- Head of Marketing (Monday): /weekly-plan.md -----------------------------------------

export const PLAN_FIELDS = ['channel', 'format', 'angle', 'based on', 'departure', 'photos', 'call to action'] as const;

// The three kinds of Instagram or Facebook post (migration 0023), and how many photos each takes.
// The week's three post slots use one of each, so the owner always gets the mix.
export const POST_FORMATS = ['single', 'carousel', 'story'] as const;
export type PostFormat = (typeof POST_FORMATS)[number];
export const FORMAT_PHOTOS: Record<PostFormat, { min: number; max: number }> = {
  single: { min: 1, max: 1 },
  carousel: { min: 3, max: 5 },
  story: { min: 1, max: 1 },
};
// A photo is used once and never again (owner, 14 October 2026). Used means it is on a draft that
// is pending or approved; a rejected or superseded draft never went out, so its photos are free.
export const PHOTO_USED_STATUSES = ['pending', 'approved'] as const;
// The booking line goes on at most this many of the week's posts (owner, 19 October 2026: "too
// pushy with the bookings links"). A story never carries it; the blog always ends with it.
export const PLAN_MAX_CTA_POSTS = 1;
// The runner warns in its log when fewer unused photos than this are left (about two weeks).
export const PHOTOS_LOW_WARNING = 12;

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
  // Blog slots only: the searches the article is written to rank for (owner request, 15 October
  // 2026), chosen from the Search Console results the planner reads.
  searchTerms?: string | null;
  // The slot's photo ids in order, so the runner can show the Copywriter the photos themselves.
  photos?: string[];
  // Whether the post ends with the facts pack's booking line (at most one post a week, and the blog).
  cta?: boolean;
}

// A blog slot's "search terms": one to three phrases, comma separated, each a real search.
export const BLOG_SEARCH_TERMS_MAX = 3;

export interface PlanCheck {
  errors: string[];
  slots: PlanSlot[];
}

// briefIds: this cycle's valid research item ids (empty when the brief failed its check).
// photoIds: every id get_photo_library can return.
// usedPhotos: ids already on a pending or approved draft; none may be planned again.
// trendIds: the brief items of type trend. When the brief has them, at least
// PLAN_MIN_TREND_SLOTS of the post slots must rest on one; with no valid brief the rule is off.
export function checkPlan(
  md: string,
  week: string,
  briefIds: readonly string[],
  photoIds: ReadonlySet<string>,
  trendIds: readonly string[] = [],
  usedPhotos: ReadonlySet<string> = new Set(),
  // Whether this week has a blog slot (blogDue); the runner decides from the drafts table.
  withBlog = true,
  // Each photo's lodge, when known: a post shows one lodge at a time (owner, 19 October 2026).
  photoLodges: ReadonlyMap<string, string | null> = new Map(),
): PlanCheck {
  const errors: string[] = [];
  const planned = new Set<string>();
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
      } else if (!r && briefs.size > 0) {
        // Owner decision (15 October 2026): every slot, the blog included, is built on the
        // Researcher's work. "facts: ..." is only the fallback for a week with no valid brief.
        errors.push(`${item.id}: "based on" must be one of this week's research items (${[...briefs].join(', ')}); every slot rests on the Researcher's brief.`);
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
    if ((f.channel ?? '').toLowerCase() === 'blog') {
      const terms = (f['search terms'] ?? '').split(',').map((t) => t.trim()).filter(Boolean);
      if (terms.length === 0 || terms.length > BLOG_SEARCH_TERMS_MAX || terms.some((t) => t.length > 60)) {
        errors.push(`${item.id}: a blog slot needs "search terms": 1 to ${BLOG_SEARCH_TERMS_MAX} searches, comma separated, each under 60 characters, taken from the Search Console results where they show any.`);
      }
    }
    if (f.departure && !/^(\d{4}-\d{2}-\d{2}|none)$/.test(f.departure)) {
      errors.push(`${item.id}: departure must be a start date (YYYY-MM-DD) from get_open_departures, or "none".`);
    }
    if (f.photos) {
      const ids = f.photos.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) errors.push(`${item.id}: name at least one photo id.`);
      for (const id of ids) {
        if (!photoIds.has(id)) errors.push(`${item.id}: unknown photo id "${id}".`);
        else if (usedPhotos.has(id)) errors.push(`${item.id}: "${id}" has already been used; a photo is never used twice. Choose one get_photo_library still lists.`);
        else if (planned.has(id)) errors.push(`${item.id}: "${id}" is already in another slot this week.`);
        planned.add(id);
      }
      const lodges = new Set(ids.map((id) => photoLodges.get(id)).filter((l): l is string => !!l));
      if (lodges.size > 1) errors.push(`${item.id}: its photos show more than one lodge; a post shows one lodge at a time (the owner's rule).`);
      if (isPost && (POST_FORMATS as readonly string[]).includes(fmt)) {
        const e = photoCountError(fmt as PostFormat, ids.length);
        if (e) errors.push(`${item.id}: ${e}`);
      }
      if (!isPost && (f.channel ?? '').toLowerCase() === 'blog' && ids.length !== BLOG_PHOTOS) {
        errors.push(`${item.id}: a blog slot takes exactly ${BLOG_PHOTOS} photo, its cover on the website.`);
      }
    }
  });
  const channels = items.map((i) => (i.fields.channel ?? '').toLowerCase());
  const posts = channels.filter((c) => (POST_CHANNELS as readonly string[]).includes(c)).length;
  const blogs = channels.filter((c) => c === 'blog').length;
  if (posts !== PLAN_POSTS_PER_WEEK) errors.push(`${posts} Instagram or Facebook slots; the owner wants exactly ${PLAN_POSTS_PER_WEEK}.`);
  const wantBlogs = withBlog ? 1 : 0;
  if (blogs !== wantBlogs) {
    errors.push(withBlog ? `${blogs} blog slots; this week needs exactly 1 (a blog every second week).` : `${blogs} blog slots; there is no blog this week (a blog every second week, and the last one was written recently).`);
  }
  if (trendIds.length > 0) {
    const trendSet = new Set(trendIds);
    const onTrend = items.filter(
      (i) => (POST_CHANNELS as readonly string[]).includes((i.fields.channel ?? '').toLowerCase()) && trendSet.has(i.fields['based on'] ?? ''),
    ).length;
    const need = Math.min(PLAN_MIN_TREND_SLOTS, trendIds.length);
    if (onTrend < need) {
      errors.push(`${onTrend} post slot(s) rest on a trend; at least ${need} must be "based on" one of this week's trend items (${trendIds.join(', ')}).`);
    }
  }
  const formats = items
    .filter((i) => (POST_CHANNELS as readonly string[]).includes((i.fields.channel ?? '').toLowerCase()))
    .map((i) => (i.fields.format ?? '').toLowerCase());
  const missingFormats = POST_FORMATS.filter((f) => !formats.includes(f));
  if (posts === PLAN_POSTS_PER_WEEK && missingFormats.length) {
    errors.push(`The ${PLAN_POSTS_PER_WEEK} post slots must be one single, one carousel and one story; missing: ${missingFormats.join(', ')}.`);
  }
  const noCta = (i: (typeof items)[number]) => /^none\b/i.test((i.fields['call to action'] ?? '').trim());
  const postItems = items.filter((i) => (POST_CHANNELS as readonly string[]).includes((i.fields.channel ?? '').toLowerCase()));
  for (const i of postItems) {
    if ((i.fields.format ?? '').toLowerCase() === 'story' && i.fields['call to action'] && !noCta(i)) {
      errors.push(`${i.id}: a story carries no booking line; its call to action is "none".`);
    }
  }
  const withCta = postItems.filter((i) => i.fields['call to action'] && !noCta(i)).length;
  if (withCta > PLAN_MAX_CTA_POSTS) {
    errors.push(`${withCta} post slots carry the booking line; at most ${PLAN_MAX_CTA_POSTS} may (the owner finds more too pushy). Write "none" for the others.`);
  }
  commonText(md, errors);
  return { errors, slots: errors.length ? [] : items.map((i) => {
    const channel = i.fields.channel.toLowerCase();
    const format = (POST_CHANNELS as readonly string[]).includes(channel) ? (i.fields.format.toLowerCase() as PostFormat) : null;
    return { id: i.id, channel, format, searchTerms: channel === 'blog' ? i.fields['search terms'].trim() : null, photos: (i.fields.photos ?? '').split(',').map((x) => x.trim()).filter(Boolean), cta: !noCta(i) };
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

// ---- The launch set (one-off, owner request 14 October 2026) ---------------------------
// Nine opening Instagram posts so the new accounts do not look empty: they fill the first three rows
// of the profile grid and tell a stranger the whole story in one scroll. Fixed here, not planned by
// the Head of Marketing, because they are the same introduction whatever the week's trends are.
// Grid posts only (a story disappears after a day). The owner posts the same set to Facebook.
export interface LaunchSlot extends PlanSlot {
  format: 'single' | 'carousel';
  angle: string;
}
export const LAUNCH_SLOT_PREFIX = 'L-';
export const LAUNCH_SLOTS: readonly LaunchSlot[] = [
  { id: 'L-1', channel: 'instagram', format: 'single', angle: 'What Rooiberg Wander is, in one image: 3 nights, 3 days on foot through a private Big 5 reserve in the Waterberg, from lodge to lodge.' },
  { id: 'L-2', channel: 'instagram', format: 'single', angle: 'Day 2 of the trail: from Temminck\'s Lodge over Groenkop to Oukraal.' },
  { id: 'L-3', channel: 'instagram', format: 'single', angle: 'Day 3 of the trail: through the Elandsberg L-Kloof and past the Welgedacht lookout to Rustwood.' },
  { id: 'L-4', channel: 'instagram', format: 'single', angle: 'Day 4 of the trail: across the open plains back to Temminck\'s Lodge, then home.' },
  { id: 'L-5', channel: 'instagram', format: 'carousel', angle: 'The three lodges, one per photo: Temminck\'s Lodge, Oukraal and Rustwood.' },
  { id: 'L-6', channel: 'instagram', format: 'single', angle: 'Safety: two armed wilderness guides with every group, the Two-Man Rule.' },
  { id: 'L-7', channel: 'instagram', format: 'carousel', angle: 'The food: hearty bushveld fare around the boma fire, with selected South African estate wines and local beers.' },
  { id: 'L-8', channel: 'instagram', format: 'carousel', angle: 'Wildlife seen on foot in a malaria-free private Big 5 reserve.' },
  { id: 'L-9', channel: 'instagram', format: 'single', angle: 'Day 1: arrive at Temminck\'s Lodge, no walking yet, and sundowners at Matopo Lookout Point before the first walk.' },
];

// ---- One blog on demand (owner request, 19 October 2026) -------------------------------
// The manual job "blog": one article on a topic the owner names when starting the run, written
// for one to three searches, without waiting for the planner's every-second-week slot. The
// topic and the terms come from the workflow form (BLOG_TOPIC, BLOG_SEARCH_TERMS).
export const BLOG_SLOT_PREFIX = 'B-';
export const BLOG_TOPIC_MAX = 300;
export const BLOG_TERM_MAX = 80;

export function blogSlot(topic: string, terms: string, now: Date): { slot?: PlanSlot; errors: string[] } {
  const t = topic.replace(/\s+/g, ' ').trim();
  const list = terms.split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const errors: string[] = [];
  if (!t) errors.push('blog: give a topic (blog_topic).');
  else if (t.length > BLOG_TOPIC_MAX) errors.push(`blog: the topic is over ${BLOG_TOPIC_MAX} characters.`);
  if (list.length < 1 || list.length > BLOG_SEARCH_TERMS_MAX) errors.push(`blog: give 1 to ${BLOG_SEARCH_TERMS_MAX} search terms, separated by commas (blog_search_terms).`);
  if (list.some((x) => x.length > BLOG_TERM_MAX)) errors.push(`blog: a search term is over ${BLOG_TERM_MAX} characters.`);
  if (errors.length) return { errors };
  const id = `${BLOG_SLOT_PREFIX}${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
  return { slot: { id, channel: 'blog', format: null, searchTerms: list.join(', '), cta: true }, errors };
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
