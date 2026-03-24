// ---------------------------------------------------------------------------
// Shared Mapbox geocoding helpers
// Extracted from discoverStore.ts for reuse across Scout, Trip Planner, etc.
// ---------------------------------------------------------------------------

const AUSTIN_LNG = -97.7431;
const AUSTIN_LAT = 30.2672;
const CACHE_MAX = 50;

export interface GeocodedPlace {
  name: string;
  lat: number;
  lng: number;
}

// In-memory geocoding cache — resets on app restart
const forwardCache = new Map<string, GeocodedPlace[]>();
const reverseCache = new Map<string, string>();

function cacheSet<V>(cache: Map<string, V>, key: string, value: V) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
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

  const cacheKey = query.toLowerCase().trim();
  const cached = forwardCache.get(cacheKey);
  if (cached) return cached;

  const proxLng = userLocation?.lng ?? AUSTIN_LNG;
  const proxLat = userLocation?.lat ?? AUSTIN_LAT;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${token}&types=place,address,poi,postcode&country=us&limit=5&proximity=${proxLng},${proxLat}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const results: GeocodedPlace[] = (json.features ?? []).map((f: any) => ({
      name: f.place_name ?? '',
      lat: f.center[1],
      lng: f.center[0],
    }));
    if (results.length > 0) cacheSet(forwardCache, cacheKey, results);
    return results;
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

  // Round to 3 decimals (~100m precision) for cache key
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached) return cached;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${token}&types=place`;
  try {
    const res = await fetch(url);
    if (!res.ok) return 'Unknown location';
    const json = await res.json();
    const name = json.features?.[0]?.place_name ?? 'Unknown location';
    if (name !== 'Unknown location') cacheSet(reverseCache, cacheKey, name);
    return name;
  } catch {
    return 'Unknown location';
  }
}

/**
 * Reverse geocode to a street address (more detailed than reverseGeocode).
 * Returns full address if available, falls back to place name, then coordinates.
 */
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<string> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  const cacheKey = `addr_${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached) return cached;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${token}&types=address,poi,place&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const json = await res.json();
    const name = json.features?.[0]?.place_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    cacheSet(reverseCache, cacheKey, name);
    return name;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
