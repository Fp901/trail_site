// Generates "Rooiberg-Wander-Website-Copy.docx" — every user-facing string on the site, grouped
// by page, with HTML placement tags + a [ref.code] for each item so edits can be mapped back.
// SEO-critical items are flagged. Run: node scripts/generate-copy-doc.mjs
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  Footer,
  PageNumber,
  TableOfContents,
} from 'docx';
import { writeFileSync, copyFileSync, existsSync } from 'node:fs';

// ----------------------------------------------------------------------------- content
// type field: { tag, what, ref, text, seo?: 'lock', fact?: true, note?: string }
const PAGES = [
  {
    name: 'Global (appears on every page)',
    url: 'header, footer and menu',
    fields: [
      { tag: 'tagline', what: 'Brand tagline (hero + footer)', ref: 'global.tagline', seo: 'lock',
        text: 'Self-catering walking safari in the Waterberg' },
      { tag: 'nav', what: 'Menu links (in order)', ref: 'global.nav',
        text: 'Home  |  The Trail  |  The Sanctuaries  |  Trail Logistics & FAQ  |  Rates & Booking' },
      { tag: 'p', what: 'Footer — operator name', ref: 'global.footer.operator', fact: true,
        text: 'RoiSan Reserve NPC' },
      { tag: 'p', what: 'Footer — location', ref: 'global.footer.location',
        text: 'Rooiberg, Limpopo, South Africa' },
      { tag: 'a', what: 'Footer — contact email', ref: 'global.footer.email', fact: true,
        text: 'hanlie@rooibergwander.co.za' },
      { tag: 'p', what: 'Footer — copyright', ref: 'global.footer.copyright',
        text: '© [current year] RoiSan Reserve NPC. All rights reserved.' },
    ],
  },
  {
    name: 'Home',
    url: '/',
    fields: [
      { tag: 'title', what: 'Browser tab / search-result title', ref: 'home.metaTitle', seo: 'lock',
        text: 'The Rooiberg Wander | Malaria-free Big 5 slackpacking trail' },
      { tag: 'meta', what: 'Search-result description', ref: 'home.metaDescription', seo: 'lock',
        text: 'A self-catering walking safari in the Waterberg. 3 nights and 3 days through 15,000 ha of malaria-free Big 5 wilderness near Rooiberg, Limpopo, 2.5 hours from Johannesburg.' },
      { tag: 'p', what: 'Hero — small line above heading', ref: 'home.hero.overline',
        text: 'Malaria-free Big 5 slackpacking · Rooiberg, Limpopo' },
      { tag: 'h1', what: 'Hero — main heading', ref: 'home.hero.h1', seo: 'lock',
        text: 'Three days on foot through a private Big 5 wilderness' },
      { tag: 'button', what: 'Hero — primary button', ref: 'home.hero.cta1', text: 'Rates & Booking' },
      { tag: 'button', what: 'Hero — secondary button', ref: 'home.hero.cta2', text: 'Explore the trail' },
      { tag: 'alt', what: 'Hero image — description', ref: 'home.hero.alt', seo: 'lock',
        text: 'Golden-hour light over the layered mountains of the Rooiberg, Limpopo.' },
      { tag: 'p', what: 'Stats bar (4 items)', ref: 'home.stats', fact: true,
        text: '3 Nights   ·   3 Days Walking   ·   3 Private Sanctuaries   ·   Max 10 Guests (Exclusive Group Use)' },
      { tag: 'p', what: 'Intro — small line above heading', ref: 'home.promise.overline',
        text: 'The unpack-and-walk trail' },
      { tag: 'h2', what: 'Intro — heading', ref: 'home.promise.h2', seo: 'lock',
        text: 'A walk through 15,000 hectares of Big 5 country' },
      { tag: 'p', what: 'Intro — paragraph 1', ref: 'home.promise.p1',
        text: 'The Rooiberg Wander is a 3-night, 3-day self-catered slackpacking trail. You cross 15,000 hectares of malaria-free Big 5 country near Rooiberg in Limpopo, 2.5 hours from Johannesburg. You walk; we move everything else.' },
      { tag: 'p', what: 'Intro — paragraph 2', ref: 'home.promise.p2',
        text: 'Over three days you cross the Groenkop and Elandsberg mountains on foot, through deep kloofs, riverbeds and open plains, with two armed wilderness guides the whole way. You bring your own food and drinks. Your bags and provisions move between camps each day, kept cool and dry, and staff at each sanctuary help with cleaning, cooking, the braai and the washing-up. The reserve is yours alone: one group of up to ten.' },
      { tag: 'li', what: 'Intro — key points (4)', ref: 'home.promise.points',
        text: '100% malaria-free   ·   Two armed guides   ·   Luggage moved daily   ·   Exclusive use · max 10' },
      { tag: 'button', what: 'Intro — button', ref: 'home.promise.cta', text: 'View rates and book the trail' },
      { tag: 'alt', what: 'Dusk panorama image — description', ref: 'home.panorama.alt', seo: 'lock',
        text: 'Dusk over the Rooiberg mountains, with a bush dinner set beside a lily-covered waterhole.' },
      { tag: 'h2', what: '"Different" section — heading', ref: 'home.diff.h2', seo: 'lock',
        text: 'You sleep somewhere new every night' },
      { tag: 'p', what: '"Different" section — paragraph', ref: 'home.diff.p',
        text: 'This is a point-to-point trail. You walk from one private sanctuary to the next and sleep somewhere new each night, with a pool, a braai and a real bed at the end of every day.' },
      { tag: 'h3', what: 'Card 1 — heading + text', ref: 'home.diff.card1',
        text: 'Big 5 on foot\nA malaria-free Big 5 reserve, walked at ground level with two armed guides the whole way.' },
      { tag: 'h3', what: 'Card 2 — heading + text', ref: 'home.diff.card2',
        text: 'Unpack and walk\nSelf-catered, but you carry only a daypack. Your food, drinks and bags travel ahead to the next camp each day, kept cool and dry.' },
      { tag: 'h3', what: 'Card 3 — heading + text', ref: 'home.diff.card3',
        text: 'Yours alone\nThe whole reserve and all three sanctuaries are yours. One group of up to ten, no one else.' },
      { tag: 'h3', what: 'Teaser 1 — The Trail', ref: 'home.teaser.trail',
        text: 'The Trail\nNo walking on arrival day; then three mountain days of roughly 20 km, sanctuary to sanctuary, and a direct departure after the final walk.' },
      { tag: 'h3', what: 'Teaser 2 — The Sanctuaries', ref: 'home.teaser.sanctuaries',
        text: 'The Sanctuaries\nRotavi Lodge, Oukraal and ViervanAcht. Three private camps, each with its own character.' },
      { tag: 'h3', what: 'Teaser 3 — Rates & Booking', ref: 'home.teaser.rates',
        text: 'Rates & Booking\nR60,000 per exclusive group of up to ten, incl. VAT and all conservation levies. See what is included and book.' },
      { tag: 'a', what: 'Teaser link label (all three)', ref: 'home.teaser.more', text: 'Read more' },
    ],
  },
  {
    name: 'The Trail',
    url: '/the-trail',
    fields: [
      { tag: 'title', what: 'Browser tab / search-result title', ref: 'trail.metaTitle', seo: 'lock',
        text: 'The Trail | Day-by-day slackpacking itinerary' },
      { tag: 'meta', what: 'Search-result description', ref: 'trail.metaDescription', seo: 'lock',
        text: 'Day by day through the Rooiberg: arrival, then three ~20 km mountain days over Groenkop, the high ridge to ViervanAcht and the open plains. Self-catered and fully ported.' },
      { tag: 'p', what: 'Small line above heading', ref: 'trail.overline',
        text: 'The Trail · 3 nights / 3 days · ~60 km' },
      { tag: 'h1', what: 'Main heading', ref: 'trail.h1', seo: 'lock',
        text: 'A three-day walking trail through the Rooiberg' },
      { tag: 'p', what: 'Intro — paragraph 1', ref: 'trail.intro.p1',
        text: 'You do not walk on the arrival day, and you leave straight after the final walk on Day 4. In between are three walking days of roughly 20 km: a mountain crossing, a high-ridge traverse and a plains return. Each day moves from one sanctuary to the next while your luggage and provisions travel ahead, kept cool and dry.' },
      { tag: 'p', what: 'Intro — paragraph 2', ref: 'trail.intro.p2',
        text: 'The walking is graded moderate to challenging, over mountain ascents, rocky kloofs and donga terrain. A good level of hiking fitness is required.' },
      { tag: 'alt', what: 'Vista banner image — description', ref: 'trail.vista.alt', seo: 'lock',
        text: 'Open bushveld and layered mountains of the Rooiberg, Limpopo, under a wide sky.' },
      { tag: 'h2', what: 'Itinerary — heading', ref: 'trail.itinerary.h2', text: 'Day by day' },
      { tag: 'p', what: 'Day 1 — title / distance / detail', ref: 'trail.day1',
        text: 'Arrival & Briefing  —  No walking\nArrive and register at Rotavi Lodge, the valley basecamp. Park in the shaded, secure on-site parking; your vehicles stay here for the whole trail. Your two armed guides run a full safety and route briefing, then the afternoon is yours at the pool, with the evening around the fire.' },
      { tag: 'p', what: 'Day 2 — title / distance / route / detail', ref: 'trail.day2',
        text: 'The Mountain Crossing  —  ~20 km  —  Rotavi Lodge to Oukraal\nAn early start for the climb over Groenkop, where the view opens up to 100 km in every direction. The path passes deep kloofs, massive fig trees and rock formations on the way to Oukraal, the bush sanctuary. Your luggage and evening food are there when you arrive.' },
      { tag: 'p', what: 'Day 3 — title / distance / route / detail', ref: 'trail.day3',
        text: 'The High Ridge Traverse  —  ~20 km  —  Oukraal to ViervanAcht\nClimb the high ridges through the deeply-ravined L-Kloof to the Welgedacht lookout, with views over Marakele. Drop into the Welgedacht Donga, cut into the rock by thousands of years of rainstorms, and reach ViervanAcht, the mountain sanctuary. The view, the pool and the fire are waiting.' },
      { tag: 'p', what: 'Day 4 — title / distance / route / detail', ref: 'trail.day4',
        text: 'The Plains, Donga & Departure  —  ~20 km  —  ViervanAcht to Rotavi Lodge\nCross the open grass plains where game is frequently seen grazing, follow the upper reaches of the Sand River, and circle the base of Groenkop back to Rotavi Lodge, where the trail concludes. Shower, share a final meal, collect your vehicles and depart.' },
      { tag: 'p', what: 'Note under the day list', ref: 'trail.altitudeNote',
        text: 'Altitude profiles for the two mountain days (the Groenkop crossing and the high-ridge traverse) are coming soon.' },
      { tag: 'h2', what: 'Route — heading', ref: 'trail.route.h2', text: 'The route' },
      { tag: 'p', what: 'Route — paragraph', ref: 'trail.route.p',
        text: 'The Rooiberg Wander is a circuitous trail that begins and ends at Rotavi Lodge: over Groenkop to Oukraal, up the high ridges via L-Kloof to ViervanAcht by way of the Welgedacht lookout, and back across the open plains along the Sand River. The map below is illustrative.' },
      { tag: 'figcaption', what: 'Route map — caption', ref: 'trail.route.caption',
        text: 'Illustrative route, not to scale or GPS-accurate.' },
      { tag: 'li', what: 'Route map — legend', ref: 'trail.route.legend',
        text: 'Day 2 · Rotavi Lodge → Oukraal   |   Day 3 · Oukraal → ViervanAcht   |   Day 4 · ViervanAcht → Rotavi Lodge' },
      { tag: 'li', what: 'Route map — Day 2 landmarks', ref: 'trail.route.landmarks2',
        text: 'Daskop dam · Groenkop summit · Exit of Groenkop climb · Scenic dam' },
      { tag: 'li', what: 'Route map — Day 3 landmarks', ref: 'trail.route.landmarks3',
        text: 'Entrance to L-Kloof · Wooden bridge · Kareedam · Welgedacht lookout · Scenic donga · Vista picnic' },
      { tag: 'li', what: 'Route map — Day 4 landmarks', ref: 'trail.route.landmarks4',
        text: 'Scenic riverbed walk · Scenic viewpoint · Welgedacht donga · Welgedacht plains · Daskop & Daskop dam' },
    ],
  },
  {
    name: 'The Sanctuaries',
    url: '/sanctuaries',
    fields: [
      { tag: 'title', what: 'Browser tab / search-result title', ref: 'sanctuaries.metaTitle', seo: 'lock',
        text: 'The Sanctuaries | Three private trail camps' },
      { tag: 'meta', what: 'Search-result description', ref: 'sanctuaries.metaDescription', seo: 'lock',
        text: 'Rotavi Lodge, Oukraal and ViervanAcht. Three private camps with pools, braai, equipped kitchens, safe drinking water and free WiFi.' },
      { tag: 'p', what: 'Small line above heading', ref: 'sanctuaries.overline', text: 'The Sanctuaries' },
      { tag: 'h1', what: 'Main heading', ref: 'sanctuaries.h1', seo: 'lock', text: 'Where you sleep each night' },
      { tag: 'p', what: 'Intro paragraph', ref: 'sanctuaries.intro',
        text: 'You sleep at three private sanctuaries: Rotavi Lodge, Oukraal and ViervanAcht. Each has its own character, and the whole reserve is yours alone for one group of up to ten.' },
      { tag: 'li', what: 'Amenities (shared by all three)', ref: 'sanctuaries.amenities',
        text: 'Swimming pool · Fully equipped kitchen & refrigeration · Braai facilities · Safe drinking water · Free WiFi' },
      { tag: 'h2', what: 'Sanctuary 1 — name / role / description', ref: 'sanctuaries.rotavi',
        text: 'Rotavi Lodge\nThe Valley Basecamp · Start & End Point\nYour start and end point. A comfortable, established lodge low in the valley. You arrive on Day 1 to register and get your briefing, leave the car in secure shaded parking, and come back on Day 4 to shower, eat and head home.' },
      { tag: 'alt', what: 'Sanctuary 1 — image description', ref: 'sanctuaries.rotavi.alt', seo: 'lock',
        text: 'The valley around Rotavi Lodge, the basecamp at the foot of the Rooiberg where the trail begins and ends.' },
      { tag: 'h2', what: 'Sanctuary 2 — name / role / description', ref: 'sanctuaries.oukraal',
        text: 'Oukraal\nThe Bush Sanctuary · Night 2\nDeep in the thick bushveld, where the evening sounds of the wild are close. You reach it on Day 2 after the crossing over Groenkop, with your luggage and food already there.' },
      { tag: 'alt', what: 'Sanctuary 2 — image description', ref: 'sanctuaries.oukraal.alt', seo: 'lock',
        text: 'Kudu in the thick green bushveld around Oukraal, the bush sanctuary reached on the second day.' },
      { tag: 'h2', what: 'Sanctuary 3 — name / role / description', ref: 'sanctuaries.viervanacht',
        text: 'ViervanAcht\nThe Mountain Sanctuary · Night 3\nHigher up the ridges, with the long view. This is where you watch the sun drop behind the mountains. You arrive on Day 3 along the high-ridge traverse, by way of the Welgedacht lookout.' },
      { tag: 'alt', what: 'Sanctuary 3 — image description', ref: 'sanctuaries.viervanacht.alt', seo: 'lock',
        text: 'Giraffes at sunset on the ridges near ViervanAcht, the mountain sanctuary and the third night of the trail.' },
    ],
  },
  {
    name: 'Trail Logistics & FAQ',
    url: '/logistics',
    fields: [
      { tag: 'title', what: 'Browser tab / search-result title', ref: 'logistics.metaTitle', seo: 'lock',
        text: 'Trail Logistics, Safety & FAQ' },
      { tag: 'meta', what: 'Search-result description', ref: 'logistics.metaDescription', seo: 'lock',
        text: 'Self-catered with daily porterage and camp staff; two armed wilderness guides under the Two-Man Rule; moderate-to-challenging grading; 100% malaria-free.' },
      { tag: 'p', what: 'Small line above heading', ref: 'logistics.overline', text: 'Before you walk' },
      { tag: 'h1', what: 'Main heading', ref: 'logistics.h1', seo: 'lock', text: 'Trail logistics & safety' },
      { tag: 'p', what: 'Intro paragraph', ref: 'logistics.intro',
        text: 'How catering, porterage, fitness and safety work on the trail, in a 100% malaria-free Big 5 reserve.' },
      { tag: 'alt', what: 'Lion image — description', ref: 'logistics.lion.alt', seo: 'lock',
        text: 'A male lion resting in the Rooiberg bushveld, a Big 5 environment walked on foot with two armed guides.' },
      { tag: 'h2', what: 'Block 1 — label / heading / body', ref: 'logistics.block.catering',
        text: 'Catering\nSelf-catered, with help at every camp\nThe Rooiberg Wander is fully self-catered. You bring your own food and drinks; we move them. Your provisions and bags travel between camps each day, kept cool and dry, and every sanctuary has staff to help with kitchen prep, cooking, the braai and the washing-up.' },
      { tag: 'h2', what: 'Block 2 — label / heading / body', ref: 'logistics.block.safety',
        text: 'Safety\nTwo armed guides, the whole way\nTwo qualified, armed wilderness guides are with you at all times. This is the Two-Man Rule, the standard for tracking on foot in a Big 5 reserve. The reserve is also 100% malaria-free.' },
      { tag: 'h2', what: 'Block 3 — label / heading / body', ref: 'logistics.block.grading',
        text: 'Grading & fitness\nModerate to challenging\nYou cover about 20 km a day, roughly 60 km in total, over mountain ascents, rocky kloofs and donga terrain. You need a good level of hiking fitness.' },
      { tag: 'h2', what: 'Food & provisions — heading + intro', ref: 'logistics.provisions',
        text: 'Stocking up before you arrive\nYou are welcome to pre-order groceries and supplies before you arrive. The closest fully-stocked supermarket is Checkers Bela Bela, at the Bela Mall off the N1, about 80 km from us.' },
      { tag: 'a', what: 'Food & provisions — link text', ref: 'logistics.provisions.link',
        text: 'Checkers Bela Bela store details, hours & location   (link URL still to be added)' },
      { tag: 'p', what: 'Food & provisions — how to order', ref: 'logistics.provisions.howto',
        text: 'We recommend the Checkers Sixty60 app. Order in advance and collect at the store on your drive up, or have it delivered through the app.' },
      { tag: 'p', what: 'Food & provisions — disclaimer', ref: 'logistics.provisions.disclaimer', fact: true,
        text: 'All grocery orders, payments, collections and deliveries are strictly between you and Checkers. The Rooiberg Wander takes no responsibility for the accuracy, timing, quality, handling or fulfilment of your orders, and cannot manage or take receipt of third-party orders on your behalf.' },
      { tag: 'h2', what: 'Transfers — heading + intro', ref: 'logistics.transfers',
        text: 'Getting here\nIf you are flying in or would rather be driven, we recommend EZ Shuttle, a local operator that knows the routes and access points to us.' },
      { tag: 'a', what: 'Transfers — link text', ref: 'logistics.transfers.link',
        text: 'EZ Shuttle   (link URL still to be added)' },
      { tag: 'p', what: 'Transfers — booking note', ref: 'logistics.transfers.booking',
        text: 'Arrange your pick-up times, vehicle and rates with them directly, before your trip.' },
      { tag: 'p', what: 'Transfers — disclaimer', ref: 'logistics.transfers.disclaimer', fact: true,
        text: 'All transport arrangements, bookings, payments and itineraries are strictly between you and EZ Shuttle. The Rooiberg Wander operates independently of all transit providers and takes no responsibility for scheduling, delays, vehicle safety, service quality, cancellations, or any incident on your way to or from the trail.' },
      { tag: 'h2', what: 'FAQ — heading', ref: 'logistics.faq.h2', text: 'Frequently asked questions' },
      { tag: 'faq', what: 'FAQ 1', ref: 'logistics.faq.1', seo: 'lock',
        text: 'Q: What is slackpacking?\nA: Slackpacking is multi-day hiking without a heavy pack. You walk the trail while your luggage and food are carried ahead. On The Rooiberg Wander, support vehicles move everything between sanctuaries each day, kept cool and dry, so you walk with only a daypack.' },
      { tag: 'faq', what: 'FAQ 2', ref: 'logistics.faq.2', seo: 'lock',
        text: 'Q: Where is the trail and how do I get there?\nA: The trail is near Rooiberg in Limpopo (the Waterberg), in the Groenkop and Elandsberg mountains, about 2.5 hours by road from Johannesburg. You drive to Rotavi Lodge and leave your car in secure on-site parking for the trail.' },
      { tag: 'faq', what: 'FAQ 3', ref: 'logistics.faq.3', seo: 'lock',
        text: 'Q: Is the area malaria-free?\nA: Yes. The reserve is 100% malaria-free.' },
      { tag: 'faq', what: 'FAQ 4', ref: 'logistics.faq.4', seo: 'lock',
        text: 'Q: How fit do I need to be?\nA: The trail is graded moderate to challenging: mountain ascents, rocky kloofs and donga terrain over about 20 km a day. You need a good level of hiking fitness.' },
      { tag: 'faq', what: 'FAQ 5', ref: 'logistics.faq.5', seo: 'lock',
        text: 'Q: How far do you walk each day?\nA: Roughly 20 km on each of the three walking days, about 60 km in total. There is no walking on the arrival day.' },
      { tag: 'faq', what: 'FAQ 6', ref: 'logistics.faq.6', seo: 'lock',
        text: 'Q: Is a walking safari in a Big 5 reserve safe?\nA: Yes. Two qualified, armed wilderness guides are with you at all times under the Two-Man Rule, the standard for tracking on foot in a Big 5 reserve.' },
      { tag: 'faq', what: 'FAQ 7', ref: 'logistics.faq.7', seo: 'lock',
        text: 'Q: Who carries the luggage and food?\nA: You do not. Your food and bags are moved between camps daily and kept cool and dry, and staff at each sanctuary help with kitchen prep, cooking, the braai and the washing-up.' },
      { tag: 'faq', what: 'FAQ 8', ref: 'logistics.faq.8', seo: 'lock',
        text: 'Q: What are the camps like?\nA: Each of the three sanctuaries has a swimming pool, a fully equipped kitchen with a fridge, braai facilities, safe drinking water and free WiFi. Each has its own character.' },
      { tag: 'faq', what: 'FAQ 9', ref: 'logistics.faq.9', seo: 'lock',
        text: 'Q: How big is the group?\nA: The trail is sold as exclusive use for one private group of up to 10 guests. You have the trail and camps to yourselves.' },
    ],
  },
  {
    name: 'Rates & Booking',
    url: '/rates',
    fields: [
      { tag: 'title', what: 'Browser tab / search-result title', ref: 'rates.metaTitle', seo: 'lock',
        text: 'Rates & Booking | The Rooiberg Wander' },
      { tag: 'meta', what: 'Search-result description', ref: 'rates.metaDescription', seo: 'lock',
        text: 'R60,000 per exclusive group of up to 10 (SA residents, incl. VAT & conservation levies); +20% for foreign nationals. See what is included and book.' },
      { tag: 'p', what: 'Small line above heading', ref: 'rates.overline', text: 'Rates & Booking' },
      { tag: 'h1', what: 'Main heading', ref: 'rates.h1', seo: 'lock', text: 'What the trail costs' },
      { tag: 'p', what: 'Intro paragraph', ref: 'rates.intro',
        text: 'The Rooiberg Wander is priced per group, not per person. One flat rate buys exclusive use of the whole reserve for up to ten guests, with VAT and all conservation levies included.' },
      { tag: 'p', what: 'Price — SA residents (label / price / note)', ref: 'rates.local', fact: true,
        text: 'SA Residents\nR60,000 per group\nFlat rate for exclusive use by up to 10 guests. Includes all conservation levies.' },
      { tag: 'p', what: 'Price — foreign nationals (label / price / note)', ref: 'rates.international', fact: true,
        text: 'Foreign Nationals\nR72,000 per group\nA 20% premium on the resident rate. Exclusive use by up to 10 guests. Includes all conservation levies.' },
      { tag: 'p', what: 'Price card small print', ref: 'rates.vatline', fact: true,
        text: 'incl. VAT (15%) & conservation levies · up to 10 guests   /   Includes R[amount] VAT.' },
      { tag: 'p', what: 'Note under the price table', ref: 'rates.tableNote', fact: true,
        text: 'Prices are in South African Rand and include VAT at 15%. A valid tax invoice is issued on confirmation of payment.' },
      { tag: 'h2', what: 'Included — heading', ref: 'rates.included.h2', text: 'Included in the price' },
      { tag: 'li', what: 'Included — list (6)', ref: 'rates.included',
        text: 'Exclusive use of the reserve and all three sanctuaries (up to 10 guests)\nTwo qualified, armed wilderness guides throughout\nDaily transport of your baggage and provisions between camps\nCamp assistants for cleaning, kitchen prep and the braai\nAll reserve conservation levies\nVAT at 15%' },
      { tag: 'h2', what: 'To arrange yourself — heading', ref: 'rates.excluded.h2', text: 'What to arrange yourself' },
      { tag: 'li', what: 'To arrange yourself — list (3)', ref: 'rates.excluded',
        text: 'All food and beverages (the trail is self-catered)\nTravel to and from Rotavi Lodge\nPersonal travel insurance' },
      { tag: 'h2', what: 'Booking — heading', ref: 'rates.book.h2', text: 'Booking the trail' },
      { tag: 'p', what: 'Booking — when live', ref: 'rates.book.live',
        text: 'Choose your start date and group size and pay securely by card. Your booking is confirmed once payment is received, and a tax invoice is issued with your receipt.' },
      { tag: 'p', what: 'Booking — "coming soon" (shown until online booking is switched on)', ref: 'rates.book.soon',
        text: 'Online booking is being finalised. For now, email us to check dates and reserve your group.   /   Button: "Enquire about dates"   /   "Secure online booking with instant confirmation is coming soon."' },
      { tag: 'p', what: 'Booking form — field labels (when live)', ref: 'rates.book.form',
        text: 'Start date (Day 1, arrival) · Group size · Residency: Local resident / International visitor · Lead guest name · Email · "Estimated total: R… per group. Final total confirmed at checkout." · Button: "Continue to secure payment"' },
      { tag: 'h2', what: 'Enquiry — heading + intro', ref: 'rates.enquire',
        text: 'Enquire first\nSend us your details and target dates and we’ll be in touch.' },
      { tag: 'p', what: 'Enquiry form — field labels', ref: 'rates.enquire.form',
        text: 'Your name · Email · Group size (e.g. 8 guests) · Target dates (e.g. April 2027) · Message (optional) · Button: "Send enquiry"' },
      { tag: 'h2', what: 'Cancellations — heading + intro', ref: 'rates.refund.intro',
        text: 'Cancellations & refunds\nThe Rooiberg Wander is booked as exclusive use of the whole reserve for a single private group, with payment made in full at the time of booking. Because each booking reserves the entire reserve, its guides and camp staff for your group alone, cancellations are subject to the schedule below. All cancellations must be made in writing and take effect on the date we receive them. “Arrival” means Day 1, the arrival day of your booked window.' },
      { tag: 'table', what: 'Cancellation schedule (4 tiers)', ref: 'rates.refund.tiers', fact: true,
        text: '60 or more days before arrival  →  90% refund (10% administration fee retained)\n45 to 59 days before arrival  →  50% refund\n30 to 44 days before arrival  →  25% refund\nFewer than 30 days before arrival, or no-show  →  No refund' },
      { tag: 'dl', what: 'Cancellation clauses (9)', ref: 'rates.refund.clauses', fact: true,
        text: 'How refunds are paid — Approved refunds are returned to the original payment method via our payment provider, normally within 10 business days of confirmation. Payment-processing or bank charges, and any difference arising from foreign-exchange or international card fees, are not recoverable.\n\nChanging your dates — You may transfer your booking to another available start date at no administration fee if you request the change 60 or more days before arrival, subject to availability. Requests made later are treated as a cancellation under the schedule above. Names within your group may be substituted at no charge up to 14 days before arrival.\n\nIf we cancel or reschedule — If we have to cancel or move your trail, for reasons such as guest or wildlife safety, fire, flood, access, or other circumstances beyond our reasonable control, you will be offered a free transfer to another date or a full refund of monies paid to us. We are not liable for other costs you may incur, such as flights, accommodation, visas or travel insurance.\n\nForce majeure — Neither party is liable for failure to perform caused by events beyond its reasonable control. In such cases we will offer a transfer or a refund as set out above; we are not responsible for consequential travel costs.\n\nTravel insurance — We strongly recommend comprehensive travel insurance for every guest, covering at least trip cancellation and curtailment, medical treatment and emergency evacuation, and personal belongings.\n\nSafety and conduct — Because the trail operates in a Big 5 environment, guests must follow all instructions from the armed wilderness guides at all times, including the Two-Man Rule. Guests who place themselves or others at risk, or who materially breach safety instructions, may be removed from the trail without refund.\n\nNo-show and unused services — No refund is given for a no-show, late arrival, early departure, or any portion of the trail not used.\n\nPrices and VAT — All prices and refunds are in South African Rand and are inclusive of VAT at 15%. A valid tax invoice is issued on confirmation of payment.\n\nYour statutory rights — This policy is applied subject to the Consumer Protection Act 68 of 2008. Nothing in it limits any right you may have under that Act.' },
    ],
  },
  {
    name: 'Other pages (404, Privacy, Booking confirmation)',
    url: 'utility pages',
    fields: [
      { tag: 'h1', what: '404 (page not found) — heading + text + button', ref: 'notfound',
        text: 'You’ve wandered off the trail\nThe page you were looking for isn’t here. Let’s get you back on the path.\nButton: "Return home"' },
      { tag: 'p', what: 'Privacy page (placeholder — to be replaced with the real policy)', ref: 'privacy',
        text: 'Heading: "Privacy Policy". Currently a placeholder: the operator’s POPIA / GDPR policy will be inserted before launch.' },
      { tag: 'p', what: 'Booking confirmed page', ref: 'booking.confirm',
        text: 'Heading: "Your booking is confirmed". Thank you. Your payment was received and your exclusive booking is secured. A confirmation email and tax invoice are on their way. We look forward to welcoming your group to the Rooiberg.' },
      { tag: 'p', what: 'Booking not completed / cancelled page', ref: 'booking.cancel',
        text: 'Heading: "Your booking was not completed". No payment was taken and the dates have been released. You’re welcome to try again whenever you’re ready.' },
    ],
  },
];

// ----------------------------------------------------------------------------- styling helpers
const EARTH = '3D2B1F';
const OCHRE = 'A9762F';
const GREY = '7A7A7A';
const TAGBLUE = '1F6FEB';
const SEORED = 'B23B2E';

const tagRun = (tag) =>
  new TextRun({ text: `<${tag}>`, font: 'Consolas', bold: true, color: TAGBLUE, size: 18 });

function fieldBlocks(f) {
  const out = [];
  // label line — plain English first; a small grey reference code for us (editor can ignore it)
  out.push(
    new Paragraph({
      spacing: { before: 260, after: 40 },
      children: [
        new TextRun({ text: f.what, bold: true, size: 22, color: EARTH }),
        new TextRun({ text: `   · ref: ${f.ref}`, color: GREY, size: 15 }),
      ],
    }),
  );
  // SEO / fact marker
  if (f.seo === 'lock') {
    out.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: '🔒 SEO — please keep as-is. ', bold: true, color: SEORED, size: 18 }),
          new TextRun({
            text: 'Changing this can hurt search ranking. Keep the key words (e.g. brand, “slackpacking”, “Big 5”, “Waterberg”, place names).',
            color: SEORED,
            size: 18,
          }),
        ],
      }),
    );
  } else if (f.fact) {
    out.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: '⚠ Fact / legal — ', bold: true, color: OCHRE, size: 18 }),
          new TextRun({ text: 'check with the operator before changing (prices, disclaimers, schedules).', color: OCHRE, size: 18 }),
        ],
      }),
    );
  }
  // editable text box (one paragraph per line, shaded)
  const lines = f.text.split('\n');
  lines.forEach((line, i) => {
    out.push(
      new Paragraph({
        spacing: { before: i === 0 ? 0 : 20, after: i === lines.length - 1 ? 120 : 20 },
        shading: { type: ShadingType.CLEAR, fill: f.seo === 'lock' ? 'FBECEA' : 'F4EFE2' },
        border: {
          top: i === 0 ? { style: BorderStyle.SINGLE, size: 2, color: 'D9CDB0' } : undefined,
          bottom: i === lines.length - 1 ? { style: BorderStyle.SINGLE, size: 2, color: 'D9CDB0' } : undefined,
          left: { style: BorderStyle.SINGLE, size: 12, color: f.seo === 'lock' ? SEORED : OCHRE },
          right: { style: BorderStyle.SINGLE, size: 2, color: 'D9CDB0' },
        },
        children: [new TextRun({ text: line || ' ', size: 22, color: '2C2C2C' })],
      }),
    );
  });
  return out;
}

// ----------------------------------------------------------------------------- document
const children = [];

// Cover
children.push(
  new Paragraph({ spacing: { before: 1400, after: 60 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'The Rooiberg Wander', font: 'Georgia', bold: true, size: 60, color: EARTH })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 },
    children: [new TextRun({ text: 'Website Copy', font: 'Georgia', size: 34, color: OCHRE })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 },
    children: [new TextRun({ text: 'For review and editing', size: 26, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 },
    children: [new TextRun({ text: 'Generated 21 June 2026', size: 18, color: GREY })] }),
);

const bullet = (runs) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: runs });
const heading = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 },
  children: [new TextRun({ text: t, bold: true, color: EARTH })] });

children.push(heading('How to use this document'));
children.push(
  bullet([new TextRun('Every page of the website is a section below. Each item has a short plain-English label that tells you where the text appears (for example “Hero — main heading”).')]),
  bullet([new TextRun('Edit only the text inside the shaded boxes. '), new TextRun({ text: 'Please leave the labels as they are.', bold: true })]),
  bullet([new TextRun('You can ignore the small grey “ref:” code after each label — it is just a reference we use to put your text back in the right place.')]),
  bullet([new TextRun('Where a box has more than one line (for example a heading and its paragraph), keep them on separate lines.')]),
  bullet([new TextRun('Save the document and send it back, and we will update the website for you.')]),
);

children.push(heading('About the coloured markers'));
children.push(
  new Paragraph({ spacing: { after: 60 }, shading: { type: ShadingType.CLEAR, fill: 'FBECEA' },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: SEORED } },
    children: [new TextRun({ text: '🔒 Red boxes are SEO-sensitive. ', bold: true, color: SEORED }),
      new TextRun('Please avoid changing these (page titles, descriptions, main headings, image descriptions and FAQ questions). They are how people find the site on Google. If you must edit, keep the key words.')] }),
  new Paragraph({ spacing: { after: 120 }, shading: { type: ShadingType.CLEAR, fill: 'F4EFE2' },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: OCHRE } },
    children: [new TextRun({ text: 'Cream boxes are free to edit. ', bold: true, color: OCHRE }),
      new TextRun('Items also marked “Fact / legal” (prices, disclaimers, the cancellation schedule) should be checked with the operator first.')] }),
);

children.push(heading('Words to keep (for SEO)'));
children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun(
  'Wherever they appear, please keep these terms: The Rooiberg Wander · slackpacking · walking safari · Big 5 · malaria-free · Waterberg · Rooiberg · Limpopo · self-catered / self-catering · Rotavi Lodge · Oukraal · ViervanAcht · Groenkop · Marakele · two armed guides / Two-Man Rule.',
)] }));

// Contents (a plain visible list — no field updates needed)
children.push(heading('Contents'));
PAGES.forEach((page, i) => {
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `${i + 1}.  `, bold: true, color: EARTH }),
        new TextRun({ text: page.name, color: EARTH }),
        new TextRun({ text: `   (${page.url})`, italics: true, color: GREY, size: 18 }),
      ],
    }),
  );
});
children.push(
  new Paragraph({
    spacing: { before: 100 },
    children: [new TextRun({ text: 'Tip: in Word, open View → Navigation Pane to jump between pages.', italics: true, color: GREY, size: 18 })],
  }),
);

// Pages (each starts on a new page via the Heading 1 style's pageBreakBefore)
PAGES.forEach((page, i) => {
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${i + 1}. ${page.name}`)] }));
  children.push(new Paragraph({ spacing: { before: 40, after: 200 },
    children: [new TextRun({ text: `Web address: ${page.url}`, italics: true, color: GREY, size: 20 })] }));
  for (const f of page.fields) children.push(...fieldBlocks(f));
});

const doc = new Document({
  creator: 'The Rooiberg Wander',
  title: 'The Rooiberg Wander — Website Copy',
  description: 'All user-facing website copy, by page, for non-technical editing.',
  features: { updateFields: true }, // makes Word refresh the Contents on open
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22, color: '2C2C2C' } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Georgia', size: 30, bold: true, color: EARTH },
        paragraph: {
          pageBreakBefore: true,
          spacing: { before: 240, after: 60 },
          keepNext: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: OCHRE, space: 6 } },
        },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Georgia', size: 23, bold: true, color: EARTH },
        paragraph: { spacing: { before: 260, after: 80 }, keepNext: true },
      },
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'D9CDB0', space: 6 } },
              children: [
                new TextRun({ text: 'The Rooiberg Wander  ·  Website Copy  ·  page ', size: 16, color: GREY }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const out = 'Rooiberg-Wander-Website-Copy.docx';
const buf = await Packer.toBuffer(doc);
writeFileSync(out, buf);
console.log('Wrote', out, `(${(buf.length / 1024) | 0} KB)`);

// Copy to the Windows Desktop if the mount is available.
const desktop = '/mnt/c/Users/preto/Desktop/Rooiberg-Wander-Website-Copy.docx';
try {
  if (existsSync('/mnt/c/Users/preto/Desktop')) {
    copyFileSync(out, desktop);
    console.log('Copied to', desktop);
  }
} catch (e) {
  console.log('Desktop copy skipped:', e.message);
}
