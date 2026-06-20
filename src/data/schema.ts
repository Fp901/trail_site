// JSON-LD builders (Part 8.8 / 10.4). Emitted via Seo.astro. Only our own serialized
// data is ever passed to set:html (Part 11.3). Keep values faithful — no invented facts.
import { site } from './site';

const ORG_ID = `${site.url}/#organization`;

export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORG_ID,
  name: site.name,
  legalName: site.operator,
  url: site.url,
  description: site.defaultDescription,
  areaServed: 'Waterberg, Limpopo, South Africa',
  address: {
    '@type': 'PostalAddress',
    addressRegion: 'Limpopo',
    addressCountry: 'ZA',
  },
};

export function webPageSchema(opts: { path: string; name: string; description: string }) {
  const url = new URL(opts.path, site.url).href;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: opts.name,
    description: opts.description,
    inLanguage: site.locale,
    isPartOf: { '@type': 'WebSite', name: site.name, url: site.url },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: new URL(it.path, site.url).href,
    })),
  };
}

// Offer — Part 8.8. Public VAT-inclusive rate in ZAR. price is the headline (incl. VAT) figure.
export function offerSchema(opts: { price: number; name: string; description?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name: opts.name,
    price: opts.price,
    priceCurrency: 'ZAR',
    description: opts.description,
    availability: 'https://schema.org/InStock',
    areaServed: 'Waterberg, Limpopo, South Africa',
    seller: { '@id': ORG_ID },
  };
}

// FAQPage — Part 10.4. Google deprecated the FAQ rich result, but Bing/AI still parse this and
// it is harmless to rankings. Answers must be plain text (no HTML).
export function faqPageSchema(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}

// TouristAttraction — one per sanctuary (Part 8.8). Strong entity signal; no Google rich result.
export function touristAttractionSchema(opts: { name: string; description: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: opts.name,
    description: opts.description,
    address: {
      '@type': 'PostalAddress',
      addressRegion: 'Limpopo',
      addressCountry: 'ZA',
    },
    isPartOf: { '@id': ORG_ID },
  };
}

// TouristTrip — strong entity/AI signal (Part 10.4). Pricing Offer lives on Rates (step 10).
export const touristTripSchema = {
  '@context': 'https://schema.org',
  '@type': 'TouristTrip',
  name: site.name,
  description:
    'A 3-night, 3-day self-catered slackpacking trail on foot through 15,000 ha of malaria-free Big 5 mountain wilderness near Rooiberg, Limpopo (the Waterberg), about 2.5 hours from Johannesburg. Roughly 20 km a day with daily luggage porterage; exclusive use for up to 10 guests, with two armed wilderness guides at all times.',
  touristType: ['Slackpacking', 'Walking safari', 'Multi-day hiking trail'],
  provider: { '@id': ORG_ID },
};
