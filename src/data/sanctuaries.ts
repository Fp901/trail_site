// Sanctuaries — Part 8.3 + 2026 brief. Three distinct premium nodes under one trail standard.
// Spelling: "ViervanAcht". Images supplied by the client.
import type { ImageMetadata } from 'astro';
import rotaviImg from '../assets/images/rotavi-valley-plains.jpg';
import oukraalImg from '../assets/images/oukraal-kudu-bushveld.jpg';
import viervanachtImg from '../assets/images/viervanacht-giraffe-sunset.jpg';

export interface Sanctuary {
  id: string;
  name: string;
  role: string;
  description: string;
  alt: string;
  accentVar: string;
  image?: ImageMetadata;
}

// Shared across all three sanctuaries (2026 brief).
export const sanctuaryAmenities = [
  'Swimming pool',
  'Fully equipped kitchen & refrigeration',
  'Braai facilities',
  'Safe drinking water',
  'Free WiFi',
];

export const sanctuaries: Sanctuary[] = [
  {
    id: 'rotavi',
    name: 'Rotavi Lodge',
    role: 'The Valley Basecamp · Start & End Point',
    description:
      'Your start and end point: an established, comfortable lodge enveloped by the tranquillity of the lower valley. You arrive here on Day 1 to register and be briefed, leave your vehicle in secure shaded parking, and return on Day 4 to shower, share a final meal and depart.',
    alt: 'The valley around Rotavi Lodge, the basecamp at the foot of the Rooiberg where the trail begins and ends.',
    accentVar: '--color-ochre',
    image: rotaviImg,
  },
  {
    id: 'oukraal',
    name: 'Oukraal',
    role: 'The Bush Sanctuary · Night 2',
    description:
      'Deeply tucked away in the thick bushveld — a miniature natural retreat where the evening sounds of the wild surround you. You reach it on Day 2 after the mountain crossing over Groenkop, with your luggage and provisions already waiting.',
    alt: 'Kudu in the thick green bushveld around Oukraal, the bush sanctuary reached on the second day.',
    accentVar: '--color-green',
    image: oukraalImg,
  },
  {
    id: 'viervanacht',
    name: 'ViervanAcht',
    role: 'The Mountain Sanctuary · Night 3',
    description:
      'Positioned higher up the ridges with sweeping vistas — the ultimate setting to watch the African sun set behind the mountains. You arrive on Day 3 along the high ridge traverse, by way of the Welgedacht lookout.',
    alt: 'Giraffes at sunset on the ridges near ViervanAcht, the mountain sanctuary and the third night of the trail.',
    accentVar: '--color-day4',
    image: viervanachtImg,
  },
];
