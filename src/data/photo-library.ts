// The marketing photo library (CLAUDE.md Part 18): every site photograph the marketing team may
// use, with a stable id, a category, the lodge where relevant, and alt text written from looking at
// each image. get_photo_library (lib/marketing-tools.ts) serves these, merged with the photos the
// owner uploads at /admin/marketing (marketing.photos, private bucket marketing-photos).
//
// RULES
// - Logos are not photos and are left out.
// - NO HUNTING TROPHIES, EVER: no mounted heads, horns, skulls, hides as decor, taxidermy or a
//   hunter with a kill. Every image below was checked by eye, including zoomed crops of the walls,
//   rugs and niches in the interiors; none shows one. A new photo is added only after the same
//   check. (Uploads carry a required "This photo shows no hunting trophies" tick.)
// - Lodges are Temminck's Lodge, Oukraal and Rustwood only. Several filenames spell Temminck's
//   as "temmnicks"; the ids and alt text use the real name.
// - Ids are stable: drafts store them in photo_ids. Never reuse or rename an id.
//
// Three pairs are the same photograph at a different crop or resolution (noted on each), kept
// because both files ship with the site.
import type { ImageMetadata } from 'astro';

import heroSunset from '../assets/images/hero-rooiberg-mountains-sunset.jpg';
import duskPanorama from '../assets/images/rooiberg-dusk-panorama.jpg';
import walk1 from '../assets/images/walking-route-1.jpg';
import walk2 from '../assets/images/walking-route-2.jpg';
import walk3 from '../assets/images/walking-route-3.jpg';

import temHero from '../assets/images/temmnicks-hero.jpg';
import temRoom1 from '../assets/images/temmnickss-room-1.jpg';
import temRoom2 from '../assets/images/temmnicks-room-2.jpg';
import temPool from '../assets/images/temmnicks-pool.jpg';
import temPoolGarden from '../assets/images/lodges/temmincks-pool-garden.jpg';
import temLapa from '../assets/images/lodges/temmincks-lapa.jpg';
import temCottageGarden from '../assets/images/lodges/temmincks-cottage-garden.jpg';
import temThatchedSuite from '../assets/images/lodges/temmincks-thatched-suite.jpg';
import temGiraffe from '../assets/images/lodges/temmincks-giraffe.jpg';

import oukHero from '../assets/images/oukraal-hero.jpg';
import oukEntrance from '../assets/images/oukraal-entrance.jpg';
import oukBed from '../assets/images/oukraal-bed.jpg';
import oukBed2 from '../assets/images/oukraal-bed-2.jpg';
import oukPool from '../assets/images/oukraal-pool.jpg';
import oukTwinRoom from '../assets/images/lodges/oukraal-twin-room.jpg';
import oukBougainvillea from '../assets/images/lodges/oukraal-bougainvillea.jpg';
import oukGardenPool from '../assets/images/lodges/oukraal-garden-pool.jpg';
import oukHideView from '../assets/images/lodges/oukraal-hide-view.jpg';
import oukLapa from '../assets/images/lodges/oukraal-lapa.jpg';
import oukFirePit from '../assets/images/lodges/oukraal-fire-pit.jpg';

import rusHero from '../assets/images/rustwood-lodge-hero.jpg';
import rusInterior from '../assets/images/rustwood-main-interior.jpg';
import rusBed from '../assets/images/rustwood-bed.jpg';
import rusFirePit from '../assets/images/rustwood-fire-pit.jpg';
import rusPoolArea from '../assets/images/rustwood-pool-area.jpg';
import rusPoolDuskBand from '../assets/images/rustwood-pool-dusk-band.jpg';
import rusView from '../assets/images/rustwood-view.jpg';
import rusInfinityPool from '../assets/images/lodges/rustwood-infinity-pool.jpg';
import rusPoolDeck from '../assets/images/lodges/rustwood-pool-deck.jpg';
import rusSuiteView from '../assets/images/lodges/rustwood-suite-view.jpg';
import rusSuite from '../assets/images/lodges/rustwood-suite.jpg';
import rusBathView from '../assets/images/lodges/rustwood-bath-view.jpg';
import rusFirePitDusk from '../assets/images/lodges/rustwood-fire-pit-dusk.jpg';
import rusPoolNight from '../assets/images/lodges/rustwood-pool-night.jpg';

export const PHOTO_CATEGORIES = ['trail', 'lodge', 'landscape', 'wildlife', 'food', 'guide'] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export const PHOTO_LODGES = ["Temminck's Lodge", 'Oukraal', 'Rustwood'] as const;
export type PhotoLodge = (typeof PHOTO_LODGES)[number];

// Uploaded photos store a lodge KEY (marketing.photos.lodge, migration 0022), so the SQL check
// carries no apostrophe; this maps it to the lodge's name.
export const PHOTO_LODGE_BY_KEY = {
  temmincks: "Temminck's Lodge",
  oukraal: 'Oukraal',
  rustwood: 'Rustwood',
} as const satisfies Record<string, PhotoLodge>;
export type PhotoLodgeKey = keyof typeof PHOTO_LODGE_BY_KEY;

// Upload limits (lib/marketing-photos.ts and the bucket itself). 4 MB stays under Vercel's 4.5 MB
// request body ceiling for a serverless function.
export const PHOTO_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoUploadType = (typeof PHOTO_UPLOAD_TYPES)[number];

export interface LibraryPhoto {
  id: string;
  category: PhotoCategory;
  lodge: PhotoLodge | null;
  alt: string;
  // For the team, not for publishing: e.g. that another id is the same photograph.
  note?: string;
  image: ImageMetadata;
}

// Portrait suits a story (a tall 9:16 frame); landscape suits a feed post or a carousel.
export type PhotoOrientation = 'portrait' | 'landscape' | 'square';
export function orientationOf(width: number, height: number): PhotoOrientation {
  return height > width ? 'portrait' : height < width ? 'landscape' : 'square';
}

const T = "Temminck's Lodge" as const;
const O = 'Oukraal' as const;
const R = 'Rustwood' as const;

// Site photos the marketing team must never use: each shows hunting trophies (the owner's
// rule). They stay on the website; they are only kept out of this library.
export const MARKETING_EXCLUDED_PHOTOS: readonly string[] = [
  'lodges/rustwood-lounge.jpg', // horned buffalo skulls above the bar
  'lodges/oukraal-four-poster.jpg', // real hide cushion on the bed
];

export const photoLibrary: readonly LibraryPhoto[] = [
  // ---- Landscape and trail ----
  {
    id: 'rooiberg-sunset-grassland',
    category: 'landscape',
    lodge: null,
    alt: 'Long grass in the foreground and layered blue Waterberg ridges under a pink and orange sunset sky.',
    image: heroSunset,
  },
  {
    id: 'rooiberg-dusk-panorama',
    category: 'landscape',
    lodge: null,
    alt: 'A wide dusk panorama over bushveld and distant mountain ridges, with a soft pink sky.',
    note: 'A wider, lower-resolution crop of the same view as rooiberg-sunset-grassland.',
    image: duskPanorama,
  },
  {
    id: 'trail-rocky-gully',
    category: 'trail',
    lodge: null,
    alt: 'Three walkers with daypacks heading up a rocky, tree-lined gully between red earth banks, seen from behind.',
    image: walk1,
  },
  {
    id: 'trail-bushveld-path',
    category: 'trail',
    lodge: null,
    alt: 'Two walkers following a grassy path through open bushveld towards a distant ridge on a bright day.',
    image: walk2,
  },
  {
    id: 'guide-reading-tracks',
    category: 'guide',
    lodge: null,
    alt: 'A trail guide in a bush hat crouches on a red dirt track, pointing at the ground, while two walkers lean in to look.',
    image: walk3,
  },

  // ---- Temminck's Lodge ----
  {
    id: 'temmincks-thatched-lodge',
    category: 'lodge',
    lodge: T,
    alt: "The low thatched main building at Temminck's Lodge behind a planted garden of cycads and flowering shrubs.",
    image: temHero,
  },
  {
    id: 'temmincks-cottage-garden',
    category: 'lodge',
    lodge: T,
    alt: "A thatched building at Temminck's Lodge behind a flowering garden and a brick path.",
    note: 'The same photograph as temmincks-thatched-lodge, at a higher resolution.',
    image: temCottageGarden,
  },
  {
    id: 'temmincks-chalet-veranda',
    category: 'lodge',
    lodge: T,
    alt: "A thatched chalet with a covered veranda at Temminck's Lodge, framed by bare trees, with a brick path leading to it.",
    image: temRoom1,
  },
  {
    id: 'temmincks-chalet-path',
    category: 'lodge',
    lodge: T,
    alt: "A thatched guest cottage at Temminck's Lodge among bushveld trees, at the end of a curving brick path.",
    image: temRoom2,
  },
  {
    id: 'temmincks-pool-lapa',
    category: 'lodge',
    lodge: T,
    alt: "The curved pool at Temminck's Lodge with a sun ledge, red rock edging and the thatched lapa behind.",
    image: temPool,
  },
  {
    id: 'temmincks-pool-garden',
    category: 'lodge',
    lodge: T,
    alt: "The pool at Temminck's Lodge from above, set among aloes, palms and red rock, with the thatched lapa behind.",
    image: temPoolGarden,
  },
  {
    id: 'temmincks-lapa',
    category: 'lodge',
    lodge: T,
    alt: "The open-sided thatched lapa at Temminck's Lodge, with tables and chairs in its shade.",
    image: temLapa,
  },
  {
    id: 'temmincks-thatched-suite',
    category: 'lodge',
    lodge: T,
    alt: "A double-storey thatched suite at Temminck's Lodge, reached by a timber stair above a small rock pool.",
    image: temThatchedSuite,
  },
  {
    id: 'temmincks-giraffe',
    category: 'wildlife',
    lodge: T,
    alt: "A giraffe standing among the trees beside a thatched chalet at Temminck's Lodge.",
    image: temGiraffe,
  },

  // ---- Oukraal ----
  {
    id: 'oukraal-entrance-sign',
    category: 'lodge',
    lodge: O,
    alt: 'The Oukraal name carved into a stone wall at the entrance, with a paved driveway, palms and a game drive vehicle beyond.',
    image: oukHero,
  },
  {
    id: 'oukraal-driveway',
    category: 'lodge',
    lodge: O,
    alt: 'The paved, palm-lined driveway at Oukraal in winter sun, with guest buildings and a game drive vehicle at the end.',
    image: oukEntrance,
  },
  {
    id: 'oukraal-twin-room-door',
    category: 'lodge',
    lodge: O,
    alt: 'A twin bedroom at Oukraal with painted brick walls, woven headboards, orange cushions and an open door to the next room.',
    image: oukBed,
  },
  {
    id: 'oukraal-twin-room-art',
    category: 'lodge',
    lodge: O,
    alt: 'A twin bedroom at Oukraal with white duvets, folded towels, bedside lanterns and an African painting on the wall.',
    image: oukBed2,
  },
  {
    id: 'oukraal-twin-room',
    category: 'lodge',
    lodge: O,
    alt: 'A twin room at Oukraal with woven headboards, patterned cushions and fresh towels on each bed.',
    image: oukTwinRoom,
  },
  {
    id: 'oukraal-pool-tree',
    category: 'lodge',
    lodge: O,
    alt: 'The pool at Oukraal under a large spreading tree, with fenced lawn and bushveld beyond.',
    image: oukPool,
  },
  {
    id: 'oukraal-garden-pool',
    category: 'lodge',
    lodge: O,
    alt: 'The garden pool at Oukraal, edged with paving and lawn, with bushveld trees behind the fence.',
    image: oukGardenPool,
  },
  {
    id: 'oukraal-bougainvillea',
    category: 'lodge',
    lodge: O,
    alt: 'Pink bougainvillea framing a guest cottage across a paved courtyard at Oukraal.',
    image: oukBougainvillea,
  },
  {
    id: 'oukraal-hide-view',
    category: 'landscape',
    lodge: O,
    alt: 'The view from the hide at Oukraal over a shallow wetland, golden grass and thorn trees.',
    image: oukHideView,
  },
  {
    id: 'oukraal-lapa',
    category: 'lodge',
    lodge: O,
    alt: 'The thatched lapa at Oukraal with a long table laid in white and wicker chairs around it.',
    image: oukLapa,
  },
  {
    id: 'oukraal-fire-pit',
    category: 'lodge',
    lodge: O,
    alt: 'A stone fire pit stacked with wood on the terrace at Oukraal, ringed by safari chairs.',
    image: oukFirePit,
  },

  // ---- Rustwood ----
  {
    id: 'rustwood-entrance',
    category: 'lodge',
    lodge: R,
    alt: "The tall thatched entrance to Rustwood's main lodge, with carved timber doors and sculpted metal trees on either side.",
    image: rusHero,
  },
  {
    id: 'rustwood-main-interior',
    category: 'lodge',
    lodge: R,
    alt: "Inside Rustwood's main lodge under a high timber and thatch roof: a leather sofa, a table tennis table and the lounge beyond.",
    image: rusInterior,
  },
  {
    id: 'rustwood-bedroom',
    category: 'lodge',
    lodge: R,
    alt: 'A bedroom at Rustwood: a double bed against a reclaimed timber headboard, woven pendant lamps and two woven stools.',
    image: rusBed,
  },
  {
    id: 'rustwood-suite',
    category: 'lodge',
    lodge: R,
    alt: 'A suite at Rustwood under a thatched roof, with woven stools at the foot of the bed and a glass walk-in shower.',
    image: rusSuite,
  },
  {
    id: 'rustwood-suite-view',
    category: 'lodge',
    lodge: R,
    alt: 'A suite at Rustwood with its glass doors folded open onto a private deck, two loungers and a wooded hillside.',
    image: rusSuiteView,
  },
  {
    id: 'rustwood-bath-view',
    category: 'lodge',
    lodge: R,
    alt: 'A freestanding bath of foam at Rustwood beside a window onto the hills, with a glass of wine on the sill.',
    image: rusBathView,
  },
  {
    id: 'rustwood-fire-pit-terrace',
    category: 'lodge',
    lodge: R,
    alt: 'A fire burning in a round fire pit on the stone terrace at Rustwood, above a wide valley and distant mountains.',
    image: rusFirePit,
  },
  {
    id: 'rustwood-fire-pit-dusk',
    category: 'lodge',
    lodge: R,
    alt: 'Flames in the fire pit at Rustwood at dusk, behind a balustrade of metal branches and the hills beyond.',
    image: rusFirePitDusk,
  },
  {
    id: 'rustwood-infinity-pool',
    category: 'lodge',
    lodge: R,
    alt: "Rustwood's infinity pool and shade sails, with loungers in the foreground and the Waterberg ranges beyond.",
    image: rusInfinityPool,
  },
  {
    id: 'rustwood-pool-shade-sails',
    category: 'lodge',
    lodge: R,
    alt: 'Shade sails over loungers beside the infinity pool at Rustwood, looking out over the valley in late afternoon light.',
    image: rusPoolArea,
  },
  {
    id: 'rustwood-pool-deck',
    category: 'lodge',
    lodge: R,
    alt: 'The pool deck at Rustwood, with the thatched lodge and its shade sails reflected in the water.',
    image: rusPoolDeck,
  },
  {
    id: 'rustwood-pool-sunset',
    category: 'lodge',
    lodge: R,
    alt: "The sun setting over the Waterberg beyond Rustwood's infinity pool, under a shade sail.",
    image: rusView,
  },
  {
    id: 'rustwood-pool-night',
    category: 'lodge',
    lodge: R,
    alt: 'The pool at Rustwood lit up at dusk under the shade sails, with the glowing lodge to one side.',
    image: rusPoolNight,
  },
  {
    id: 'rustwood-pool-dusk-wide',
    category: 'lodge',
    lodge: R,
    alt: 'The pool at Rustwood lit up at dusk under the shade sails.',
    note: 'The same photograph as rustwood-pool-night, at a higher resolution.',
    image: rusPoolDuskBand,
  },
];
