import { useMemo } from 'react'
import { AREAS, areasByBorough } from '../data/districts'
import { PRESET_ACTIVITIES, supportsCuisine } from '../lib/activities'
import { PICKER_CUISINES } from '../lib/cuisines'
import {
  MAX_PEOPLE,
  MIN_PEOPLE,
  type Plan,
  formatDate,
  todayIso,
} from '../lib/plan'

interface PlannerFormProps {
  plan: Plan
  onChange: (patch: Partial<Plan>) => void
  onSubmit: () => void
  /** Cancels an in-flight Overpass search, or clears the plan when idle. */
  onReset: () => void
  loading: boolean
  /** True when there is something to reset: a running search or results. */
  canReset: boolean
}

const isPreset = (activity: string) =>
  PRESET_ACTIVITIES.some((preset) => preset.id === activity)

export function PlannerForm({ plan, onChange, onSubmit, onReset, loading, canReset }: PlannerFormProps) {
  const groups = useMemo(() => areasByBorough(), [])
  const usingFreeText = !isPreset(plan.activity)
  const freeTextValue = usingFreeText ? plan.activity : ''
  const areaName = AREAS.find((a) => a.id === plan.areaId)?.name ?? ''
  // A cuisine only narrows the meals; coffee, drinks and free text ignore it.
  const showCuisines = supportsCuisine(plan.activity)

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

      <fieldset className="field">
        <legend>What's the plan?</legend>
        <div className="chips" role="group" aria-label="Activity">
          {PRESET_ACTIVITIES.map((preset) => {
            const selected = plan.activity === preset.id
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
                    cuisine: supportsCuisine(preset.id) ? plan.cuisine : undefined,
                  })
                }
              >
                <span aria-hidden="true">{preset.emoji}</span>
                <span>{preset.label}</span>
              </button>
            )
          })}
        </div>

        <label className="sr-only" htmlFor="free-text">
          Or describe your own activity
        </label>
        <input
          id="free-text"
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
              cuisine: supportsCuisine(activity) ? plan.cuisine : undefined,
            })
          }}
        />
      </fieldset>

      {showCuisines && (
        <fieldset className="field">
          <legend>Any particular kitchen?</legend>
          <div className="chips chips--cuisine" role="group" aria-label="Cuisine">
            <button
              type="button"
              className={`chip chip--cuisine${plan.cuisine ? '' : ' chip--selected'}`}
              aria-pressed={!plan.cuisine}
              onClick={() => onChange({ cuisine: undefined })}
            >
              Any cuisine
            </button>
            {PICKER_CUISINES.map((cuisine) => {
              const selected = plan.cuisine === cuisine.id
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
          <p className="hint">
            Optional. If there aren't five nearby, other kitchens fill the rest.
          </p>
        </fieldset>
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
          {loading ? 'Finding spots…' : 'Suggest 5 spots'}
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
