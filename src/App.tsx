import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlannerForm } from './components/PlannerForm'
import { Results, type ResultsState } from './components/Results'
import { AREAS, getArea } from './data/districts'
import { resolveActivity } from './lib/activities'
import { getCuisine } from './lib/cuisines'
import {
  dayKeyOf,
  effectiveCuisine,
  formatDate,
  planFromParams,
  planSeed,
  planToParams,
  activityLabel,
  defaultPlan,
  type Plan,
} from './lib/plan'
import { findVenues } from './lib/venues'
import { rankVenues } from './lib/ranking'

export default function App() {
  const [plan, setPlan] = useState<Plan>(() => {
    const fromUrl = planFromParams(new URLSearchParams(window.location.search))
    return fromUrl ?? defaultPlan()
  })
  const [state, setState] = useState<ResultsState>({ status: 'idle' })
  const [shareLabel, setShareLabel] = useState('Copy link')
  const requestRef = useRef<AbortController | null>(null)
  // A plan arriving via a shared link should resolve itself immediately.
  const autoRun = useRef(planFromParams(new URLSearchParams(window.location.search)) !== null)

  const area = getArea(plan.areaId) ?? AREAS[0]
  const spec = useMemo(
    () => resolveActivity(plan.activity, effectiveCuisine(plan)),
    [plan],
  )
  const day = dayKeyOf(plan.date)

  const search = useCallback(
    async (target: Plan) => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller

      const targetArea = getArea(target.areaId) ?? AREAS[0]
      const targetCuisine = effectiveCuisine(target)
      const targetSpec = resolveActivity(target.activity, targetCuisine)

      setState({ status: 'loading' })
      try {
        const { venues, source, widened, relaxed, matchCount } = await findVenues(
          targetArea,
          targetSpec,
          controller.signal,
        )
        if (controller.signal.aborted) return
        const ranked = rankVenues(venues, {
          area: targetArea,
          spec: targetSpec,
          people: target.people,
          seed: planSeed(target),
        })
        setState({
          status: 'ready',
          venues: ranked,
          source,
          widened,
          relaxed,
          matchCount,
          cuisineLabel: getCuisine(targetCuisine)?.label,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Something went wrong while searching.',
        })
      }
    },
    [],
  )

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
    const running = state.status === 'loading'
    requestRef.current?.abort()
    requestRef.current = null
    autoRun.current = false
    setState({ status: 'idle' })
    if (!running) setPlan(defaultPlan())
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

  return (
    <div className="app">
      <header className="masthead">
        <h1>Berlin Hangout Planner</h1>
        <p>
          Pick a day, an activity and how many of you there are. Get five spots — all
          inside fare zone AB.
        </p>
      </header>

      <main>
        <PlannerForm
          plan={plan}
          onChange={update}
          onSubmit={handleSubmit}
          onReset={handleReset}
          loading={state.status === 'loading'}
          canReset={state.status !== 'idle'}
        />

        {state.status !== 'idle' && (
          <p className="plan-summary">
            {formatDate(plan.date)} · {activityLabel(plan)} · {plan.people} people
            · {area.name}
          </p>
        )}

        <Results
          state={state}
          day={day}
          people={plan.people}
          areaName={area.name}
          activityLabel={spec.label}
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
