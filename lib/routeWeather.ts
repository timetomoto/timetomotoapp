import AsyncStorage from '@react-native-async-storage/async-storage';
import { codeMeta } from './weather';

const API_KEY = process.env.EXPO_PUBLIC_TOMORROW_API_KEY ?? '';
const BASE = 'https://api.tomorrow.io/v4';

async function getTempUnit(): Promise<'imperial' | 'metric'> {
  try {
    const val = await AsyncStorage.getItem('ttm_units_temp');
    return val === 'celsius' ? 'metric' : 'imperial';
  } catch {
    return 'imperial';
  }
}

async function getDistanceUnit(): Promise<'miles' | 'kilometers'> {
  try {
    const val = await AsyncStorage.getItem('ttm_units_distance');
    return val === 'kilometers' ? 'kilometers' : 'miles';
  } catch {
    return 'miles';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteWeatherPoint {
  latitude: number;
  longitude: number;
  label: string;
  temp: number;
  weatherCode: number;
  icon: string;
  rainChance: number;
  wind: number;
  distanceKm: number;
}

// ---------------------------------------------------------------------------
// Coordinate sampling — pick points every ~25-30km along the route
// ---------------------------------------------------------------------------

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sampleRouteCoordinates(
  coordinates: [number, number][],
  intervalKm = 28,
): { lat: number; lng: number; distanceKm: number }[] {
  if (coordinates.length < 2) return [];

  const samples: { lat: number; lng: number; distanceKm: number }[] = [];
  samples.push({ lng: coordinates[0][0], lat: coordinates[0][1], distanceKm: 0 });

  let accumulated = 0;
  let lastSampleDist = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1];
    const [lng2, lat2] = coordinates[i];
    accumulated += haversineKm(lat1, lng1, lat2, lng2);

    if (accumulated - lastSampleDist >= intervalKm) {
      samples.push({ lng: lng2, lat: lat2, distanceKm: Math.round(accumulated) });
      lastSampleDist = accumulated;
    }
  }

  // Always include the end if far enough from last sample
  const last = coordinates[coordinates.length - 1];
  const lastSample = samples[samples.length - 1];
  if (haversineKm(lastSample.lat, lastSample.lng, last[1], last[0]) > 5) {
    samples.push({ lng: last[0], lat: last[1], distanceKm: Math.round(accumulated) });
  }

  // Cap at 8 checkpoints
  if (samples.length > 8) {
    const step = Math.ceil(samples.length / 8);
    const filtered = samples.filter((_, i) => i === 0 || i === samples.length - 1 || i % step === 0);
    return filtered.slice(0, 8);
  }

  return samples;
}

// ---------------------------------------------------------------------------
// Batch weather fetch — single API call for all checkpoints
// ---------------------------------------------------------------------------

async function fetchBatchWeather(
  samples: { lat: number; lng: number }[],
  units: 'imperial' | 'metric',
): Promise<{ temp: number; weatherCode: number; rainChance: number; wind: number }[]> {
  const fields = ['temperature', 'weatherCode', 'precipitationProbability', 'windSpeed'];

  const body = samples.map((s) => ({
    location: `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`,
    fields,
    timesteps: ['current'],
    units,
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${BASE}/timelines?apikey=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      // Batch endpoint may not be available on free tier — fall back to individual
      const errBody = await res.text().catch(() => '');
      console.error(`[RouteWeather] Batch HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      return fallbackSequential(samples, units);
    }

    const json = await res.json();

    // Parse batch response — array of timeline results
    return (Array.isArray(json) ? json : json.data ?? []).map((item: any) => {
      const v = item?.data?.timelines?.[0]?.intervals?.[0]?.values
        ?? item?.timelines?.[0]?.intervals?.[0]?.values
        ?? item?.data?.values
        ?? {};
      return {
        temp: Math.round(Number(v.temperature) || 0),
        weatherCode: Number(v.weatherCode) || 1000,
        rainChance: Number(v.precipitationProbability) || 0,
        wind: Math.round(Number(v.windSpeed) || 0),
      };
    });
  } catch (e) {
    clearTimeout(timer);
    console.error('[RouteWeather] Batch failed, falling back to sequential:', e);
    return fallbackSequential(samples, units);
  }
}

// Fallback: sequential with delays (when batch endpoint isn't available)
async function fallbackSequential(
  samples: { lat: number; lng: number }[],
  units: 'imperial' | 'metric',
): Promise<{ temp: number; weatherCode: number; rainChance: number; wind: number }[]> {
  const fields = 'temperature,weatherCode,precipitationProbability,windSpeed';
  const results: { temp: number; weatherCode: number; rainChance: number; wind: number }[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    try {
      const url = `${BASE}/weather/realtime?location=${s.lat.toFixed(4)},${s.lng.toFixed(4)}&units=${units}&fields=${fields}&apikey=${API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const v = json.data?.values ?? {};
      results.push({
        temp: Math.round(Number(v.temperature) || 0),
        weatherCode: Number(v.weatherCode) || 1000,
        rainChance: Number(v.precipitationProbability) || 0,
        wind: Math.round(Number(v.windSpeed) || 0),
      });
    } catch {
      results.push({ temp: 0, weatherCode: 1000, rainChance: 0, wind: 0 });
    }
    // 1.5s delay between requests to avoid 429
    if (i < samples.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main function — fetch weather for sampled route points
// ---------------------------------------------------------------------------

export async function fetchRouteWeather(
  coordinates: [number, number][],
): Promise<{ points: RouteWeatherPoint[]; useCelsius: boolean; useMiles: boolean }> {
  const samples = sampleRouteCoordinates(coordinates);
  if (samples.length === 0) return { points: [], useCelsius: false, useMiles: true };

  const units = await getTempUnit();
  const distUnit = await getDistanceUnit();
  const useCelsius = units === 'metric';
  const useMiles = distUnit === 'miles';

  const weatherData = await fetchBatchWeather(samples, units);

  const points = samples.map((s, i) => {
    const weather = weatherData[i] ?? { temp: 0, weatherCode: 1000, rainChance: 0, wind: 0 };
    const meta = codeMeta(weather.weatherCode);
    return {
      latitude: s.lat,
      longitude: s.lng,
      label: s.distanceKm === 0 ? 'Start' : useMiles ? `${Math.round(s.distanceKm * 0.621)} mi` : `${s.distanceKm} km`,
      temp: weather.temp,
      weatherCode: weather.weatherCode,
      icon: meta.icon,
      rainChance: weather.rainChance,
      wind: weather.wind,
      distanceKm: s.distanceKm,
    };
  });
  return { points, useCelsius, useMiles };
}

// ---------------------------------------------------------------------------
// Check for weather warnings along route
// ---------------------------------------------------------------------------

/** Check if any checkpoint has concerning conditions worth showing */
export function hasRouteWeatherConcern(points: RouteWeatherPoint[], useCelsius: boolean): boolean {
  const freezeThreshold = useCelsius ? 2 : 35;
  return points.some(
    (p) =>
      p.rainChance > 30 ||
      p.weatherCode >= 5000 || // snow, freezing, ice, thunderstorm
      p.temp < freezeThreshold ||
      p.wind > (useCelsius ? 56 : 35),
  );
}

/** Generate a specific warning message for the most severe condition */
export function getRouteWarningMessage(points: RouteWeatherPoint[], useCelsius: boolean): string | null {
  const freezeThreshold = useCelsius ? 2 : 35;
  const windThreshold = useCelsius ? 56 : 35;

  // Check in severity order: thunderstorm > ice > snow > freezing > rain > wind
  const thunder = points.find((p) => p.weatherCode >= 8000);
  if (thunder) return `Thunderstorms near ${thunder.label}`;

  const ice = points.find((p) => p.weatherCode >= 7000 && p.weatherCode < 8000);
  if (ice) return `Icy conditions near ${ice.label}`;

  const freezing = points.find((p) => p.weatherCode >= 6000 && p.weatherCode < 7000);
  if (freezing) return `Freezing rain/sleet near ${freezing.label}`;

  const snow = points.find((p) => p.weatherCode >= 5000 && p.weatherCode < 6000);
  if (snow) return `Snow conditions near ${snow.label}`;

  const cold = points.find((p) => p.temp < freezeThreshold && p.temp > 0);
  if (cold) return `Below freezing near ${cold.label} — risk of ice`;

  const rain = points.find((p) => p.rainChance > 30);
  if (rain) return `Rain expected near ${rain.label} (${rain.rainChance}%)`;

  const windy = points.find((p) => p.wind > windThreshold);
  if (windy) return `High winds near ${windy.label} (${windy.wind} ${useCelsius ? 'km/h' : 'mph'})`;

  return null;
}
