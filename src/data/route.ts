// Conceptual route data — Part 8.6. Drives the static RouteMap SVG (no GPS / mapping lib).
// Coordinates are illustrative only, chosen for a balanced loop — not geographic.
export interface RoutePin {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  isHub?: boolean; // start & end point (Rotavi Lodge)
}

export interface RouteSegment {
  day: number;
  colorVar: string;
  from: string;
  to: string;
  path: string; // SVG path "d"
  landmarks: string[];
}

export const routeViewBox = '0 0 800 560';

export const routePins: RoutePin[] = [
  { id: 'rotavi', name: 'Rotavi Lodge', role: 'Start & end', x: 158, y: 432, isHub: true },
  { id: 'oukraal', name: 'Oukraal', role: 'Night 2', x: 432, y: 120 },
  { id: 'viervanacht', name: 'ViervanAcht', role: 'Night 3', x: 660, y: 360 },
];

export const routeSegments: RouteSegment[] = [
  {
    day: 2,
    colorVar: '--color-day2',
    from: 'Rotavi Lodge',
    to: 'Oukraal',
    path: 'M158 432 Q 228 232 432 120',
    landmarks: ['Groenkop summit', 'Exit of Groenkop climb', 'Scenic dam'],
  },
  {
    day: 3,
    colorVar: '--color-day3',
    from: 'Oukraal',
    to: 'ViervanAcht',
    path: 'M432 120 Q 632 162 660 360',
    landmarks: [
      'Entrance to L-Kloof',
      'Kareedam',
      'Welgedacht lookout',
      'Scenic ravine',
      'Vista picnic',
    ],
  },
  {
    day: 4,
    colorVar: '--color-day4',
    from: 'ViervanAcht',
    to: 'Rotavi Lodge',
    path: 'M660 360 Q 452 524 158 432',
    landmarks: [
      'Scenic riverbed walk',
      'Scenic viewpoint',
      'Welgedacht plains',
      'Daskop & Daskop dam',
    ],
  },
];
