// ---------------------------------------------------------------------------
// Shared haversine distance calculations
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_MILES = 3958.8;
const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_METERS = 6371000;

function haversineCore(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distance in miles between two lat/lng points */
export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return EARTH_RADIUS_MILES * haversineCore(lat1, lng1, lat2, lng2);
}

/** Distance in kilometers between two lat/lng points */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return EARTH_RADIUS_KM * haversineCore(lat1, lng1, lat2, lng2);
}

/** Distance in meters between two lat/lng points */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return EARTH_RADIUS_METERS * haversineCore(lat1, lng1, lat2, lng2);
}
