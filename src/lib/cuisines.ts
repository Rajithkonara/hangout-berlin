/**
 * Optional cuisine narrowing for the food activities.
 *
 * OSM's `cuisine` tag is free-form and semicolon-multi-valued (`italian;pizza`),
 * so every filter here is a case-insensitive regex rather than an exact match.
 */
import type { TagFilter } from './activities'

export interface Cuisine {
  id: string
  label: string
  emoji: string
  /** OR-list; a venue matching any one of them counts as this cuisine. */
  filters: TagFilter[]
  /** Free-text synonyms that resolve to this cuisine. */
  words: string[]
  /** Recognised in free text but kept out of the chip picker. */
  hidden?: boolean
}

/** `cuisine~"a|b"` — the common case. */
const cuisineTag = (...values: string[]): TagFilter[] => [
  { key: 'cuisine', value: values.join('|'), regex: true },
]

/**
 * Weighted towards what Berlin actually has a lot of. Order is the display
 * order in the form.
 */
export const CUISINES: readonly Cuisine[] = [
  {
    id: 'italian',
    label: 'Italian',
    emoji: '🍝',
    filters: cuisineTag('italian', 'pizza', 'pasta'),
    words: ['italian', 'italienisch', 'pizza', 'pasta'],
  },
  {
    id: 'turkish',
    label: 'Turkish & döner',
    emoji: '🥙',
    filters: cuisineTag('turkish', 'kebab', 'doner'),
    words: ['turkish', 'tuerkisch', 'türkisch', 'kebab', 'doner', 'döner', 'dürüm'],
  },
  {
    id: 'vietnamese',
    label: 'Vietnamese',
    emoji: '🍜',
    filters: cuisineTag('vietnamese', 'pho'),
    words: ['vietnamese', 'vietnamesisch', 'pho', 'banh'],
  },
  {
    id: 'indian',
    label: 'Indian',
    emoji: '🍛',
    filters: cuisineTag('indian', 'curry', 'pakistani', 'sri_lankan'),
    words: ['indian', 'indisch', 'curry', 'masala', 'tandoori'],
  },
  {
    id: 'japanese',
    label: 'Japanese & sushi',
    emoji: '🍣',
    filters: cuisineTag('japanese', 'sushi', 'ramen'),
    words: ['japanese', 'japanisch', 'sushi', 'ramen', 'izakaya'],
  },
  {
    id: 'thai',
    label: 'Thai',
    emoji: '🌶️',
    filters: cuisineTag('thai'),
    words: ['thai', 'thailaendisch', 'thailändisch'],
  },
  {
    id: 'chinese',
    label: 'Chinese',
    emoji: '🥟',
    filters: cuisineTag('chinese', 'dumpling', 'szechuan', 'sichuan'),
    words: ['chinese', 'chinesisch', 'dumplings', 'dumpling', 'dimsum'],
  },
  {
    id: 'korean',
    label: 'Korean',
    emoji: '🍚',
    filters: cuisineTag('korean'),
    words: ['korean', 'koreanisch', 'bibimbap', 'kimchi'],
  },
  {
    id: 'middle_eastern',
    label: 'Middle Eastern',
    emoji: '🧆',
    filters: cuisineTag('arab', 'lebanese', 'falafel', 'syrian', 'israeli', 'persian'),
    words: ['falafel', 'hummus', 'lebanese', 'libanesisch', 'arabic', 'arabisch', 'syrian', 'persian'],
  },
  {
    id: 'mexican',
    label: 'Mexican',
    emoji: '🌮',
    filters: cuisineTag('mexican', 'tacos', 'taco', 'burrito', 'latin_american'),
    words: ['mexican', 'mexikanisch', 'tacos', 'taco', 'burrito', 'burritos'],
  },
  {
    id: 'greek',
    label: 'Greek',
    emoji: '🥗',
    filters: cuisineTag('greek'),
    words: ['greek', 'griechisch', 'gyros', 'souvlaki'],
  },
  {
    id: 'spanish',
    label: 'Spanish & tapas',
    emoji: '🥘',
    filters: cuisineTag('spanish', 'tapas', 'portuguese'),
    words: ['spanish', 'spanisch', 'tapas', 'paella', 'portuguese'],
  },
  {
    id: 'german',
    label: 'German',
    emoji: '🥨',
    filters: cuisineTag('german', 'regional', 'bavarian'),
    words: ['german', 'deutsch', 'schnitzel', 'currywurst', 'bavarian'],
  },
  {
    id: 'burger',
    label: 'Burgers',
    emoji: '🍔',
    filters: cuisineTag('burger', 'american', 'barbecue', 'steak_house'),
    words: ['burger', 'burgers', 'american', 'bbq', 'barbecue', 'steak'],
  },
  {
    id: 'vegan',
    label: 'Vegan',
    emoji: '🌱',
    filters: [
      ...cuisineTag('vegan'),
      { key: 'diet:vegan', value: 'yes|only', regex: true },
    ],
    words: ['vegan'],
  },
  {
    id: 'vegetarian',
    label: 'Vegetarian',
    emoji: '🥕',
    filters: [
      ...cuisineTag('vegetarian', 'vegan'),
      { key: 'diet:vegetarian', value: 'yes|only', regex: true },
      { key: 'diet:vegan', value: 'yes|only', regex: true },
    ],
    words: ['vegetarian', 'vegetarisch', 'veggie'],
  },
  // Recognised when typed, but too niche in Berlin to earn a chip.
  {
    id: 'french',
    label: 'French',
    emoji: '🥖',
    filters: cuisineTag('french', 'crepe'),
    words: ['french', 'franzoesisch', 'französisch', 'crepe', 'crepes'],
    hidden: true,
  },
  {
    id: 'seafood',
    label: 'Seafood',
    emoji: '🦐',
    filters: cuisineTag('seafood', 'fish'),
    words: ['seafood', 'fish', 'fisch', 'oysters'],
    hidden: true,
  },
  {
    id: 'ethiopian',
    label: 'Ethiopian',
    emoji: '🍲',
    filters: cuisineTag('ethiopian', 'eritrean', 'african'),
    words: ['ethiopian', 'aethiopisch', 'äthiopisch', 'eritrean', 'african'],
    hidden: true,
  },
  {
    id: 'georgian',
    label: 'Georgian',
    emoji: '🫓',
    filters: cuisineTag('georgian', 'russian', 'ukrainian'),
    words: ['georgian', 'georgisch', 'khachapuri', 'russian', 'ukrainian'],
    hidden: true,
  },
]

/** The cuisines offered as chips in the planner form. */
export const PICKER_CUISINES: readonly Cuisine[] = CUISINES.filter((c) => !c.hidden)

export function getCuisine(id: string | undefined): Cuisine | undefined {
  if (!id) return undefined
  return CUISINES.find((cuisine) => cuisine.id === id)
}

export function cuisineLabel(id: string | undefined): string | undefined {
  return getCuisine(id)?.label
}

/** Word -> cuisine id, used to resolve cuisines typed as free text. */
export const CUISINE_WORDS: ReadonlyMap<string, string> = new Map(
  CUISINES.flatMap((cuisine) => cuisine.words.map((word) => [word, cuisine.id] as const)),
)
