import { DAY_KEYS, type DayKey } from './openingHours'
import { DEFAULT_AREA_ID, getArea } from '../data/districts'
import { PRESET_ACTIVITIES, supportsCuisine } from './activities'
import { getCuisine } from './cuisines'

export interface Plan {
  /** ISO date (YYYY-MM-DD) of the meet-up. */
  date: string
  /** A preset activity id, or free text. */
  activity: string
  /** Optional cuisine id, only meaningful for the food presets. */
  cuisine?: string
  areaId: string
  people: number
  /** Changes on every shuffle so the ranking reshuffles deterministically. */
  roll: number
}

export const MIN_PEOPLE = 2
export const MAX_PEOPLE = 30

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

export function defaultPlan(): Plan {
  return {
    date: todayIso(),
    activity: 'coffee',
    areaId: DEFAULT_AREA_ID,
    people: 4,
    roll: 1,
  }
}

function clampPeople(value: number): number {
  if (!Number.isFinite(value)) return 4
  return Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, Math.round(value)))
}

export function planToParams(plan: Plan): URLSearchParams {
  const params = new URLSearchParams({
    date: plan.date,
    activity: plan.activity,
    area: plan.areaId,
    people: String(plan.people),
    roll: String(plan.roll),
  })
  const cuisine = effectiveCuisine(plan)
  if (cuisine) params.set('cuisine', cuisine)
  return params
}

/** The cuisine that actually applies, ignoring a stale one on a non-food activity. */
export function effectiveCuisine(plan: Plan): string | undefined {
  if (!supportsCuisine(plan.activity)) return undefined
  return getCuisine(plan.cuisine)?.id
}

export function planFromParams(params: URLSearchParams): Plan | null {
  if (!params.has('activity') && !params.has('area')) return null

  const fallback = defaultPlan()
  const date = params.get('date') ?? ''
  const activity = (params.get('activity') ?? fallback.activity).slice(0, 80)
  const areaId = params.get('area') ?? fallback.areaId
  const roll = Number(params.get('roll'))
  const cuisine = getCuisine(params.get('cuisine') ?? undefined)

  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback.date,
    activity: activity.trim() || fallback.activity,
    cuisine: supportsCuisine(activity) ? cuisine?.id : undefined,
    areaId: getArea(areaId) ? areaId : fallback.areaId,
    people: clampPeople(Number(params.get('people'))),
    roll: Number.isFinite(roll) && roll > 0 ? Math.floor(roll) : 1,
  }
}

/** Stable key describing everything that affects the suggestions. */
export function planSeed(plan: Plan): string {
  return `${plan.areaId}|${plan.activity}|${effectiveCuisine(plan) ?? ''}|${plan.people}|${plan.date}|${plan.roll}`
}

export function activityLabel(plan: Plan): string {
  const base = PRESET_ACTIVITIES.find((p) => p.id === plan.activity)?.label ?? plan.activity
  const cuisine = getCuisine(effectiveCuisine(plan))
  return cuisine ? `${base} · ${cuisine.label}` : base
}
