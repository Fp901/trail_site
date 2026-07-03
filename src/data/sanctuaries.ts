// Sanctuaries — Part 8.3 + 2026 brief. Three distinct premium nodes under one trail standard.
// Spelling: "ViervanAcht". Images supplied by the client.
import type { ImageMetadata } from 'astro';
import rotaviImg from '../assets/images/rotavi-valley-plains.jpg';
import oukraalImg from '../assets/images/oukraal-kudu-bushveld.jpg';
import viervanachtImg from '../assets/images/viervanacht-giraffe-sunset.jpg';

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

export interface Sanctuary {
  id: string;
  name: string;
  role: string;
  description: string;
  alt: string;
  accentVar: string;
  image?: ImageMetadata;
  amenities: LodgeAmenity[];
}

// Shared across all three sanctuaries (2026 brief).
export const sanctuaryAmenities = [
  'Swimming pool',
  'Fully equipped kitchen & refrigeration',
  'Barbeque facilities',
  'Safe drinking water',
  'Ice',
  'Wood',
  'Bedding',
  'Free WiFi',
];

export const sanctuaries: Sanctuary[] = [
  {
    id: 'rotavi',
    name: 'Rotavi Lodge',
    role: 'The Valley Basecamp · Start & End Point',
    description:
      'Your start and end point. A comfortable, established safari lodge low in the Waterberg valley. Arrive on Day 1 to register and get your safety briefing, leave the car in secure shaded parking, and return on Day 4 to shower, share a final meal and head home.',
    alt: 'The valley around Rotavi Lodge, the basecamp at the foot of the Rooiberg where the trail begins and ends.',
    accentVar: '--color-ochre',
    image: rotaviImg,
    amenities: [
      { icon: 'parking', label: 'Secure shaded parking' },
      { icon: 'pool', label: 'Swimming pool' },
      { icon: 'suite', label: '2-person suites, bedding included' },
      { icon: 'kitchen', label: 'Equipped kitchen & fridge' },
      { icon: 'barbeque', label: 'Barbeque & evening fire' },
      { icon: 'wifi', label: 'Free WiFi' },
    ],
  },
  {
    id: 'oukraal',
    name: 'Oukraal',
    role: 'The Bush Lodge · Night 2',
    description:
      'Deep in the thick Limpopo bushveld, where the evening sounds of the wild are close. You reach this private bush lodge on Day 2 after the mountain crossing over Groenkop, with your luggage and dinner supplies already waiting, kept cool and dry.',
    alt: 'Kudu in the thick green bushveld around Oukraal, the bush lodge reached on the second day.',
    accentVar: '--color-green',
    image: oukraalImg,
    amenities: [
      { icon: 'pool', label: 'Swimming pool' },
      { icon: 'suite', label: '2-person suites, bedding included' },
      { icon: 'kitchen', label: 'Equipped kitchen, fridge & ice' },
      { icon: 'barbeque', label: 'Barbeque under the stars' },
      { icon: 'wifi', label: 'Free WiFi' },
      { icon: 'wood', label: 'Firewood supplied' },
    ],
  },
  {
    id: 'viervanacht',
    name: 'ViervanAcht',
    role: 'The Mountain Lodge · Night 3',
    description:
      'The highest lodge on the trail, up on the ridges with long views across the Waterberg. You arrive on Day 3 along the high-ridge traverse, by way of the Welgedacht lookout over the Marakele range. Then watch the sun drop behind the mountains from the pool.',
    alt: 'Giraffes at sunset on the ridges near ViervanAcht, the mountain lodge and the third night of the trail.',
    accentVar: '--color-day4',
    image: viervanachtImg,
    amenities: [
      { icon: 'view', label: 'Sunset mountain views' },
      { icon: 'pool', label: 'Swimming pool' },
      { icon: 'suite', label: '2-person suites, bedding included' },
      { icon: 'kitchen', label: 'Equipped kitchen, fridge & ice' },
      { icon: 'barbeque', label: 'Barbeque & fire' },
      { icon: 'wifi', label: 'Free WiFi' },
    ],
  },
];
