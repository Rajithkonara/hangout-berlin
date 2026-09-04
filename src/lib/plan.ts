import { DAY_KEYS, type DayKey } from './openingHours'
import { DEFAULT_AREA_ID, getArea } from '../data/districts'
import { PRESET_ACTIVITIES, supportsCuisine } from './activities'
import { getCuisine } from './cuisines'

/** One leg of the day, e.g. "coffee" or "dinner · indian". */
export interface Stop {
  /** A preset activity id, or free text. */
  activity: string
  /** Optional cuisine id, only meaningful for the food presets. */
  cuisine?: string
}

export interface Plan {
  /** ISO date (YYYY-MM-DD) of the meet-up. */
  date: string
  /** 1-3 legs of the day, in order, e.g. coffee -> bowling -> dinner. */
  stops: Stop[]
  areaId: string
  people: number
  /** Changes on every shuffle so the ranking reshuffles deterministically. */
  roll: number
}

export const MIN_PEOPLE = 2
export const MAX_PEOPLE = 30
export const MAX_STOPS = 3

export function todayIso(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function dayKeyOf(isoDate: string): DayKey {
  const parsed = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return DAY_KEYS[0]
  // JS weeks start on Sunday, OSM weeks start on Monday.
  return DAY_KEYS[(parsed.getDay() + 6) % 7]
}

export function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function defaultStop(): Stop {
  return { activity: 'coffee' }
}

export function defaultPlan(): Plan {
  return {
    date: todayIso(),
    stops: [defaultStop()],
    areaId: DEFAULT_AREA_ID,
    people: 4,
    roll: 1,
  }
}

function clampPeople(value: number): number {
  if (!Number.isFinite(value)) return 4
  return Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, Math.round(value)))
}

/** The cuisine that actually applies to a stop, ignoring a stale one on a non-food activity. */
export function effectiveCuisine(stop: Stop): string | undefined {
  if (!supportsCuisine(stop.activity)) return undefined
  return getCuisine(stop.cuisine)?.id
}

// Stop 1 keeps the original `activity`/`cuisine` param names so existing shared
// links keep working; stops 2 and 3 get a numeric suffix.
function paramSuffix(index: number): string {
  return index === 0 ? '' : String(index + 1)
}

export function planToParams(plan: Plan): URLSearchParams {
  const params = new URLSearchParams({
    date: plan.date,
    area: plan.areaId,
    people: String(plan.people),
    roll: String(plan.roll),
  })
  plan.stops.forEach((stop, index) => {
    const suffix = paramSuffix(index)
    params.set(`activity${suffix}`, stop.activity)
    const cuisine = effectiveCuisine(stop)
    if (cuisine) params.set(`cuisine${suffix}`, cuisine)
  })
  return params
}

/** Reads one stop from the URL; `null` means "no such stop present". */
function stopFromParams(params: URLSearchParams, index: number): Stop | null {
  const suffix = paramSuffix(index)
  const raw = params.get(`activity${suffix}`)
  if (raw === null) return null

  const activity = raw.slice(0, 80).trim() || defaultStop().activity
  const cuisine = getCuisine(params.get(`cuisine${suffix}`) ?? undefined)
  return { activity, cuisine: supportsCuisine(activity) ? cuisine?.id : undefined }
}

export function planFromParams(params: URLSearchParams): Plan | null {
  if (!params.has('activity') && !params.has('area')) return null

  const fallback = defaultPlan()
  const date = params.get('date') ?? ''
  const areaId = params.get('area') ?? fallback.areaId
  const roll = Number(params.get('roll'))

  const stops: Stop[] = []
  for (let index = 0; index < MAX_STOPS; index++) {
    const stop = stopFromParams(params, index)
    if (!stop) break
    stops.push(stop)
  }

  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback.date,
    stops: stops.length ? stops : fallback.stops,
    areaId: getArea(areaId) ? areaId : fallback.areaId,
    people: clampPeople(Number(params.get('people'))),
    roll: Number.isFinite(roll) && roll > 0 ? Math.floor(roll) : 1,
  }
}

/** Stable key describing everything that affects one stop's suggestions. */
export function stopSeed(plan: Plan, index: number): string {
  const stop = plan.stops[index]
  return `${plan.areaId}|${stop.activity}|${effectiveCuisine(stop) ?? ''}|${plan.people}|${plan.date}|${plan.roll}|${index}`
}

export function stopLabel(stop: Stop): string {
  const base = PRESET_ACTIVITIES.find((p) => p.id === stop.activity)?.label ?? stop.activity
  const cuisine = getCuisine(effectiveCuisine(stop))
  return cuisine ? `${base} · ${cuisine.label}` : base
}
