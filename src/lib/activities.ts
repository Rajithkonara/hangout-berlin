/**
 * Maps user-facing activities onto OpenStreetMap tag filters used to build
 * Overpass queries.
 */
import { CUISINE_WORDS, getCuisine } from './cuisines'

/** A single Overpass tag filter, e.g. `amenity=cafe`. */
export interface TagFilter {
  key: string
  /** Omit for "tag exists" filters. */
  value?: string
  /** Treat `value` as a case-insensitive regex instead of an exact match. */
  regex?: boolean
}

export interface ActivitySpec {
  /** Human-readable label used in the plan summary. */
  label: string
  /** Overpass tag filters; a venue matching any one of them is a candidate. */
  filters: TagFilter[]
  /**
   * Optional narrowing, AND-ed onto every entry in `filters`: a venue must
   * match one of `filters` *and* one of these. Used for cuisines, so that
   * "dinner" plus "indian" means an Indian restaurant rather than either.
   */
  refine?: TagFilter[]
  /** Label of whatever produced `refine`, e.g. the cuisine name. */
  refineLabel?: string
  /**
   * Tag values that make a venue a better fit for a bigger group, on top of the
   * generic bonuses (outdoor seating, beer garden, ...).
   */
  groupFriendly?: TagFilter[]
}

export interface PresetActivity extends ActivitySpec {
  id: string
  emoji: string
  /** Rough time of day, shown as a hint in the UI. */
  hint: string
}

export const PRESET_ACTIVITIES: readonly PresetActivity[] = [
  {
    id: 'coffee',
    label: 'Coffee',
    emoji: '☕',
    hint: 'morning / afternoon',
    filters: [
      { key: 'amenity', value: 'cafe' },
      { key: 'shop', value: 'coffee' },
    ],
  },
  {
    id: 'breakfast',
    label: 'Breakfast',
    emoji: '🥐',
    hint: 'early morning',
    filters: [
      { key: 'amenity', value: 'cafe' },
      { key: 'shop', value: 'bakery' },
      { key: 'shop', value: 'pastry' },
    ],
    groupFriendly: [{ key: 'amenity', value: 'cafe' }],
  },
  {
    id: 'brunch',
    label: 'Brunch',
    emoji: '🥞',
    hint: 'late morning / midday',
    filters: [
      { key: 'amenity', value: 'cafe' },
      { key: 'amenity', value: 'restaurant' },
    ],
    groupFriendly: [{ key: 'amenity', value: 'restaurant' }],
  },
  {
    id: 'lunch',
    label: 'Lunch',
    emoji: '🍽️',
    hint: 'midday',
    filters: [
      { key: 'amenity', value: 'restaurant' },
      { key: 'amenity', value: 'fast_food' },
    ],
    groupFriendly: [{ key: 'amenity', value: 'restaurant' }],
  },
  {
    id: 'drinks',
    label: 'Evening drinks',
    emoji: '🍻',
    hint: 'evening',
    filters: [
      { key: 'amenity', value: 'bar' },
      { key: 'amenity', value: 'pub' },
      { key: 'amenity', value: 'biergarten' },
    ],
    groupFriendly: [
      { key: 'amenity', value: 'pub' },
      { key: 'amenity', value: 'biergarten' },
    ],
  },
  {
    id: 'dinner',
    label: 'Dinner',
    emoji: '🍝',
    hint: 'evening',
    filters: [{ key: 'amenity', value: 'restaurant' }],
  },
]

/** Presets that offer the optional cuisine picker. */
export const FOOD_ACTIVITY_IDS: ReadonlySet<string> = new Set([
  'breakfast',
  'brunch',
  'lunch',
  'dinner',
])

export const supportsCuisine = (activity: string): boolean =>
  FOOD_ACTIVITY_IDS.has(activity)

/**
 * Free-text keywords mapped onto tag filters. Keys are matched as whole words
 * against the lower-cased input, so "let's go bowling" resolves to a bowling
 * alley. German synonyms are included because the venues are in Berlin.
 */
const KEYWORD_RULES: Array<{ words: string[]; label: string; filters: TagFilter[] }> = [
  { words: ['bowling', 'kegeln', 'bowlen'], label: 'Bowling', filters: [{ key: 'leisure', value: 'bowling_alley' }] },
  { words: ['cinema', 'movie', 'movies', 'film', 'kino'], label: 'Cinema', filters: [{ key: 'amenity', value: 'cinema' }] },
  { words: ['karaoke'], label: 'Karaoke', filters: [{ key: 'amenity', value: 'nightclub' }, { key: 'name', value: 'karaoke', regex: true }] },
  { words: ['club', 'clubbing', 'dancing', 'techno', 'party'], label: 'Clubbing', filters: [{ key: 'amenity', value: 'nightclub' }] },
  { words: ['minigolf', 'mini-golf'], label: 'Minigolf', filters: [{ key: 'leisure', value: 'miniature_golf' }] },
  { words: ['golf'], label: 'Golf', filters: [{ key: 'leisure', value: 'golf_course' }] },
  { words: ['climbing', 'bouldering', 'boulder', 'klettern'], label: 'Climbing', filters: [{ key: 'sport', value: 'climbing' }, { key: 'leisure', value: 'sports_centre' }] },
  { words: ['swimming', 'swim', 'pool', 'schwimmbad', 'baden'], label: 'Swimming', filters: [{ key: 'leisure', value: 'swimming_pool' }, { key: 'leisure', value: 'water_park' }] },
  { words: ['sauna', 'spa', 'therme', 'wellness'], label: 'Sauna & spa', filters: [{ key: 'leisure', value: 'sauna' }, { key: 'amenity', value: 'spa' }] },
  { words: ['museum', 'exhibition', 'ausstellung'], label: 'Museum', filters: [{ key: 'tourism', value: 'museum' }] },
  { words: ['gallery', 'galerie', 'art'], label: 'Art gallery', filters: [{ key: 'tourism', value: 'gallery' }] },
  { words: ['park', 'picnic', 'walk', 'stroll', 'spaziergang'], label: 'Park', filters: [{ key: 'leisure', value: 'park' }, { key: 'leisure', value: 'garden' }] },
  { words: ['theatre', 'theater', 'play', 'opera', 'oper'], label: 'Theatre', filters: [{ key: 'amenity', value: 'theatre' }] },
  { words: ['icecream', 'ice-cream', 'gelato', 'eis', 'eisdiele'], label: 'Ice cream', filters: [{ key: 'amenity', value: 'ice_cream' }, { key: 'shop', value: 'ice_cream' }] },
  { words: ['bakery', 'pastry', 'cake', 'kuchen', 'baeckerei', 'bäckerei'], label: 'Bakery', filters: [{ key: 'shop', value: 'bakery' }, { key: 'shop', value: 'pastry' }] },
  { words: ['breakfast', 'fruehstueck', 'frühstück'], label: 'Breakfast', filters: [{ key: 'amenity', value: 'cafe' }, { key: 'shop', value: 'bakery' }, { key: 'shop', value: 'pastry' }] },
  { words: ['brunch'], label: 'Brunch', filters: [{ key: 'amenity', value: 'cafe' }, { key: 'amenity', value: 'restaurant' }] },
  { words: ['beer', 'bier', 'biergarten', 'beergarden'], label: 'Beer garden', filters: [{ key: 'amenity', value: 'biergarten' }, { key: 'amenity', value: 'pub' }] },
  { words: ['wine', 'wein', 'winebar'], label: 'Wine bar', filters: [{ key: 'amenity', value: 'bar' }, { key: 'shop', value: 'wine' }] },
  { words: ['cocktail', 'cocktails', 'drinks'], label: 'Cocktails', filters: [{ key: 'amenity', value: 'bar' }] },
  { words: ['billiards', 'pool-table', 'snooker', 'billard'], label: 'Billiards', filters: [{ key: 'leisure', value: 'amusement_arcade' }, { key: 'sport', value: 'billiards' }] },
  { words: ['arcade', 'games', 'gaming', 'videogames'], label: 'Arcade', filters: [{ key: 'leisure', value: 'amusement_arcade' }] },
  { words: ['boardgames', 'boardgame', 'brettspiele'], label: 'Board games', filters: [{ key: 'amenity', value: 'cafe' }, { key: 'shop', value: 'games' }] },
  { words: ['zoo', 'aquarium'], label: 'Zoo & aquarium', filters: [{ key: 'tourism', value: 'zoo' }, { key: 'tourism', value: 'aquarium' }] },
  { words: ['market', 'markt', 'flohmarkt', 'fleamarket'], label: 'Market', filters: [{ key: 'amenity', value: 'marketplace' }] },
  { words: ['library', 'bibliothek', 'books', 'bookshop'], label: 'Books', filters: [{ key: 'amenity', value: 'library' }, { key: 'shop', value: 'books' }] },
]

function normalise(input: string): string {
  return input.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim()
}

/** Escape a user string so it is safe inside an Overpass regex literal. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&')
}

/**
 * Resolves free text into an activity spec. Tries keyword rules first, then
 * cuisines, and finally falls back to a name search across common venue types
 * so that anything typed still returns something sensible.
 */
export function resolveFreeText(rawInput: string): ActivitySpec {
  const text = normalise(rawInput)
  const words = new Set(text.split(' '))
  const label = rawInput.trim() || 'Hangout'

  for (const rule of KEYWORD_RULES) {
    if (rule.words.some((w) => words.has(w) || text.includes(w))) {
      return { label: rule.label, filters: rule.filters }
    }
  }

  for (const [word, cuisineId] of CUISINE_WORDS) {
    if (words.has(word)) {
      const cuisine = getCuisine(cuisineId)
      if (cuisine) return { label, filters: cuisine.filters }
    }
  }

  // Nothing recognised: search venue names across the usual suspects.
  const needle = escapeRegex(text.split(' ').slice(0, 3).join(' '))
  return {
    label,
    filters: needle
      ? [
          { key: 'name', value: needle, regex: true },
          { key: 'cuisine', value: needle, regex: true },
        ]
      : [
          { key: 'amenity', value: 'cafe' },
          { key: 'amenity', value: 'bar' },
          { key: 'amenity', value: 'restaurant' },
        ],
  }
}

/**
 * Resolve either a preset id or free text into a concrete spec.
 *
 * `cuisine` narrows a food preset (Dinner + Indian). It is ignored for
 * non-food presets and for free text, where any cuisine typed is already part
 * of the text itself.
 */
export function resolveActivity(activity: string, cuisineId?: string): ActivitySpec {
  const preset = PRESET_ACTIVITIES.find((p) => p.id === activity)
  if (!preset) return resolveFreeText(activity)

  const cuisine = supportsCuisine(activity) ? getCuisine(cuisineId) : undefined
  if (!cuisine) return preset

  return {
    ...preset,
    label: `${preset.label} · ${cuisine.label}`,
    refine: cuisine.filters,
    refineLabel: cuisine.label,
  }
}
