// ---------------------------------------------------------------------------
// Ride Window Planner — route segmentation + per-segment weather forecast
// ---------------------------------------------------------------------------

import * as Location from 'expo-location';

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

import { haversineMiles as haversine } from './distance';
export { haversine };

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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&hourly=temperature_2m,weathercode,precipitation_probability,windspeed_10m` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=3`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const times: string[] = json.hourly?.time ?? [];
  const temps: number[] = json.hourly?.temperature_2m ?? [];
  const codes: number[] = json.hourly?.weathercode ?? [];
  const precip: number[] = json.hourly?.precipitation_probability ?? [];
  const winds: number[] = json.hourly?.windspeed_10m ?? [];

  if (!times.length) throw new Error('No hourly data');

  // Find closest time slot to target
  const target = targetTime.getTime();
  let bestIdx = 0;
  let bestDiff = Math.abs(new Date(times[0]).getTime() - target);
  for (let i = 1; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]).getTime() - target);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  }

  return {
    temperature: temps[bestIdx] ?? 0,
    weatherCode: codes[bestIdx] ?? 0,
    precipProbability: precip[bestIdx] ?? 0,
    windSpeed: winds[bestIdx] ?? 0,
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

  // Fetch segments sequentially with delay to avoid 429 rate limiting
  const segments: RouteSegment[] = [];
  for (let i = 0; i < numSegments; i++) {
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

    segments.push({ name, startMile, endMile, midLat, midLng, eta, ...weather, risk } as RouteSegment);

    // Stagger to avoid 429
    if (i < numSegments - 1) await new Promise((r) => setTimeout(r, 500));
  }
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
