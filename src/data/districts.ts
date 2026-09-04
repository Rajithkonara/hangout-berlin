/**
 * Search areas inside Berlin. Every anchor sits well within the city limits, so
 * an `around` query never strays into fare zone C (Brandenburg). Results are
 * additionally clipped against the real city boundary, see `insideBerlin`.
 */
export interface Area {
  id: string
  /** Display name. */
  name: string
  /** Borough this area belongs to, used for grouping in the picker. */
  borough: string
  lat: number
  lon: number
  /** Search radius in metres. */
  radius: number
}

export const AREAS: readonly Area[] = [
  // --- Mitte ---
  { id: 'mitte', name: 'Mitte (Hackescher Markt)', borough: 'Mitte', lat: 52.5225, lon: 13.402, radius: 1300 },
  { id: 'tiergarten', name: 'Tiergarten / Potsdamer Platz', borough: 'Mitte', lat: 52.5096, lon: 13.376, radius: 1300 },
  { id: 'moabit', name: 'Moabit', borough: 'Mitte', lat: 52.5289, lon: 13.34, radius: 1300 },
  { id: 'wedding', name: 'Wedding', borough: 'Mitte', lat: 52.5487, lon: 13.36, radius: 1500 },

  // --- Friedrichshain-Kreuzberg ---
  { id: 'kreuzberg-36', name: 'Kreuzberg 36 (Oranienstr.)', borough: 'Friedrichshain-Kreuzberg', lat: 52.5018, lon: 13.42, radius: 1200 },
  { id: 'kreuzberg-61', name: 'Kreuzberg 61 (Bergmannkiez)', borough: 'Friedrichshain-Kreuzberg', lat: 52.4879, lon: 13.39, radius: 1200 },
  { id: 'friedrichshain', name: 'Friedrichshain (Boxhagener Platz)', borough: 'Friedrichshain-Kreuzberg', lat: 52.5095, lon: 13.4595, radius: 1300 },

  // --- Pankow ---
  { id: 'prenzlauer-berg', name: 'Prenzlauer Berg (Kollwitzkiez)', borough: 'Pankow', lat: 52.5382, lon: 13.4193, radius: 1400 },
  { id: 'pankow', name: 'Pankow', borough: 'Pankow', lat: 52.5691, lon: 13.4021, radius: 1600 },
  { id: 'weissensee', name: 'Weißensee', borough: 'Pankow', lat: 52.5545, lon: 13.4635, radius: 1600 },

  // --- Charlottenburg-Wilmersdorf ---
  { id: 'charlottenburg', name: 'Charlottenburg (Savignyplatz)', borough: 'Charlottenburg-Wilmersdorf', lat: 52.5055, lon: 13.3223, radius: 1400 },
  { id: 'wilmersdorf', name: 'Wilmersdorf', borough: 'Charlottenburg-Wilmersdorf', lat: 52.487, lon: 13.318, radius: 1500 },

  // --- Tempelhof-Schöneberg ---
  { id: 'schoeneberg', name: 'Schöneberg (Nollendorfplatz)', borough: 'Tempelhof-Schöneberg', lat: 52.4993, lon: 13.3543, radius: 1300 },
  { id: 'tempelhof', name: 'Tempelhof', borough: 'Tempelhof-Schöneberg', lat: 52.467, lon: 13.3855, radius: 1600 },

  // --- Neukölln ---
  { id: 'neukoelln', name: 'Neukölln (Weserstr. / Reuterkiez)', borough: 'Neukölln', lat: 52.4885, lon: 13.4295, radius: 1300 },
  { id: 'rixdorf', name: 'Rixdorf / Britz', borough: 'Neukölln', lat: 52.4718, lon: 13.4436, radius: 1600 },

  // --- Lichtenberg ---
  { id: 'lichtenberg', name: 'Lichtenberg', borough: 'Lichtenberg', lat: 52.5153, lon: 13.4977, radius: 1600 },

  // --- Treptow-Köpenick ---
  { id: 'treptow', name: 'Treptow / Alt-Treptow', borough: 'Treptow-Köpenick', lat: 52.4933, lon: 13.4593, radius: 1500 },
  { id: 'koepenick', name: 'Köpenick (Altstadt)', borough: 'Treptow-Köpenick', lat: 52.4453, lon: 13.5776, radius: 1800 },

  // --- Steglitz-Zehlendorf ---
  { id: 'steglitz', name: 'Steglitz', borough: 'Steglitz-Zehlendorf', lat: 52.4562, lon: 13.3236, radius: 1600 },
  { id: 'zehlendorf', name: 'Zehlendorf', borough: 'Steglitz-Zehlendorf', lat: 52.4335, lon: 13.2589, radius: 1800 },

  // --- Spandau ---
  { id: 'spandau', name: 'Spandau (Altstadt)', borough: 'Spandau', lat: 52.5357, lon: 13.2003, radius: 1800 },

  // --- Reinickendorf ---
  { id: 'reinickendorf', name: 'Reinickendorf', borough: 'Reinickendorf', lat: 52.5795, lon: 13.3312, radius: 1800 },

  // --- Marzahn-Hellersdorf ---
  { id: 'marzahn', name: 'Marzahn', borough: 'Marzahn-Hellersdorf', lat: 52.5444, lon: 13.5442, radius: 1800 },
  { id: 'hellersdorf', name: 'Hellersdorf', borough: 'Marzahn-Hellersdorf', lat: 52.5347, lon: 13.6055, radius: 1800 },
]

export const DEFAULT_AREA_ID = 'mitte'

export function getArea(id: string): Area | undefined {
  return AREAS.find((a) => a.id === id)
}

/** Areas grouped by borough, preserving declaration order. */
export function areasByBorough(): Array<{ borough: string; areas: Area[] }> {
  const groups: Array<{ borough: string; areas: Area[] }> = []
  for (const area of AREAS) {
    let group = groups.find((g) => g.borough === area.borough)
    if (!group) {
      group = { borough: area.borough, areas: [] }
      groups.push(group)
    }
    group.areas.push(area)
  }
  return groups
}
