# ⚠ STATUS — SUPERSEDED (read this first)

This standalone file has been **consolidated into `CLAUDE.md` §10.11**, the single source of truth. Preserved for reference/history; **nothing removed**; **where it conflicts with `CLAUDE.md`, `CLAUDE.md` wins.** The keyword strategy here is intact and authoritative. One correction: the **Rates page rate must be quoted VAT-inclusive** — **R62,100 / group (local), R74,520 (international)**, conservation levies included; the "R54,000 … excl. VAT" phrasing below is **superseded** (R54,000 is the ex-VAT net, shown only as a breakdown, never as the headline). See the inline ⚠ note in §3 and `CLAUDE.md` §8.5/§12.

---

# KEYWORD_MAP.md — Keyword &amp; Entity Map

Companion to `SEO.md`. Maps real search demand to each page so copy is written against what people (and AI engines) actually ask. Grounded in the live South African walking-safari / slackpacking market vocabulary; pairs with `TECHNICAL_SPEC.md` §I (per-page meta).

---

## 0. How to read this (and an honest caveat)

These clusters are **intent-grounded demand hypotheses** built from the language the SA market actually uses — not exact volume figures (no keyword tool was run). Treat the per-page *primary* terms as commitments and validate/refine everything against **Google Search Console queries** + a keyword tool (Ahrefs/Semrush/Keyword Planner) within the first 4–8 weeks of live data. Competitiveness notes below are based on observed market saturation.

**Three buckets of intent** run through every page:
- **Informational** — "what is slackpacking", "is a walking safari safe" → answered in content + GEO blocks.
- **Commercial/comparison** — "best Big 5 walking trail", "Waterberg slackpacking" → category pages, listicle placement.
- **Transactional** — "book / cost / rates" → the Rates page.

---

## 1. Positioning &amp; the keyword wedge

Don't fight Kruger and &amp;Beyond for head terms like **"walking safari South Africa"** or **"Big Five safari"** — those are dominated by huge, authoritative operators and the National Park. Win the **specific intersection** instead, where competition is thin and intent is precise:

> **A point-to-point, multi-day _slackpacking trail_ through _Big 5_ terrain, in the _Waterberg_, for an _exclusive private group_.**

Most "slackpacking" trails are coastal/mountain (Dolphin, Oystercatcher, Cederberg, Baviaans). Most "Big 5 walking safaris" are single-camp bases with bush walks + game drives. Almost nobody is *both*. That gap is the brand's keyword territory.

| Tier | Terms | Strategy |
|---|---|---|
| **Brand (own outright)** | the rooiberg wander · rooiberg wander trail/walk | Rank #1; reinforce with `Organization` schema + consistent naming |
| **Winnable niche (target hard)** | waterberg slackpacking · big 5 walking trail limpopo · multi-day walking safari waterberg · self-catered guided walking trail · exclusive walking trail private reserve · point-to-point big 5 trail | Low competition, high intent — primary battleground |
| **Category (compete via specificity)** | slackpacking south africa · guided walking trail south africa · waterberg hiking trails · luxury walking safari | Compete by being the *Waterberg + Big-5-trail* answer, not the generic one |
| **Head (don't chase; ride via GEO/listicles)** | walking safari south africa · big five safari | Pursue only through third-party listicles + AI citations, not direct ranking |

---

## 2. Global entity list

Use these **consistently** across copy, schema (`schema.ts`), `llms.txt`, and alt text. Consistency is how Google's Knowledge Graph and LLMs resolve "what/where" this is (see `SEO.md` §5).

- **Brand:** The Rooiberg Wander
- **Category entities:** slackpacking · guided walking trail · walking safari · Big 5 / Big Five (on foot) · multi-day hiking trail · point-to-point trail · self-catered trail · luggage porterage
- **Place entities:** RoiSan Reserve · Waterberg · Waterberg Biosphere · Limpopo · South Africa · Big 5 private game reserve · D970 (access route)
- **Trail entities:** Rotavi Lodge · Oukraal · VierVanAcht · Groenkop · Welgedacht lookout · Welgedacht donga
- **Feature entities:** Two-Man Rule · two armed wilderness guides · FGASA Lead Trails Guide · ~20 km per day · 3 nights / 3 days · max 10 guests · exclusive group use · conservation levies
- **Operator entity:** RoiSan Reserve NPC
- **Comparison set (for context, not copying):** Baviaans Canyon Trail · Dolphin Trail · Oystercatcher Trail · Cederberg Heritage Route

---

## 3. Per-page keyword map

Each page owns a distinct primary term (no cannibalisation — see §6). "Questions" feed GEO/AEO: use them as `<h2>`s with an answer in the first sentence.

### Home — `/`
- **Intent:** brand + category discovery; the hook.
- **Primary:** `Big 5 slackpacking trail` (brand-led: *The Rooiberg Wander*)
- **Secondary:** walking safari Waterberg · exclusive guided walking trail · multi-day walking trail Big 5 · private game reserve walking trail
- **Long-tail:** 3 night slackpacking trail South Africa · walking trail through Big 5 reserve · exclusive walking trail up to 10 guests
- **Questions (GEO):** What is the Rooiberg Wander? · Where is the Rooiberg Wander? · What makes it different from a normal walking safari?
- **Recommended title / H1:** Title `The Rooiberg Wander — Exclusive Big 5 Slackpacking Trail` · H1 leads with the wilderness promise, first paragraph states the category + place in plain words ("a 3-night guided slackpacking trail through a private Big 5 reserve in the Waterberg").
- **Links to:** The Trail, Rates (primary CTA).

### The Trail — `/the-trail`
- **Intent:** informational; understand the journey before committing.
- **Primary:** `3 day walking trail itinerary` (Big 5 / Waterberg-qualified)
- **Secondary:** point-to-point walking trail · Rooiberg Wander route · ~20 km per day hiking trail · lodge-to-lodge walking trail
- **Long-tail:** 3 night 3 day slackpacking itinerary · do you walk on arrival day · how far do you walk per day on a slackpacking trail
- **Questions (GEO):** How long is the Rooiberg Wander? · How many kilometres do you walk each day? · Do you walk on the arrival day? · What is the route / where does it start and end?
- **Recommended H1:** "The 3-Night / 3-Day Rhythm" — answer-first day cards; explicitly state "no walking on Day 1" and "depart after the final walk on Day 4".
- **Links to:** Sanctuaries, Logistics, Rates.

### The Sanctuaries — `/sanctuaries`
- **Intent:** commercial; accommodation quality/where you sleep.
- **Primary:** `Waterberg trail lodges` (overnight camps on the trail)
- **Secondary:** Rotavi Lodge · Oukraal · VierVanAcht · walking trail overnight camps · bush lodge Waterberg
- **Long-tail:** where do you stay on the Rooiberg Wander · trail accommodation private game reserve Waterberg
- **Questions (GEO):** Where do you sleep on the trail? · What are the three sanctuaries? · Is the accommodation catered or self-catered?
- **Recommended H1:** "Three sanctuaries, one standard." Each card: Name → role → evocative description; name the entity in the first sentence.
- **Links to:** The Trail, Rates.

### Trail Logistics &amp; FAQ — `/logistics`
- **Intent:** informational + reassurance; the biggest GEO surface (questions galore).
- **Primary:** `self-catered walking trail` (what's included / how it works)
- **Secondary:** is a walking safari safe · armed guides walking safari · what is slackpacking · luggage transfer hiking trail · Big 5 walking trail safety
- **Long-tail:** how does a self-catered slackpacking trail work · do guides carry rifles on walking safaris · what do you need to bring on a slackpacking trail · two armed guides Big 5
- **Questions (GEO — answer each in one sentence, then detail):** What is slackpacking? · Is it safe to walk in a Big 5 reserve? · How many guides accompany the group? · What is the Two-Man Rule? · Is the trail catered or self-catered? · Who carries the luggage and food? · What do I need to bring? · Is the route finalised? *(route-status notice)*
- **Recommended treatment:** keep **visible** Q&A (LLMs cite this); `FAQPage` schema optional (Bing/AI only — Google dropped FAQ rich results May 2026, see `SEO.md` §4). Emphasise the safety block.
- **Links to:** The Trail, Rates.

### Rates &amp; Booking — `/rates`
- **Intent:** transactional; price + inquiry.
- **Primary:** `Rooiberg Wander rates` / `Big 5 walking trail cost`
- **Secondary:** walking trail price South Africa · book guided walking trail Waterberg · private group walking trail rate · exclusive trail booking
- **Long-tail:** how much does the Rooiberg Wander cost · slackpacking trail price for a group of 10 · walking trail rate including conservation levies
- **Questions (GEO):** How much does the Rooiberg Wander cost? · What's included in the price? · Is the rate per person or per group? · Do international visitors pay more? · How do I book / inquire?
- **Recommended H1:** "Rates &amp; Booking Inquiries." State the group rate plainly and early (R54,000 / group, up to 10, levies incl., excl. VAT; international +20%). Never expose internal figures.
  > ⚠ **SUPERSEDED by `CLAUDE.md` §8.5/§12:** quote the rate **VAT-inclusive** — **R62,100 / group** (local), **R74,520** (international), conservation levies included; show the R54,000 / R64,800 ex-VAT net + 15% VAT only as a breakdown. The internal R60k figure stays hidden. (Page is now "Rates &amp; Booking" with a live booking widget, not inquiries-only.)
- **Links to:** every page links *in* to this one.

---

## 4. Keyword → page ownership matrix (anti-cannibalisation)

One page owns each term so pages don't compete with each other in search.

| Keyword cluster | Owner page |
|---|---|
| brand / "rooiberg wander" | Home |
| Big 5 slackpacking trail / walking safari Waterberg | Home |
| itinerary / route / km per day / 3-day rhythm | The Trail |
| lodges / camps / where you sleep / sanctuary names | The Sanctuaries |
| safety / guides / what's included / what is slackpacking | Logistics &amp; FAQ |
| cost / price / rates / book / inquiry | Rates &amp; Booking |

If two pages start ranking for the same term in GSC, strengthen the owner and add an internal link from the other to it.

---

## 5. GEO question bank (cross-site)

The natural-language prompts to be answerable across the site — and the test set for measuring AI citation (`SEO.md` §10). Run these monthly through ChatGPT/Perplexity/Gemini/Google AI Overviews and note whether the brand is cited.

- "Multi-day walking safari in the Waterberg"
- "Slackpacking trail through a Big 5 reserve in South Africa"
- "Point-to-point guided walking trail Limpopo"
- "Self-catered walking trail with luggage transfer South Africa"
- "Exclusive private walking trail for a group of 10"
- "Where can I do a 3-day walking safari in the Waterberg?"
- "Big 5 walking trail with armed guides"
- "Walking safari that isn't in Kruger"
- "Luxury slackpacking South Africa 2026"
- "How much does a private group walking trail in South Africa cost?"

---

## 6. Content roadmap (post-launch GEO/SEO clusters)

Modest, excellent guides — each owns a query cluster and feeds both classic SEO and AI citation (`SEO.md` §9). Build only when the operation is past conceptual; keep it small and authoritative, not a content farm.

| Guide (target query) | Primary cluster | Why it ranks/cites |
|---|---|---|
| "What is slackpacking?" | definitional, high informational volume | Owns a clean definition LLMs quote; links to the trail |
| "Walking safely in Big 5 terrain" | safety intent + E-E-A-T | First-hand operator authority; cites well |
| "Best time to visit the Waterberg for walking" | seasonal/local | Captures planning-stage searchers |
| "What to pack for a 3-day slackpacking trail" | practical long-tail | Highly answerable; strong GEO list content |
| "Slackpacking vs walking safari: what's the difference?" | comparison | Owns the exact wedge this brand occupies |

---

## 7. Cannibalisation &amp; mapping rules

- One primary keyword per page (§4); supporting terms can repeat naturally but the *owner* gets the strongest title/H1/internal-link signal.
- Don't create new pages for individual keywords in this 5-page phase — fold them into the owning page as a section/question. New pages are a §6 (post-launch) decision.
- Anchor text into a page should use that page's owned terms ("see the full 3-day itinerary", "trail rates").

---

## 8. Validation &amp; next steps

1. Ship with these as working targets; wire Google Search Console + Bing Webmaster (`SEO.md` §10).
2. After ~4–8 weeks of data: pull GSC queries, find near-miss terms (positions 5–20), and tighten titles/copy toward them.
3. Run a keyword tool against the §1 winnable cluster to confirm volume and discover adjacent long-tail.
4. Pursue 2–3 listicle/directory placements for "slackpacking South Africa" / "Waterberg trails" — being in already-ranking lists is the strongest GEO lever.
5. Run the §5 prompt set monthly to track AI-citation visibility.

> Keep brand and entity naming identical everywhere. The single biggest, cheapest ranking *and* AI-citation advantage this site has is being unambiguously the one clear answer to "the multi-day Big 5 slackpacking trail in the Waterberg."