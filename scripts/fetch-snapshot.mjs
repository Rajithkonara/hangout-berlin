#!/usr/bin/env node
/**
 * Builds the offline venue snapshot used when the Overpass API is unavailable.
 *
 *   node scripts/fetch-snapshot.mjs
 *
 * Writes one file per area to public/venues/<areaId>.json. Re-run occasionally
 * to refresh the data; the app always prefers a live Overpass query and only
 * falls back to these files.
 *
 * Data (c) OpenStreetMap contributors, ODbL.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = resolve(root, 'public/venues')

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

const AMENITIES =
  'cafe|restaurant|fast_food|bar|pub|biergarten|nightclub|cinema|theatre|ice_cream|marketplace|library|spa'
const LEISURE =
  'bowling_alley|miniature_golf|amusement_arcade|park|garden|sauna|swimming_pool|water_park|sports_centre|golf_course'
const TOURISM = 'museum|gallery|zoo|aquarium'
const SHOPS = 'coffee|bakery|pastry|ice_cream|wine|books|games'

/** Tags worth keeping; everything else is dropped to keep files small. */
const KEEP_TAGS = new Set([
  'name',
  'amenity',
  'leisure',
  'tourism',
  'shop',
  'sport',
  'cuisine',
  'opening_hours',
  'website',
  'contact:website',
  'url',
  'phone',
  'contact:phone',
  'addr:street',
  'addr:housenumber',
  'addr:suburb',
  'addr:city',
  'outdoor_seating',
  'reservation',
  'wheelchair',
  'diet:vegan',
  'diet:vegetarian',
])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function buildQuery(area) {
  const around = `(around:${area.radius},${area.lat},${area.lon})`
  return `[out:json][timeout:90];
(
  nwr["amenity"~"^(${AMENITIES})$"]${around};
  nwr["leisure"~"^(${LEISURE})$"]${around};
  nwr["tourism"~"^(${TOURISM})$"]${around};
  nwr["shop"~"^(${SHOPS})$"]${around};
);
out tags center;`
}

async function runQuery(query) {
  let lastError
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // Overpass' front-end rejects Node's default User-Agent with a 406.
            'User-Agent': 'berlin-hangout-planner/0.1 (snapshot builder)',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(180_000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json()
      } catch (error) {
        lastError = error
        process.stdout.write(` retry(${endpoint.split('/')[2]}:${error.message})`)
        await sleep(5000 * (attempt + 1))
      }
    }
  }
  throw lastError ?? new Error('all endpoints failed')
}

/** Parse the area list straight out of the TypeScript source. */
async function loadAreas() {
  const source = await readFile(resolve(root, 'src/data/districts.ts'), 'utf8')
  const areas = []
  const re =
    /\{\s*id:\s*'([^']+)'[^}]*?lat:\s*([\d.]+),\s*lon:\s*([\d.]+),\s*radius:\s*(\d+)\s*\}/g
  let match
  while ((match = re.exec(source))) {
    areas.push({
      id: match[1],
      lat: Number(match[2]),
      lon: Number(match[3]),
      radius: Number(match[4]),
    })
  }
  return areas
}

async function main() {
  const areas = await loadAreas()
  if (areas.length === 0) throw new Error('no areas parsed from districts.ts')
  await mkdir(outDir, { recursive: true })

  const index = []
  for (const area of areas) {
    process.stdout.write(`${area.id} …`)
    const json = await runQuery(buildQuery(area))

    const seen = new Set()
    const venues = []
    for (const el of json.elements ?? []) {
      const lat = el.lat ?? el.center?.lat
      const lon = el.lon ?? el.center?.lon
      const name = el.tags?.name?.trim()
      if (lat === undefined || lon === undefined || !name) continue

      const key = `${name.toLowerCase()}@${lat.toFixed(3)},${lon.toFixed(3)}`
      if (seen.has(key)) continue
      seen.add(key)

      const tags = {}
      for (const [k, v] of Object.entries(el.tags)) {
        if (KEEP_TAGS.has(k)) tags[k] = v
      }
      venues.push({
        id: `${el.type}/${el.id}`,
        name,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
        tags,
      })
    }

    await writeFile(resolve(outDir, `${area.id}.json`), JSON.stringify(venues), 'utf8')
    index.push({ id: area.id, count: venues.length })
    process.stdout.write(` ${venues.length} venues\n`)
    await sleep(4000)
  }

  await writeFile(
    resolve(outDir, 'index.json'),
    JSON.stringify(
      { generated: new Date().toISOString().slice(0, 10), areas: index },
      null,
      2,
    ),
    'utf8',
  )
  console.log(
    `\nDone. ${index.reduce((n, a) => n + a.count, 0)} venues across ${index.length} areas.`,
  )
}

main().catch((error) => {
  console.error('\nSnapshot failed:', error.message)
  process.exit(1)
})
