import { AREAS, type Area } from '../data/districts'
import type { ActivitySpec, TagFilter } from './activities'
import { distanceMeters, insideBerlin } from './geo'
import { OverpassError, fetchVenues, type Venue } from './overpass'

/**
 * The app queries OpenStreetMap live, but the free Overpass API is a
 * volunteer-run service that regularly returns 429/504. When that happens we
 * fall back to a snapshot of Berlin venues shipped with the site, so the app
 * still works without any backend of our own.
 */
export type VenueSource = 'live' | 'offline'

export interface VenueResult {
  venues: Venue[]
  source: VenueSource
  /** True when the search area had to grow to find enough options. */
  widened: boolean
  /**
   * True when a cuisine was asked for but there were too few matches, so
   * venues of other kitchens were mixed in to fill the five slots.
   */
  relaxed: boolean
  /** How many of the returned venues actually match the cuisine. */
  matchCount: number
}

/** Enough candidates to fill five slots with some choice left over. */
const TARGET_CANDIDATES = 8
/** Below this many cuisine matches, other kitchens are mixed in. */
const MIN_CUISINE_MATCHES = 5
/** Roughly city-wide from any anchor, still clipped to the Berlin boundary. */
const CITY_WIDE_RADIUS = 15_000
/**
 * How long to keep trying the live API before using the offline snapshot.
 * Overpass can take tens of seconds under load; waiting that long is worse for
 * the user than slightly staler data.
 */
const LIVE_DEADLINE_MS = 12_000

/** AbortSignal.any is not available everywhere yet. */
function combineSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (a.aborted || b.aborted) abort()
  a.addEventListener('abort', abort, { once: true })
  b.addEventListener('abort', abort, { once: true })
  return controller.signal
}

const snapshotCache = new Map<string, Venue[]>()

function matches(venue: Venue, filter: TagFilter): boolean {
  const value = venue.tags[filter.key]
  if (value === undefined) return false
  if (filter.value === undefined) return true
  if (filter.regex) {
    try {
      return new RegExp(filter.value, 'i').test(value)
    } catch {
      return value.toLowerCase().includes(filter.value.toLowerCase())
    }
  }
  return value === filter.value
}

/** True when the venue satisfies at least one of the filters. */
export const matchesAny = (venue: Venue, filters: TagFilter[]): boolean =>
  filters.some((filter) => matches(venue, filter))

/** Base filters are OR-ed; a refinement, when present, is AND-ed on top. */
const applyFilters = (venues: Venue[], filters: TagFilter[], refine?: TagFilter[]) =>
  venues.filter(
    (venue) =>
      matchesAny(venue, filters) && (!refine?.length || matchesAny(venue, refine)),
  )

async function loadSnapshot(areaId: string, signal?: AbortSignal): Promise<Venue[]> {
  const cached = snapshotCache.get(areaId)
  if (cached) return cached

  const response = await fetch(`${import.meta.env.BASE_URL}venues/${areaId}.json`, { signal })
  if (!response.ok) throw new Error(`snapshot unavailable (${response.status})`)

  const venues = (await response.json()) as Venue[]
  const usable = venues.filter((v) => insideBerlin(v.lat, v.lon))
  snapshotCache.set(areaId, usable)
  return usable
}

/** Areas ordered by distance from the given one, nearest first. */
function nearestAreas(area: Area, count: number): Area[] {
  return AREAS.filter((candidate) => candidate.id !== area.id)
    .map((candidate) => ({
      candidate,
      d: distanceMeters(area.lat, area.lon, candidate.lat, candidate.lon),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((entry) => entry.candidate)
}

/**
 * Niche activities (bowling, karaoke, a museum) may have only one or two
 * matches in a single Kiez, so the search goes city-wide when the neighbourhood
 * comes up short. Ranking still favours whatever is closest.
 */
async function searchLive(
  area: Area,
  filters: TagFilter[],
  signal: AbortSignal,
  deadline: AbortSignal,
  refine?: TagFilter[],
): Promise<{ venues: Venue[]; widened: boolean }> {
  const radii = [area.radius, CITY_WIDE_RADIUS]
  let best: Venue[] = []
  let widened = false

  for (const [index, radius] of radii.entries()) {
    try {
      const venues = await fetchVenues(area, filters, signal, radius, refine)
      if (venues.length > best.length) {
        best = venues
        widened = index > 0
      }
    } catch (error) {
      // Out of time: keep whatever the narrower query already found.
      if (deadline.aborted && best.length > 0) break
      throw error
    }
    if (best.length >= TARGET_CANDIDATES || deadline.aborted) break
  }

  return { venues: best, widened }
}

async function searchOffline(
  area: Area,
  filters: TagFilter[],
  signal?: AbortSignal,
  refine?: TagFilter[],
): Promise<{ venues: Venue[]; widened: boolean }> {
  const own = applyFilters(await loadSnapshot(area.id, signal), filters, refine)
  if (own.length >= TARGET_CANDIDATES) return { venues: own, widened: false }

  // Pull in neighbouring areas until there is enough to choose from.
  const collected = new Map(own.map((venue) => [venue.id, venue]))
  for (const neighbour of nearestAreas(area, 6)) {
    if (collected.size >= TARGET_CANDIDATES) break
    try {
      const snapshot = await loadSnapshot(neighbour.id, signal)
      for (const venue of applyFilters(snapshot, filters, refine)) {
        collected.set(venue.id, venue)
      }
    } catch {
      // A missing neighbour file is not fatal.
    }
  }

  return { venues: [...collected.values()], widened: collected.size > own.length }
}

interface Collected {
  venues: Venue[]
  widened: boolean
  source: VenueSource
}

/**
 * One pass of the live-then-offline pipeline for a given filter set. Live
 * results win; the snapshot is the safety net when Overpass is slow or down.
 */
async function collect(
  area: Area,
  filters: TagFilter[],
  refine: TagFilter[] | undefined,
  signal: AbortSignal | undefined,
): Promise<Collected> {
  let liveError: unknown = null

  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), LIVE_DEADLINE_MS)
  try {
    const live = await searchLive(
      area,
      filters,
      combineSignals(signal, deadline.signal),
      deadline.signal,
      refine,
    )
    if (live.venues.length > 0) return { ...live, source: 'live' }
  } catch (error) {
    // A user-initiated cancellation must propagate; a deadline must not.
    if (signal?.aborted) throw error
    if (!deadline.signal.aborted && !(error instanceof OverpassError)) throw error
    liveError = error
  } finally {
    clearTimeout(timer)
  }

  try {
    const offline = await searchOffline(area, filters, signal, refine)
    return { ...offline, source: 'offline' }
  } catch (error) {
    if (signal?.aborted) throw error
    // The offline copy is only a safety net; report the real problem.
    throw liveError ?? error
  }
}

export async function findVenues(
  area: Area,
  spec: ActivitySpec,
  signal?: AbortSignal,
): Promise<VenueResult> {
  const refine = spec.refine?.length ? spec.refine : undefined
  const primary = await collect(area, spec.filters, refine, signal)
  const exact = { ...primary, relaxed: false, matchCount: primary.venues.length }

  // No cuisine asked for, or the cuisine found plenty on its own.
  if (!refine || primary.venues.length >= MIN_CUISINE_MATCHES) return exact

  // Too thin: top up with the same activity minus the cuisine. The exact
  // matches keep their place at the front of the merged list.
  let fallback: Collected
  try {
    fallback = await collect(area, spec.filters, undefined, signal)
  } catch (error) {
    if (signal?.aborted) throw error
    // Relaxing is a nicety; whatever exact matches we have still stand.
    if (primary.venues.length > 0) return exact
    throw error
  }

  const merged = new Map(primary.venues.map((venue) => [venue.id, venue]))
  for (const venue of fallback.venues) {
    if (!merged.has(venue.id)) merged.set(venue.id, venue)
  }

  return {
    venues: [...merged.values()],
    // A snapshot standing in on either pass still means the data is stale.
    source: primary.source === 'offline' || fallback.source === 'offline' ? 'offline' : 'live',
    widened: primary.widened || fallback.widened,
    relaxed: merged.size > primary.venues.length,
    matchCount: primary.venues.length,
  }
}
