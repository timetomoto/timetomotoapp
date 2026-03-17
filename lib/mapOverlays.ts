// ---------------------------------------------------------------------------
// Fuel stations — Overpass API
// ---------------------------------------------------------------------------

export interface FuelStation {
  id: number;
  lat: number;
  lng: number;
  name: string;
  address: string;
  fuelTypes: string[];
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
    const results = (data.elements ?? []).map((el: any) => {
      const t = el.tags ?? {};
      const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
      const city = t['addr:city'] ?? '';
      const address = [street, city].filter(Boolean).join(', ') || t['brand'] || '';
      const fuelTypes: string[] = [];
      return { id: el.id, lat: el.lat, lng: el.lon, name: t.name ?? t.brand ?? t.operator ?? t['brand:wikidata'] ?? 'Gas Station', address, fuelTypes };
    });
    return results;
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
      properties: { id: s.id, name: s.name, address: s.address, fuelTypes: s.fuelTypes.join(', '), lat: s.lat, lng: s.lng },
    })),
  };
}

// ---------------------------------------------------------------------------
// Food places — Overpass API
// ---------------------------------------------------------------------------

export interface FoodPlace {
  id: number;
  lat: number;
  lng: number;
  name: string;
  type: string;
  address: string;
}

export async function fetchFoodPlaces(
  lat: number,
  lng: number,
  radiusMeters = 10_000,
): Promise<FoodPlace[]> {
  const query = `[out:json];(node[amenity=restaurant](around:${radiusMeters},${lat},${lng});node[amenity=cafe](around:${radiusMeters},${lat},${lng});node[amenity=fast_food](around:${radiusMeters},${lat},${lng}););out 100;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    const results = (data.elements ?? []).map((el: any) => {
      const t = el.tags ?? {};
      const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
      const city = t['addr:city'] ?? '';
      const address = [street, city].filter(Boolean).join(', ') || '';
      return { id: el.id, lat: el.lat, lng: el.lon, name: t.name ?? 'Restaurant', type: t.amenity ?? 'restaurant', address };
    });
    return results;
  } finally {
    clearTimeout(timer);
  }
}

export function foodPlacesGeoJson(places: FoodPlace[]) {
  return {
    type: 'FeatureCollection' as const,
    features: places.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, type: p.type, address: p.address, lat: p.lat, lng: p.lng },
    })),
  };
}
