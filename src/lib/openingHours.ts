/**
 * Minimal `opening_hours` reader. The real grammar is large; we only handle the
 * common shapes and fall back to showing the raw string when unsure.
 */

export const DAY_KEYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const
export type DayKey = (typeof DAY_KEYS)[number]

export const DAY_LABELS: Record<DayKey, string> = {
  Mo: 'Monday',
  Tu: 'Tuesday',
  We: 'Wednesday',
  Th: 'Thursday',
  Fr: 'Friday',
  Sa: 'Saturday',
  Su: 'Sunday',
}

export type OpenState = 'open' | 'closed' | 'unknown'

function expandDayRange(token: string): DayKey[] {
  const [fromRaw, toRaw] = token.split('-')
  const from = DAY_KEYS.indexOf(fromRaw as DayKey)
  if (from === -1) return []
  if (!toRaw) return [DAY_KEYS[from]]
  const to = DAY_KEYS.indexOf(toRaw as DayKey)
  if (to === -1) return []

  const days: DayKey[] = []
  for (let i = from; ; i = (i + 1) % 7) {
    days.push(DAY_KEYS[i])
    if (i === to) break
  }
  return days
}

const DAY_TOKEN = /^(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b/
const TIME_RE = /\d{1,2}:\d{2}/

/**
 * Splits a value into individual rules. Rules are separated by `;`, but very
 * often by `,` as well ("Tu-Th 15:00-01:00, Sa 12:00-03:00"). A comma only
 * starts a new rule when what came before already carries a time, otherwise it
 * is just separating days ("Mo-Fr,Sa 10:00-12:00").
 */
function splitRules(value: string): string[] {
  const rules: string[] = []

  for (const part of value.split(';')) {
    let current = ''
    for (const token of part.split(',')) {
      const trimmed = token.trim()
      if (!trimmed) continue
      if (current && TIME_RE.test(current) && DAY_TOKEN.test(trimmed)) {
        rules.push(current)
        current = trimmed
      } else {
        current = current ? `${current},${trimmed}` : trimmed
      }
    }
    if (current) rules.push(current)
  }

  return rules
}

/**
 * Best-effort check of whether a venue is open on a given weekday.
 * Returns 'unknown' whenever the rule is beyond this simple parser.
 */
export function opensOn(openingHours: string | undefined, day: DayKey): OpenState {
  if (!openingHours) return 'unknown'
  const value = openingHours.trim()
  if (!value) return 'unknown'
  if (/^24\/7$/i.test(value)) return 'open'
  // Conditional or seasonal rules are out of scope.
  if (/\b(easter|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(value)) {
    return 'unknown'
  }

  let sawDaySpecificRule = false
  let openToday: OpenState = 'unknown'

  for (const rule of splitRules(value)) {
    const trimmed = rule.trim()
    if (!trimmed) continue

    const match = /^([A-Za-z,\-\s]+?)\s+(.+)$/.exec(trimmed)
    const daysPart = match ? match[1] : ''
    const timesPart = match ? match[2] : trimmed

    const days = new Set<DayKey>()
    let unparseableDays = false
    for (const token of daysPart.split(',').map((t) => t.trim()).filter(Boolean)) {
      if (token === 'PH' || token === 'SH') continue
      const expanded = expandDayRange(token)
      if (expanded.length === 0) {
        unparseableDays = true
        break
      }
      expanded.forEach((d) => days.add(d))
    }
    if (unparseableDays) return 'unknown'

    // No day prefix means the rule applies every day.
    const applies = days.size === 0 ? true : days.has(day)
    if (days.size > 0) sawDaySpecificRule = true
    if (!applies) continue

    if (/^off|closed$/i.test(timesPart.trim())) {
      openToday = 'closed'
    } else if (/\d{1,2}:\d{2}/.test(timesPart)) {
      openToday = 'open'
    }
  }

  if (openToday !== 'unknown') return openToday
  // Days were listed explicitly and today was not among them.
  return sawDaySpecificRule ? 'closed' : 'unknown'
}
