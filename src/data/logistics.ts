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
    kicker: 'Catering',
    title: 'Self-catered or fully catered',
    body: [
      'For un-catered groups you bring your own food and drinks; we move them. Your provisions and bags travel between lodges each day, kept cool and dry, and every lodge has staff to help with kitchen prep, cooking, the barbeque, and washing up.',
      'Prefer not to plan meals? For catered groups we provide a full English breakfast, a snack pack for the trail, and a full barbeque for dinner. Unfortunately, due to logistical limitations, we do not cater for special dietary requirements.',
      'Shared group Sunday and Monday departures are fully catered only.',
    ],
  },
  {
    id: 'lodges',
    kicker: 'The lodges',
    title: 'Every lodge, one standard',
    body: 'Each of the three private lodges is fully equipped to the same premium standard: bedding, pool, equipped kitchen, barbeque, free ice, wood and WiFi. You carry only a daypack, and everything you need is waiting when you arrive.',
  },
  {
    id: 'safety',
    kicker: 'Safety',
    title: 'Two experienced trail guides, the whole way.',
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
    q: 'What is slackpacking?',
    a: 'Slackpacking is multi-day hiking without a heavy pack. You walk the trail while your luggage and food are carried ahead. On The Rooiberg Wander, support vehicles move everything between lodges each day, kept cool and dry, so you walk with only a daypack.',
  },
  {
    q: 'What are the conservation levies?',
    a: 'Included in your package are conservation levies of approximately R380 to R760 (depending on residency status) per person per day, payable to RoiSan Reserve NPC, the manager of the reserve, which allocates monies to the maintenance and protection of the ecosystem and wildlife. This represents up to approximately 20% of your booking fee.',
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
    a: 'Between 15 and 20 km on each of the three walking days, about 55 km in total. There is no walking on the arrival day.',
  },
  {
    q: 'Is a walking safari in a Big 5 reserve safe?',
    a: 'Yes. Two qualified trail guides are with you at all times under the Two-Man Rule, the standard for tracking on foot in a Big 5 reserve.',
  },
  {
    q: 'Who carries the luggage and food?',
    a: 'You do not. Your food and bags are moved between lodges daily and kept cool and dry, and staff at each lodge help with kitchen prep, cooking, the barbeque and the washing-up.',
  },
  {
    q: 'What are the lodges like?',
    a: 'Each of the three lodges accommodates guests in 2 person suites, includes bedding, has a swimming pool, a fully equipped kitchen with a fridge, ice machine, wood, barbeque facilities, safe drinking water and free WiFi. Each has its own character.',
  },
  {
    q: 'How big is the group?',
    a: 'The trail and each lodge are reserved exclusively for your group: self-catered groups of up to 10 guests, catered groups up to a maximum of 8 guests. Mixed groups of up to 8 guests start on Sundays or Mondays and are fully catered only.',
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

// Practical "before you arrive" info — provisions and transfers, each with a disclaimer.
export const provisions = {
  kicker: 'Food & provisions',
  title: 'Stocking up before you arrive',
  intro:
    'You are welcome to pre-order groceries and supplies before you arrive. The closest fully-stocked supermarket and liquor store is Checkers Bela Bela, at the Bela Mall off the N1, about 80 km from us.',
  disclaimer:
    'Grocery orders and deliveries are strictly between you and Checkers; we cannot manage them on your behalf.',
};

export const transfers = {
  kicker: 'Transfers & transport',
  title: 'Getting here',
  intro:
    'If you are flying in or would rather be driven, we recommend EZ Shuttle, a local operator that knows the routes and access points to reach us.',
  linkText: 'Book a transfer with EZ Shuttle',
  linkUrl: 'https://www.ezshuttle.co.za/',
  booking:
    'Arrange your pick-up times, vehicle and rates with them directly, before your trip. The destination point is the reserve access gate. Rooiberg Wander reception is 2 km from the gate. Prior to your trip, please contact us via WhatsApp for gate access codes.',
  disclaimer:
    'All transport arrangements, bookings, payments and itineraries are strictly between you and EZ Shuttle. The Rooiberg Wander operates independently of all transit providers and takes no responsibility for scheduling, delays, vehicle safety, service quality, cancellations, or any incident on your way to or from the trail.',
};

// Day-pack kit list. Items grounded in the brief.
export const kitList = {
  kicker: 'What to pack',
  title: 'What to pack for a slackpacking trail',
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
