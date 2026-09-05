/**
 * Builders for the email invite and its calendar links.
 *
 * Everything here is a pure string function - no DOM, no Blob, no window - so
 * the module runs unchanged under `node --test`. The dialog component owns all
 * side effects.
 */

/** One leg of the invite: the stop's label plus the venue that was picked for it. */
export interface InviteStop {
  /** e.g. "Coffee" or "Dinner · Indian", from `stopLabel()`. */
  label: string
  venueName: string
  /** From `venueAddress()`; missing for venues OSM has no address for. */
  address?: string
}

export interface InviteDetails {
  /** ISO YYYY-MM-DD, straight from `plan.date`. */
  date: string
  /** Already formatted for humans by `formatDate()`, e.g. "Saturday, 12 September". */
  dateLabel: string
  /** "HH:MM", 24-hour. */
  startTime: string
  durationHours: number
  areaName: string
  people: number
  stops: InviteStop[]
  /** The shareable plan URL, from `planToParams()`. */
  planUrl: string
}

// Outlook truncates mailto: links a little past 1800 characters, and
// percent-encoding inflates spaces and newlines threefold. Staying under this
// costs one fallback branch in `mailtoUrl`.
const MAILTO_LIMIT = 1900

/**
 * Start and end as local Date objects. Built from local components and read
 * back as local components, so no timezone conversion ever happens - and an
 * end time past midnight rolls the date correctly.
 */
export function eventDates(details: InviteDetails): { start: Date; end: Date } {
  const [hours, minutes] = details.startTime.split(':').map(Number)
  const start = new Date(`${details.date}T00:00:00`)
  start.setHours(hours, minutes, 0, 0)
  const end = new Date(start.getTime() + details.durationHours * 3_600_000)
  return { start, end }
}

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * Floating local time, e.g. "20260912T180000" - no Z, no TZID, so every
 * calendar reads it as the viewer's own clock.
 *
 * ponytail: floating time is correct only while everyone is in one timezone.
 * Serving people outside Berlin means TZID=Europe/Berlin plus a VTIMEZONE block.
 */
export function icsStamp(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  )
}

/** Local time in the "2026-09-12T18:00:00" shape Outlook's deeplink expects. */
function isoLocal(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  )
}

/** "18:00" + 3h -> "21:00". Display only; `eventDates` handles the real maths. */
export function endTimeLabel(details: InviteDetails): string {
  const { end } = eventDates(details)
  return `${pad(end.getHours())}:${pad(end.getMinutes())}`
}

function calendarTitle(details: InviteDetails): string {
  return `Hangout in ${details.areaName}`
}

function calendarLocation(details: InviteDetails): string {
  const first = details.stops[0]
  if (!first) return `${details.areaName}, Berlin`
  return first.address ? `${first.venueName}, ${first.address}` : `${first.venueName}, Berlin`
}

/**
 * The full itinerary. Used only by the .ics, which has no length limit - see
 * the calendar URL builders for why they deliberately leave it out.
 */
function calendarDescription(details: InviteDetails): string {
  const itinerary = details.stops
    .map((stop, index) => `${index + 1}. ${stop.label} — ${stop.venueName}`)
    .join('\n')
  return `${itinerary}\n\nFull plan: ${details.planUrl}`
}

// These two URLs carry no description on purpose. They are embedded in the
// mailto body, so their own percent-encoding gets encoded a second time - a
// description costs roughly three times its length. Measured: adding one back
// takes a three-stop invite from ~1385 characters to ~2180, past what Outlook
// accepts. The itinerary already sits directly above these links in the email,
// and the .ics carries it for anyone who attaches that instead.

export function googleCalendarUrl(details: InviteDetails): string {
  const { start, end } = eventDates(details)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: calendarTitle(details),
    dates: `${icsStamp(start)}/${icsStamp(end)}`,
    location: calendarLocation(details),
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

export function outlookCalendarUrl(details: InviteDetails): string {
  const { start, end } = eventDates(details)
  const params = new URLSearchParams({
    subject: calendarTitle(details),
    startdt: isoLocal(start),
    enddt: isoLocal(end),
    location: calendarLocation(details),
  })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`
}

/** RFC 5545 §3.3.11 - backslash, semicolon, comma and newlines are special. */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * RFC 5545 §3.1 line folding. Continuation lines start with one space, so they
 * carry 74 characters of payload rather than 75.
 *
 * ponytail: folds on characters, not octets, so a line of mostly non-ASCII
 * folds later than the spec allows. Every parser in practice accepts it; switch
 * to a Buffer.byteLength walk if one ever complains.
 */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  for (let rest = line.slice(75); rest.length > 0; rest = rest.slice(74)) {
    parts.push(rest.slice(0, 74))
  }
  return parts.join('\r\n ')
}

function uid(details: InviteDetails): string {
  const { start } = eventDates(details)
  const slug = details.areaName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${icsStamp(start)}-${slug}@berlin-hangout-planner`
}

export function icsText(details: InviteDetails): string {
  const { start, end } = eventDates(details)
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Berlin Hangout Planner//EN',
      'BEGIN:VEVENT',
      `UID:${uid(details)}`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEscape(calendarTitle(details))}`,
      `LOCATION:${icsEscape(calendarLocation(details))}`,
      `DESCRIPTION:${icsEscape(calendarDescription(details))}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(fold)
      .join('\r\n') + '\r\n'
  )
}

export function emailSubject(details: InviteDetails): string {
  return `Hangout in ${details.areaName} — ${details.dateLabel}, ${details.startTime}`
}

export function emailBody(details: InviteDetails, withAddresses: boolean): string {
  const lines: string[] = [
    "Hey! Here's the plan for our hangout.",
    '',
    `${details.dateLabel} · ${details.startTime}–${endTimeLabel(details)}`,
    `${details.areaName} · ${details.people} people`,
    '',
  ]

  details.stops.forEach((stop, index) => {
    lines.push(`${index + 1}. ${stop.label}`)
    lines.push(`   ${stop.venueName}`)
    if (withAddresses && stop.address) lines.push(`   ${stop.address}`)
    lines.push('')
  })

  lines.push(
    'Add it to your calendar:',
    `Google  — ${googleCalendarUrl(details)}`,
    `Outlook — ${outlookCalendarUrl(details)}`,
    '',
    'See the full plan and other options:',
    details.planUrl,
  )

  return lines.join('\n')
}

/**
 * The whole mailto: link, with an empty `to=` so the user fills in recipients
 * in their own client. Addresses are dropped wholesale if the link would
 * otherwise overrun what mail clients accept - venue names and the plan URL
 * always survive, so nothing is silently lost.
 */
export function mailtoUrl(details: InviteDetails): string {
  const build = (withAddresses: boolean): string =>
    `mailto:?subject=${encodeURIComponent(emailSubject(details))}` +
    `&body=${encodeURIComponent(emailBody(details, withAddresses))}`

  const full = build(true)
  return full.length <= MAILTO_LIMIT ? full : build(false)
}
