import type { ActivitySpec } from '../lib/activities'
import type { DayKey } from '../lib/openingHours'
import type { Stop } from '../lib/plan'
import { RESERVATION_THRESHOLD, type RankedVenue } from '../lib/ranking'
import type { VenueSource } from '../lib/venues'
import { VenueCard } from './VenueCard'

export type ResultsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      venues: RankedVenue[]
      source: VenueSource
      widened: boolean
      /** A cuisine was asked for, but other kitchens were mixed in. */
      relaxed: boolean
      /** How many of the shown venues match the cuisine. */
      matchCount: number
      /** The requested cuisine's label, when there is one. */
      cuisineLabel?: string
    }

interface StopView {
  stop: Stop
  spec: ActivitySpec
  state: ResultsState
}

interface ResultsProps {
  stops: StopView[]
  day: DayKey
  people: number
  areaName: string
  onRetry: () => void
  onShuffle: () => void
  onShare: () => void
  shareLabel: string
}

function Skeletons() {
  return (
    <ul className="venues" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="venue venue--skeleton">
          <span className="venue__rank">{i + 1}</span>
          <div className="venue__body">
            <span className="skeleton skeleton--title" />
            <span className="skeleton skeleton--line" />
            <span className="skeleton skeleton--line skeleton--short" />
          </div>
        </li>
      ))}
    </ul>
  )
}

interface StopResultsProps {
  index: number
  spec: ActivitySpec
  state: ResultsState
  day: DayKey
  areaName: string
  showHeading: boolean
  onRetry: () => void
}

function StopResults({ index, spec, state, day, areaName, showHeading, onRetry }: StopResultsProps) {
  const heading = showHeading ? (
    <h3 className="stop-block__heading">
      Stop {index + 1} · {spec.label}
    </h3>
  ) : null

  if (state.status === 'loading') {
    return (
      <div className="stop-block" aria-busy="true">
        {heading}
        <p className="results__status">Searching OpenStreetMap…</p>
        <Skeletons />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="stop-block" role="alert">
        {heading}
        <p>{state.message}</p>
        <button type="button" className="secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  if (state.status === 'idle') return null

  if (state.venues.length === 0) {
    return (
      <div className="stop-block">
        {heading}
        <p>
          No {spec.label.toLowerCase()} spots are mapped around {areaName}. Try another
          neighbourhood, or describe the activity differently.
        </p>
      </div>
    )
  }

  const shownMatches = state.venues.filter((venue) => venue.cuisineMatch).length

  return (
    <div className="stop-block">
      {heading}

      {state.widened && (
        <p className="notice notice--info">
          Not many {spec.label.toLowerCase()} options right around {areaName}, so the
          search was widened across Berlin — still all inside zone AB.
        </p>
      )}

      {state.relaxed && state.cuisineLabel && (
        <p className="notice notice--info">
          {shownMatches === 0
            ? `No ${state.cuisineLabel.toLowerCase()} spots are mapped around ${areaName}, so these are other kitchens nearby.`
            : `Only ${shownMatches} ${state.cuisineLabel.toLowerCase()} ${
                shownMatches === 1 ? 'spot' : 'spots'
              } nearby — the rest are other kitchens in the area.`}
        </p>
      )}

      {state.source === 'offline' && (
        <p className="notice notice--info">
          OpenStreetMap's live search is busy, so these come from the app's built-in
          Berlin snapshot. Hit Shuffle in a minute for fresh data.
        </p>
      )}

      <ul className="venues">
        {state.venues.map((venue, venueIndex) => (
          <VenueCard key={venue.id} venue={venue} index={venueIndex} day={day} />
        ))}
      </ul>
    </div>
  )
}

export function Results({
  stops,
  day,
  people,
  areaName,
  onRetry,
  onShuffle,
  onShare,
  shareLabel,
}: ResultsProps) {
  if (stops.every((s) => s.state.status === 'idle')) {
    return (
      <section className="card results results--empty">
        <p>
          Pick a day, one to three activities and your group size to get five ideas per
          stop.
        </p>
      </section>
    )
  }

  const multiStop = stops.length > 1
  const anyLoading = stops.some((s) => s.state.status === 'loading')
  const heading = multiStop
    ? `Your ${stops.length}-stop plan`
    : `5 ideas for ${stops[0].spec.label.toLowerCase()} in ${areaName}`

  return (
    <section className="card results">
      <header className="results__header">
        <h2>{heading}</h2>
        <div className="results__actions">
          <button type="button" className="secondary" onClick={onShuffle} disabled={anyLoading}>
            Shuffle
          </button>
          <button type="button" className="secondary" onClick={onShare}>
            {shareLabel}
          </button>
        </div>
      </header>

      {people >= RESERVATION_THRESHOLD && (
        <p className="notice">
          You're {people} people — call ahead or book a table, most Berlin spots won't
          seat a group this size on the spot.
        </p>
      )}

      <div className={multiStop ? 'stop-results' : undefined}>
        {stops.map(({ spec, state }, index) => (
          <StopResults
            key={index}
            index={index}
            spec={spec}
            state={state}
            day={day}
            areaName={areaName}
            showHeading={multiStop}
            onRetry={onRetry}
          />
        ))}
      </div>
    </section>
  )
}
