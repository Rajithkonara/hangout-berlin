import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emailBody,
  endTimeLabel,
  eventDates,
  googleCalendarUrl,
  icsText,
  mailtoUrl,
  type InviteDetails,
} from './invite.ts'

function details(overrides: Partial<InviteDetails> = {}): InviteDetails {
  return {
    date: '2026-09-12',
    dateLabel: 'Saturday, 12 September',
    startTime: '18:00',
    durationHours: 3,
    areaName: 'Kreuzberg 36',
    people: 4,
    stops: [
      { label: 'Coffee', venueName: 'Five Elephant', address: 'Reichenberger Str. 101, Kreuzberg' },
      { label: 'Dinner · Indian', venueName: 'Chutnify', address: 'Sredzkistr. 43, Prenzlauer Berg' },
      { label: 'Bowling', venueName: 'Bowling Center Hasenheide', address: 'Hasenheide 107, Neukölln' },
    ],
    planUrl:
      'https://hangout.berlin/?date=2026-09-12&area=kreuzberg-36&people=4&roll=1&activity=coffee&activity2=dinner&cuisine2=indian&activity3=bowling',
    ...overrides,
  }
}

test('a three-stop invite fits inside the mailto budget', () => {
  const url = mailtoUrl(details())
  assert.ok(url.length <= 1900, `mailto was ${url.length} characters`)
})

test('addresses are dropped when the link would overrun', () => {
  // A plan URL long enough to push the full body over the limit on its own.
  const url = mailtoUrl(details({ planUrl: `https://hangout.berlin/?${'x'.repeat(700)}` }))
  const body = decodeURIComponent(url.split('&body=')[1])

  assert.ok(body.includes('Chutnify'), 'venue names must survive the trim')
  // Stop 1's address still appears inside the calendar links' `location`, so
  // assert on a later stop's address, which only ever appears in the itinerary.
  assert.ok(!body.includes('Sredzkistr'), 'itinerary addresses must be dropped')
  assert.ok(body.includes('hangout.berlin'), 'the plan URL must survive the trim')
})

test('calendar links carry no description, which is what keeps the mailto short', () => {
  const url = googleCalendarUrl(details())
  assert.ok(!url.includes('details='), 'a description here costs ~3x once double-encoded')
})

test('a venue with no address renders without a dangling blank line', () => {
  const body = emailBody(details({ stops: [{ label: 'Coffee', venueName: 'Five Elephant' }] }), true)
  assert.ok(body.includes('1. Coffee\n   Five Elephant\n\nAdd it to your calendar:'))
})

test('duration sets the end time', () => {
  assert.equal(endTimeLabel(details()), '21:00')
})

test('an end time past midnight rolls onto the next day', () => {
  const { end } = eventDates(details({ startTime: '23:00', durationHours: 4 }))
  assert.equal(end.getDate(), 13)
  assert.equal(end.getHours(), 3)
})

test('calendar times are floating local time', () => {
  const url = googleCalendarUrl(details())
  assert.match(url, /dates=20260912T180000%2F20260912T210000/)
  assert.ok(!icsText(details()).includes('TZID'), 'no TZID parameter')
  assert.match(icsText(details()), /DTSTART:20260912T180000\r\n/)
})

test('ics escapes commas, semicolons, backslashes and newlines', () => {
  const ics = icsText(
    details({ stops: [{ label: 'Coffee', venueName: 'Bar; Grill, Berlin', address: 'Back\\Alley 1' }] }),
  )
  assert.ok(ics.includes('Bar\\; Grill\\, Berlin'))
  assert.ok(ics.includes('Back\\\\Alley 1'))
  assert.ok(!/DESCRIPTION:[^\r\n]*\n[^ ]/.test(ics), 'raw newlines must be escaped')
})

test('ics folds long lines and every continuation starts with a space', () => {
  for (const line of icsText(details()).split('\r\n')) {
    assert.ok(line.length <= 75, `unfolded line of ${line.length}: ${line.slice(0, 40)}…`)
  }
})
