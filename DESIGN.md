> # ⚠ STATUS — SUPERSEDED (read this first)
> This standalone file has been **consolidated into `CLAUDE.md`**, which is the single source of truth Claude Code reads every session. It is preserved here for reference/history and **nothing has been removed**, but **where anything below conflicts with `CLAUDE.md`, `CLAUDE.md` wins** (the visual bible now lives in `CLAUDE.md` **Part 5**). Two project-wide changes post-date this file and override it wherever they touch:
> 1. **Architecture:** the project moved from *static, no-backend, inquiry-to-email* to a **transactional booking site (Astro SSR for booking/API routes + Paystack + Supabase)**. Marketing pages stay static. There are now **three islands** (`MobileMenu`, `InquiryForm`, **`BookingWidget`**), and the Rates page hosts a real booking flow.
> 2. **Pricing display:** consumer prices are shown **VAT-inclusive** — **R62,100 / group local, R74,520 international** (R54,000 / R64,800 net + 15% VAT, conservation levies incl.). The "excludes VAT" wording below is **superseded**.
> See `CLAUDE.md` Part 16 (Reconciliation Log) and the inline ⚠ notes below.
>
> ---
>
> **How this file fits the build (read first).** This is the project's **visual bible** — the authority on *look, feel, and component treatment*. Claude Code must read it before building or restyling any UI. It is reconciled with the rest of the system as follows:
> - **Tokens are real, not aspirational:** the palette in §4 and the type direction in §3 are implemented as CSS-first `@theme` tokens in `src/styles/global.css` (Tailwind v4 — there is no `tailwind.config.mjs`). Use the token variables (`--color-earth`, `--color-ochre`, …), never hard-coded hexes.
> - **Display vs body fonts:** Playfair Display is the display/heading face; Inter (variable, self-hosted via Fontsource) is **body only**. §2's "avoid Inter" rule refers to hero/display use — it must never be a headline face.
> - **Buttons:** the no-pill, refined CTA treatment in §6 is encoded as `.btn` / `.btn-primary` / `.btn-secondary` in `global.css` (considered rounding via `--radius-md`, never `rounded-full`).
> - **Companion docs:** `CLAUDE.md` (how to build + workflow), `TECHNICAL_SPEC.md` (exact copy, data, acceptance criteria), `SECURITY.md` (OWASP baseline). Where build mechanics conflict, follow CLAUDE.md; where security conflicts, follow SECURITY.md; for everything visual, this file governs.

---

# DESIGN.md — Visual & Component Direction for The Rooiberg Wander

**Version**: 2.0 (Expanded with component-level specifications)
**Goal**: Deliver a distinctive, premium, emotionally resonant website that feels hand-crafted and specific to the Rooiberg wilderness experience — never generic or template-like.

---

## 1. Core Aesthetic Philosophy

**Brand Personality** (apply to every visual decision):
- Raw yet refined
- Cinematic & atmospheric
- Exclusive & intimate (max 10 guests)
- Grounded, powerful, and timeless
- South African veld elegance — not polished safari luxury, but wild and considered

**Overall Feeling to Evoke**:
Visitors should feel the dramatic scale of the Rooiberg mountains, the quiet intimacy of a small exclusive group, and the deep confidence of a world-class guided wilderness experience. The design should feel expensive in the best way: thoughtful, authentic, and quietly powerful.

**Visual References** (for tone and quality, not direct copying):
- &Beyond and Singita (cinematic photography + elegant restraint)
- Leopard Trail / Baviaans Canyon Trail (practical, high-conversion wilderness storytelling)
- High-end editorial nature photography (golden hour light, dramatic scale, authentic moments)
- Premium adventure editorial (restrained, textural, grounded)

---

## 2. Strict Anti-Slop Rules (Never Violate)

- **No** generic system fonts as primary (avoid Inter, Roboto, Arial, SF Pro as hero fonts)
- **No** heavy drop shadows or "modern card" aesthetics with thick borders + big shadows
- **No** centered-everything layouts or symmetrical grids as default
- **No** purple, blue, or corporate gradients
- **No** timid, evenly distributed color palettes
- **No** overused Tailwind component patterns without strong justification
- **No** decorative line icons or generic heroicons without personality
- Always ask: "Could this exist on any generic travel site?" If yes → redesign.

---

## 3. Typography System

**Primary Display / Headings**
- Use a distinctive serif or strong display face with presence (e.g. Playfair Display, or equivalent with character and good pairing potential).
- Large sizes with generous tracking on hero headlines.
- Strong contrast in weight and size.

**Body & UI Text**
- High-quality, highly legible sans-serif with subtle character (avoid the most common defaults).
- Excellent screen rendering and pairing with the display font.

**Hierarchy Rules**:
- Create clear rhythm and breathing room.
- Use size, weight, and color (not just size) to create hierarchy.
- Generous line-height (1.5–1.7 for body, tighter for headings).

**Mobile Adjustments**:
- Slightly tighter tracking and line-height on mobile for better readability in constrained space.

---

## 4. Color System

**Core Palette** (implemented as `@theme` tokens in `global.css`):
- `--color-earth`: #3D2B1F (dominant deep earth)
- `--color-ochre`: #C19A6B (sharp, warm accent)
- `--color-green`: #4A5D23 (muted supporting green)
- `--color-charcoal`: #2C2C2C (text)
- `--color-cream`: #F5F0E6 (backgrounds & cards)

**Usage Rules**:
- Dominant use of deep earth and cream for calm, grounded feeling.
- Ochre used sparingly as a sharp, high-quality accent (CTAs, key highlights, subtle dividers).
- Green used for secondary elements and nature connection.
- High contrast text on all backgrounds (WCAG AA minimum, preferably AAA). Verify ochre-on-cream and text-over-image combinations explicitly.

---

## 5. Spacing & Layout System

**Spacing Scale** (use consistently):
- Base unit: 4px or 8px system
- Generous whitespace is a feature — it should feel luxurious, not empty.
- Prefer asymmetric or flowing layouts over rigid 12-column grids where it enhances the wilderness feeling.

**Key Principles**:
- Large breathing room around major sections.
- Tighter, more intentional spacing inside components.
- Mobile: Maintain generous touch targets while reducing overall whitespace appropriately.

---

## 6. Component Guidelines (Specific)

### Hero Section
- Full-bleed cinematic image or subtle video background with natural golden-hour quality.
- Strong but elegant text overlay with excellent contrast.
- Headline should feel poetic and grounded (large, distinctive typography).
- Tagline secondary and more intimate.
- Primary CTA in ochre with refined treatment (not a big pill button).
- Secondary CTA more understated.
- Subtle atmospheric treatment (very light vignette or gradient if needed, but prefer natural image quality).
- On mobile: Maintain impact — large typography that scales well, clear CTAs.

### Navigation
- Clean, minimal top bar on desktop with excellent typography.
- Logo treatment that feels considered (not overly stylized).
- Desktop links with refined hover states (subtle color or underline treatment).
- Mobile: Elegant hamburger that opens to a full-screen overlay with generous spacing and clear hierarchy.
- Sticky behavior on scroll (subtle background blur or solid cream when scrolled).

### Itinerary / Timeline (The Trail page)
- Vertical timeline on both desktop and mobile (excellent on mobile).
- Clear day markers with strong typography.
- Each day card/section should feel distinct and atmospheric.
- Use subtle visual differentiation (color accents per day, iconography with personality, or imagery treatments).
- Generous spacing between days.
- Highlight the "No walking on Day 1" and "Depart after final walk on Day 4" information clearly but elegantly.
- Avoid generic vertical line + dot patterns — make it feel more organic and considered.

### Sanctuary Cards / Sections
- Distinct visual treatment for each of the three sanctuaries while maintaining overall cohesion.
- High-quality imagery treatment (even with placeholders).
- Clear hierarchy: Name → Role in the journey → Short evocative description.
- Subtle differentiation (different accent colors or subtle border treatments).
- On hover (desktop): Very restrained lift or image treatment — nothing flashy.
- Mobile: Excellent tap targets and readable text.

### Pricing / Rates Section
- Clean, transparent matrix or card layout.
- Make the local vs international distinction clear and elegant.
- Strong typography for the price itself.
- Include the "includes conservation levies, excludes VAT" note in refined small text.
  > ⚠ **SUPERSEDED by `CLAUDE.md` §8.5/§12:** display **VAT-inclusive** — headline **R62,100** (local) / **R74,520** (international), small text "incl. VAT (15%) and conservation levies", with the ex-VAT (R54,000 / R64,800) + VAT breakdown beneath. Do **not** print "excludes VAT" and never show the internal R60k figure.
- The section should feel trustworthy and premium.

### Inquiry / Booking Form
> ⚠ **EXPANDED by `CLAUDE.md` §5.6/Part 9:** there is now a real **`BookingWidget`** island (date, group size, residency → server-computed total → Paystack hosted checkout) **in addition to** the optional inquiry/"enquire" path described below. Apply this section's field treatment to **both**; the booking widget must feel calm and confidence-inspiring, show a clearly-labelled estimate ("final total confirmed at checkout"), and never act on a client-sent price.
- Clean, minimal form fields with excellent labels and spacing.
- High-quality focus states (subtle ochre accent).
- Submit button treatment that matches the premium CTA style.
- Success state should feel calm and reassuring (not overly celebratory).
- A short, plain-language privacy note sits near the submit button (POPIA — see SECURITY.md §9).
- On mobile: Stack naturally with large tap targets.

### Buttons & CTAs
- Primary: Ochre background with excellent typography and refined hover/active states.
- Secondary: Subtle treatment (outline, text-only, or cream background).
- All buttons should have excellent touch targets on mobile (≥44px).
- Avoid generic pill shapes — consider slightly more considered rounding or treatment that fits the earthy aesthetic.

### Cards & Content Blocks
- Subtle borders or very light backgrounds rather than heavy shadows.
- Generous internal padding.
- Clear visual hierarchy inside cards.
- Avoid overused "modern card" aesthetics.

### Footer
- Clean and minimal.
- Good typography and spacing.
- Include necessary legal/placeholder information without clutter.

---

## 7. Interaction & Motion Language

- **Subtle and intentional** — never flashy or trendy.
- Hover states: Very refined lifts, color shifts, or image treatments.
- Transitions: Smooth and natural (use appropriate easing).
- Focus states: Clear but elegant (ochre accent where appropriate).
- Mobile interactions: Prioritize touch feedback and performance.
- Overall motion should feel grounded and confident, not playful or energetic.
- Always honour `prefers-reduced-motion` (implemented in `global.css`).

---

## 8. Imagery & Photography Direction

- Prioritize atmospheric, high-quality, emotionally resonant images.
- Golden hour and dramatic natural light preferred.
- Images should feel authentic to the Rooiberg (rugged mountains, open terrain, small groups, guides).
- Purposeful overlays and text treatment for readability.
- On mobile: Images should still feel impactful (consider cropping or treatment that works vertically).
- Do not fabricate photo credits or specific lodge features; real assets are supplied separately.

---

## 9. Page-Specific Notes

- **Home**: Hero must stop people. Quick stats bar should feel premium and scannable. Overall tone: invitation into a special experience.
- **The Trail**: Focus on the journey and rhythm. Make the "no walking on arrival" and departure timing very clear.
- **Sanctuaries**: Each should feel distinct but part of one cohesive high-standard experience.
- **Logistics & Safety**: Important information presented clearly and reassuringly without alarmism.
- **Rates**: Transparent, trustworthy, and premium.

---

## 10. Final Quality Filter

Before finalizing any section or component, ask:
- Does this feel like it belongs specifically to The Rooiberg Wander?
- Would this look out of place next to &Beyond or a top slackpacking trail site?
- Is there emotional impact, or does it feel generic?
- Is the typography, spacing, and treatment distinctive and considered?
- Does it work exceptionally well on mobile?

**When in doubt, make it more restrained, more typographic, and more atmospheric.**

---

This DESIGN.md is the detailed visual bible for the project. Combine it with `CLAUDE.md`, `TECHNICAL_SPEC.md`, and `SECURITY.md` for maximum results. Update it as the design evolves.