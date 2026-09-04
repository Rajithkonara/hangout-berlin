import { useMemo } from 'react'
import { AREAS, areasByBorough } from '../data/districts'
import { PRESET_ACTIVITIES, supportsCuisine } from '../lib/activities'
import { PICKER_CUISINES } from '../lib/cuisines'
import {
  MAX_PEOPLE,
  MAX_STOPS,
  MIN_PEOPLE,
  type Plan,
  type Stop,
  formatDate,
  todayIso,
} from '../lib/plan'

interface PlannerFormProps {
  plan: Plan
  onChange: (patch: Partial<Plan>) => void
  onStopChange: (index: number, patch: Partial<Stop>) => void
  onAddStop: () => void
  onRemoveStop: (index: number) => void
  onSubmit: () => void
  /** Cancels an in-flight Overpass search, or clears the plan when idle. */
  onReset: () => void
  loading: boolean
  /** True when there is something to reset: a running search or results. */
  canReset: boolean
}

const isPreset = (activity: string) =>
  PRESET_ACTIVITIES.some((preset) => preset.id === activity)

interface StopFieldsProps {
  stop: Stop
  index: number
  onChange: (patch: Partial<Stop>) => void
  onRemove?: () => void
}

function StopFields({ stop, index, onChange, onRemove }: StopFieldsProps) {
  const usingFreeText = !isPreset(stop.activity)
  const freeTextValue = usingFreeText ? stop.activity : ''
  const showCuisines = supportsCuisine(stop.activity)
  const freeTextId = `free-text-${index}`

  return (
    <fieldset className="field stop">
      <legend className="stop__legend">
        <span>Stop {index + 1}</span>
        {onRemove && (
          <button type="button" className="stop__remove" onClick={onRemove}>
            Remove
          </button>
        )}
      </legend>

      <div className="chips" role="group" aria-label={`Activity for stop ${index + 1}`}>
        {PRESET_ACTIVITIES.map((preset) => {
          const selected = stop.activity === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              className={`chip${selected ? ' chip--selected' : ''}`}
              aria-pressed={selected}
              onClick={() =>
                onChange({
                  activity: preset.id,
                  // Keep the cuisine when moving between meals, drop it when
                  // moving to something it can't narrow.
                  cuisine: supportsCuisine(preset.id) ? stop.cuisine : undefined,
                })
              }
            >
              <span aria-hidden="true">{preset.emoji}</span>
              <span>{preset.label}</span>
            </button>
          )
        })}
      </div>

      <label className="sr-only" htmlFor={freeTextId}>
        Or describe your own activity for stop {index + 1}
      </label>
      <input
        id={freeTextId}
        type="text"
        className={usingFreeText ? 'freetext freetext--active' : 'freetext'}
        placeholder="…or type your own: bowling, karaoke, sushi, museum"
        value={freeTextValue}
        maxLength={80}
        onChange={(event) => {
          const value = event.target.value
          const activity = value.trim() ? value : PRESET_ACTIVITIES[0].id
          onChange({
            activity,
            cuisine: supportsCuisine(activity) ? stop.cuisine : undefined,
          })
        }}
      />

      {showCuisines && (
        <div className="chips chips--cuisine" role="group" aria-label={`Cuisine for stop ${index + 1}`}>
          <button
            type="button"
            className={`chip chip--cuisine${stop.cuisine ? '' : ' chip--selected'}`}
            aria-pressed={!stop.cuisine}
            onClick={() => onChange({ cuisine: undefined })}
          >
            Any cuisine
          </button>
          {PICKER_CUISINES.map((cuisine) => {
            const selected = stop.cuisine === cuisine.id
            return (
              <button
                key={cuisine.id}
                type="button"
                className={`chip chip--cuisine${selected ? ' chip--selected' : ''}`}
                aria-pressed={selected}
                // Clicking the selected cuisine again clears it.
                onClick={() => onChange({ cuisine: selected ? undefined : cuisine.id })}
              >
                <span aria-hidden="true">{cuisine.emoji}</span>
                <span>{cuisine.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}

export function PlannerForm({
  plan,
  onChange,
  onStopChange,
  onAddStop,
  onRemoveStop,
  onSubmit,
  onReset,
  loading,
  canReset,
}: PlannerFormProps) {
  const groups = useMemo(() => areasByBorough(), [])
  const areaName = AREAS.find((a) => a.id === plan.areaId)?.name ?? ''

  return (
    <form
      className="card planner"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="field">
        <label htmlFor="date">When are you meeting?</label>
        <input
          id="date"
          type="date"
          value={plan.date}
          min={todayIso()}
          onChange={(event) => onChange({ date: event.target.value })}
        />
        <p className="hint">{formatDate(plan.date)}</p>
      </div>

      {plan.stops.map((stop, index) => (
        <StopFields
          key={index}
          stop={stop}
          index={index}
          onChange={(patch) => onStopChange(index, patch)}
          onRemove={plan.stops.length > 1 ? () => onRemoveStop(index) : undefined}
        />
      ))}

      {plan.stops.length < MAX_STOPS && (
        <button type="button" className="secondary add-stop" onClick={onAddStop}>
          + Add another stop
        </button>
      )}

      <div className="row">
        <div className="field">
          <label htmlFor="area">Where in Berlin?</label>
          <select
            id="area"
            value={plan.areaId}
            onChange={(event) => onChange({ areaId: event.target.value })}
          >
            {groups.map((group) => (
              <optgroup key={group.borough} label={group.borough}>
                {group.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="hint">Inside fare zone AB · {areaName}</p>
        </div>

        <div className="field">
          <label htmlFor="people">How many of you?</label>
          <div className="stepper">
            <button
              type="button"
              aria-label="Fewer people"
              disabled={plan.people <= MIN_PEOPLE}
              onClick={() => onChange({ people: plan.people - 1 })}
            >
              −
            </button>
            <input
              id="people"
              type="number"
              inputMode="numeric"
              min={MIN_PEOPLE}
              max={MAX_PEOPLE}
              value={plan.people}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (!Number.isFinite(next)) return
                onChange({
                  people: Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, Math.round(next))),
                })
              }}
            />
            <button
              type="button"
              aria-label="More people"
              disabled={plan.people >= MAX_PEOPLE}
              onClick={() => onChange({ people: plan.people + 1 })}
            >
              +
            </button>
          </div>
          <p className="hint">{plan.people} people</p>
        </div>
      </div>

      <div className="actions">
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Finding spots…' : plan.stops.length > 1 ? 'Suggest my plan' : 'Suggest 5 spots'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onReset}
          disabled={!loading && !canReset}
          title={
            loading
              ? 'Stop the OpenStreetMap search'
              : 'Clear the results and start over'
          }
        >
          {loading ? 'Stop search' : 'Reset'}
        </button>
      </div>
    </form>
  )
}
