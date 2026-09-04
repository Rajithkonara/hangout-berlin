import { formatDistance } from '../lib/geo'
import { DAY_LABELS, opensOn, type DayKey } from '../lib/openingHours'
import {
  type RankedVenue,
  venueAddress,
  venueCategory,
  venuePhone,
  venueWebsite,
} from '../lib/ranking'

interface VenueCardProps {
  venue: RankedVenue
  index: number
  day: DayKey
}

function osmLink(venue: RankedVenue): string {
  const [type, id] = venue.id.split('/')
  return `https://www.openstreetmap.org/${type}/${id}`
}

function mapsLink(venue: RankedVenue): string {
  const query = encodeURIComponent(`${venue.name}, Berlin`)
  return `https://www.openstreetmap.org/?mlat=${venue.lat}&mlon=${venue.lon}#map=18/${venue.lat}/${venue.lon}&query=${query}`
}

export function VenueCard({ venue, index, day }: VenueCardProps) {
  const hours = venue.tags.opening_hours
  const state = opensOn(hours, day)
  const address = venueAddress(venue)
  const website = venueWebsite(venue)
  const phone = venuePhone(venue)

  return (
    <li className="venue">
      <span className="venue__rank" aria-hidden="true">
        {index + 1}
      </span>

      <div className="venue__body">
        <h3 className="venue__name">{venue.name}</h3>
        <p className="venue__meta">
          <span className="tag">{venueCategory(venue)}</span>
          <span>{formatDistance(venue.distance)} from the centre</span>
          {venue.tags.outdoor_seating === 'yes' && <span className="tag tag--soft">outdoor seating</span>}
          {venue.tags.wheelchair === 'yes' && <span className="tag tag--soft">step-free</span>}
        </p>

        {address && <p className="venue__address">{address}</p>}

        {hours && (
          <p className={`venue__hours venue__hours--${state}`}>
            {state === 'open' && `Open on ${DAY_LABELS[day]}`}
            {state === 'closed' && `Looks closed on ${DAY_LABELS[day]}`}
            {state === 'unknown' && 'Opening hours'}
            <span className="venue__hours-raw">{hours}</span>
          </p>
        )}

        <p className="venue__links">
          <a href={mapsLink(venue)} target="_blank" rel="noreferrer noopener">
            Map
          </a>
          {website && (
            <a href={website} target="_blank" rel="noreferrer noopener">
              Website
            </a>
          )}
          {phone && <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>}
          <a href={osmLink(venue)} target="_blank" rel="noreferrer noopener">
            OSM
          </a>
        </p>
      </div>
    </li>
  )
}
