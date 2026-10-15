// The cover photo of a published blog article when it is one of the owner's uploads (CLAUDE.md
// Part 18, migration 0025). Uploads live in the PRIVATE marketing-photos bucket and the site's CSP
// allows images from 'self' only, so the article shows the cover through this route. It serves
// only the cover of an article that is live: no other upload can be reached here.
import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { getBlogPost } from '../../../lib/blog-posts';
import { MARKETING_PHOTO_BUCKET, UPLOAD_ID_PREFIX } from '../../../lib/marketing-photos';

export const prerender = false;

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

export const GET: APIRoute = async ({ params }) => {
  let post;
  try {
    post = await getBlogPost(params.slug);
  } catch {
    return new Response('Unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
  if (!post?.cover_photo_id?.startsWith(UPLOAD_ID_PREFIX)) return notFound();
  const sb = getSupabaseAdmin();
  const { data: row } = await sb
    .schema('marketing')
    .from('photos')
    .select('storage_path, content_type')
    .eq('id', post.cover_photo_id.slice(UPLOAD_ID_PREFIX.length))
    .maybeSingle();
  if (!row) return notFound();
  const { data: file, error } = await sb.storage.from(MARKETING_PHOTO_BUCKET).download(String(row.storage_path));
  if (error || !file) return notFound();
  return new Response(file, {
    headers: {
      'Content-Type': String(row.content_type),
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
