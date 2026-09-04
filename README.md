# Berlin Hangout Planner

Pick a day, an activity and how many friends are coming — get five places to go,
all inside Berlin's **AB fare zone**.

No backend, no API keys, no database. It's a static site that queries
OpenStreetMap directly from the browser, so it can be hosted for free on GitHub
Pages (or Netlify, Cloudflare Pages, anywhere).

## How it works

| Piece | Approach |
| --- | --- |
| Venues | [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) — keyless, CORS-enabled, queried live from the browser |
| Reliability | Overpass is volunteer-run and regularly returns 429/504. If it's slow (>12s) or down, the app silently falls back to a **12,400-venue snapshot of Berlin** shipped with the site, and says so. |
| AB zone | Every result is tested against Berlin's real city boundary (OSM relation `62422`, simplified). Berlin's city limit *is* the AB limit — zone C is Brandenburg. |
| Areas | A static list of districts and Kieze with anchor points and search radii, so no geocoding request is needed |
| Activity | Presets map to OSM tags (`amenity=cafe`, `amenity=bar`, …); free text is resolved through a keyword and cuisine table, with a name-search fallback |
| Cuisine | Breakfast, Brunch, Lunch and Dinner take an optional cuisine, AND-ed onto the activity (`amenity=restaurant` **and** `cuisine~indian`). If fewer than five match, the search widens across Berlin and then drops the cuisine, filling the remaining slots with other kitchens and saying so — exact matches always come first |
| Thin results | Niche activities (bowling, karaoke) widen the search across Berlin automatically, with a note — still zone AB only |
| Group size | A ranking hint, not a filter — 5+ people favours outdoor seating, beer gardens and pubs; 6+ shows a "book ahead" note |
| Sharing | The whole plan lives in the URL, so a link reproduces the exact same five suggestions |

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

For a GitHub Pages **project** site the assets live under `/<repo>/`, so build with:

```bash
VITE_BASE=/your-repo-name/ npm run build
```

## Refreshing the offline snapshot

`public/venues/*.json` is the fallback data used when Overpass is unavailable.
Regenerate it whenever you like (it takes a few minutes and is polite to the
API):

```bash
npm run snapshot
```

Commit the result — it's part of the static site.

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`. To enable it: push the repo, then set
**Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

The workflow sets `VITE_BASE` from the repository name automatically and copies
`index.html` to `404.html` so shared plan links resolve.

## Attribution

Venue data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
licensed under the [ODbL](https://opendatacommons.org/licenses/odbl/). The
Overpass API is a free, volunteer-run service — responses are cached in
`sessionStorage` to keep usage light.
