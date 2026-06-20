# ⚠ STATUS — SUPERSEDED (read this first)

This standalone file has been **consolidated into `CLAUDE.md` Part 10**, the single source of truth. Preserved for reference/history; **nothing removed**; **where it conflicts with `CLAUDE.md`, `CLAUDE.md` wins.** Most of this file is still valid (marketing pages remain static and crawl-optimal). Two additions post-date it:
> 1. **Dynamic routes exist now.** The booking/`/api/` routes (`/booking/confirm`, `/booking/cancel`, `/api/payments/webhook`) must be **`noindex` and excluded from the sitemap**; only the five marketing pages are indexable (`CLAUDE.md` §10.1).
> 2. **Pricing in content is VAT-inclusive** — R62,100 local / R74,520 international (ZAR), international +20% on the net. Use these figures in titles/descriptions/`Offer` schema; never the internal R60k figure.
>
> Also note: `TECHNICAL_SPEC.md` referenced below no longer exists as a separate file — its per-page meta now lives in `CLAUDE.md` §8.8.

---

# SEO.md — Search &amp; AI-Visibility Masterplan (2026)

Companion to `CLAUDE.md`, `DESIGN.md`, `TECHNICAL_SPEC.md`, `SECURITY.md`. This file makes the site a technical-SEO *masterpiece from day one* and sets the playbook for the part of "ranking high" that a build alone can't deliver.

---

## 0. The honest framing (read this first)

A build controls **technical and on-page SEO** — and those can be flawless at launch. A build does **not** control the two things that actually decide rankings: **content depth/quality** and **authority (links, mentions, reputation)**, both of which compound over *time* in a competitive field. So:

- **Day 1, guaranteed:** crawlable, fast, fully structured, schema-rich, AI-readable, mobile-first, accessible — a site that gives every page its best possible shot.
- **Earned over weeks/months:** position 1 for competitive terms. Anyone promising "rank #1 at launch" is selling. What we *can* promise is that nothing technical will hold the site back.

In 2026 there are **two visibility layers**, and we optimise for both:
1. **Classic search** (Google/Bing organic results).
2. **Generative engines** — being *cited* inside Google AI Overviews, ChatGPT, Perplexity, Gemini, Copilot. This is **GEO/AEO** (Generative/Answer Engine Optimization) and in 2026 it is not optional — a large and growing share of searches end without a click to a blue link.

---

## 1. Technical SEO foundation (the stack already wins here)

The Astro static architecture is a structural advantage — there is no JS framework hydration tax on crawl or render.

- **Static prerendering** → every page is complete HTML on first byte; ideal for both Googlebot and LLM crawlers (which often don't execute JS).
- **HTTPS + HSTS**, HTTP→HTTPS redirect (see `SECURITY.md`).
- **Clean, lowercase, hyphenated URLs** matching nav (`/the-trail`, `/sanctuaries`, `/logistics`, `/rates`). No params, no trailing-slash ambiguity — pick one and 301 the other.
- **Self-canonical** on every page (`<link rel="canonical">`, absolute URL). Handled by `Seo.astro`.
- **XML sitemap** via `@astrojs/sitemap` (`sitemap-index.xml`); reference it in `robots.txt`. Configure it to include images (`serialize`/`images` option) so the trail photography is discoverable.
- **`robots.txt`** allows crawling and **explicitly welcomes AI crawlers** (see §6) and points to the sitemap.
- **Custom `404.astro`** that keeps users on-site (links to all pages).
- **One render target, no soft-404s, no orphan pages** — every page is linked from the nav and footer.
- **`lang="en-ZA"`** on `<html>`; declare currency as ZAR in content.

---

## 2. On-page SEO (per page)

Per-page metadata is specified in `TECHNICAL_SPEC.md` §I; the rules:

- **Title** — unique, ≤ ~60 chars, primary entity + qualifier, brand last. Pattern: `Primary Topic — The Rooiberg Wander`.
- **Meta description** — unique, ~150 chars, benefit + a concrete detail + soft CTA. Not a ranking factor directly, but drives CTR.
- **Headings** — exactly one `<h1>` per page stating the page's subject; logical `<h2>/<h3>` nesting. Headings phrased as the things people search (see §6).
- **Semantic HTML** — `header/nav/main/article/section/footer`, real lists, real tables. Structure *is* a signal.
- **Internal linking** — every page links toward `/rates` (conversion) and across to relevant siblings with **descriptive anchor text** ("the 3-day itinerary", not "click here").
- **Images** — descriptive filenames (`rooiberg-ridge-traverse.avif`, not `IMG_4821`), meaningful `alt` (see `TECHNICAL_SPEC.md` §H), AVIF/WebP, explicit dimensions, lazy below the fold, hero eager + `fetchpriority="high"`.
- **No keyword stuffing.** Write for a person who is deciding whether to book a once-in-a-lifetime walk.

---

## 3. Core Web Vitals (2026)

Google's **"good" thresholds** (75th percentile of *real-user field data*, 28-day rolling window) are **unchanged**: **LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1**. (Note: some 2026 articles claim LCP tightened to 2.0s after a "March 2026 update"; Google's own web.dev/Search Central docs still list 2.5s as of June 2026. We treat 2.0s as an internal safety target, not the official bar.)

**Our internal budgets / alert lines** (≈80% of threshold):

| Metric | Good (Google) | Our target | Alert at |
|---|---|---|---|
| LCP | ≤ 2.5s | < 2.0s | > 2.0s |
| INP | ≤ 200ms | < 150ms | > 160ms |
| CLS | ≤ 0.1 | < 0.05 | > 0.08 |

Why we win these easily:
- **INP** (the metric ~43% of sites fail in 2026) is trivial here — we ship near-zero JS, only two small islands. Keep event handlers light; no blocking third-party scripts.
- **LCP** — self-hosted preloaded fonts (`font-display: swap`), hero image eager + `fetchpriority="high"` in AVIF, critical CSS inlined by Astro.
- **CLS** — explicit `width`/`height` on every image/embed; reserve space for the sticky nav and any dynamic content; `text-wrap: balance` won't shift layout.

Measure with **field data (CrUX / Search Console)**, not just lab Lighthouse. Lighthouse is a pre-launch gate; CrUX is the truth.

---

## 4. Structured data / Schema (2026 reality)

JSON-LD only, emitted by `Seo.astro` from builders in `src/data/schema.ts`. Validate every type with Google's Rich Results Test and Schema.org validator before launch.

**Types that still earn rich results in 2026** (use these): `Organization`, `LocalBusiness` (and the more specific tourism types), `BreadcrumbList`, `Article` (if a blog is added), `Event` (if/when dated departures exist), `ImageObject`/`VideoObject`.

**Ship on every page:**
- `Organization` (or `LocalBusiness`/`TouristAttraction`) — name, URL, logo, `sameAs` (socials when they exist), `areaServed`, geo region (Waterberg, Limpopo, ZA). This is the **entity anchor** that both Google's Knowledge Graph and LLMs use to understand "who" the brand is.
- `BreadcrumbList` — reflects the page hierarchy; still produces breadcrumb rich results.
- `WebSite` + `WebPage` per page.

**Ship where relevant:**
- **`TouristTrip`** on Home / The Trail — `itinerary` as an `ItemList` of the four days, `touristType`, duration. Google doesn't render a special rich result for `TouristTrip`, but it's strong **entity/AI signal** — LLMs use it to describe the product accurately.
- **`TouristAttraction`** for each sanctuary (name, geo, description).
- **`Offer`/`PriceSpecification`** on `/rates` — group rate, currency ZAR, conditions. (Don't expose the internal R60k figure.)

**FAQ note (important, 2026):** Google **deprecated FAQ rich results on 7 May 2026** — `FAQPage` markup no longer produces the expandable Q&A in Google Search, and the Search Console FAQ report/Rich-Results-Test support is being retired (June 2026; API August 2026). **However:** the `FAQPage` schema type is *not* deprecated, doesn't harm rankings, and is still parsed by Bing and AI crawlers. **So:** keep the **visible** Q&A content on the Logistics page (that's what LLMs extract and cite), and including `FAQPage` JSON-LD is optional/low-cost — keep it for Bing/AI engines, just don't expect a Google rich result.

---

## 5. GEO / AEO — getting cited by AI engines (the 2026 essential)

Goal: when someone asks an AI "guided walking safaris in the Waterberg" or "Big 5 slackpacking trail South Africa," The Rooiberg Wander is in the cited answer. LLMs retrieve and quote **self-contained, factual passages from trusted, well-structured pages.**

Write for extraction:
- **Question-shaped headings** that mirror real queries ("What is the Rooiberg Wander?", "How long is each day's walk?", "Is it safe in a Big 5 area?"), each followed by a **direct, standalone answer in the first sentence**, then detail.
- **Lead with the fact.** First sentence of a section answers the question; don't bury it after throat-clearing.
- **Be specific and quotable.** Concrete numbers and named entities (3 nights, ~20 km/day, max 10 guests, Two-Man Rule, Rotavi/Oukraal/VierVanAcht, Waterberg) are exactly what gets cited.
- **Entity clarity & consistency.** Identical Name/brand, location, and description everywhere; `Organization` schema; a clear "About"/operator section. Consistency is how AI resolves "who" you are.
- **Authority & corroboration.** AI engines lean on sources that are *already* cited elsewhere. Earn mentions in regional tourism listicles, hiking directories, and "best slackpacking trails in South Africa" roundups — being in already-ranking lists is one of the most reliable GEO levers.
- **`llms.txt`** at the site root — a concise, link-rich map of the most important pages for LLMs (shipped in this repo; keep it updated).
- **Allow AI crawlers** in `robots.txt` (§6). You cannot be cited by an engine you've blocked.
- **Plain, well-formatted prose** — short paragraphs, real lists/tables, no content hidden behind interactions LLM crawlers won't trigger.

> The same content that's good for GEO (clear questions, direct answers, real specifics) is also good for humans and classic SEO. There is no separate "AI content" — there's just clearer content.

---

## 6. Crawler &amp; AI-bot policy (`robots.txt` + `llms.txt`)

- Allow general crawling; reference the sitemap.
- **Explicitly allow** the major AI crawlers so the site is eligible for AI citations: `GPTBot`, `OAI-SearchBot` (OpenAI), `PerplexityBot`, `ClaudeBot`/`anthropic-ai`, `Google-Extended` (governs Gemini/AI Overviews use), `Bingbot` (also feeds Copilot). The shipped `robots.txt` does this.
- Decision point for the client: allowing `Google-Extended` and `GPTBot` permits AI use of the content. For a marketing site that *wants* AI visibility, allow them. If the client ever wants to opt out of AI training, that's a one-line change — flag it as their call.
- Ship `llms.txt` (and optionally `llms-full.txt`) summarising the site for LLMs.

---

## 7. Local SEO (this is a destination — don't skip it)

The product is a physical place in the Limpopo Waterberg; local signals matter for "walking trail near…", map results, and AI "places" answers.

- **Google Business Profile** — create/claim it once the operation is real (category: e.g. "Hiking area"/"Tour operator"); this is the single highest-impact local lever. (Client action, post-conceptual.)
- **NAP consistency** — identical Name, Address (or service area), Phone everywhere on-site and across directories.
- **`LocalBusiness`/geo schema** — `areaServed`, `geo` coordinates of Rotavi Lodge basecamp, `address` region.
- **Locality in content** — natural mentions of Waterberg, Limpopo, nearest town/route (D970), "private Big 5 reserve" — these are the modifiers people and AIs use.
- **Reviews** — plan for them later; review signals feed both local pack and AI trust.

---

## 8. Internationalisation (do it right, don't over-engineer)

- Primary market is local SA → `lang="en-ZA"`, prices in **ZAR**, the +20% international rate stated in content.
- **Do NOT add `hreflang` now.** It's only correct when there are genuinely separate localized URLs. A single English site needs none; premature hreflang creates errors. Revisit only if dedicated international/translated pages are built.

---

## 9. Content &amp; E-E-A-T (where ranking is actually won)

Technical SEO gets you eligible; **content and authority** get you ranked. E-E-A-T = Experience, Expertise, Authoritativeness, Trust.

- **Own the niche entities.** Be the definitive page for "Rooiberg Wander," and a strong page for "Waterberg Big 5 walking trail," "slackpacking South Africa," "guided wilderness trail Limpopo."
- **Demonstrate real experience** — authentic photography (when assets arrive), specifics only an operator would know, the named guides/qualifications (FGASA Lead Trails), the actual logistics. Originality and first-hand detail are what Google's helpful-content systems and AI engines reward.
- **Trust signals** — clear operator identity (RoiSan Reserve), safety credentials, transparent pricing, a privacy notice, real contact path.
- **Content roadmap (post-launch, when not conceptual):** a small set of genuinely useful guides — "What is slackpacking?", "What to pack for a 3-day Big 5 walk," "Walking safely in Big 5 terrain," "Best time to visit the Waterberg." Each targets a real query cluster and feeds both SEO and GEO. Keep it modest and excellent, not a content farm.
- **Freshness** — update the route-status notice and any dated content as the project moves from conceptual to live.

---

## 10. Measurement &amp; tooling

You can't improve what you don't measure. Set up at launch:

- **Google Search Console** (verify; submit sitemap) — the source of truth for impressions, queries, CTR, indexing, and Core Web Vitals field data.
- **Bing Webmaster Tools** — Bing's index also feeds Copilot and parts of ChatGPT search; cheap to add.
- **Privacy-friendly analytics** (e.g. Plausible/Fathom/GA4-with-consent) — respect the `SECURITY.md`/POPIA stance; load async, don't let it hurt INP.
- **Field CWV** — Search Console + optional RUM; alert at the §3 lines.
- **LLM-visibility tracking** — periodically prompt ChatGPT/Perplexity/Gemini/Google AI Overviews with 10–20 real prospect queries; note whether and how the brand is cited. This is the GEO equivalent of rank tracking.
- **Validation gates (pre-launch):** Rich Results Test (schema), PageSpeed Insights (lab + field), Lighthouse (Perf/A11y/Best-Practices/SEO via `npm run lh`), mobile-friendly check.

---

## 11. Day-1 launch checklist

- [ ] Every page: unique title + meta description + self-canonical + OG/Twitter (via `Seo.astro`).
- [ ] One `<h1>` per page; question-shaped, query-matching `<h2>`s with answer-first paragraphs.
- [ ] JSON-LD on every page: `Organization` + `BreadcrumbList` + `WebPage`; `TouristTrip` on Home/Trail; `TouristAttraction` per sanctuary; `Offer` on Rates. All validated.
- [ ] `sitemap-index.xml` generated (with images) and referenced in `robots.txt`.
- [ ] `robots.txt` allows Googlebot, Bingbot, and AI crawlers; `llms.txt` present and accurate.
- [ ] Core Web Vitals pass in Lighthouse lab (targets in §3); hero preloaded; all images dimensioned.
- [ ] `lang="en-ZA"`; ZAR pricing; no premature hreflang.
- [ ] Custom 404; internal links to `/rates` from every page; descriptive anchors.
- [ ] Search Console + Bing Webmaster verified; sitemap submitted; analytics live (consent-aware).
- [ ] Visible Q&A on Logistics (GEO); `FAQPage` schema optional (Bing/AI only — no Google rich result expected).
- [ ] No internal/business-plan data exposed; privacy notice present.

## 12. Ongoing cadence (post-launch)

Monthly: review GSC queries → tighten titles/content for near-miss queries; check CWV field data; run the LLM-visibility prompts; pursue 2–3 quality directory/listicle placements. Quarterly: refresh content, add a guide from the §9 roadmap, audit schema against Google's current supported list (it narrows over time).

---

**Bottom line:** technically, the site will launch as a masterpiece — fast, structured, schema-rich, AI-readable, accessible. Turning that into top rankings is the content-and-authority work in §5/§9/§12, which compounds with consistency over time. The build removes every technical excuse for not ranking; the rest is earned.