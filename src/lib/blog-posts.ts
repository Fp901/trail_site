// The public blog's reads (CLAUDE.md Part 18, migration 0025). Server only: marketing.blog_posts is
// default-deny, so the /blog pages read it with the service role, and only the published columns
// leave this module. Nothing here writes; the owner's Publish button (adminPublishBlog) does.
import type { ImageMetadata } from 'astro';
import { getSupabaseAdmin } from './supabase';
import { MARKETING_BLOG_POST_COLUMNS, sel, type MarketingBlogPostRow } from './db.types';
import { UPLOAD_ID_PREFIX } from './marketing-photos';
import { photoLibrary } from '../data/photo-library';

const LIST_COLS = ['slug', 'title', 'description', 'cover_photo_id', 'cover_alt', 'published_at'] as const satisfies readonly (typeof MARKETING_BLOG_POST_COLUMNS)[number][];
export type BlogListItem = Pick<MarketingBlogPostRow, (typeof LIST_COLS)[number]>;
const POST_COLS = ['slug', 'title', 'description', 'body', 'cover_photo_id', 'cover_alt', 'published_at'] as const satisfies readonly (typeof MARKETING_BLOG_POST_COLUMNS)[number][];
export type BlogPost = Pick<MarketingBlogPostRow, (typeof POST_COLS)[number]>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Published articles, newest first. Throws on a database error so the page can say so. */
export async function listBlogPosts(limit = 50): Promise<BlogListItem[]> {
  const { data, error } = await getSupabaseAdmin()
    .schema('marketing')
    .from('blog_posts')
    .select(sel<MarketingBlogPostRow, typeof LIST_COLS>(LIST_COLS))
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as BlogListItem[]) ?? [];
}

/** One article by its slug, or null. A malformed slug never reaches the database. */
export async function getBlogPost(slug: string | undefined): Promise<BlogPost | null> {
  if (!slug || slug.length > 80 || !SLUG.test(slug)) return null;
  const { data, error } = await getSupabaseAdmin()
    .schema('marketing')
    .from('blog_posts')
    .select(sel<MarketingBlogPostRow, typeof POST_COLS>(POST_COLS))
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as BlogPost | null) ?? null;
}

export type BlogCover =
  // A photo from the site's own library: an optimised asset, or a file in public/.
  | { kind: 'asset'; image: ImageMetadata }
  | { kind: 'file'; src: string; width: number; height: number }
  // An owner upload lives in the private bucket, so the page shows it through /blog/cover/<slug>.
  | { kind: 'upload'; src: string };

export function coverFor(photoId: string | null, slug: string): BlogCover | null {
  if (!photoId) return null;
  const lib = photoLibrary.find((p) => p.id === photoId);
  if (lib) {
    // The owner's own shoot photos are plain files in public/marketing-library (photo-library.ts).
    if (lib.image.src.startsWith('/marketing-library/')) {
      return { kind: 'file', src: lib.image.src, width: lib.image.width, height: lib.image.height };
    }
    return { kind: 'asset', image: lib.image };
  }
  if (photoId.startsWith(UPLOAD_ID_PREFIX)) return { kind: 'upload', src: `/blog/cover/${slug}` };
  return null;
}

/** "15 October 2026", in South African English. */
export function blogDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });
}

// Pages are rendered on demand; the edge keeps each for a minute, so a new article shows quickly.
export const BLOG_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600';
