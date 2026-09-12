import { useEffect, useRef, useState } from 'react'
import { endTimeLabel, icsText, mailtoUrl, smsBody, whatsappBody, type InviteDetails } from '../lib/invite'

interface InviteDialogProps {
  /** Everything but the time, which this dialog owns and the plan never stores. */
  base: Omit<InviteDetails, 'startTime' | 'durationHours'>
  /** "HH:MM", picked from the plan's activity - e.g. dinner defaults later than coffee. */
  defaultStartTime: string
  onClose: () => void
}

const DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8]

// Only iOS and Android ship a default handler for `sms:` links - desktop
// browsers have nothing to open it with, so the button stays hidden there.
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export function InviteDialog({ base, defaultStartTime, onClose }: InviteDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [startTime, setStartTime] = useState(defaultStartTime)
  const [durationHours, setDurationHours] = useState(3)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // Without showModal there is no backdrop and no focus trap; the CSS still
    // renders a usable panel, which is enough for a browser this old.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }, [])

  const details: InviteDetails = { ...base, startTime, durationHours }

  const downloadIcs = () => {
    const url = URL.createObjectURL(
      new Blob([icsText(details)], { type: 'text/calendar;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `hangout-${base.date}.ics`
    link.click()
    // Revoking in the same tick cancels the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // The dialog stays open afterwards: navigating to a mailto: reports nothing
  // back, so leaving it up lets the user retry or grab the .ics instead.
  const openEmail = () => {
    window.location.href = mailtoUrl(details)
  }

  // iOS Safari only prefills the body when the link has no number before it
  // and uses `&` there instead of `?`; Android accepts either separator.
  const openSms = () => {
    const separator = /iPad|iPhone|iPod/i.test(navigator.userAgent) ? '&' : '?'
    window.location.href = `sms:${separator}body=${encodeURIComponent(smsBody(details))}`
  }

  // Not mobile-gated like openSms: wa.me works on desktop too (WhatsApp Web).
  // Opened in a new tab: unlike mailto:/sms:, wa.me is a real page navigation
  // and would otherwise replace the planner tab with WhatsApp Web.
  const openWhatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(whatsappBody(details))}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <dialog ref={ref} className="invite" onClose={onClose}>
      <div className="invite__panel">
        <div className="invite__head">
          <h2>Set up & share</h2>
          <form method="dialog">
            <button type="submit" className="invite__close" aria-label="Close">
              ×
            </button>
          </form>
        </div>

        <p className="invite__date">{base.dateLabel}</p>

        <div className="invite__when">
          <label className="invite__field">
            Starts
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </label>
          <label className="invite__field">
            For
            <select
              value={durationHours}
              onChange={(event) => setDurationHours(Number(event.target.value))}
            >
              {DURATIONS.map((hours) => (
                <option key={hours} value={hours}>
                  {hours} {hours === 1 ? 'hour' : 'hours'}
                </option>
              ))}
            </select>
          </label>
          <p className="invite__until">until {endTimeLabel(details)}</p>
        </div>

        <ol className="invite__itinerary">
          {base.stops.map((stop, index) => (
            <li
              key={index}
              className={base.stops.length > 1 ? 'invite__stop' : 'invite__stop invite__stop--unnumbered'}
            >
              {base.stops.length > 1 && (
                <span className="invite__stop-n" aria-hidden="true">
                  {index + 1}
                </span>
              )}
              <span>
                <span className="invite__label">{stop.label}</span>
                <span className="invite__venue">{stop.venueName}</span>
                {stop.address && <span className="invite__address">📍 {stop.address}</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="invite__actions">
          <button type="button" className="secondary" onClick={downloadIcs}>
            📅 Add to Calendar
          </button>
        </div>

        <div className="invite__share">
          <p className="invite__share-label">➦ Share plan via</p>
          <div className="invite__share-row">
            <button type="button" className="secondary" onClick={openWhatsapp}>
              📲 WhatsApp
            </button>
            {isMobile && (
              <button type="button" className="secondary" onClick={openSms}>
                💬 SMS
              </button>
            )}
            <button type="button" className="secondary" onClick={openEmail}>
              ✉️ Email
            </button>
          </div>
        </div>

        <p className="invite__hint">
          Attach the calendar file so Apple Mail and Outlook show a real invite. Google
          and Outlook Web users can use the links in the email instead.
        </p>
      </div>
    </dialog>
  )
}
