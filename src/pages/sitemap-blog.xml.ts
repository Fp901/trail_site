// The blog's sitemap (CLAUDE.md Part 10.1, Part 18). @astrojs/sitemap lists only the prerendered
// pages, and the blog is rendered on demand, so its articles are listed here instead and
// robots.txt names this file as a second sitemap. The blog index appears once it has an article.
import type { APIRoute } from 'astro';
import { listBlogPosts } from '../lib/blog-posts';
import { blogUrl } from '../lib/blog';
import { site } from '../data/site';

export const prerender = false;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async () => {
  let posts: Awaited<ReturnType<typeof listBlogPosts>> = [];
  try {
    posts = await listBlogPosts(1000);
  } catch {
    return new Response('Unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
  const urls = posts.length
    ? [
        { loc: `${site.canonicalUrl.replace(/\/$/, '')}/blog`, lastmod: posts[0].published_at },
        ...posts.map((p) => ({ loc: blogUrl(p.slug), lastmod: p.published_at })),
      ]
    : [];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod.slice(0, 10)}</lastmod></url>`).join('\n') +
    (urls.length ? '\n' : '') +
    '</urlset>\n';
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600' },
  });
};
