// Sanctuaries — Part 8.3 + 2026 brief. Three distinct premium nodes under one trail standard.
// Spelling: "Blackwood" (renamed from ViervanAcht). Images supplied by the client.
//
// Each lodge carries three photo roles, matching the approved wireframe's photo plan: a small
// `homeImage` teaser (Home page lodge cards — decorative, alt="" there since the card's own text
// already names the lodge), a larger `heroImage` for the lodge's own card on /accommodation, and
// a `gallery` of supporting photos shown alongside it. Previously all three contexts shared one
// single image per lodge; this splits them so the Home teaser, the lodge-page hero and its
// gallery can each carry the photo that actually suits that slot.
import type { ImageMetadata } from 'astro';

import temmnicksHomeImg from '../assets/images/temmnicks-pool.jpg';
import temmnicksHeroImg from '../assets/images/temmnicks-hero.jpg';
import temmnicksGallery1 from '../assets/images/temmnickss-room-1.jpg';
import temmnicksGallery2 from '../assets/images/temmnicks-room-2.jpg';

import oukraalHomeImg from '../assets/images/oukraal-pool.jpg';
import oukraalHeroImg from '../assets/images/oukraal-hero.jpg';
import oukraalGallery1 from '../assets/images/oukraal-entrance.jpg';
import oukraalGallery2 from '../assets/images/oukraal-bed-2.jpg';

import blackwoodHomeImg from '../assets/images/blackwood-pool-area.jpg';
import blackwoodHeroImg from '../assets/images/blackwood-lodge-hero.jpg';
import blackwoodGallery1 from '../assets/images/blackwood-fire-pit.jpg';
import blackwoodGallery2 from '../assets/images/blackwood-main-interior.jpg';

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
  homeImage?: ImageMetadata; // small teaser photo on the Home page lodge cards (rendered alt="")
  heroImage?: ImageMetadata; // primary photo on the lodge's own card on /accommodation
  gallery?: GalleryPhoto[]; // supporting photos shown alongside the hero
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
    homeImage: temmnicksHomeImg,
    heroImage: temmnicksHeroImg,
    gallery: [
      { image: temmnicksGallery1, alt: "A thatched guest gazebo along the path at Temminck's Lodge." },
      { image: temmnicksGallery2, alt: "One of the guest cottages at Temminck's Lodge, tucked among the trees." },
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
    homeImage: oukraalHomeImg,
    heroImage: oukraalHeroImg,
    gallery: [
      { image: oukraalGallery1, alt: 'The palm-lined driveway and grounds at Oukraal.' },
      { image: oukraalGallery2, alt: 'A twin bedroom at Oukraal, with African art and reading lamps.' },
    ],
    amenities: [
      { icon: 'pool', label: 'Swimming pool' },
      { icon: 'suite', label: '2-person suites' },
            { icon: 'barbeque', label: 'Dining under the stars' },
      { icon: 'wifi', label: 'Free WiFi' },
          ],
  },
  {
    id: 'blackwood',
    name: 'Blackwood',
    role: 'The Mountain Lodge · Night 3',
    description:
      'The highest lodge on the trail, up on the ridges with long views across the Waterberg. You arrive on Day 3 along the high-ridge traverse, by way of the Welgedacht lookout over the Marakele range. The pool faces west across the Waterberg.',
    alt: "The thatched entrance to Blackwood's main lodge, the mountain lodge overlooking the Waterberg on the third night of the trail.",
    accentVar: '--color-day4',
    homeImage: blackwoodHomeImg,
    heroImage: blackwoodHeroImg,
    gallery: [
      { image: blackwoodGallery1, alt: 'The fire pit terrace at Blackwood, looking out over the Waterberg.' },
      { image: blackwoodGallery2, alt: "The open-plan lounge and games area inside Blackwood's main building." },
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
