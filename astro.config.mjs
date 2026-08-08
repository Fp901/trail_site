// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// Build target:
//   - default (Vercel / local): SSR adapter, full booking backend.
//   - BUILD_TARGET=static (GitHub Pages): static-only export; the booking backend is excluded
//     by the Pages workflow (GitHub Pages cannot run servers). See README "Deploying".
const isStatic = process.env.BUILD_TARGET === 'static';

// On the custom domain (www.rooibergwander.co.za) the site is served from the root, so base is
// undefined. For a GitHub Pages *project* subpath (e.g. /trail_site, before the domain is wired)
// the workflow passes PAGES_BASE/SITE_URL from configure-pages, which read the configured domain.
const base = process.env.PAGES_BASE || undefined;
// Non-www is the production canonical (per the Vercel domain setup) — keeps the sitemap consistent
// with the canonical/og:url tags emitted by Seo.astro. SITE_URL (e.g. GitHub Pages) still overrides.
const site = process.env.SITE_URL || 'https://rooibergwander.co.za';

// https://astro.build/config
export default defineConfig({
  site,
  base,

  // 301: the old /sanctuaries route is now /accommodation (content carried forward). Permanent so
  // search engines transfer ranking to the new URL.
  redirects: {
    '/sanctuaries': { status: 301, destination: '/accommodation' },
  },

  // Content-Security-Policy (Part 11.2). Astro auto-hashes the inline <script>/<style> it emits and
  // writes a <meta http-equiv> CSP.
  //
  // style-src no longer lists 'unsafe-inline', and this is a FIX rather than a tightening: Astro
  // always appends its own 'sha256-…' style hashes, and per CSP2+ the presence of any hash or nonce
  // makes browsers IGNORE 'unsafe-inline' entirely. So the previous
  //   style-src 'self' 'unsafe-inline' 'sha256-…' 'sha256-…'
  // did not permit inline styles at all — every style="" attribute on the site was blocked in
  // production while working fine in dev (which emits no CSP). That silently killed the --accent
  // custom property on day cards, sanctuary cards and the route-map legend. All six inline style
  // attributes are now driven by [data-accent] / utility classes instead, so nothing needs
  // 'unsafe-inline' and listing it only made the policy look more permissive than it was.
  // (Runtime CSSOM writes like el.style.overflow in MobileMenu are unaffected — CSP governs style
  // ATTRIBUTES and <style> elements, not CSSOM property assignment.)
  //
  // NB: <meta> CSP cannot set frame-ancestors — clickjacking is covered by X-Frame-Options: DENY
  // (vercel.json). Paystack is a full-page REDIRECT (not an iframe/inline script), so it needs no
  // script-src/frame-src entry; connect-src allows Supabase (availability read) + 'self' (Actions).
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' https://*.supabase.co",
        "form-action 'self'",
      ],
      styleDirective: {
        resources: ["'self'"],
      },
    },
  },

  // Marketing pages stay prerendered (static); booking + API routes opt into SSR via
  // `export const prerender = false`. SSR needs a server adapter (Part 2).
  // Adapter = Vercel (swap to @astrojs/netlify in one line if preferred). Omitted for static.
  ...(isStatic ? {} : { adapter: vercel() }),

  integrations: [
    sitemap({
      // Exclude transactional API + booking routes (Part 10.1).
      filter: (page) =>
        !page.includes('/api/') &&
        !page.includes('/booking/') &&
        !page.includes('/pretrip') &&
        !page.includes('/trip-info') &&
        !page.includes('/admin'),
    }),
  ],

  // Tailwind v4 via the Vite plugin ONLY (Part 2 / Part 3).
  // Do NOT add @astrojs/tailwind or a tailwind.config.* — that is the deprecated v3 path.
  vite: {
    plugins: [tailwindcss()],
  },
});
