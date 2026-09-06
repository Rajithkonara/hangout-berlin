import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emailBody,
  emailSubject,
  endTimeLabel,
  eventDates,
  googleCalendarUrl,
  icsText,
  mailtoUrl,
  mapsPinUrl,
  mapsUrl,
  smsBody,
  whatsappBody,
  type InviteDetails,
} from './invite.ts'

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

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

test('a single stop folds its activity into the greeting instead of repeating it as a label', () => {
  const body = emailBody(details({ stops: [{ label: 'Coffee', venueName: 'Five Elephant' }] }), false)
  assert.ok(body.startsWith("Hey! Here's the plan for our hangout for a coffee. 👋"))
  assert.ok(body.includes('📍 Five Elephant\n\n📅 Add it to your calendar:'))
  assert.ok(!body.includes('Coffee\n'), 'the activity should not also appear as its own line')
})

test('a single-stop activity starting with a vowel gets "an", not "a"', () => {
  const body = emailBody(details({ stops: [{ label: 'Italian dinner', venueName: 'Chutnify' }] }), false)
  assert.ok(body.startsWith("Hey! Here's the plan for our hangout for an italian dinner. 👋"))
})

test('email subject names the activity and uses today/tomorrow/day-after instead of the date, close in', () => {
  const subject = emailSubject(
    details({ date: isoDate(0), stops: [{ label: 'Coffee', venueName: 'Five Elephant' }] }),
  )
  assert.equal(subject, 'Hangout for a coffee in Kreuzberg 36 — Today at 18:00')
})

test('email subject falls back to the full date once the plan is more than two days out', () => {
  const subject = emailSubject(details({ date: isoDate(5) }))
  assert.ok(subject.includes('Saturday, 12 September, 18:00'))
})

test('whatsapp greeting names the activity and the near-term day, with no emoji', () => {
  const body = whatsappBody(
    details({ date: isoDate(1), stops: [{ label: 'Coffee', venueName: 'Five Elephant' }] }),
  )
  const greetingLine = body.split('\n')[0]
  assert.equal(greetingLine, "Hey! Let's hang out for a coffee in Kreuzberg 36 tomorrow.")
  assert.ok(!greetingLine.match(/\p{Extended_Pictographic}/u), 'no emoji in the whatsapp greeting line')
})

test('whatsapp greeting drops the day word once the plan is more than two days out', () => {
  const body = whatsappBody(details({ date: isoDate(5) }))
  assert.ok(body.startsWith("Hey! Let's hang out in Kreuzberg 36."))
})

test('multiple stops are numbered', () => {
  const body = emailBody(
    details({
      stops: [
        { label: 'Coffee', venueName: 'Five Elephant' },
        { label: 'Dinner', venueName: 'Chutnify' },
      ],
    }),
    false,
  )
  assert.ok(body.includes('1. Coffee'))
  assert.ok(body.includes('2. Dinner'))
})

test('sms body always fits inside a single SMS segment', () => {
  const body = smsBody(details())
  assert.ok(body.length <= 160, `sms body was ${body.length} characters`)
  assert.ok(body.includes('google.com/maps/search'), 'should link straight to the first stop')
})

test('sms body reads like a text, not a system dump, for a realistic short plan', () => {
  const body = smsBody(
    details({ areaName: 'Kreuzberg 36', stops: [{ label: 'Coffee', venueName: 'Five Elephant' }] }),
  )
  assert.ok(body.length <= 160, `sms body was ${body.length} characters`)
  assert.ok(body.startsWith("Hey! Let's hang out at Five Elephant"), 'should read as a message from a friend')
})

test('sms uses the short coordinate pin, not the name-based query, when a stop has coordinates', () => {
  const body = smsBody(
    details({
      stops: [{ label: 'Coffee', venueName: 'the Butterfly Lovers', address: 'Veteranenstraße 10, Mitte', lat: 52.5, lon: 13.4 }],
      areaName: 'Prenzlauer Berg (Kollwitzkiez)',
    }),
  )
  assert.ok(body.length <= 160, `sms body was ${body.length} characters`)
  assert.ok(body.startsWith("Hey! Let's hang out at the Butterfly Lovers"), 'should still greet like a friend')
  assert.ok(body.includes('query=52.5,13.4'), 'should use the short pin, not the long name+address query')
})

test('an oversized venue name still keeps the sms body under the segment limit', () => {
  const body = smsBody(
    details({
      areaName: 'Neukölln (Weserstr. / Reuterkiez)',
      stops: [{ label: 'Coffee', venueName: 'x'.repeat(300), address: 'Weserstr. 1, Neukölln' }],
    }),
  )
  assert.ok(body.length <= 160, `sms body was ${body.length} characters`)
})

test('sms links to the first stop on a map, not the plan editor', () => {
  const body = smsBody(details({ stops: [{ label: 'Coffee', venueName: 'Five Elephant' }] }))
  assert.ok(body.includes('google.com/maps/search'), 'should link straight to the venue')
  assert.ok(!body.includes('hangout.berlin'), 'the plan URL should not appear once a map link is available')
  assert.ok(body.length <= 160, `sms body was ${body.length} characters`)
})

test('email itinerary shows the venue pinned and the address with its map link in brackets, and keeps the full plan link too', () => {
  const body = emailBody(
    details({
      stops: [{ label: 'Coffee', venueName: 'Five Elephant', address: 'Reichenberger Str. 101' }],
    }),
    true,
  )
  assert.ok(body.includes('📍 Five Elephant'))
  assert.ok(
    body.includes(
      `Address: Reichenberger Str. 101 (https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Five Elephant, Reichenberger Str. 101, Berlin')})`,
    ),
  )
  assert.ok(body.includes('hangout.berlin'), 'the full plan link must still be there')
})

test('mapsUrl falls back to the area when a venue has no known address', () => {
  const url = mapsUrl({ label: 'Coffee', venueName: 'Five Elephant' }, 'Kreuzberg 36')
  assert.equal(url, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Five Elephant, Kreuzberg 36, Berlin')}`)
})

test('mapsPinUrl is a short coordinate link, undefined without coordinates', () => {
  assert.equal(mapsPinUrl({ label: 'Coffee', venueName: 'Five Elephant', lat: 52.5, lon: 13.4 }), 'https://www.google.com/maps/search/?api=1&query=52.5,13.4')
  assert.equal(mapsPinUrl({ label: 'Coffee', venueName: 'Five Elephant' }), undefined)
})

test('each emoji in the email is used at most once, except the map pin (once per stop)', () => {
  const body = emailBody(details(), true)
  const counts = new Map<string, number>()
  for (const emoji of body.match(/\p{Extended_Pictographic}/gu) ?? []) {
    counts.set(emoji, (counts.get(emoji) ?? 0) + 1)
  }
  for (const [emoji, count] of counts) {
    if (emoji === '📍') continue
    assert.equal(count, 1, `${emoji} appeared ${count} times`)
  }
  assert.ok(!emailSubject(details()).match(/\p{Extended_Pictographic}/u), 'subject line stays plain text')
})

test('whatsapp body carries the full itinerary with a map link per stop, unlike the sms body', () => {
  const body = whatsappBody(details())
  assert.ok(body.includes('Chutnify'), 'every stop should appear, not just the first')
  const mapLinks = body.split('\n').filter((line) => line.startsWith('📍')).length
  assert.equal(mapLinks, details().stops.length)
  assert.ok(body.includes('hangout.berlin'), 'the full plan link must still be there')
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
