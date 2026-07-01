// Global site strings — Part 8 (verbatim where specified) + a few derived defaults.
// Single source for SEO, Nav and Footer. Page-specific copy lives in its own data file.

export const site = {
  name: 'The Rooiberg Wander',
  headerTagline: 'A Luxury Slackpack Self-Catering Walking Safari',
  operator: 'RoiSan Reserve NPC',
  location: 'Rooiberg, Limpopo, South Africa',
  region: 'Waterberg, Limpopo',
  terrainHa: 15000,
  driveFromJoburg: '2.5 hours',
  hook: 'Self-catering walking safari in the Waterberg',
  maxGuests: 12,

  // Enquiries / bookings email.
  notifyEmail: 'hanlie@rooibergwander.co.za',

  // Contact (shown in header + footer).
  contact: {
    name: 'Hanlie',
    email: 'hanlie@rooibergwander.co.za',
    phone: '+27 82 905 8832',
    whatsapp: '27829058832',
    whatsappUrl:
      'https://wa.me/27829058832?text=Hi%20Hanlie%2C%20I%27d%20like%20to%20enquire%20about%20The%20Rooiberg%20Wander.',
    officeHours: '08h00 to 17h00',
  },

  locale: 'en-ZA',

  // Production domain (primary). Must match `site` in astro.config.mjs.
  url: 'https://www.rooibergwander.co.za',

  // Sitewide SEO fallback description (pages pass their own per Part 8.8).
  defaultDescription:
    'A self-catering walking safari in the Waterberg. A 3-night, 3-day slackpacking trail through 15,000 ha of malaria-free Big 5 wilderness near Rooiberg, Limpopo, 2.5 hours from Johannesburg.',

  // Social-card fallback.
  ogImage: '/images/og-default.jpg',
} as const;

// Quick facts — Part 8.5 / new brief. Reused on Rates and (some) on the Trail page.
export const quickFacts = [
  { label: 'Distance', value: '~15–20 km/day · ~55 km total over 3 walking days' },
  { label: 'Group size', value: 'Exclusive use, up to 10 guests (optional two extra by special arrangement)' },
  { label: 'Catering', value: 'Self-catered. Bring your own food and drinks; we move them daily' },
  { label: 'Guides & safety', value: 'Two qualified, armed trail guides at all times' },
  { label: 'Grading', value: 'Moderate to challenging. You need a good level of hiking fitness' },
  { label: 'Malaria', value: '100% malaria-free' },
  { label: 'Getting there', value: 'About 2.5 hours by road from Johannesburg' },
] as const;

// Stats bar — four items.
export const stats = [
  { value: '3', label: 'Nights' },
  { value: '3', label: 'Days Walking' },
  { value: '3', label: 'Private Lodges' },
  { value: 'Up to 10', label: 'Guests (Exclusive Group Use)' },
] as const;

// Prefix a root-relative path with the configured base (Astro `base`), so internal links work
// when the site is served from a subpath (e.g. GitHub project Pages at /repo/). External links,
// mailto: and #anchors pass through unchanged. Root deploys (base "/") are a no-op.
export function withBase(path: string): string {
  if (!path.startsWith('/')) return path;
  const raw = import.meta.env.BASE_URL || '/';
  const base = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  return base + path;
}

// Primary navigation — labels verbatim from Part 8.
export const nav = [
  { label: 'Home', href: '/' },
  { label: 'The Trail', href: '/the-trail' },
  { label: 'The Safari Lodges', href: '/sanctuaries' },
  { label: 'Trail Logistics & FAQ', href: '/logistics' },
  { label: 'Rates & Booking', href: '/rates' },
] as const;
