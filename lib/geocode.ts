// ---------------------------------------------------------------------------
// Shared Mapbox geocoding helpers
// Extracted from discoverStore.ts for reuse across Scout, Trip Planner, etc.
// ---------------------------------------------------------------------------

const AUSTIN_LNG = -97.7431;
const AUSTIN_LAT = 30.2672;

export interface GeocodedPlace {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Forward geocode a text query via Mapbox Places API.
 * Returns up to 5 results biased toward the given proximity (default Austin).
 */
export async function geocodeLocation(
  query: string,
  userLocation?: { lat: number; lng: number } | null,
): Promise<GeocodedPlace[]> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token || !query.trim()) return [];
  const proxLng = userLocation?.lng ?? AUSTIN_LNG;
  const proxLat = userLocation?.lat ?? AUSTIN_LAT;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${token}&types=place,address,poi,postcode&country=us&limit=5&proximity=${proxLng},${proxLat}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? []).map((f: any) => ({
      name: f.place_name ?? '',
      lat: f.center[1],
      lng: f.center[0],
    }));
  } catch {
    return [];
  }
}

/**
 * Reverse geocode coordinates to a place name via Mapbox Places API.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) return 'Unknown location';
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${token}&types=place`;
  try {
    const res = await fetch(url);
    if (!res.ok) return 'Unknown location';
    const json = await res.json();
    return json.features?.[0]?.place_name ?? 'Unknown location';
  } catch {
    return 'Unknown location';
  }
}
