// Sanctuaries — Part 8.3 + 2026 brief. Three distinct premium nodes under one trail standard.
// Spelling: "Rustwood" (renamed from Blackwood, originally ViervanAcht). Images supplied by the client.
//
// Each lodge carries one `heroImage`, used both as the Home page lodge-card teaser and as the
// primary photo on the lodge's own card on /accommodation, plus a `gallery` of supporting photos
// shown alongside the hero there. A separate, smaller `homeImage` (a pool-area shot, distinct
// from the hero) used to serve the Home teaser alone; it read as a weaker, less characterful photo
// of each lodge than the hero one click away, so the Home cards now show the same hero photo
// instead — one strong image per lodge, reused, rather than two competing ones.
import type { ImageMetadata } from 'astro';

import temmnicksHeroImg from '../assets/images/temmnicks-hero.jpg';
import temmnicksGallery1 from '../assets/images/temmnickss-room-1.jpg';
import temmnicksGallery2 from '../assets/images/temmnicks-room-2.jpg';

import oukraalHeroImg from '../assets/images/oukraal-hero.jpg';
import oukraalGallery1 from '../assets/images/oukraal-entrance.jpg';
import oukraalGallery2 from '../assets/images/oukraal-bed-2.jpg';

import rustwoodHeroImg from '../assets/images/rustwood-lodge-hero.jpg';
// Named by subject rather than by slot: the two gallery photos shifted along by one (the fire-pit
// terrace came out, the bedroom came in), and positional names made that change unreadable.
import rustwoodInteriorImg from '../assets/images/rustwood-main-interior.jpg';
import rustwoodBedImg from '../assets/images/rustwood-bed.jpg';
// Lightbox-only photos (the "View all photos" viewer on /accommodation). Client photography,
// chosen to show rooms, pools and outdoor spaces: no mounted trophies and no kitchens.
import temPoolGarden from '../assets/images/lodges/temmincks-pool-garden.jpg';
import temLapa from '../assets/images/lodges/temmincks-lapa.jpg';
import temCottageGarden from '../assets/images/lodges/temmincks-cottage-garden.jpg';
import temThatchedSuite from '../assets/images/lodges/temmincks-thatched-suite.jpg';
import temGiraffe from '../assets/images/lodges/temmincks-giraffe.jpg';
import oukFourPoster from '../assets/images/lodges/oukraal-four-poster.jpg';
import oukTwinRoom from '../assets/images/lodges/oukraal-twin-room.jpg';
import oukBougainvillea from '../assets/images/lodges/oukraal-bougainvillea.jpg';
import oukGardenPool from '../assets/images/lodges/oukraal-garden-pool.jpg';
import oukHideView from '../assets/images/lodges/oukraal-hide-view.jpg';
import oukLapa from '../assets/images/lodges/oukraal-lapa.jpg';
import oukFirePit from '../assets/images/lodges/oukraal-fire-pit.jpg';
import rusInfinityPool from '../assets/images/lodges/rustwood-infinity-pool.jpg';
import rusPoolDeck from '../assets/images/lodges/rustwood-pool-deck.jpg';
import rusSuiteView from '../assets/images/lodges/rustwood-suite-view.jpg';
import rusSuite from '../assets/images/lodges/rustwood-suite.jpg';
import rusBathView from '../assets/images/lodges/rustwood-bath-view.jpg';
import rusFirePitDusk from '../assets/images/lodges/rustwood-fire-pit-dusk.jpg';
import rusLounge from '../assets/images/lodges/rustwood-lounge.jpg';
import rusPoolNight from '../assets/images/lodges/rustwood-pool-night.jpg';

export type AmenityIconName =
  | 'parking'
  | 'pool'
  | 'suite'
  | 'kitchen'
  | 'barbeque'
  | 'water'
  | 'ice'
  | 'wood'
  | 'wifi'
  | 'view';

export interface LodgeAmenity {
  icon: AmenityIconName;
  label: string;
}

export interface GalleryPhoto {
  image: ImageMetadata;
  alt: string;
}

export interface Sanctuary {
  id: string;
  name: string;
  role: string;
  description: string;
  alt: string; // heroImage's alt text
  accentVar: string;
  heroImage?: ImageMetadata; // primary photo, used on both the Home page teaser and /accommodation
  gallery?: GalleryPhoto[]; // supporting photos shown alongside the hero
  morePhotos?: GalleryPhoto[]; // extra photos shown only in the enlarged viewer
  amenities: LodgeAmenity[];
}

export const sanctuaries: Sanctuary[] = [
  {
    id: 'rotavi',
    name: "Temminck's Lodge",
    role: 'The Valley Basecamp · Start & End Point',
    description:
      'Your start and end point. A comfortable, established safari lodge low in the Waterberg valley. Arrive on Day 1 to register and get your safety briefing, leave the car in secure shaded parking, and return on Day 4 to shower, share a final meal and head home.',
    alt: "The thatched main lodge at Temminck's, the basecamp at the foot of the Rooiberg where the trail begins and ends.",
    accentVar: '--color-ochre',
    heroImage: temmnicksHeroImg,
    gallery: [
      { image: temmnicksGallery1, alt: "A thatched guest gazebo along the path at Temminck's Lodge." },
      { image: temmnicksGallery2, alt: "One of the guest cottages at Temminck's Lodge, tucked among the trees." },
    ],
    morePhotos: [
      { image: temPoolGarden, alt: "The pool at Temminck's Lodge, set among aloes and red rock, with the thatched lapa behind." },
      { image: temLapa, alt: "The open-sided thatched lapa at Temminck's Lodge." },
      { image: temCottageGarden, alt: "A thatched cottage at Temminck's Lodge behind a flowering garden path." },
      { image: temThatchedSuite, alt: "A double-storey thatched suite at Temminck's Lodge, reached by a timber stair." },
      { image: temGiraffe, alt: "A giraffe browsing among the trees beside a chalet at Temminck's Lodge." },
    ],
    amenities: [
      { icon: 'parking', label: 'Secure shaded parking' },
      { icon: 'pool', label: 'Swimming pool' },
      { icon: 'suite', label: '2-person suites' },
            { icon: 'barbeque', label: 'Boma fire & barbeque' },
      { icon: 'wifi', label: 'Free WiFi' },
    ],
  },
  {
    id: 'oukraal',
    name: 'Oukraal',
    role: 'The Bush Lodge · Night 2',
    description:
      'Deep in the thick Limpopo bushveld, where the bush closes in around the lodge. You reach this private bush lodge on Day 2 after the mountain crossing over Groenkop, with a pool, fire-side and dinner waiting.',
    alt: 'The entrance to Oukraal, the bush lodge deep in the Limpopo bushveld reached on the second day.',
    accentVar: '--color-green',
    heroImage: oukraalHeroImg,
    gallery: [
      { image: oukraalGallery1, alt: 'The palm-lined driveway and grounds at Oukraal.' },
      { image: oukraalGallery2, alt: 'A twin bedroom at Oukraal, with African art and reading lamps.' },
    ],
    morePhotos: [
      { image: oukFourPoster, alt: 'A four-poster double bed at Oukraal, with giraffe-print cushions and bedside lamps.' },
      { image: oukTwinRoom, alt: 'A twin room at Oukraal, with woven headboards and fresh towels on each bed.' },
      { image: oukBougainvillea, alt: 'Pink bougainvillea framing a guest cottage across the paved courtyard at Oukraal.' },
      { image: oukGardenPool, alt: 'The garden pool at Oukraal, edged with lawn and bushveld trees.' },
      { image: oukHideView, alt: 'The view from the hide at Oukraal over a wetland and grassland.' },
      { image: oukLapa, alt: 'The thatched lapa at Oukraal, set for dinner with a long table and wicker chairs.' },
      { image: oukFirePit, alt: 'The stone fire pit on the terrace at Oukraal, ringed by safari chairs.' },
    ],
    amenities: [
      { icon: 'pool', label: 'Swimming pool' },
      { icon: 'suite', label: '2-person suites' },
            { icon: 'barbeque', label: 'Dining under the stars' },
      { icon: 'wifi', label: 'Free WiFi' },
          ],
  },
  {
    id: 'rustwood',
    name: 'Rustwood',
    role: 'The Mountain Lodge · Night 3',
    description:
      'The highest lodge on the trail, up on the ridges with long views across the Waterberg. You arrive on Day 3 along the high-ridge traverse, by way of the Welgedacht lookout over the Marakele range. The pool faces west across the Waterberg.',
    alt: "The thatched entrance to Rustwood's main lodge, the mountain lodge overlooking the Waterberg on the third night of the trail.",
    accentVar: '--color-day4',
    heroImage: rustwoodHeroImg,
    gallery: [
      {
        image: rustwoodInteriorImg,
        alt: "The open-plan lounge and games area inside Rustwood's main building.",
      },
      {
        image: rustwoodBedImg,
        alt: 'A bedroom at Rustwood: a double bed against a reclaimed-timber headboard, with woven pendant lamps and a slate floor.',
      },
    ],
    morePhotos: [
      { image: rusInfinityPool, alt: "Rustwood's infinity pool and shade sails, looking out across the Waterberg." },
      { image: rusPoolDeck, alt: 'The pool deck at Rustwood, with the thatched lodge reflected in the water.' },
      { image: rusSuiteView, alt: 'A suite at Rustwood with its glass doors folded open onto a private deck and the valley.' },
      { image: rusSuite, alt: 'A suite at Rustwood, with woven stools at the foot of the bed and a walk-in shower.' },
      { image: rusBathView, alt: 'A freestanding bath at Rustwood beside a window onto the hills.' },
      { image: rusFirePitDusk, alt: 'The fire pit at Rustwood at dusk, above the valley.' },
      { image: rusLounge, alt: "The lounge and dining area in Rustwood's main building, under a high timber ceiling." },
      { image: rusPoolNight, alt: 'The pool at Rustwood lit up at night, under the shade sails.' },
    ],
    amenities: [
      { icon: 'view', label: 'Sunset mountain views' },
      { icon: 'pool', label: 'Swimming pool' },
      { icon: 'suite', label: '2-person suites' },
            { icon: 'barbeque', label: 'Boma fire & barbeque' },
      { icon: 'wifi', label: 'Free WiFi' },
    ],
  },
];
