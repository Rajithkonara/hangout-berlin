import type { DayKey } from '../lib/openingHours'
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

interface ResultsProps {
  state: ResultsState
  day: DayKey
  people: number
  areaName: string
  activityLabel: string
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

export function Results({
  state,
  day,
  people,
  areaName,
  activityLabel,
  onRetry,
  onShuffle,
  onShare,
  shareLabel,
}: ResultsProps) {
  if (state.status === 'idle') {
    return (
      <section className="card results results--empty">
        <p>Pick a day, an activity and your group size to get five ideas.</p>
      </section>
    )
  }

  if (state.status === 'loading') {
    return (
      <section className="card results" aria-busy="true">
        <p className="results__status">Searching OpenStreetMap…</p>
        <Skeletons />
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="card results results--error" role="alert">
        <h2>That didn't work</h2>
        <p>{state.message}</p>
        <button type="button" className="secondary" onClick={onRetry}>
          Try again
        </button>
      </section>
    )
  }

  if (state.venues.length === 0) {
    return (
      <section className="card results results--empty">
        <h2>Nothing found</h2>
        <p>
          No {activityLabel.toLowerCase()} spots are mapped around {areaName}. Try another
          neighbourhood, or describe the activity differently.
        </p>
      </section>
    )
  }

  const shownMatches = state.venues.filter((venue) => venue.cuisineMatch).length

  return (
    <section className="card results">
      <header className="results__header">
        <h2>
          5 ideas for {activityLabel.toLowerCase()} in {areaName}
        </h2>
        <div className="results__actions">
          <button type="button" className="secondary" onClick={onShuffle}>
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

      {state.widened && (
        <p className="notice notice--info">
          Not many {activityLabel.toLowerCase()} options right around {areaName}, so the
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
        {state.venues.map((venue, index) => (
          <VenueCard key={venue.id} venue={venue} index={index} day={day} />
        ))}
      </ul>
    </section>
  )
}
