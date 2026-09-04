import { BERLIN_BBOX, BERLIN_BOUNDARY } from '../data/berlinBoundary'

/**
 * Ray-casting point-in-polygon against the simplified Berlin outline. Berlin's
 * city limit doubles as the AB fare-zone limit, so anything failing this test
 * would be a zone C trip.
 */
export function insideBerlin(lat: number, lon: number): boolean {
  if (
    lat < BERLIN_BBOX.south ||
    lat > BERLIN_BBOX.north ||
    lon < BERLIN_BBOX.west ||
    lon > BERLIN_BBOX.east
  ) {
    return false
  }

  let inside = false
  for (let i = 0, j = BERLIN_BOUNDARY.length - 1; i < BERLIN_BOUNDARY.length; j = i++) {
    const [latI, lonI] = BERLIN_BOUNDARY[i]
    const [latJ, lonJ] = BERLIN_BOUNDARY[j]
    const straddles = latI > lat !== latJ > lat
    if (straddles && lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI) {
      inside = !inside
    }
  }
  return inside
}

const EARTH_RADIUS_M = 6_371_000

/** Great-circle distance in metres. */
export function distanceMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(1)} km`
}
