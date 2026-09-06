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
  lat?: number
  lon?: number
}

export function mapsUrl(stop: InviteStop, areaName: string): string {
  const place = stop.address ? `${stop.venueName}, ${stop.address}` : `${stop.venueName}, ${areaName}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place}, Berlin`)}`
}

/**
 * A coordinate pin link - shorter than `mapsUrl` but unlabelled, so it's only
 * used where length matters more than a named place card (the SMS body).
 */
export function mapsPinUrl(stop: InviteStop): string | undefined {
  if (stop.lat == null || stop.lon == null) return undefined
  return `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lon}`
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

/** "1. " before a stop's label, but only when there's more than one stop to number. */
function stepPrefix(index: number, total: number): string {
  return total > 1 ? `${index + 1}. ` : '• '
}

/**
 * The full itinerary. Used only by the .ics, which has no length limit - see
 * the calendar URL builders for why they deliberately leave it out.
 */
function calendarDescription(details: InviteDetails): string {
  const itinerary = details.stops
    .map((stop, index) => `${stepPrefix(index, details.stops.length)}${stop.label} — ${stop.venueName}`)
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

const startsWithVowel = (word: string): boolean => /^[aeiou]/i.test(word)

/** " for a coffee" / " for an italian dinner" for a single-stop plan, "" when there are several stops. */
function activityPhrase(details: InviteDetails): string {
  const singleStop = details.stops.length === 1 ? details.stops[0] : undefined
  if (!singleStop) return ''
  return ` for ${startsWithVowel(singleStop.label) ? 'an' : 'a'} ${singleStop.label.toLowerCase()}`
}

/** 'today' / 'tomorrow' / 'day after tomorrow', or undefined further out (callers fall back to the full date). */
function relativeDayWord(details: InviteDetails): string | undefined {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${details.date}T00:00:00`)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays === 2) return 'day after tomorrow'
  return undefined
}

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

export function emailSubject(details: InviteDetails): string {
  const day = relativeDayWord(details)
  const dayPart = day ? `${capitalize(day)} at ${details.startTime}` : `${details.dateLabel}, ${details.startTime}`
  return `Hangout${activityPhrase(details)} in ${details.areaName} — ${dayPart}`
}

export function emailBody(details: InviteDetails, withAddresses: boolean): string {
  const singleStop = details.stops.length === 1 ? details.stops[0] : undefined
  const lines: string[] = [
    `Hey! Here's the plan for our hangout${activityPhrase(details)}. 👋`,
    '',
    `${details.dateLabel} · ${details.startTime}–${endTimeLabel(details)}`,
    `${details.areaName} · ${details.people} people`,
    '',
  ]

  details.stops.forEach((stop, index) => {
    const indent = singleStop ? '' : '   '
    if (!singleStop) lines.push(`${stepPrefix(index, details.stops.length)}${stop.label}`)
    lines.push(`${indent}📍 ${stop.venueName}`)
    if (withAddresses) lines.push(`${indent}Address: ${stop.address ?? details.areaName} (${mapsUrl(stop, details.areaName)})`)
    lines.push('')
  })

  lines.push(
    '📅 Add it to your calendar:',
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

// A regular (GSM-7, single-segment) SMS carries 160 characters; going over
// splits the text into multiple linked messages that don't always thread
// together on the recipient's end. Staying under one segment keeps the
// invite a single text.
const SMS_LIMIT = 160

/** "Sep 6" - reads like something a friend typed, and short enough to leave
 * room for the plan URL in one SMS segment (the full "Sunday, September 6"
 * dateLabel doesn't fit alongside a long area name and the link). */
function shortDateLabel(details: InviteDetails): string {
  const { start } = eventDates(details)
  return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function smsBody(details: InviteDetails): string {
  const first = details.stops[0]
  const link = (first && mapsPinUrl(first)) ?? (first ? mapsUrl(first, details.areaName) : details.planUrl)
  const intro = first
    ? `Hey! Let's hang out at ${first.venueName}, ${shortDateLabel(details)} ${details.startTime}`
    : `Hey! Let's hang in ${details.areaName}, ${shortDateLabel(details)} at ${details.startTime}`
  const short = `${intro} — ${link}`
  if (short.length <= SMS_LIMIT) return short
  return link.length <= SMS_LIMIT ? link : link.slice(0, SMS_LIMIT)
}

// Safety margin for the wa.me URL length - WhatsApp itself has no message limit.
const WHATSAPP_LIMIT = 2000

export function whatsappBody(details: InviteDetails): string {
  const day = relativeDayWord(details)
  const lines: string[] = [
    `Hey! Let's hang out${activityPhrase(details)} in ${details.areaName}${day ? ` ${day}` : ''}.`,
    `${details.dateLabel} · ${details.startTime}–${endTimeLabel(details)}`,
    '',
  ]

  details.stops.forEach((stop, index) => {
    lines.push(`${stepPrefix(index, details.stops.length)}${stop.label}: ${stop.venueName}`)
    lines.push(`📍 ${mapsUrl(stop, details.areaName)}`)
    lines.push('')
  })

  lines.push(`Full plan: ${details.planUrl}`)

  const full = lines.join('\n')
  return full.length <= WHATSAPP_LIMIT ? full : `Full plan: ${details.planUrl}`
}
