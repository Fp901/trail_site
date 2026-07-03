// Itinerary — Part 8.2 + 2026 brief. Day 1 distanceKm null ("No walking"); Days 2–4 are walked.
// colorVar matches the route-map day colours (Part 5.4 / 8.6). Walking days carry an elevation
// profile image (from the measured GPS routes).
import type { ImageMetadata } from 'astro';
import elevationDay2 from '../assets/images/elevation-day2.png';
import elevationDay3 from '../assets/images/elevation-day3.png';
import elevationDay4 from '../assets/images/elevation-day4.png';

export interface ItineraryDay {
  day: number;
  title: string;
  distanceKm: number | null; // null = no walking (arrival day)
  from?: string;
  to?: string;
  description: string;
  colorVar?: string;
  elevation?: ImageMetadata;
  elevationAlt?: string;
  elevationCaption?: string;
}

export const itinerary: ItineraryDay[] = [
  {
    day: 1,
    title: 'Arrival & Briefing',
    distanceKm: null,
    description:
      'Arrive and register at Rotavi Lodge, the valley basecamp, from 13h00 onwards. Park in the shaded, secure on-site parking; your vehicles stay here for the whole trail. Your two armed trail guides run a full safety and route briefing, then the afternoon is yours at the pool, with the evening around the fire.',
  },
  {
    day: 2,
    title: 'The Mountain Crossing',
    distanceKm: 15,
    from: 'Rotavi Lodge',
    to: 'Oukraal',
    description:
      'Set off early for the rewarding climb over Groenkop. The trail is tough but the payoff is huge: 360° views that reach 100 km. You’ll wind past deep kloofs, towering fig trees, and striking rock formations, all leading to Oukraal, a quiet bush lodge where your luggage and dinner supplies are already waiting.',
    colorVar: '--color-day2',
    elevation: elevationDay2,
    elevationAlt:
      'Day 2 elevation profile: 14.82 km, climbing from about 1,166 m over Groenkop to roughly 1,516 m, then descending to Oukraal.',
    elevationCaption: 'Elevation profile · 14.8 km · over Groenkop to ~1,516 m',
  },
  {
    day: 3,
    title: 'The High Ridge Traverse',
    distanceKm: 20,
    from: 'Oukraal',
    to: 'ViervanAcht',
    description:
      'Climb the high ridges through the deeply-ravined Elandsberg L-Kloof to the lookout point with stunning views over the Marakele range. Drop into the Welgedacht Ravine, cut into the rock by thousands of years of rainstorms, and reach ViervanAcht, the mountain lodge. The view, the pool and the fire are waiting.',
    colorVar: '--color-day3',
    elevation: elevationDay3,
    elevationAlt:
      'Day 3 elevation profile: 19.65 km, undulating up to about 1,414 m along the high ridge to ViervanAcht.',
    elevationCaption: 'Elevation profile · 19.7 km · up to ~1,414 m on the high ridge',
  },
  {
    day: 4,
    title: 'The Plains & Departure',
    distanceKm: 18,
    from: 'ViervanAcht',
    to: 'Rotavi Lodge',
    description:
      'Cross the open grass plains where game is frequently seen grazing, follow the upper reaches of the Sand River, and circle the base of Groenkop back to Rotavi Lodge, where the trail concludes. Shower, share a final meal, collect your vehicles and depart.',
    colorVar: '--color-day4',
    elevation: elevationDay4,
    elevationAlt:
      'Day 4 elevation profile: 18.61 km, descending from about 1,341 m across the open plains back to Rotavi Lodge.',
    elevationCaption: 'Elevation profile · 18.6 km · descending across the plains',
  },
];
