// The blog (CLAUDE.md Part 18, migration 0025): the pure helpers shared by the owner's Publish
// button and the public /blog pages. No database and no I/O here, so scripts/verify-marketing.mjs
// can test them directly.
//
// SECURITY (Part 11.3): a blog body is text the marketing team wrote and the owner approved. It is
// never rendered with set:html. parseBlogBody turns it into plain data (headings, paragraphs,
// lists, bold runs and links) that the page renders with ordinary, escaped Astro expressions. A
// link is only ever https, or a path on this site; anything else stays plain text.
import { site } from '../data/site';

export type BlogInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; v: string }
  | { t: 'link'; v: string; href: string; external: boolean };

export type BlogBlock =
  | { type: 'h2' | 'h3' | 'p'; inline: BlogInline[] }
  | { type: 'ul' | 'ol'; items: BlogInline[][] };

// The site's own hosts: a link to one of these becomes a path, so it stays on the site.
const OWN_HOSTS = new Set(['rooibergwander.co.za', 'www.rooibergwander.co.za']);

export const BLOG_SLUG_MAX = 80;
export const BLOG_DESCRIPTION_MAX = 155;

/** "What should I pack for three days on foot?" -> "what-should-i-pack-for-three-days-on-foot" */
export function slugify(title: string): string {
  const s = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= BLOG_SLUG_MAX) return s || 'post';
  const cut = s.slice(0, BLOG_SLUG_MAX);
  return cut.slice(0, cut.lastIndexOf('-') > 20 ? cut.lastIndexOf('-') : BLOG_SLUG_MAX).replace(/-+$/, '');
}

/** The first free slug: "x", then "x-2", "x-3" and so on. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = base.slice(0, BLOG_SLUG_MAX - suffix.length).replace(/-+$/, '') + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

function safeHref(raw: string): { href: string; external: boolean } | null {
  if (raw.startsWith('/') && !raw.startsWith('//')) return { href: raw, external: false };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && OWN_HOSTS.has(u.hostname))) return null;
  if (OWN_HOSTS.has(u.hostname)) return { href: `${u.pathname}${u.search}${u.hash}` || '/', external: false };
  return { href: u.href, external: true };
}

// A bare URL loses trailing sentence punctuation: "book here: https://x.co/rates." links /rates.
const INLINE = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)|\*\*([^*\n]{1,300})\*\*|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function parseInline(text: string): BlogInline[] {
  const out: BlogInline[] = [];
  const push = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === 'text') last.v += v;
    else out.push({ t: 'text', v });
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    push(text.slice(at, m.index));
    at = (m.index ?? 0) + m[0].length;
    if (m[1] !== undefined) {
      const link = safeHref(m[2]);
      if (link) out.push({ t: 'link', v: m[1], ...link });
      else push(m[1]);
    } else if (m[3] !== undefined) {
      out.push({ t: 'strong', v: m[3] });
    } else {
      const link = safeHref(m[4]);
      // A bare link to our own site reads as its path ("rooibergwander.co.za/rates").
      if (link) out.push({ t: 'link', v: link.external ? m[4] : `rooibergwander.co.za${link.href === '/' ? '' : link.href}`, ...link });
      else push(m[4]);
    }
  }
  push(text.slice(at));
  // Stray markdown markers the patterns above did not use are dropped, not shown.
  for (const node of out) if (node.t === 'text') node.v = node.v.replace(/\*\*|__/g, '');
  return out;
}

/**
 * Turns an approved blog body into blocks. Understands what the Copywriter is asked to write:
 * "## " and "### " headings, paragraphs separated by a blank line, "- " or "1. " lists,
 * **bold**, [text](url) links and bare links. A leading "# " line repeats the title, so it is
 * dropped; anything else unfamiliar is shown as plain text.
 */
export function parseBlogBody(body: string): BlogBlock[] {
  const blocks: BlogBlock[] = [];
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', inline: parseInline(para.join(' ')) });
    para = [];
    if (list) blocks.push({ type: list.type, items: list.items.map(parseInline) });
    list = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return flush();
    if (/^#\s/.test(line)) {
      flush();
      // Only the very first line may repeat the title; a later "# " is a section heading.
      if (blocks.length > 0 || lines.slice(0, i).some((l) => l.trim())) blocks.push({ type: 'h2', inline: parseInline(line.replace(/^#\s+/, '')) });
      return;
    }
    const h = line.match(/^(#{2,6})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ type: h[1].length === 2 ? 'h2' : 'h3', inline: parseInline(h[2].replace(/\s*#+$/, '')) });
      return;
    }
    const li = line.match(/^(?:([-*•])|(\d{1,2})[.)])\s+(.*)$/);
    if (li) {
      const type = li[1] ? 'ul' : 'ol';
      if (para.length || (list && list.type !== type)) flush();
      if (!list) list = { type, items: [] };
      list.items.push(li[3]);
      return;
    }
    if (list) {
      // A wrapped list item continues the last one.
      if (/^\s/.test(raw) && list.items.length) {
        list.items[list.items.length - 1] += ` ${line}`;
        return;
      }
      flush();
    }
    para.push(line);
  });
  flush();
  return blocks;
}

function plain(inline: BlogInline[]): string {
  return inline.map((n) => n.v).join('');
}

/** The meta description: the first paragraph as plain text, cut at a word to 155 characters. */
export function blogDescription(body: string): string {
  const first = parseBlogBody(body).find((b) => b.type === 'p');
  const text = (first && first.type === 'p' ? plain(first.inline) : '').replace(/\s+/g, ' ').trim();
  if (text.length <= BLOG_DESCRIPTION_MAX) return text;
  const cut = text.slice(0, BLOG_DESCRIPTION_MAX - 3);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,;:.]+$/, '')}...`;
}

/** Reading time in whole minutes, at 220 words a minute, never under one. */
export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220));
}

/** The absolute address of a published article. */
export function blogUrl(slug: string): string {
  return `${site.canonicalUrl.replace(/\/$/, '')}/blog/${slug}`;
}
