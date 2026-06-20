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

// For GitHub Pages project sites the app is served from a subpath, e.g. /my-repo.
// The workflow passes PAGES_BASE and SITE_URL; defaults keep root + the placeholder domain.
const base = process.env.PAGES_BASE || undefined;
const site = process.env.SITE_URL || 'https://www.rooibergwander.co.za';

// https://astro.build/config
export default defineConfig({
  site,
  base,

  // Marketing pages stay prerendered (static); booking + API routes opt into SSR via
  // `export const prerender = false`. SSR needs a server adapter (Part 2).
  // Adapter = Vercel (swap to @astrojs/netlify in one line if preferred). Omitted for static.
  ...(isStatic ? {} : { adapter: vercel() }),

  integrations: [
    sitemap({
      // Exclude transactional API + booking routes (Part 10.1). /privacy is excluded only
      // while it is a noindex stub — re-include it once the real policy lands.
      filter: (page) =>
        !page.includes('/api/') &&
        !page.includes('/booking/') &&
        !page.includes('/privacy'),
    }),
  ],

  // Tailwind v4 via the Vite plugin ONLY (Part 2 / Part 3).
  // Do NOT add @astrojs/tailwind or a tailwind.config.* — that is the deprecated v3 path.
  vite: {
    plugins: [tailwindcss()],
  },
});
