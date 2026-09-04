import type { Area } from '../data/districts'
import type { TagFilter } from './activities'
import { insideBerlin } from './geo'

export interface Venue {
  id: string
  name: string
  lat: number
  lon: number
  tags: Record<string, string>
}

/** Overpass mirrors, tried in order. */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const QUERY_TIMEOUT_MS = 45_000
const CACHE_PREFIX = 'bhp:overpass:'

function filterToClause(filter: TagFilter): string {
  const key = JSON.stringify(filter.key)
  if (filter.value === undefined) return `[${key}]`
  const value = JSON.stringify(filter.value)
  return filter.regex ? `[${key}~${value},i]` : `[${key}=${value}]`
}

export function buildQuery(
  area: Area,
  filters: TagFilter[],
  radius = area.radius,
  refine?: TagFilter[],
): string {
  const around = `(around:${radius},${area.lat},${area.lon})`
  // Each refinement is AND-ed onto every base filter, so the clauses are the
  // cross product of the two lists. No refinement means a single empty suffix.
  const suffixes = refine?.length ? refine.map(filterToClause) : ['']
  const body = filters
    .flatMap((filter) => {
      const base = filterToClause(filter)
      return suffixes.flatMap((suffix) => {
        const clause = `${base}${suffix}`
        // Ways and relations cover venues mapped as buildings rather than points.
        return [
          `  node${clause}${around};`,
          `  way${clause}${around};`,
          `  relation${clause}${around};`,
        ]
      })
    })
    .join('\n')

  return `[out:json][timeout:25];\n(\n${body}\n);\nout tags center 200;`
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function toVenues(elements: OverpassElement[]): Venue[] {
  const seen = new Set<string>()
  const venues: Venue[] = []

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    const name = el.tags?.name?.trim()
    if (lat === undefined || lon === undefined || !name) continue
    // Hard AB-zone guarantee: drop anything outside the Berlin city boundary.
    if (!insideBerlin(lat, lon)) continue

    // The same venue is often mapped as both a node and a building way.
    const key = `${name.toLowerCase()}@${lat.toFixed(3)},${lon.toFixed(3)}`
    if (seen.has(key)) continue
    seen.add(key)

    venues.push({ id: `${el.type}/${el.id}`, name, lat, lon, tags: el.tags ?? {} })
  }

  return venues
}

function readCache(key: string): Venue[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key)
    return raw ? (JSON.parse(raw) as Venue[]) : null
  } catch {
    return null
  }
}

function writeCache(key: string, venues: Venue[]): void {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(venues))
  } catch {
    // Storage full or unavailable - caching is best-effort.
  }
}

export class OverpassError extends Error {}

export async function fetchVenues(
  area: Area,
  filters: TagFilter[],
  signal?: AbortSignal,
  radius = area.radius,
  refine?: TagFilter[],
): Promise<Venue[]> {
  const query = buildQuery(area, filters, radius, refine)
  // The refinement has to be part of the key, or a cuisine search would be
  // served the unfiltered results of an earlier plain-activity search.
  const refineKey = refine?.length ? `&${refine.map(filterToClause).join('')}` : ''
  const cacheKey = `${area.id}:${radius}:${filters.map(filterToClause).join('')}${refineKey}`

  const cached = readCache(cacheKey)
  if (cached) return cached

  let lastError: unknown = null

  for (const [index, endpoint] of ENDPOINTS.entries()) {
    // Back off briefly before hitting a mirror; the previous failure was often
    // a rate limit, and hammering all three instantly makes it worse.
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600 * index))
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    }

    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), QUERY_TIMEOUT_MS)
    const onAbort = () => timeout.abort()
    signal?.addEventListener('abort', onAbort)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: timeout.signal,
      })

      if (!response.ok) {
        throw new OverpassError(
          response.status === 429 || response.status === 504
            ? 'the free OpenStreetMap API is busy right now'
            : `Overpass responded with ${response.status}`,
        )
      }

      const json = (await response.json()) as { elements?: OverpassElement[] }
      const venues = toVenues(json.elements ?? [])
      writeCache(cacheKey, venues)
      return venues
    } catch (error) {
      // The caller cancelled (new search started) - stop, don't try mirrors.
      if (signal?.aborted) throw error
      lastError = error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  throw new OverpassError(
    lastError instanceof Error
      ? `Could not reach OpenStreetMap — ${lastError.message}. Give it a few seconds and try again.`
      : 'Could not reach OpenStreetMap. Give it a few seconds and try again.',
  )
}
