// Guest testimonials for the homepage. INTENTIONALLY EMPTY until real guest reviews exist.
// The Testimonials component renders nothing while this array is empty, so no fabricated quotes
// are ever shown (CLAUDE.md Part 12). To publish testimonials, add real entries below and the
// homepage section appears automatically. Never invent quotes, names, or locations.

export interface Testimonial {
  quote: string;
  name: string;
  location?: string;
}

export const testimonials: Testimonial[] = [];
