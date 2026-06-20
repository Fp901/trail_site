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
    title: 'Is the trail catered or self-catered?',
    body: 'The Rooiberg Wander is a fully self-catered slackpacking trail — you bring your own food and drinks, and we take care of the rest. Your provisions and baggage are transported between camps each day and kept cool and dry, and each sanctuary has dedicated staff to help with kitchen prep, cooking, the braai and the washing-up.',
  },
  {
    id: 'safety',
    kicker: 'Safety',
    title: 'Is it safe in a Big 5 reserve?',
    body: 'You are accompanied at all times by two qualified, armed wilderness guides — the Two-Man Rule — for safe tracking in a true Big 5 environment. The reserve is also 100% malaria-free.',
    emphasis: true,
  },
  {
    id: 'grading',
    kicker: 'Grading & fitness',
    title: 'How hard is the walking?',
    body: 'The trail is graded moderate to challenging, with mountain ascents, rocky kloofs and donga terrain across roughly 20 km a day (about 60 km in total). A good level of hiking fitness is required to enjoy it.',
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: 'What is slackpacking?',
    a: 'Slackpacking is multi-day hiking without a heavy pack: you walk the trail while your luggage and provisions are carried ahead for you. On The Rooiberg Wander, support vehicles move everything between sanctuaries each day — kept cool and dry — so you walk with only a daypack.',
  },
  {
    q: 'Where is the trail and how do I get there?',
    a: 'The trail is near Rooiberg in Limpopo (the Waterberg), in the Groenkop and Elandsberg mountains — about 2.5 hours by road from Johannesburg. You drive to Rotavi Lodge and leave your vehicle in secure on-site parking for the duration.',
  },
  {
    q: 'Is the area malaria-free?',
    a: 'Yes. The reserve is 100% malaria-free.',
  },
  {
    q: 'How fit do I need to be?',
    a: 'The trail is graded moderate to challenging — mountain ascents, rocky kloofs and donga terrain over about 20 km a day. A good level of hiking fitness is required.',
  },
  {
    q: 'How far do you walk each day?',
    a: 'Roughly 20 km on each of the three walking days — about 60 km in total. There is no walking on the arrival day.',
  },
  {
    q: 'Is a walking safari in a Big 5 reserve safe?',
    a: 'Yes. You are accompanied at all times by two qualified, armed wilderness guides under the Two-Man Rule — the standard for safe tracking on foot in a Big 5 environment.',
  },
  {
    q: 'Who carries the luggage and food?',
    a: 'You do not. Your provisions and baggage are moved between camps daily and kept cool and dry, and dedicated staff at each sanctuary help with kitchen prep, cooking, the braai and the washing-up.',
  },
  {
    q: 'What are the camps like?',
    a: 'Each of the three sanctuaries has a swimming pool, a fully equipped kitchen with refrigeration, braai facilities, safe drinking water and free WiFi — each with its own distinct character.',
  },
  {
    q: 'How big is the group?',
    a: 'The trail is sold as exclusive use for a single private group of up to 10 guests — you have the trail and camps to yourselves.',
  },
];
