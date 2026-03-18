import type { NavRoute, NavStep, RoutePreference } from './navigationStore';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

// ---------------------------------------------------------------------------
// Step type parsing
// ---------------------------------------------------------------------------

function parseStepType(maneuver: { type: string; modifier?: string }): NavStep['type'] {
  const { type, modifier } = maneuver;
  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return 'depart';
  if (type === 'roundabout' || type === 'rotary') return 'roundabout';
  if (type === 'merge') return 'merge';
  if (type === 'fork') return 'fork';
  if (type === 'off ramp') return 'off_ramp';
  if (type === 'on ramp') return 'on_ramp';
  if (type === 'end of road') return 'end_of_road';
  if (type === 'exit roundabout' || type === 'exit rotary') return 'exit_highway';
  if (modifier === 'left' || modifier === 'sharp left' || modifier === 'slight left') return 'turn_left';
  if (modifier === 'right' || modifier === 'sharp right' || modifier === 'slight right') return 'turn_right';
  if (modifier === 'straight' || type === 'continue') return 'continue';
  return 'continue';
}

// ---------------------------------------------------------------------------
// fetchDirections
// ---------------------------------------------------------------------------

export async function fetchDirections(
  originLng: number,
  originLat: number,
  destLng: number,
  destLat: number,
  preference: RoutePreference = 'fastest',
  waypoints?: { lng: number; lat: number }[],
): Promise<NavRoute[]> {
  const profile = preference === 'offroad' ? 'cycling' : 'driving';

  const params = new URLSearchParams({
    access_token: TOKEN,
    geometries: 'geojson',
    steps: 'true',
    overview: 'full',
    alternatives: waypoints && waypoints.length > 0 ? 'false' : 'true',
    language: 'en',
  });

  // Apply route preference via avoid params
  if (preference === 'scenic') {
    params.set('exclude', 'motorway,ferry');
  } else if (preference === 'no_highway') {
    params.set('exclude', 'motorway');
  } else if (preference === 'no_tolls') {
    params.set('exclude', 'toll');
  }

  // Build coordinate string with optional waypoints
  const coordParts = [`${originLng},${originLat}`];
  if (waypoints) {
    for (const wp of waypoints) {
      coordParts.push(`${wp.lng},${wp.lat}`);
    }
  }
  coordParts.push(`${destLng},${destLat}`);
  const coordString = coordParts.join(';');

  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordString}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Directions API error: ${res.status}`);
  }
  const json = await res.json();

  if (!json.routes || json.routes.length === 0) {
    throw new Error('No routes found');
  }

  return json.routes.map((r: any): NavRoute => {
    const leg = r.legs?.[0];
    const steps: NavStep[] = (leg?.steps ?? []).map((s: any): NavStep => {
      const maneuver = s.maneuver ?? {};
      const road = s.name || s.ref || '';
      const distanceMiles = (s.distance ?? 0) / 1609.344;
      const stepType = parseStepType(maneuver);
      const maneuverLocation: [number, number] | undefined =
        maneuver.location ? [maneuver.location[0], maneuver.location[1]] : undefined;

      return {
        type: stepType,
        road,
        distanceMiles,
        instruction: maneuver.instruction ?? s.instruction ?? '',
        maneuverLocation,
      };
    });

    // Cycling profile returns bicycle ETAs — scale down for motorcycle on back roads
    const rawDuration = r.duration ?? 0;
    const adjustedDuration = profile === 'cycling' ? rawDuration / 3.5 : rawDuration;

    return {
      geometry: r.geometry as { type: 'LineString'; coordinates: [number, number][] },
      steps,
      distanceMiles: (r.distance ?? 0) / 1609.344,
      durationSeconds: adjustedDuration,
    };
  });
}

// ---------------------------------------------------------------------------
// haversineMeters
// ---------------------------------------------------------------------------

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// distanceToSegmentMeters — point-to-segment distance
// ---------------------------------------------------------------------------

function distanceToSegmentMeters(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dx = bLng - aLng;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return haversineMeters(pLat, pLng, aLat, aLng);
  }

  let t = ((pLng - aLng) * dx + (pLat - aLat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestLat = aLat + t * dy;
  const closestLng = aLng + t * dx;

  return haversineMeters(pLat, pLng, closestLat, closestLng);
}

// ---------------------------------------------------------------------------
// distanceToRouteMeters
// ---------------------------------------------------------------------------

export function distanceToRouteMeters(
  lat: number,
  lng: number,
  routeCoords: [number, number][],
): number {
  if (routeCoords.length < 2) return Infinity;

  let minDist = Infinity;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const [aLng, aLat] = routeCoords[i];
    const [bLng, bLat] = routeCoords[i + 1];
    const d = distanceToSegmentMeters(lat, lng, aLat, aLng, bLat, bLng);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// ---------------------------------------------------------------------------
// findNextStepIndex
// ---------------------------------------------------------------------------

export function findNextStepIndex(
  lat: number,
  lng: number,
  steps: NavStep[],
  currentIndex: number,
): number {
  // Look ahead up to 2 steps
  for (let i = currentIndex + 1; i < Math.min(currentIndex + 3, steps.length); i++) {
    const step = steps[i];
    if (!step.maneuverLocation) continue;
    const [mLng, mLat] = step.maneuverLocation;
    const dist = haversineMeters(lat, lng, mLat, mLng);
    if (dist < 30) {
      return i;
    }
  }
  return currentIndex;
}
