import type { Area } from '../data/districts'
import type { ActivitySpec } from './activities'
import { distanceMeters } from './geo'
import type { Venue } from './overpass'
import { matchesAny } from './venues'

export interface RankedVenue extends Venue {
  score: number
  distance: number
  /**
   * Whether the venue matches the requested cuisine. Undefined when no cuisine
   * was asked for.
   */
  cuisineMatch?: boolean
}

/** Group size at which we start favouring venues that can absorb a crowd. */
export const BIG_GROUP_THRESHOLD = 5
/** Group size at which we suggest calling ahead. */
export const RESERVATION_THRESHOLD = 6

/** Deterministic string hash, so a shared link always reproduces its results. */
function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Stable pseudo-random value in [0, 1) derived from a seed and a venue id. */
function seededJitter(seed: string, id: string): number {
  return hashString(`${seed}|${id}`) / 0xffffffff
}

function has(venue: Venue, key: string): boolean {
  const value = venue.tags[key]
  return typeof value === 'string' && value.length > 0
}

export function venueWebsite(venue: Venue): string | undefined {
  return venue.tags.website ?? venue.tags['contact:website'] ?? venue.tags.url
}

export function venuePhone(venue: Venue): string | undefined {
  return venue.tags.phone ?? venue.tags['contact:phone']
}

export function venueAddress(venue: Venue): string | undefined {
  const street = venue.tags['addr:street']
  const number = venue.tags['addr:housenumber']
  const suburb = venue.tags['addr:suburb'] ?? venue.tags['addr:city']
  if (!street) return suburb
  const line = number ? `${street} ${number}` : street
  return suburb ? `${line}, ${suburb}` : line
}

/** Short, human-friendly category derived from the venue's primary tag. */
export function venueCategory(venue: Venue): string {
  const raw =
    venue.tags.amenity ??
    venue.tags.leisure ??
    venue.tags.tourism ??
    venue.tags.shop ??
    venue.tags.sport ??
    'venue'
  const label = raw.replace(/_/g, ' ')
  const cuisine = venue.tags.cuisine?.split(';')[0]?.replace(/_/g, ' ')
  return cuisine ? `${label} · ${cuisine}` : label
}

function groupBonus(venue: Venue, spec: ActivitySpec, people: number): number {
  if (people < BIG_GROUP_THRESHOLD) return 0
  let bonus = 0

  if (venue.tags.outdoor_seating === 'yes') bonus += 3
  if (venue.tags.amenity === 'biergarten') bonus += 4
  if (venue.tags.amenity === 'pub') bonus += 2
  if (venue.tags.amenity === 'restaurant') bonus += 1
  if (has(venue, 'reservation') || venue.tags.reservation === 'yes') bonus += 2
  // Fast food and tiny coffee bars rarely work for a crowd.
  if (venue.tags.amenity === 'fast_food') bonus -= 2

  for (const filter of spec.groupFriendly ?? []) {
    if (venue.tags[filter.key] === filter.value) bonus += 2
  }

  // The larger the group, the more the fit matters.
  return bonus * (1 + (people - BIG_GROUP_THRESHOLD) / 10)
}

function qualityScore(venue: Venue): number {
  let score = 0
  if (venueWebsite(venue)) score += 2
  if (venuePhone(venue)) score += 1
  if (has(venue, 'opening_hours')) score += 3
  if (venueAddress(venue)) score += 2
  if (has(venue, 'cuisine')) score += 1
  if (venue.tags.wheelchair === 'yes') score += 1
  return score
}

export interface RankOptions {
  area: Area
  spec: ActivitySpec
  people: number
  /** Seed string; identical seeds produce identical orderings. */
  seed: string
  limit?: number
}

export function rankVenues(venues: Venue[], options: RankOptions): RankedVenue[] {
  const { area, spec, people, seed, limit = 5 } = options
  const refine = spec.refine?.length ? spec.refine : undefined

  const ranked = venues.map((venue) => {
    const distance = distanceMeters(area.lat, area.lon, venue.lat, venue.lon)
    // Mild pull towards the centre of the chosen area, capped so that a good
    // venue slightly further out can still win.
    const proximity = Math.max(0, 3 - (distance / area.radius) * 3)
    const score =
      qualityScore(venue) +
      groupBonus(venue, spec, people) +
      proximity +
      seededJitter(seed, venue.id) * 6

    return {
      ...venue,
      score,
      distance,
      // When a cuisine was asked for, the list may have been topped up with
      // other kitchens; exact matches are sorted strictly ahead of those.
      cuisineMatch: refine ? matchesAny(venue, refine) : undefined,
    }
  })

  ranked.sort(
    (a, b) =>
      Number(b.cuisineMatch ?? false) - Number(a.cuisineMatch ?? false) ||
      b.score - a.score ||
      a.name.localeCompare(b.name),
  )
  return ranked.slice(0, limit)
}
