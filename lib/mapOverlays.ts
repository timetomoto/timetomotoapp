// ---------------------------------------------------------------------------
// Fuel range circle GeoJSON
// ---------------------------------------------------------------------------

export function circleGeoJson(
  centerLng: number,
  centerLat: number,
  radiusMiles: number,
  steps = 64,
) {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusMiles / 69.0) * Math.sin(angle);
    const dLng =
      (radiusMiles / (69.0 * Math.cos((centerLat * Math.PI) / 180))) *
      Math.cos(angle);
    coords.push([centerLng + dLng, centerLat + dLat]);
  }
  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
    properties: {},
  };
}

// ---------------------------------------------------------------------------
// Fuel stations — Overpass API
// ---------------------------------------------------------------------------

export interface FuelStation {
  id: number;
  lat: number;
  lng: number;
  name: string;
}

export async function fetchFuelStations(
  lat: number,
  lng: number,
  radiusMeters = 40_000,
): Promise<FuelStation[]> {
  const query = `[out:json];node[amenity=fuel](around:${radiusMeters},${lat},${lng});out 150;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.elements ?? []).map((el: any) => ({
      id: el.id,
      lat: el.lat,
      lng: el.lon,
      name: el.tags?.name ?? 'Fuel',
    }));
  } finally {
    clearTimeout(timer);
  }
}

export function fuelStationsGeoJson(stations: FuelStation[]) {
  return {
    type: 'FeatureCollection' as const,
    features: stations.map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      properties: { name: s.name },
    })),
  };
}
