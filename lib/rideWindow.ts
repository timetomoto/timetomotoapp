// ---------------------------------------------------------------------------
// Ride Window Planner — route segmentation + per-segment weather forecast
// ---------------------------------------------------------------------------

import * as Location from 'expo-location';

const API_KEY = process.env.EXPO_PUBLIC_TOMORROW_API_KEY ?? '';
const BASE = 'https://api.tomorrow.io/v4';
const AVG_SPEED_MPH = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = 'CLEAR' | 'WATCH' | 'WARNING' | 'DANGER';

export interface RouteSegment {
  name: string;
  startMile: number;
  endMile: number;
  midLat: number;
  midLng: number;
  eta: Date;
  temperature: number;
  weatherCode: number;
  precipProbability: number;
  windSpeed: number;
  risk: RiskLevel;
}

export interface RideWindowResult {
  fromLabel: string;
  toLabel: string;
  totalMiles: number;
  estimatedHours: number;
  departureTime: Date;
  segments: RouteSegment[];
  recommendation: string;
  plannedAt: number;
}

export interface GeoPlace {
  lat: number;
  lng: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Haversine distance (miles)
// ---------------------------------------------------------------------------

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
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
// Geocode a place string using expo-location (device geocoding — no API key)
// ---------------------------------------------------------------------------

export async function geocodePlace(query: string): Promise<GeoPlace | null> {
  try {
    const results = await Location.geocodeAsync(query);
    if (!results.length) return null;
    const r = results[0];
    const [place] = await Location.reverseGeocodeAsync(
      { latitude: r.latitude, longitude: r.longitude },
    );
    const city = place?.city || place?.subregion || place?.region || '';
    const region = place?.region || '';
    const label = city && region ? `${city}, ${region}` : city || region || query;
    return { lat: r.latitude, lng: r.longitude, label };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch hourly forecast for a point, return slot closest to targetTime
// ---------------------------------------------------------------------------

async function fetchSegmentWeather(
  lat: number,
  lng: number,
  targetTime: Date,
): Promise<{ temperature: number; weatherCode: number; precipProbability: number; windSpeed: number }> {
  const fields = ['temperature', 'weatherCode', 'precipitationProbability', 'windSpeed'].join(',');
  const url =
    `${BASE}/weather/forecast?location=${lat},${lng}&units=imperial&timesteps=1h&fields=${fields}&apikey=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const hourly: any[] = json.timelines?.hourly ?? [];
  if (!hourly.length) throw new Error('No hourly data');

  const target = targetTime.getTime();
  let best = hourly[0];
  let bestDiff = Math.abs(new Date(best.time).getTime() - target);
  for (const slot of hourly.slice(1)) {
    const diff = Math.abs(new Date(slot.time).getTime() - target);
    if (diff < bestDiff) { best = slot; bestDiff = diff; }
  }

  return {
    temperature: best.values.temperature ?? 0,
    weatherCode: best.values.weatherCode ?? 1000,
    precipProbability: best.values.precipitationProbability ?? 0,
    windSpeed: best.values.windSpeed ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Risk logic
// ---------------------------------------------------------------------------

function calcRisk(weatherCode: number, precipProbability: number, windSpeed: number): RiskLevel {
  if (weatherCode === 8000) return 'DANGER';
  if (precipProbability > 60) return 'WARNING';
  if (precipProbability > 30 || windSpeed > 30) return 'WATCH';
  return 'CLEAR';
}

function buildRecommendation(segments: RouteSegment[]): string {
  const risks = segments.map((s) => s.risk);
  if (risks.includes('DANGER')) {
    return 'Severe weather detected along your route. Strongly consider rescheduling or taking an alternate route.';
  }
  if (risks.includes('WARNING')) {
    return 'Significant precipitation expected on parts of your route. Gear up for wet roads and reduced visibility.';
  }
  if (risks.includes('WATCH')) {
    return 'Some precipitation is possible. Keep an eye on conditions and be ready to adjust your plans.';
  }
  return 'Conditions look favorable for your ride. Stay safe and enjoy the road.';
}

// ---------------------------------------------------------------------------
// Main planner
// ---------------------------------------------------------------------------

export async function planRideWindow(
  from: GeoPlace,
  to: GeoPlace,
  departureTime: Date,
): Promise<RideWindowResult> {
  const totalMiles = haversine(from.lat, from.lng, to.lat, to.lng);
  const estimatedHours = totalMiles / AVG_SPEED_MPH;

  const numSegments = totalMiles < 60 ? 4 : totalMiles < 200 ? 6 : 8;

  const segmentPromises = Array.from({ length: numSegments }, async (_, i) => {
    const startFrac = i / numSegments;
    const endFrac = (i + 1) / numSegments;
    const midFrac = (startFrac + endFrac) / 2;

    const midLat = from.lat + (to.lat - from.lat) * midFrac;
    const midLng = from.lng + (to.lng - from.lng) * midFrac;

    const startMile = Math.round(startFrac * totalMiles);
    const endMile = Math.round(endFrac * totalMiles);

    const hoursToMid = (midFrac * totalMiles) / AVG_SPEED_MPH;
    const eta = new Date(departureTime.getTime() + hoursToMid * 3_600_000);

    let weather: Awaited<ReturnType<typeof fetchSegmentWeather>>;
    try {
      weather = await fetchSegmentWeather(midLat, midLng, eta);
    } catch {
      weather = { temperature: 0, weatherCode: 1000, precipProbability: 0, windSpeed: 0 };
    }

    const risk = calcRisk(weather.weatherCode, weather.precipProbability, weather.windSpeed);

    const name =
      i === 0 ? `Near ${from.label}`
      : i === numSegments - 1 ? `Near ${to.label}`
      : `Mile ${startMile}–${endMile}`;

    return { name, startMile, endMile, midLat, midLng, eta, ...weather, risk } as RouteSegment;
  });

  const segments = await Promise.all(segmentPromises);
  const recommendation = buildRecommendation(segments);

  return {
    fromLabel: from.label,
    toLabel: to.label,
    totalMiles,
    estimatedHours,
    departureTime,
    segments,
    recommendation,
    plannedAt: Date.now(),
  };
}
