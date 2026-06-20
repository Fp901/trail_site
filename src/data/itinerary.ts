// Itinerary — Part 8.2 + 2026 brief. Day 1 distanceKm null ("No walking"); Days 2–4 ~20 km
// (~60 km total). colorVar matches the route-map day colours (Part 5.4 / 8.6).
export interface ItineraryDay {
  day: number;
  title: string;
  distanceKm: number | null; // null = no walking (arrival day)
  from?: string;
  to?: string;
  description: string;
  colorVar?: string;
}

export const itinerary: ItineraryDay[] = [
  {
    day: 1,
    title: 'Arrival & Briefing',
    distanceKm: null,
    description:
      'Arrive and register at Rotavi Lodge, the valley basecamp. Park in the shaded, secure on-site parking — your vehicles stay here for the trail. After a full safety and route briefing by your two armed guides, settle into the rhythm of the bush with a relaxed afternoon at the pool and an evening together around the fire.',
  },
  {
    day: 2,
    title: 'The Mountain Crossing',
    distanceKm: 20,
    from: 'Rotavi Lodge',
    to: 'Oukraal',
    description:
      'An early start for the challenging, scenic climb over Groenkop, where 360° views stretch up to 100 km. Pass deep kloofs, massive fig trees and dramatic rock formations on the way to Oukraal, the bush sanctuary — your luggage and evening provisions already waiting on arrival.',
    colorVar: '--color-day2',
  },
  {
    day: 3,
    title: 'The High Ridge Traverse',
    distanceKm: 20,
    from: 'Oukraal',
    to: 'ViervanAcht',
    description:
      'Ascend the high ridges via the deeply ravined L-Kloof to the pristine Welgedacht lookout, with panoramic views over Marakele. Descend into the historic Welgedacht Donga — carved into the rock by thousands of years of rainstorms — and arrive at ViervanAcht, the mountain sanctuary, for the view, the pool and the campfire.',
    colorVar: '--color-day3',
  },
  {
    day: 4,
    title: 'The Plains, Donga & Departure',
    distanceKm: 20,
    from: 'ViervanAcht',
    to: 'Rotavi Lodge',
    description:
      'Cross the open grass plains where game is frequently seen grazing, follow the upper reaches of the Sand River, and circle the base of Groenkop back to Rotavi Lodge, where the trail concludes. Shower, share a final meal, collect your vehicles and depart.',
    colorVar: '--color-day4',
  },
];
