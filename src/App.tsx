import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlannerForm } from './components/PlannerForm'
import { Results, type ResultsState } from './components/Results'
import { AREAS, getArea } from './data/districts'
import { resolveActivity } from './lib/activities'
import { getCuisine } from './lib/cuisines'
import {
  MAX_STOPS,
  dayKeyOf,
  defaultStop,
  effectiveCuisine,
  formatDate,
  planFromParams,
  planToParams,
  stopLabel,
  stopSeed,
  defaultPlan,
  type Plan,
  type Stop,
} from './lib/plan'
import { findVenues } from './lib/venues'
import { rankVenues } from './lib/ranking'

const idleResults = (plan: Plan): ResultsState[] => plan.stops.map(() => ({ status: 'idle' }))

export default function App() {
  const [plan, setPlan] = useState<Plan>(() => {
    const fromUrl = planFromParams(new URLSearchParams(window.location.search))
    return fromUrl ?? defaultPlan()
  })
  const [results, setResults] = useState<ResultsState[]>(() => idleResults(plan))
  const [shareLabel, setShareLabel] = useState('Copy link')
  const requestRef = useRef<AbortController | null>(null)
  // A plan arriving via a shared link should resolve itself immediately.
  const autoRun = useRef(planFromParams(new URLSearchParams(window.location.search)) !== null)

  const area = getArea(plan.areaId) ?? AREAS[0]
  const specs = useMemo(
    () => plan.stops.map((stop) => resolveActivity(stop.activity, effectiveCuisine(stop))),
    [plan.stops],
  )
  const day = dayKeyOf(plan.date)
  const loading = results.some((r) => r.status === 'loading')

  const search = useCallback(async (target: Plan) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    const targetArea = getArea(target.areaId) ?? AREAS[0]
    setResults(target.stops.map((): ResultsState => ({ status: 'loading' })))

    // Stops run one after another (not in parallel) so each later stop can see
    // which venues earlier stops already claimed and avoid repeating them.
    const claimed = new Set<string>()

    for (let index = 0; index < target.stops.length; index++) {
      if (controller.signal.aborted) return
      const stop = target.stops[index]
      const cuisine = effectiveCuisine(stop)
      const spec = resolveActivity(stop.activity, cuisine)

      let next: ResultsState
      try {
        const { venues, source, widened, relaxed, matchCount } = await findVenues(
          targetArea,
          spec,
          controller.signal,
        )
        if (controller.signal.aborted) return
        const available = venues.filter((venue) => !claimed.has(venue.id))
        const ranked = rankVenues(available, {
          area: targetArea,
          spec,
          people: target.people,
          seed: stopSeed(target, index),
        })
        ranked.forEach((venue) => claimed.add(venue.id))
        next = {
          status: 'ready',
          venues: ranked,
          source,
          widened,
          relaxed,
          matchCount,
          cuisineLabel: getCuisine(cuisine)?.label,
        }
      } catch (error) {
        if (controller.signal.aborted) return
        next = {
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Something went wrong while searching.',
        }
      }

      const settled = next
      setResults((prev) => prev.map((r, i) => (i === index ? settled : r)))
    }
  }, [])

  // Keep the URL in sync so any plan on screen is shareable.
  useEffect(() => {
    const url = `${window.location.pathname}?${planToParams(plan).toString()}`
    window.history.replaceState(null, '', url)
  }, [plan])

  useEffect(() => {
    if (!autoRun.current) return
    autoRun.current = false
    void search(plan)
  }, [plan, search])

  useEffect(() => () => requestRef.current?.abort(), [])

  const update = (patch: Partial<Plan>) => setPlan((prev) => ({ ...prev, ...patch }))

  const updateStop = (index: number, patch: Partial<Stop>) =>
    setPlan((prev) => ({
      ...prev,
      stops: prev.stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)),
    }))

  const addStop = () =>
    setPlan((prev) => {
      if (prev.stops.length >= MAX_STOPS) return prev
      return { ...prev, stops: [...prev.stops, defaultStop()] }
    })

  const removeStop = (index: number) =>
    setPlan((prev) => {
      if (prev.stops.length <= 1) return prev
      return { ...prev, stops: prev.stops.filter((_, i) => i !== index) }
    })

  const handleSubmit = () => {
    void search(plan)
  }

  const handleShuffle = () => {
    const next = { ...plan, roll: plan.roll + 1 }
    setPlan(next)
    void search(next)
  }

  // Cancels the in-flight Overpass request; when nothing is running it clears
  // the results and puts the form back to its defaults.
  const handleReset = () => {
    const running = loading
    requestRef.current?.abort()
    requestRef.current = null
    autoRun.current = false
    if (running) {
      setResults(idleResults(plan))
    } else {
      const fresh = defaultPlan()
      setPlan(fresh)
      setResults(idleResults(fresh))
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${planToParams(plan)}`
    try {
      await navigator.clipboard.writeText(url)
      setShareLabel('Link copied!')
    } catch {
      setShareLabel('Copy failed')
    }
    setTimeout(() => setShareLabel('Copy link'), 2000)
  }

  const canReset = loading || results.some((r) => r.status !== 'idle')

  return (
    <div className="app">
      <header className="masthead">
        <h1>Berlin Hangout Planner</h1>
        <p>
          Pick a day, one to three activities and how many of you there are. Get five
          spots per stop — all inside fare zone AB.
        </p>
      </header>

      <main>
        <PlannerForm
          plan={plan}
          onChange={update}
          onStopChange={updateStop}
          onAddStop={addStop}
          onRemoveStop={removeStop}
          onSubmit={handleSubmit}
          onReset={handleReset}
          loading={loading}
          canReset={canReset}
        />

        {canReset && (
          <p className="plan-summary">
            {formatDate(plan.date)} ·{' '}
            {plan.stops.map((stop) => stopLabel(stop)).join(' → ')} · {plan.people} people
            · {area.name}
          </p>
        )}

        <Results
          stops={plan.stops.map((stop, index) => ({
            stop,
            spec: specs[index],
            state: results[index] ?? { status: 'idle' },
          }))}
          day={day}
          people={plan.people}
          areaName={area.name}
          onRetry={handleSubmit}
          onShuffle={handleShuffle}
          onShare={() => void handleShare()}
          shareLabel={shareLabel}
        />
      </main>

      <footer className="footer">
        <p>
          Venue data from{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
            © OpenStreetMap contributors
          </a>{' '}
          (ODbL), queried live via the Overpass API. No account, no backend, no tracking.
        </p>
      </footer>
    </div>
  )
}
