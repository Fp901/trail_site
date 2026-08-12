// Conceptual route data — Part 8.6. Drives the static RouteMap SVG (no GPS / mapping lib).
// Coordinates are illustrative only — a balanced composition, not geography.
//
// Two layouts, not one. A single 800x560 board is ~1118px wide on desktop but only ~300px
// inside the panel on a 380px phone (container 75rem - px-6 - panel padding), i.e. a 0.375
// scale that shrank the pin labels to ~7px. "wide" serves >=640px; "tall" is a portrait
// recomposition with fewer labels and larger type for phones. Same pins, same days.
export interface RoutePin {
  id: string;
  name: string;
  role: string;
  isHub?: boolean; // start & end point (Temminck's Lodge)
}

export interface RouteSegment {
  day: number;
  colorVar: string;
  from: string;
  to: string;
  landmarks: string[];
}

/** Depth tone for a filled terrain silhouette — far ridges recede, near ground advances. */
export type TerrainTone = 'far' | 'mid' | 'plain';

export interface TerrainShape {
  d: string;
  tone: TerrainTone;
}

export interface WaterShape {
  d: string;
  kind: 'river' | 'dam';
}

export interface MapLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

/**
 * Where a pin's name sits relative to its dot. The default "above" stops working once a route
 * passes over that side — Day 3 runs north of Temminck's and leaves Oukraal westward, so both
 * needed moving. `lines` splits a long name over two rows; "Temminck's Lodge" on one row is
 * ~203 units wide and could not clear the Day 3 traverse on either side of the hub.
 */
export interface PinPlacement {
  x: number;
  y: number;
  place?: 'above' | 'right';
  lines?: string[];
}

export interface RouteLayout {
  id: string;
  viewBox: string;
  /** Pin id -> position and label placement in this layout's coordinate space. */
  pins: Record<string, PinPlacement>;
  /** Day number -> SVG path "d" for that day's walk. */
  paths: Record<number, string>;
  terrain: TerrainShape[];
  water: WaterShape[];
  places: MapLabel[];
}

export const routePins: RoutePin[] = [
  { id: 'rotavi', name: "Temminck's Lodge", role: 'Start & end', isHub: true },
  { id: 'oukraal', name: 'Oukraal', role: 'Night 2' },
  { id: 'blackwood', name: 'Blackwood', role: 'Night 3' },
];

export const routeSegments: RouteSegment[] = [
  {
    day: 2,
    colorVar: '--color-day2',
    from: "Temminck's Lodge",
    to: 'Oukraal',
    landmarks: ['Groenkop summit', 'Exit of Groenkop climb', 'Scenic dam'],
  },
  {
    day: 3,
    colorVar: '--color-day3',
    from: 'Oukraal',
    to: 'Blackwood',
    landmarks: ['Entrance to L-Kloof', 'Welgedacht lookout', 'Scenic ravine', 'Vista picnic'],
  },
  {
    day: 4,
    colorVar: '--color-day4',
    from: 'Blackwood',
    to: "Temminck's Lodge",
    landmarks: [
      'Scenic riverbed walk',
      'Scenic viewpoint',
      'Welgedacht plains',
      'Daskop & Daskop dam',
    ],
  },
];

// Landscape board, laid out from the operator's Google Earth plot (Dec 2023 screenshot):
// Temminck's is the northern hub, Oukraal sits east of it, Blackwood (VierVanAcht) is far
// west and lower. Day 2 loops south-east over Groenkop and bulges east past the scenic dam
// before turning north to Oukraal; Day 3 runs west from Oukraal *north of* the hub, then
// south-west via L-Kloof and Kareedam; Day 4 drops south, rounds the southern plain and
// comes back north up the riverbed. Still stylised — relative position and direction are
// faithful, the line work is not a GPS trace.
const wide: RouteLayout = {
  id: 'wide',
  viewBox: '0 0 800 560',
  // Every pin label sits east of its dot. The hub is boxed in on three sides — Day 3 passes
  // north of it, Day 4 arrives from the south-west up the riverbed, Day 2 departs south-east —
  // and "above" put the name straight under the Day 3 traverse.
  pins: {
    rotavi: { x: 462, y: 140, place: 'right', lines: ["Temminck's", 'Lodge'] },
    oukraal: { x: 668, y: 104, place: 'right' },
    blackwood: { x: 288, y: 356, place: 'right' },
  },
  paths: {
    2: 'M462 140 Q 470 186 537 200 Q 600 244 640 276 Q 706 306 748 262 Q 776 226 736 194 Q 706 140 668 104',
    3: 'M668 104 Q 536 6 380 66 Q 330 88 332 182 Q 330 240 218 250 Q 130 258 78 302 Q 44 340 94 366 Q 182 392 288 356',
    4: 'M288 356 Q 320 420 372 476 Q 410 512 460 490 Q 520 470 512 414 Q 498 366 448 332 Q 424 280 440 220 Q 452 172 462 140',
  },
  terrain: [
    // Backdrop ridgeline across the north. Many small angular peaks, not three big smooth
    // triangles: a ridgeline silhouette rather than the generic travel-template mountain.
    {
      d: 'M 8 104 L 40 74 L 64 88 L 96 56 L 124 82 L 154 52 L 186 84 L 214 66 L 244 92 L 270 74 L 296 104 Z',
      tone: 'far',
    },
    // Groenkop — the Day 2 climb crosses its shoulder on the way out of Temminck's.
    { d: 'M 470 252 Q 505 244 526 208 L 549 176 L 578 212 Q 604 246 640 252 Z', tone: 'mid' },
    // The western high ground the Day 3 traverse climbs into at the L-Kloof entrance.
    { d: 'M 140 254 Q 176 246 198 214 L 220 184 L 246 218 Q 272 250 306 254 Z', tone: 'mid' },
    // Low ground south-west of Blackwood, filling the corner the loop leaves open. Lower and
    // shallower than the northern ridge so the two do not read as a mirrored pair.
    {
      d: 'M 34 502 L 62 478 L 84 490 L 112 466 L 138 488 L 164 468 L 188 492 L 210 478 L 232 502 Z',
      tone: 'far',
    },
    // The open southern ground Day 4 rounds before turning back north — sized to sit inside
    // the loop rather than spread past it as a slab.
    {
      d: 'M 318 424 Q 380 402 442 414 Q 490 424 522 412 Q 540 456 528 500 Q 440 534 360 518 Q 306 504 300 470 Q 300 442 318 424 Z',
      tone: 'plain',
    },
  ],
  water: [
    // The riverbed Day 4 walks north. Drawn *under* the Day 4 line rather than beside it —
    // the walk is in the riverbed, and a parallel line read as a fourth route.
    {
      d: 'M 486 470 Q 496 430 500 396 Q 486 358 462 334 Q 442 310 436 282 Q 432 262 434 246',
      kind: 'river',
    },
    { d: 'M 212 152 Q 236 142 256 150 Q 272 158 262 168 Q 238 178 216 168 Q 204 160 212 152 Z', kind: 'dam' },
    { d: 'M 716 226 Q 740 216 760 224 Q 776 232 766 242 Q 742 252 720 242 Q 708 234 716 226 Z', kind: 'dam' },
  ],
  places: [
    { text: 'Daskop dam', x: 238, y: 138, anchor: 'middle' },
    { text: 'Groenkop', x: 566, y: 178, anchor: 'start' },
    { text: 'Scenic dam', x: 700, y: 236, anchor: 'end' },
    { text: 'Entrance to L-Kloof', x: 230, y: 288, anchor: 'middle' },
    { text: 'Kareedam', x: 96, y: 344, anchor: 'start' },
    { text: 'Riverbed walk', x: 470, y: 300, anchor: 'start' },
  ],
};

// Portrait board for phones — same topology as `wide`, recomposed for a tall frame: Oukraal
// north-east, Temminck's below and west of it, Blackwood bottom-left. Carries two place names
// instead of six; the landmark key below the map is the full text equivalent, so thinning the
// board costs nothing and buys legibility at ~300px.
const tall: RouteLayout = {
  id: 'tall',
  viewBox: '0 0 480 660',
  pins: {
    rotavi: { x: 208, y: 258, place: 'above', lines: ["Temminck's", 'Lodge'] },
    oukraal: { x: 344, y: 128, place: 'above' },
    blackwood: { x: 132, y: 496, place: 'above' },
  },
  paths: {
    2: 'M208 258 Q 268 300 300 350 Q 344 412 396 384 Q 436 356 410 288 Q 388 194 344 128',
    3: 'M344 128 Q 214 84 118 152 Q 62 194 78 268 Q 92 336 132 496',
    4: 'M132 496 Q 176 560 244 590 Q 310 612 328 556 Q 336 492 286 442 Q 236 388 214 330 Q 204 292 208 258',
  },
  terrain: [
    {
      d: 'M 176 92 L 208 60 L 232 74 L 264 42 L 292 68 L 322 38 L 354 70 L 382 52 L 410 78 L 436 60 L 462 92 Z',
      tone: 'far',
    },
    // Groenkop, on the Day 2 loop south-east of the hub.
    { d: 'M 286 366 Q 316 358 336 328 L 358 300 L 382 334 Q 404 364 438 370 Z', tone: 'mid' },
    // The western high ground Day 3 climbs into. Sits below the hub label, not behind it.
    { d: 'M 6 366 Q 34 358 52 328 L 72 300 L 94 332 Q 114 360 144 366 Z', tone: 'mid' },
    {
      d: 'M 146 528 Q 232 506 312 528 Q 356 540 386 528 Q 400 572 388 614 Q 280 646 190 630 Q 138 618 128 586 Q 124 552 146 528 Z',
      tone: 'plain',
    },
  ],
  water: [
    {
      d: 'M 330 528 Q 318 480 296 448 Q 272 412 246 380 Q 226 348 214 312 Q 206 284 208 262',
      kind: 'river',
    },
  ],
  // No place labels at all. Day 3 runs straight down the western margin and Day 2's loop fills
  // the east, leaving corridors under ~15 units wide once the lodge names are placed — every
  // candidate position for "Groenkop" or "L-Kloof" sat on a route. The landmark key below the
  // map names all of them, so the phone board stays purely spatial.
  places: [],
};

export const routeLayouts: RouteLayout[] = [wide, tall];
