// The Rooiberg tool server's six tools (CLAUDE.md Part 18). The agents reach them over MCP through
// src/pages/api/marketing/mcp/[employee].ts, and each employee may call only its own TOOL_ACCESS
// list (marketing/config.ts), enforced here in callTool as well as in the agent's toolset.
// Four are read-only; save_draft can only INSERT a pending draft; submit_review (the Editor's
// alone) can only set editor_status and editor_notes on a draft that is still pending and not yet
// reviewed. There is deliberately no publish, post, email or send tool: a person approves every
// draft at /admin/marketing, and no tool can approve, reject, edit the text of or delete a draft.
//
// FACTS ARE NEVER MEMORISED. Every call reads src/data and the live departure_inventory view, so a
// rate or itinerary change reaches the agents on their next call with nothing to re-teach. The
// facts pack carries the international flagship only: no SADC rate, nothing self-catered, no
// /sadc-slackpacking (Part 12, Part 17.1).
import { z } from 'astro/zod';
import { site, stats } from '../data/site';
import { itinerary } from '../data/itinerary';
import { sanctuaries } from '../data/sanctuaries';
import { photoLibrary as sitePhotos, orientationOf } from '../data/photo-library';
import { existingUploadIds, uploadedPhotos } from './marketing-photos';
import { logisticsBlocks, faqs, faqAnswerText, seasons } from '../data/logistics';
import {
  rateRows,
  formatRand,
  FROM_PP_TRIP_DISPLAY,
  SEASON_HIGH_DATES,
  SINGLE_SUPPLEMENT_PCT,
  MAX_GROUP_SIZE,
  MIN_PARTY_CATERED,
  ROOMS_PER_DEPARTURE,
  BOOKING_OPEN_DISPLAY,
  BETA_OPEN_DISPLAY,
  START_DAYS_DISPLAY,
  TAPER_END_DISPLAY,
  inclusions,
  exclusions,
} from '../data/rates';
import { earliestBookableDate, latestBookableDate, todaySast, SPLIT_THRESHOLD_DAYS, BALANCE_LEAD_DAYS } from './pricing';
import { refundPolicy } from '../data/policies';
import { getSupabaseAdmin, getSupabaseAnon } from './supabase';
import { checkDraft, describeViolations } from './brand-rules';
import { rateLimit } from './ratelimit';
import { TOOL_ACCESS, type EmployeeKey } from '../../marketing/config';
import { photoCountError } from '../../marketing/contracts';
import {
  MARKETING_AUTHORS,
  MARKETING_DRAFT_KINDS,
  MARKETING_POST_FORMATS,
  type DepartureInventoryRow,
  type MarketingDraftRow,
} from './db.types';

export interface ToolResult {
  text: string;
  isError?: boolean;
}

const json = (value: unknown): ToolResult => ({ text: JSON.stringify(value, null, 2) });
const fail = (text: string): ToolResult => ({ text, isError: true });

// Anything that mentions the hidden product or the resident band never leaves this module.
const PUBLIC_SAFE = (s: string) => !/\bSADC\b|self[\s-]?cater|sadc-slackpacking|uncatered/i.test(s);

// ---- get_open_departures ------------------------------------------------------------------------
// The view is SPARSE: a date absent from it has nobody booked yet. Marketing only ever promotes
// dates that already carry a booking (a guaranteed departure), on the public catered product,
// inside the bookable window, with at least one free room.
export const departureLine = (taken: number, available: number) =>
  `Guaranteed Departure: ${taken} of ${MAX_GROUP_SIZE} spots booked. ${available} spots available.`;

async function getOpenDepartures(input: { limit: number }): Promise<ToolResult> {
  const from = earliestBookableDate();
  const to = latestBookableDate('catered', 0);
  const { data, error } = await getSupabaseAnon()
    .from('departure_inventory')
    .select('start_date, seats_taken, seats_left, rooms_taken, locked_catering, is_blocked')
    .gte('start_date', from)
    .lte('start_date', to)
    .order('start_date', { ascending: true });
  if (error) return fail('Could not read departures right now.');

  type Row = DepartureInventoryRow & { rooms_taken: number };
  const departures = ((data ?? []) as Row[])
    .filter((d) => !d.is_blocked && d.locked_catering === 'catered' && d.seats_taken > 0)
    .map((d) => {
      // Free rooms count as doubles, exactly as the booking widget states it.
      const available = Math.min(2 * (ROOMS_PER_DEPARTURE - d.rooms_taken), d.seats_left);
      return {
        start_date: d.start_date,
        spots_booked: d.seats_taken,
        spots_available: available,
        line: departureLine(d.seats_taken, available),
      };
    })
    .filter((d) => d.spots_available >= MIN_PARTY_CATERED)
    .slice(0, input.limit);

  return json({
    as_of: todaySast(),
    bookable_from: from,
    bookable_to: to,
    note:
      'Only dates that already carry a booking are listed. Quote each one with its exact `line`. ' +
      'Every other start day in the window is open to book from 2 guests at ' +
      `${site.canonicalUrl}/rates.`,
    departures,
  });
}

// ---- get_facts_pack -----------------------------------------------------------------------------
function buildFactsPack() {
  return {
    as_of: todaySast(),
    brand: {
      name: site.name,
      hook: site.hook,
      description: site.defaultDescription,
      website: site.canonicalUrl,
      book_at: `${site.canonicalUrl}/rates`,
      contact_email: site.contact.email,
      social: site.social,
    },
    stats: stats.map((s) => `${s.value} ${s.label}`),
    pricing: {
      unit: 'Per person, sharing, for the whole 3-night trail. VAT and all conservation levies included. Never quote a per-night figure.',
      from: FROM_PP_TRIP_DISPLAY,
      rates: rateRows.map((r) => ({ year: r.year, high_season: formatRand(r.high), low_season: formatRand(r.low) })),
      high_season_dates: SEASON_HIGH_DATES,
      single_supplement: `A single supplement of ${SINGLE_SUPPLEMENT_PCT}% of the all-inclusive rate applies to a guest in their own room.`,
      includes: inclusions,
      excludes: exclusions,
    },
    booking: {
      // Booking is open now; what starts on this date is the first departure that can be booked online.
      book_online: `Online booking is open now, for start dates from ${BOOKING_OPEN_DISPLAY}. Never say booking "opens" on that date: guests can book today.`,
      start_days: `${START_DAYS_DISPLAY}, until ${TAPER_END_DISPLAY}. Every day of the week after that.`,
      party: `From ${MIN_PARTY_CATERED} guests. At most ${MAX_GROUP_SIZE} walkers per departure, in ${ROOMS_PER_DEPARTURE} double rooms.`,
      exclusive: `A group that takes all ${ROOMS_PER_DEPARTURE} rooms has the trail and each lodge to itself.`,
      payment: `Bookings made ${SPLIT_THRESHOLD_DAYS} or more days before arrival pay a 50% deposit, with the balance due ${BALANCE_LEAD_DAYS} days before arrival. Bookings made inside ${SPLIT_THRESHOLD_DAYS} days pay in full at booking.`,
      cancellation: refundPolicy.tiers.map((t) => `${t.window}: ${t.refund}.`).join(' '),
      before_online_booking: `Start dates from ${BETA_OPEN_DISPLAY} to before ${BOOKING_OPEN_DISPLAY} are for family and friends, by enquiry or WhatsApp only. Do not promote these dates or their discount in posts.`,
      joined_departure_line: departureLine(2, 6) + ' (example; always take the numbers from get_open_departures)',
    },
    itinerary: itinerary.map((d) => ({
      day: d.day,
      title: d.title,
      distance_km: d.distanceKm,
      walking: d.distanceKm !== null,
      from: d.from ?? null,
      to: d.to ?? null,
      description: d.description,
    })),
    route: `Night 1 at Temminck's Lodge, night 2 at Oukraal, night 3 at Rustwood. Day 4 walks back to Temminck's Lodge, where the trail ends. So there are three lodges and three nights, but the trail starts and ends at the same lodge.`,
    // One call to action for every post: booking is open, so every post sends readers to book.
    call_to_action: { text: 'See dates and book on the rates page.', url: `${site.canonicalUrl.replace(/\/$/, '')}/rates` },
    arrival_day: 'There is no walking schedule on the arrival day. Guests settled in at Temminck\'s Lodge before 16h00 can walk to Matopo Lookout Point for sundowners.',
    lodges: sanctuaries.map((s) => ({
      name: s.name,
      role: s.role,
      description: s.description,
      amenities: s.amenities.map((a) => a.label),
    })),
    logistics: logisticsBlocks.map((b) => ({
      topic: b.kicker,
      title: b.title,
      text: Array.isArray(b.body) ? b.body.join(' ') : b.body,
    })),
    seasons: seasons.map((s) => ({ name: s.name, months: s.months, climate: s.climate, experience: s.experience })),
    faqs: faqs
      .filter((f) => f.id !== 'sadc-resident')
      .map((f) => ({ q: f.q, a: faqAnswerText(f.a) }))
      .filter((f) => PUBLIC_SAFE(f.q) && PUBLIC_SAFE(f.a)),
    hard_rules: [
      'No em-dashes or en-dashes.',
      'No per-night price; quote only the rates above.',
      'Only the all-inclusive trail and the rates above are public; anything else in your instructions stays unsaid.',
      'Never use business-plan internals or named individuals from the plan.',
      'Safety copy names the Two-Man Rule.',
      "Lodges: Temminck's Lodge, Oukraal, Rustwood. Write barbeque, not braai.",
      'Joined departures: the exact line from get_open_departures only.',
    ],
  };
}

// ---- get_photo_library --------------------------------------------------------------------------
// Every marketing-usable site photo (data/photo-library.ts: checked by eye, no hunting trophies),
// with its public URL, plus the owner's uploads (marketing.photos) with short-lived signed URLs.
export function staticPhotoLibrary() {
  const base = site.canonicalUrl.replace(/\/$/, '');
  return sitePhotos.map((p) => ({
    id: p.id,
    category: p.category,
    lodge: p.lodge,
    alt: p.alt,
    orientation: orientationOf(p.image.width, p.image.height),
    ...(p.note ? { note: p.note } : {}),
    url: base + p.image.src,
    source: 'site' as const,
  }));
}

async function getPhotoLibrary(): Promise<ToolResult> {
  const photos = staticPhotoLibrary();
  try {
    const uploads = await uploadedPhotos();
    return json({
      photos: [...uploads.map((u) => ({ ...u, source: 'upload' as const })), ...photos],
      note: 'Refer to photos by id. Uploaded photos have signed URLs that expire; never copy a URL into a draft.',
    });
  } catch {
    return json({ photos, note: 'Uploaded photos could not be read right now; these are the site photos only.' });
  }
}

// ---- get_results --------------------------------------------------------------------------------
async function getResults(input: { days: number }): Promise<ToolResult> {
  const since = new Date(Date.now() - input.days * 86_400_000).toISOString();
  const db = getSupabaseAdmin().schema('marketing');
  const [drafts, metrics, posts, spend, feedback] = await Promise.all([
    db.from('drafts').select('author, kind, format, status, editor_status, decision_reason').gte('created_at', since),
    db.from('metrics').select('channel, metric, value').gte('measured_at', since).limit(2000),
    db.from('posts').select('channel, published_at').gte('created_at', since),
    db.from('spend_log').select('employee, list_cost_cents').gte('created_at', since).limit(2000),
    db.from('feedback').select('decision, reason').gte('created_at', since).limit(200),
  ]);
  if (drafts.error || metrics.error || posts.error || spend.error || feedback.error) return fail('Could not read results right now.');

  const count = <T,>(rows: T[], key: (r: T) => string) =>
    rows.reduce<Record<string, number>>((acc, r) => ((acc[key(r)] = (acc[key(r)] ?? 0) + 1), acc), {});
  type D = Pick<MarketingDraftRow, 'author' | 'kind' | 'format' | 'status' | 'editor_status' | 'decision_reason'>;
  const runs = (spend.data ?? []) as Array<{ employee: string; list_cost_cents: number }>;
  const costByEmployee = runs.reduce<Record<string, number>>((acc, r) => ((acc[r.employee] = (acc[r.employee] ?? 0) + r.list_cost_cents), acc), {});
  const d = (drafts.data ?? []) as D[];
  const totals: Record<string, number> = {};
  for (const m of (metrics.data ?? []) as Array<{ channel: string; metric: string; value: number }>) {
    const k = `${m.channel}.${m.metric}`;
    totals[k] = (totals[k] ?? 0) + Number(m.value);
  }

  return json({
    window_days: input.days,
    drafts: {
      total: d.length,
      by_status: count(d, (r) => r.status),
      by_author_and_status: count(d, (r) => `${r.author}:${r.status}`),
      by_kind: count(d, (r) => r.kind),
      by_format: count(d.filter((r) => r.format), (r) => String(r.format)),
      editor_flagged: d.filter((r) => r.editor_status === 'flagged').length,
      rejection_reasons: d
        .filter((r) => r.status === 'rejected' && r.decision_reason)
        .map((r) => r.decision_reason)
        .slice(0, 20),
    },
    // Every owner decision in the window (approved, edited, rejected) with its reason, if given.
    owner_decisions: ((feedback.data ?? []) as Array<{ decision: string; reason: string | null }>).map((f) => ({
      decision: f.decision,
      reason: f.reason,
    })),
    cost: {
      total_us_dollars: Math.round(runs.reduce((n, r) => n + r.list_cost_cents, 0)) / 100,
      by_employee_us_cents: costByEmployee,
      runs: runs.length,
    },
    posts_published: (posts.data ?? []).filter((p) => p.published_at).length,
    metrics: totals,
    note: 'Publishing is not built yet, so posts and metrics stay empty until it is.',
  });
}

// ---- save_draft ---------------------------------------------------------------------------------
const PUBLIC_KINDS = MARKETING_DRAFT_KINDS.filter((k) => k !== 'weekly_report');
// Instagram and Facebook posts carry a format (single, carousel or story); nothing else does.
const SOCIAL_KINDS: ReadonlySet<string> = new Set(['instagram_caption', 'facebook_post']);

async function saveDraft(input: z.infer<typeof saveDraftInput>, caller: EmployeeKey): Promise<ToolResult> {
  if (input.author !== caller) return fail(`author must be your own employee key, "${caller}".`);
  if (input.author === 'editor') return fail('The Editor reviews drafts; it does not save them.');
  if (input.kind === 'weekly_report' && input.author !== 'analyst' && input.author !== 'head_of_marketing') {
    return fail('Only the Analyst or the Head of Marketing saves a weekly_report.');
  }
  // A looping agent must not flood the owner's queue (fail-open limiter, Part 11).
  if (!(await rateLimit('marketing:save_draft', 40, 3600))) {
    return fail('Too many drafts saved in the last hour. Stop and leave the rest for the next run.');
  }

  const format = input.format ?? null;
  if (SOCIAL_KINDS.has(input.kind) && !format) {
    return fail(`An ${input.kind} needs a format: ${MARKETING_POST_FORMATS.join(', ')}.`);
  }
  if (!SOCIAL_KINDS.has(input.kind) && format) return fail(`Only Instagram and Facebook posts take a format.`);
  if (format) {
    const e = photoCountError(format, input.photo_ids.length);
    if (e) return fail(`Photo count: ${e}`);
  }

  const violations = checkDraft([input.title ?? '', input.body].join('\n'), input.kind, format);
  if (violations.length) {
    return fail(`Draft refused by the brand rules. Fix these and save again:\n${describeViolations(violations)}`);
  }

  const library = staticPhotoLibrary();
  const known = new Set(library.map((p) => p.id));
  if (format === 'story') {
    const wide = library.filter((p) => input.photo_ids.includes(p.id) && p.orientation === 'landscape');
    if (wide.length) {
      return fail(`A story fills a tall screen, so it needs a portrait photo; ${wide[0].id} is landscape.`);
    }
  }
  let uploads: Set<string>;
  try {
    uploads = await existingUploadIds(input.photo_ids.filter((id) => !known.has(id)));
  } catch {
    return fail('Could not check the photo ids right now.');
  }
  const unknown = input.photo_ids.filter((id) => !known.has(id) && !uploads.has(id));
  if (unknown.length) return fail(`Unknown photo ids: ${unknown.join(', ')}. Use ids from get_photo_library.`);

  // The fix round: a corrected draft names the flagged one it replaces. Only the author's own
  // draft, still pending and flagged by the Editor, and only once (it stops being pending below).
  if (input.replaces) {
    const { data: old, error: oldErr } = await getSupabaseAdmin()
      .schema('marketing')
      .from('drafts')
      .select('id, author, status, editor_status')
      .eq('id', input.replaces)
      .maybeSingle();
    if (oldErr) return fail('Could not check the draft you are replacing right now.');
    if (!old || old.author !== caller || old.status !== 'pending' || old.editor_status !== 'flagged') {
      return fail('replaces must be the id of one of your own drafts that the Editor flagged and nobody has decided yet.');
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .schema('marketing')
    .from('drafts')
    .insert({
      author: input.author,
      kind: input.kind,
      title: input.title ?? null,
      body: input.body,
      photo_ids: input.photo_ids,
      format,
      replaces: input.replaces ?? null,
      departure_date: input.departure_date ?? null,
      notes: input.notes ?? null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !data) return fail('Could not save the draft right now.');
  if (input.replaces) {
    // Compare-and-set: only a draft that is still pending moves, so the owner never sees both.
    const { error: supErr } = await getSupabaseAdmin()
      .schema('marketing')
      .from('drafts')
      .update({ status: 'superseded' })
      .eq('id', input.replaces)
      .eq('status', 'pending');
    if (supErr) console.error('[marketing] supersede failed', supErr.message);
  }
  return json({ saved: true, id: data.id, status: 'pending', next: 'A person will approve, edit or reject it.' });
}

const saveDraftInput = z
  .object({
    author: z.enum(MARKETING_AUTHORS).describe('Your own employee key, e.g. "copywriter".'),
    kind: z.enum(MARKETING_DRAFT_KINDS).describe(`One of: ${MARKETING_DRAFT_KINDS.join(', ')}. Public kinds: ${PUBLIC_KINDS.join(', ')}.`),
    body: z.string().min(1).max(20000).describe('The full text of the post, caption, blog draft, reply or report.'),
    title: z.string().max(200).optional().describe('Optional title (blog drafts and reports).'),
    photo_ids: z.array(z.string().max(80)).max(10).default([]).describe('Photo ids from get_photo_library, in the order they should appear.'),
    format: z
      .enum(MARKETING_POST_FORMATS)
      .optional()
      .describe(
        'Instagram and Facebook posts only, and then required. single: 1 photo and a caption. carousel: 3 to 10 photos in order and a caption. story: 1 portrait photo and at most 125 characters of text on it, no caption.',
      ),
    departure_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('The start date (YYYY-MM-DD) when the draft promotes one departure.'),
    notes: z.string().max(2000).optional().describe('Notes for the owner: sources, assumptions, missing facts.'),
    replaces: z
      .string()
      .uuid()
      .optional()
      .describe('Only in the fix round: the id of your own draft the Editor flagged, which this corrected draft replaces.'),
  })
  .strict();

// ---- submit_review (the Editor only) ------------------------------------------------------------
// Records the Editor's verdict on one draft. The ONLY write besides save_draft's insert, and the
// narrowest one: it sets editor_status and editor_notes, nothing else, and only on a draft whose
// status is still 'pending' and whose editor_status is still 'unchecked' (so it can neither
// overturn a code-rules flag nor revisit a decided draft). It never touches status, the text,
// the decision fields or any other table.
const submitReviewInput = z
  .object({
    draft_id: z.string().uuid().describe('The id of the draft you reviewed.'),
    verdict: z.enum(['pass', 'flag']).describe('"pass" when it is ready for the owner, "flag" when it has a real problem.'),
    notes: z.string().trim().min(1).max(1000).describe('One or two short reasons, for the owner.'),
  })
  .strict();

async function submitReview(input: z.infer<typeof submitReviewInput>, caller: EmployeeKey): Promise<ToolResult> {
  if (caller !== 'editor') return fail('Only the Editor submits reviews.');
  if (!(await rateLimit('marketing:submit_review', 60, 3600))) {
    return fail('Too many reviews in the last hour. Stop and leave the rest for the next run.');
  }
  const { data, error } = await getSupabaseAdmin()
    .schema('marketing')
    .from('drafts')
    .update({ editor_status: input.verdict === 'pass' ? 'passed' : 'flagged', editor_notes: input.notes })
    .eq('id', input.draft_id)
    .eq('status', 'pending')
    .eq('editor_status', 'unchecked')
    .select('id');
  if (error) return fail('Could not record the review right now.');
  if (!data || data.length === 0) {
    return fail('That draft is not waiting for a review: it was already reviewed or decided, or the id is wrong.');
  }
  return json({ saved: true, id: input.draft_id, verdict: input.verdict, next: 'The owner sees your verdict next to the draft.' });
}

// ---- The registry -------------------------------------------------------------------------------
export const TOOLS = [
  {
    name: 'get_open_departures',
    description:
      'Guaranteed departures (dates that already carry a booking) on the public trail, each with the exact line to quote. Read-only.',
    input: z.object({ limit: z.number().int().min(1).max(20).default(10) }).strict(),
    run: getOpenDepartures,
  },
  {
    name: 'get_facts_pack',
    description:
      'The current public facts: rates (per person, whole trail), itinerary, lodges, safety, logistics, seasons, FAQ and the hard rules. Read it fresh every run; never rely on memory for a fact. Read-only.',
    input: z.object({}).strict(),
    run: async () => json(buildFactsPack()),
  },
  {
    name: 'get_photo_library',
    description:
      'Every usable photograph (trail, lodges, landscape, wildlife, guides) with id, category, lodge, alt text and URL, including photos the owner uploaded. Refer to photos by id in save_draft. Read-only.',
    input: z.object({}).strict(),
    run: getPhotoLibrary,
  },
  {
    name: 'get_results',
    description:
      "Draft decisions (approved, edited, rejected, with the owner's reasons), drafts by format, what the team's runs cost, published posts and channel metrics for the last N days. Read-only.",
    input: z.object({ days: z.number().int().min(1).max(90).default(28) }).strict(),
    run: getResults,
  },
  {
    name: 'save_draft',
    description:
      'Save one draft for the owner to review. The brand rules run first and refuse a failing draft with the reasons. Saves as pending only; nothing is published or sent.',
    input: saveDraftInput,
    run: saveDraft,
  },
  {
    name: 'submit_review',
    description:
      "The Editor's verdict on one pending draft: pass or flag, with short notes for the owner. Records the verdict only; it does not approve, publish, change or delete the draft.",
    input: submitReviewInput,
    run: submitReview,
  },
] as const;

export type ToolName = (typeof TOOLS)[number]['name'];

const allowed = (caller: EmployeeKey, name: string) => (TOOL_ACCESS[caller] as readonly string[]).includes(name);

// MCP tools/list shape, only the caller's own tools. Input schemas are generated from the same zod
// objects that validate calls.
export function listTools(caller: EmployeeKey) {
  return TOOLS.filter((t) => allowed(caller, t.name)).map((t) => {
    const { $schema: _drop, ...schema } = z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown>;
    return { name: t.name, description: t.description, inputSchema: schema };
  });
}

export async function callTool(name: string, args: unknown, caller: EmployeeKey): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool || !allowed(caller, name)) return fail(`Unknown tool: ${name}`);
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) {
    return fail(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`);
  }
  try {
    return await (tool.run as (i: unknown, c: EmployeeKey) => Promise<ToolResult>)(parsed.data, caller);
  } catch (err) {
    console.error('[marketing-tools]', name, (err as Error).message);
    return fail('The tool failed. Try again later.');
  }
}
