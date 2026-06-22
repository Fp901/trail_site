// Trail logistics & FAQ content — Part 8.4 + 2026 brief. Three blocks (safety emphasised) plus
// answer-first Q&A for GEO (Part 10.5). All copy grounded in the brief.

export interface LogBlock {
  id: string;
  kicker: string;
  title: string;
  body: string;
  emphasis?: boolean;
}

export const logisticsBlocks: LogBlock[] = [
  {
    id: 'catering',
    kicker: 'Catering',
    title: 'Self-catered, with help at every camp',
    body: 'The Rooiberg Wander is fully self-catered. You bring your own food and drinks; we move them. Your provisions and bags travel between camps each day, kept cool and dry, and every lodge has staff to help with kitchen prep, cooking, the barbeque and washing-up.',
  },
  {
    id: 'safety',
    kicker: 'Safety',
    title: 'Two armed guides, the whole way',
    body: 'Two qualified, armed trail guides are with you at all times. This is the Two-Man Rule, the standard for tracking on foot in a Big 5 reserve. The reserve is also 100% malaria-free.',
    emphasis: true,
  },
  {
    id: 'grading',
    kicker: 'Grading & fitness',
    title: 'Moderate to challenging',
    body: 'You cover about 15 to 20 km a day, roughly 55 km in total, over mountain ascents, rocky kloofs and donga terrain. You need a good level of hiking fitness.',
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: 'What is slackpacking?',
    a: 'Slackpacking is multi-day hiking without a heavy pack. You walk the trail while your luggage and food are carried ahead. On The Rooiberg Wander, support vehicles move everything between lodges each day, kept cool and dry, so you walk with only a daypack.',
  },
  {
    q: 'Where is the trail and how do I get there?',
    a: 'The trail is near Rooiberg in Limpopo (the Waterberg), in the Groenkop and Elandsberg mountains, about 2.5 hours by road from Johannesburg. You drive to Rotavi Lodge and leave your car in secure on-site parking for the trail.',
  },
  {
    q: 'Is the area malaria-free?',
    a: 'Yes. The reserve is 100% malaria-free.',
  },
  {
    q: 'How fit do I need to be?',
    a: 'The trail is graded moderate to challenging: mountain ascents, rocky kloofs and donga terrain over about 15 to 20 km a day. You need a good level of hiking fitness.',
  },
  {
    q: 'How far do you walk each day?',
    a: 'Between 15 and 20 km on each of the three walking days, about 55 km in total. There is no walking on the arrival day.',
  },
  {
    q: 'Is a walking safari in a Big 5 reserve safe?',
    a: 'Yes. Two qualified, armed trail guides are with you at all times under the Two-Man Rule, the standard for tracking on foot in a Big 5 reserve.',
  },
  {
    q: 'Who carries the luggage and food?',
    a: 'You do not. Your food and bags are moved between camps daily and kept cool and dry, and staff at each lodge help with kitchen prep, cooking, the barbeque and the washing-up.',
  },
  {
    q: 'What are the camps like?',
    a: 'Each of the three lodges has a swimming pool, a fully equipped kitchen with a fridge, barbeque facilities, safe drinking water and free WiFi. Each has its own character.',
  },
  {
    q: 'How big is the group?',
    a: 'The trail is sold as exclusive use for one private group of up to 10 guests. You have the trail and camps to yourselves.',
  },
];

// Practical "before you arrive" info — provisions and transfers, each with a disclaimer.
// External links are PLACEHOLDERS until the real URLs are supplied.
export const provisions = {
  kicker: 'Food & provisions',
  title: 'Stocking up before you arrive',
  intro:
    'You are welcome to pre-order groceries and supplies before you arrive. The closest fully-stocked supermarket is Checkers Bela Bela, at the Bela Mall off the N1, about 80 km from us.',
  linkText: 'Checkers Bela Bela store details, hours & location',
  linkUrl: '#', // PLACEHOLDER — add the Checkers Bela Bela store-info URL
  howTo:
    'We recommend the Checkers Sixty60 app. Order in advance and collect at the store on your drive up, or have it delivered through the app.',
  disclaimer:
    'All grocery orders, payments, collections and deliveries are strictly between you and Checkers. The Rooiberg Wander takes no responsibility for the accuracy, timing, quality, handling or fulfilment of your orders, and cannot manage or take receipt of third-party orders on your behalf.',
};

export const transfers = {
  kicker: 'Transfers & transport',
  title: 'Getting here',
  intro:
    'If you are flying in or would rather be driven, we recommend EZ Shuttle, a local operator that knows the routes and access points to reach us.',
  linkText: 'EZ Shuttle',
  linkUrl: '#', // PLACEHOLDER — add the EZ Shuttle booking URL
  booking:
    'Arrange your pick-up times, vehicle and rates with them directly, before your trip.',
  disclaimer:
    'All transport arrangements, bookings, payments and itineraries are strictly between you and EZ Shuttle. The Rooiberg Wander operates independently of all transit providers and takes no responsibility for scheduling, delays, vehicle safety, service quality, cancellations, or any incident on your way to or from the trail.',
};
