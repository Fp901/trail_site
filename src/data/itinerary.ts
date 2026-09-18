// Itinerary — Part 8.2 + 2026 brief. Day 1 distanceKm null ("No walking"); Days 2–4 are walked.
// colorVar matches the route-map day colours (Part 5.4 / 8.6). Walking days carry an elevation
// profile.
//
// The profile used to be a screenshot of the Google Maps "Elevation profile" widget
// (elevation-day2/3/4.png) — Google's own UI chrome (a "Length" field, a dropdown, an "Advanced
// measurements" footer), Google's default blue and non-round auto-fit gridlines had nothing to do
// with this site's design. `elevationProfile` below drives a hand-authored ElevationChart.astro
// instead, matching the route map's own approach (Part 8.6: "a hand-authored illustrative SVG,
// not a mapping library") — same real distance and elevation figures (see elevationAlt), an
// illustrative curve rather than a literal GPS trace.
import type { ImageMetadata } from 'astro';
import temmnicksPoolImg from '../assets/images/temmnicks-pool.jpg';
import oukraalBedImg from '../assets/images/oukraal-bed.jpg';
import blackwoodBedImg from '../assets/images/blackwood-bed.jpg';
import temmnicksHeroImg from '../assets/images/temmnicks-hero.jpg';

export interface ElevationProfile {
  points: [number, number][]; // [distance fraction 0..1, elevation metres], illustrative shape
  axisMin: number; // real reported low point (metres)
  axisMax: number; // real reported high point (metres)
  axisStep: number; // gridline spacing (metres)
  distanceKm: number; // real reported distance, to 2 decimal places
  landmarkLabel: string; // named feature at the callout point — from the day's own copy
  landmarkFrac: number; // where along the walk that feature sits (0..1)
}

export interface ItineraryDay {
  day: number;
  title: string;
  distanceKm: number | null; // null = no walking (arrival day)
  from?: string;
  to?: string;
  description: string;
  colorVar?: string;
  elevationProfile?: ElevationProfile;
  elevationAlt?: string;
  elevationCaption?: string;
  photo?: ImageMetadata; // a real photo of that night's lodge, paired with the elevation chart
  photoAlt?: string;
}

export const itinerary: ItineraryDay[] = [
  {
    day: 1,
    title: 'Arrival & Briefing',
    distanceKm: null,
    description:
      'Arrive and register at Temminck\'s Lodge, the valley basecamp, from 13h00 onwards. Park in the shaded, secure on-site parking; your vehicles stay here for the whole trail. Your two experienced trail guides run a full safety and route briefing, then the afternoon is yours at the pool, with the evening around the fire.',
    photo: temmnicksPoolImg,
    photoAlt: "The pool at Temminck's Lodge, where the afternoon is free after the arrival briefing.",
  },
  {
    day: 2,
    title: 'The Mountain Crossing',
    distanceKm: 15,
    from: "Temminck's Lodge",
    to: 'Oukraal',
    photo: oukraalBedImg,
    photoAlt: 'A twin room at Oukraal, waiting at the end of the mountain crossing over Groenkop.',
    description:
      'Set off early for the traverse over Groenkop. A demanding climb, rewarded with 360° views reaching 100 km. The route passes deep kloofs, towering fig trees and striking rock formations before dropping to Oukraal, a quiet bush lodge where your luggage and dinner supplies are already waiting.',
    colorVar: '--color-day2',
    elevationProfile: {
      points: [
        [0.0, 1195], [0.05, 1180], [0.1, 1200], [0.15, 1175], [0.2, 1166], [0.25, 1190],
        [0.3, 1230], [0.35, 1320], [0.4, 1420], [0.45, 1490], [0.48, 1516], [0.52, 1480],
        [0.56, 1430], [0.6, 1380], [0.64, 1340], [0.68, 1300], [0.72, 1270], [0.76, 1250],
        [0.8, 1230], [0.84, 1215], [0.88, 1225], [0.9, 1210], [0.94, 1195], [0.97, 1205],
        [1.0, 1180],
      ],
      axisMin: 1166,
      axisMax: 1516,
      axisStep: 100,
      distanceKm: 14.82,
      landmarkLabel: 'Groenkop',
      landmarkFrac: 0.48,
    },
    elevationAlt:
      'Day 2 elevation profile: 14.82 km, climbing from about 1,166 m over Groenkop to roughly 1,516 m, then descending to Oukraal.',
    elevationCaption: 'Elevation profile · 14.8 km · over Groenkop to ~1,516 m',
  },
  {
    day: 3,
    title: 'The High Ridge Traverse',
    distanceKm: 20,
    from: 'Oukraal',
    to: 'Blackwood',
    photo: blackwoodBedImg,
    photoAlt: 'A bedroom at Blackwood, the highest lodge on the trail, at the end of the high ridge traverse.',
    description:
      'Climb the high ridges through the deeply-ravined Elandsberg L-Kloof to the lookout point with stunning views over the Marakele range. Drop into the Welgedacht Ravine, cut into the rock by thousands of years of rainstorms, and reach Blackwood, the highest lodge on the trail, with a pool and an evening fire.',
    colorVar: '--color-day3',
    elevationProfile: {
      points: [
        [0.0, 1160], [0.04, 1145], [0.08, 1170], [0.12, 1150], [0.16, 1180], [0.2, 1140],
        [0.24, 1107], [0.28, 1140], [0.32, 1190], [0.36, 1220], [0.38, 1200], [0.42, 1230],
        [0.46, 1270], [0.5, 1310], [0.54, 1350], [0.58, 1385], [0.62, 1405], [0.65, 1414.5],
        [0.68, 1400], [0.7, 1390], [0.73, 1405], [0.76, 1395], [0.8, 1370], [0.84, 1330],
        [0.88, 1290], [0.9, 1260], [0.93, 1245], [0.96, 1270], [1.0, 1310],
      ],
      axisMin: 1107,
      axisMax: 1414.5,
      axisStep: 100,
      distanceKm: 19.65,
      landmarkLabel: 'High ridge',
      landmarkFrac: 0.65,
    },
    elevationAlt:
      'Day 3 elevation profile: 19.65 km, undulating up to about 1,414 m along the high ridge to Blackwood.',
    elevationCaption: 'Elevation profile · 19.7 km · up to ~1,414 m on the high ridge',
  },
  {
    day: 4,
    title: 'The Plains & Departure',
    distanceKm: 18,
    from: 'Blackwood',
    to: "Temminck's Lodge",
    photo: temmnicksHeroImg,
    photoAlt: "The thatched main lodge at Temminck's, back at the valley basecamp where the trail concludes.",
    description:
      'Cross the open grass plains where game is frequently seen grazing, follow the upper reaches of the Sand River, and circle the base of Groenkop back to Temminck\'s Lodge, where the trail concludes. Shower, share a final meal, collect your vehicles and depart.',
    colorVar: '--color-day4',
    elevationProfile: {
      points: [
        [0.0, 1341], [0.03, 1280], [0.06, 1220], [0.09, 1195], [0.12, 1175], [0.15, 1200],
        [0.18, 1230], [0.21, 1245], [0.24, 1225], [0.27, 1195], [0.3, 1175], [0.33, 1200],
        [0.36, 1235], [0.39, 1215], [0.42, 1180], [0.45, 1160], [0.48, 1175], [0.5, 1195],
        [0.53, 1180], [0.56, 1160], [0.59, 1150], [0.62, 1160], [0.65, 1155], [0.68, 1150],
        [0.71, 1160], [0.74, 1155], [0.77, 1150], [0.8, 1144], [0.83, 1160], [0.86, 1195],
        [0.89, 1215], [0.92, 1200], [0.95, 1210], [1.0, 1200],
      ],
      axisMin: 1144,
      axisMax: 1341,
      axisStep: 100,
      distanceKm: 18.61,
      landmarkLabel: 'Blackwood',
      landmarkFrac: 0.0,
    },
    elevationAlt:
      'Day 4 elevation profile: 18.61 km, descending from about 1,341 m across the open plains back to Temminck\'s Lodge.',
    elevationCaption: 'Elevation profile · 18.6 km · descending across the plains',
  },
];
