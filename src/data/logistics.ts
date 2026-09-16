// Trail logistics & FAQ content — Part 8.4 + 2026 brief. Three blocks (safety emphasised) plus
// answer-first Q&A for GEO (Part 10.5). All copy grounded in the brief.

export interface LogBlock {
  id: string;
  kicker: string;
  title: string;
  body: string | string[];
  emphasis?: boolean;
}

export const logisticsBlocks: LogBlock[] = [
  {
    id: 'catering',
    kicker: 'Dining',
    title: 'All-inclusive, hearty bush hospitality',
    body: [
      'Every meal is included. Breakfast at the lodge before you set off, a bush brunch laid out on the trail after three to four hours of walking, refreshments on arrival at the next lodge, and dinner served family-style around the boma fire, accompanied by selected South African estate wines and local beers.',
      'The menu is a fixed, wholesome bushveld one, deliberately built without high-risk allergens such as nuts and shellfish. It carries enough variety for straightforward vegetarian preferences, but as a remote walking safari rather than a bespoke lodge we cannot cater for extensive or highly specific diets.',
      'Because you walk 15 to 20 km the next morning in Big 5 terrain, heavy spirits are excluded apart from gin for sundowners, and wine and beer are served as a curated daily selection. You are welcome to bring a particular bottle of your own; it travels with your luggage.',
    ],
  },
  {
    id: 'lodges',
    kicker: 'The lodges',
    title: 'Every lodge, one standard',
    body: 'Each of the three private lodges is fully equipped to the same premium standard including a pool and WiFi. Everything you need is waiting when you arrive.',
  },
  {
    id: 'safety',
    kicker: 'Safety',
    title: 'Two trail guides, the whole way',
    body: 'Two experienced trail guides are with you at all times. This is the Two-Man Rule, the standard for tracking on foot in a Big 5 reserve. The reserve is also 100% malaria-free.',
    emphasis: true,
  },
  {
    id: 'grading',
    kicker: 'Grading & fitness',
    title: 'Moderate to challenging',
    body: 'You cover about 15 to 20 km a day, roughly 55 km in total, over mountain ascents, rocky kloofs and rugged ravine terrain. You need a good level of hiking fitness. Vehicle transfers can be arranged with your trail guide if any guest wants to shorten their walk on any day.',
  },
];

// An answer is either plain text, or a mix of text and inline links — kept typed (no set:html)
// so an FAQ answer can safely link out (e.g. to a partner lodge's booking page).
export type FaqAnswerPart = string | { text: string; href: string };

export interface Faq {
  q: string;
  a: string | FaqAnswerPart[];
}

// Flattens a (possibly link-mixed) answer to plain text, e.g. for JSON-LD.
export function faqAnswerText(a: Faq['a']): string {
  if (typeof a === 'string') return a;
  return a.map((part) => (typeof part === 'string' ? part : part.text)).join('');
}

export const faqs: Faq[] = [
  {
    q: 'Is this a slackpacking trail?',
    a: 'Yes. Your luggage moves ahead to the next lodge each day, so you walk with a daypack. Rooiberg Wander is all-inclusive: every meal, both trail guides and all conservation levies are part of the rate, and you sleep in established private safari lodges.',
  },
  {
    q: 'What are the conservation levies?',
    a: 'Your rate includes a conservation levy paid to RoiSan Reserve, the manager of the reserve. It funds anti-poaching work, fence maintenance and wildlife monitoring across the reserve.',
  },
  {
    q: 'Where is the trail and how do I get there?',
    a: "The trail is near Rooiberg in Limpopo (the Waterberg), in the Groenkop and Elandsberg mountains, about 2.5 hours from OR Tambo International Airport. You drive to Temminck's Lodge and leave your car in secure on-site parking for the trail.",
  },
  {
    q: 'Is the area malaria-free?',
    a: 'Yes. The reserve is 100% malaria-free.',
  },
  {
    q: 'How fit do I need to be?',
    a: 'The trail is graded moderate to challenging: mountain ascents, rocky kloofs and rugged ravine terrain over about 15 to 20 km a day. You need a good level of hiking fitness.',
  },
  {
    q: 'How far do you walk each day?',
    a: 'Between 15 and 20 km on each of the three walking days, about 55 km in total. There is no scheduled walking on the arrival day. You can arrange a vehicle transfer with your trail guide to shorten your walk on any day.',
  },
  {
    q: 'Is a walking safari in a Big 5 reserve safe?',
    a: 'Yes. Two qualified trail guides are with you at all times under the Two-Man Rule, the standard for tracking on foot in a Big 5 reserve. Walking in Big 5 territory carries risk, but your two guides are trained to read the terrain and animal behaviour, and will adjust your route and pace throughout the walk.',
  },
  {
    q: 'Who carries the luggage and food?',
    a: 'You do not. Your bags and the group provisions are moved between lodges daily and kept cool and dry, and a chef travels with the group to handle every meal.',
  },
  {
    q: 'What are the lodges like?',
    a: 'Each of the three lodges accommodates guests in 2 person suites, includes bedding, and has a swimming pool, safe drinking water and free WiFi. Each is an established private bush lodge with its own character.',
  },
  {
    q: 'How big is the group?',
    a: 'Two to eight guests, with two trail guides. The first booking on a date opens it, from two guests, and later bookings join until the eight places are taken. Book all eight and the trail and each lodge are reserved for your group alone.',
  },
  {
    q: 'Where can I stay before or after my visit?',
    a: [
      'If you wish to extend your trip, we recommend ',
      { text: 'babirwa.com', href: 'https://babirwa.com' },
      ' on the western side of RoiSan Reserve, or ',
      {
        text: 'Letamo at Qwabi',
        href: 'https://booking.newmarkhotels.com/en/letamoatqwabi/home?no-cache=&currency=ZAR',
      },
      ', 5 km north of us.',
    ],
  },
];

// Practical "before you arrive" info — transfers, with a disclaimer.
export const transfers = {
  kicker: 'Transfers & transport',
  title: 'Getting here',
  intro:
    'If you require a transfer, we recommend EZ Shuttle, a local operator that knows the routes and access points to reach us.',
  linkText: 'Book a transfer with EZ Shuttle',
  linkUrl: 'https://www.ezshuttle.co.za/',
  booking:
    'Arrange your pick-up times, vehicle and rates with them directly, before your trip. The destination point is the reserve access gate. Rooiberg Wander reception is 2 km from the gate. Prior to your trip, please contact us via WhatsApp for gate access codes.',
  // Pinned location of the reserve access gate, for guests to reference or share with EZ
  // Shuttle when arranging their pick-up (EZ Shuttle's own booking form is app/JS-based with no
  // documented way to pre-fill a destination via URL, so this is a plain map link, not an
  // auto-fill integration).
  mapUrl: 'https://maps.app.goo.gl/q513JEGNSY3ZhbUk8',
  mapLinkText: 'View the reserve access gate on Google Maps',
  disclaimer:
    'All transport arrangements, bookings, payments and itineraries are strictly between you and EZ Shuttle. Rooiberg Wander operates independently of all transit providers and takes no responsibility for scheduling, delays, vehicle safety, service quality, cancellations, or any incident on your way to or from the trail.',
};

// Day-pack kit list. Items grounded in the brief.
export const kitList = {
  kicker: 'What to pack',
  title: 'What to pack for the trail',
  intro:
    'You walk with a light daypack while the rest of your luggage travels ahead to the next lodge. Pack for warm days and cool mornings in the Waterberg, in neutral colours for the game areas.',
  items: [
    'Walking shoes',
    'Layered clothing for winter',
    'Light raincoat for summer',
    'Vaseline',
    'Duct tape for blisters',
    'Sun protection',
    'Hat',
    'Insect repellant',
    'A daypack',
    '2-litre water bottles',
    'A headlamp',
    'Personal medication',
    'Neutral colours for the game areas',
  ],
};

// "When to walk" — the Waterberg seasons (evergreen SEO; client-supplied copy, lightly edited).
export interface Season {
  name: string;
  months: string;
  lead: string;
  climate: string;
  experience: string;
  pack: string;
}

export const seasonsIntro =
  'Because the trail winds through high mountain ridges, deep rocky kloofs and open savanna plains, your walking experience changes with the season. The region is 100% malaria-free year-round, so it is safe to walk in any season.';

export const seasons: Season[] = [
  {
    name: 'Autumn & Winter: The Prime Walking Window',
    months: 'May to August',
    lead: 'This is widely considered the best season for long-distance wilderness tracking in the Limpopo bushveld.',
    climate:
      'Expect crisp mornings, often dropping to a refreshing 3°C to 10°C, that clear into mild, cloudless days averaging around 20°C to 24°C.',
    experience:
      'The winter bush is thin, dry and gold, with maximum visibility for tracking wildlife on foot. As surface water dries up, animals gather around the permanent waterholes and river systems, so game viewing is predictable and rewarding.',
    pack: "A solid layered clothing system. Bring a warm beanie and a fleece for the early-morning briefings at Temminck's Lodge, then shed layers as the day warms up.",
  },
  {
    name: 'Spring: The Great Awakening',
    months: 'September to October',
    lead: 'The shoulder months are a unique, transitional window for seasoned bush walkers.',
    climate:
      'Temperatures climb quickly, with midday highs of 28°C to 34°C. The air is dry and the sun is intense.',
    experience:
      'This is the peak dry season, but we do experience occasional showers. The landscape is starting to green, and the bush reveals its survival strategies: many indigenous trees flower before the first rains, and wildlife activity around the remaining waterpoints is at its highest.',
    pack: 'High-factor sun protection, a wide-brimmed hat, and extra water-carrying capacity in your daypack.',
  },
  {
    name: 'Summer: The Green Season',
    months: 'November to April',
    lead: 'A spectacular transformation for those who love lush biodiversity, birding and dramatic skies.',
    climate:
      'True summer conditions, with midday temperatures often around 30°C to 35°C and medium to low humidity. Late-afternoon thunderstorms are common, bringing dramatic light and quick relief from the heat.',
    experience:
      'The green season brings dense vegetation, flowing streams and newborn animals, and the bushveld turns a vivid emerald green. The thick foliage makes tracking large mammals harder, but the birdlife is spectacular as migratory species arrive in their thousands.',
    pack: 'Lightweight, breathable, moisture-wicking walking clothing and reliable waterproof gear for afternoon showers.',
  },
];
