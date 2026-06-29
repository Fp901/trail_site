// Wildlife & birding — curated from the RoiSan species list (client-supplied, 2026).
// Representative selections only; the full bird, mammal and tree lists are available on request.
// NOTE: the supplied mammal list does not include rhino (4 of the Big 5 are listed) — confirm
// rhino presence before leaning on the "Big 5" wording in this section.

export const wildlifeCounts = {
  birds: 168, // species recorded on the reserve
  mammals: 66,
};

export interface WildlifeGroup {
  title: string;
  blurb: string;
  species: string[];
}

export const wildlifeGroups: WildlifeGroup[] = [
  {
    title: 'Big game on foot',
    blurb: 'The marquee animals you track on foot, always with two armed guides.',
    species: ['Lion', 'Leopard', 'Elephant', 'African buffalo', 'Cheetah', 'Giraffe', 'Hippo'],
  },
  {
    title: 'Plains game & antelope',
    blurb: 'Open plains and mountain slopes hold a wide spread of grazers and browsers.',
    species: [
      'Burchell’s zebra',
      'Blue wildebeest',
      'Eland',
      'Kudu',
      'Nyala',
      'Bushbuck',
      'Waterbuck',
      'Impala',
      'Red hartebeest',
      'Blesbok',
      'Gemsbok',
      'Mountain reedbuck',
      'Klipspringer',
      'Steenbok',
      'Common duiker',
      'Warthog',
    ],
  },
  {
    title: 'Predators & smaller carnivores',
    blurb: 'A full predator guild, from the cats to the night-time hunters.',
    species: [
      'Brown hyaena',
      'Spotted hyena',
      'Caracal',
      'Serval',
      'African wild cat',
      'Aardwolf',
      'Black-backed jackal',
      'Side-striped jackal',
      'Honey badger (ratel)',
      'Genets & mongooses',
    ],
  },
  {
    title: 'Special & nocturnal',
    blurb: 'Patience and good guiding turn up the bushveld’s quieter residents.',
    species: [
      'Aardvark',
      'Pangolin',
      'Porcupine',
      'Lesser bush baby',
      'Rock dassie',
      'Chacma baboon',
      'Vervet monkey',
      'Bushpig',
    ],
  },
];

// Birding — 168 species recorded; a few of the showy, sought-after ones.
export const birdingHighlights = [
  'Lilac-breasted Roller',
  'African Fish Eagle',
  'Secretary Bird',
  'Southern Ground Hornbill',
  'Verreaux’s (Giant) Eagle-Owl',
  'Pearl-spotted Owlet',
  'Giant & Pygmy Kingfisher',
  'Crimson-breasted Shrike',
  'Grey Go-away-bird',
  'Amethyst & Marico Sunbird',
  'Cape Glossy & Violet-backed Starling',
  'European, Little & White-fronted Bee-eater',
];
