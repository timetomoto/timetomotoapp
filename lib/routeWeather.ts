import AsyncStorage from '@react-native-async-storage/async-storage';
import { codeMeta } from './weather';

const WINDY_KEY = process.env.EXPO_PUBLIC_WINDY_API_KEY ?? '';
const TOMORROW_KEY = process.env.EXPO_PUBLIC_TOMORROW_API_KEY ?? '';
const TOMORROW_BASE = 'https://api.tomorrow.io/v4';
const WINDY_URL = 'https://api.windy.com/api/point-forecast/v2';

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

type PointWeather = { temp: number; weatherCode: number; rainChance: number; wind: number };

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

  const last = coordinates[coordinates.length - 1];
  const lastSample = samples[samples.length - 1];
  if (haversineKm(lastSample.lat, lastSample.lng, last[1], last[0]) > 5) {
    samples.push({ lng: last[0], lat: last[1], distanceKm: Math.round(accumulated) });
  }

  if (samples.length > 8) {
    const step = Math.ceil(samples.length / 8);
    const filtered = samples.filter((_, i) => i === 0 || i === samples.length - 1 || i % step === 0);
    return filtered.slice(0, 8);
  }

  return samples;
}

// ---------------------------------------------------------------------------
// Windy — primary source
// ---------------------------------------------------------------------------

function kelvinToF(k: number): number { return (k - 273.15) * 9 / 5 + 32; }
function kelvinToC(k: number): number { return k - 273.15; }

/** Derive a Tomorrow.io-compatible weather code from Windy data */
function deriveWeatherCode(precipMm: number, snowMm: number, windMph: number): number {
  if (snowMm > 1) return 5001; // Heavy snow
  if (snowMm > 0) return 5000; // Snow
  if (precipMm > 5) return 4201; // Heavy rain
  if (precipMm > 1) return 4001; // Rain
  if (precipMm > 0.1) return 4200; // Light rain
  if (precipMm > 0) return 4000; // Drizzle
  if (windMph > 40) return 1001; // Cloudy (windy)
  return 1000; // Clear
}

async function fetchWindyPoint(
  lat: number,
  lng: number,
  useCelsius: boolean,
): Promise<PointWeather> {
  const res = await fetch(WINDY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat,
      lon: lng,
      model: 'gfs',
      parameters: ['temp', 'precip', 'snowPrecip', 'wind'],
      levels: ['surface'],
      key: WINDY_KEY,
    }),
  });

  if (!res.ok) throw new Error(`Windy HTTP ${res.status}`);
  const json = await res.json();

  // Find the timestamp index closest to now
  const ts: number[] = json.ts ?? [];
  const now = Date.now();
  const idx = ts.length > 0
    ? ts.reduce((best, t, i) => Math.abs(t - now) < Math.abs(ts[best] - now) ? i : best, 0)
    : 0;

  const tempK = json['temp-surface']?.[idx] ?? 273.15;
  const precipMm = json['precip-surface']?.[idx] ?? 0;
  const snowMm = json['snowPrecip-surface']?.[idx] ?? 0;
  const windU = json['wind_u-surface']?.[idx] ?? 0;
  const windV = json['wind_v-surface']?.[idx] ?? 0;

  const windMs = Math.sqrt(windU * windU + windV * windV);
  const windMph = windMs * 2.237;
  const windKmh = windMs * 3.6;
  const temp = useCelsius ? kelvinToC(tempK) : kelvinToF(tempK);
  const weatherCode = deriveWeatherCode(precipMm, snowMm, windMph);

  const rainChance = precipMm > 2 ? 80 : precipMm > 0.5 ? 60 : precipMm > 0.1 ? 40 : precipMm > 0 ? 20 : 0;

  return {
    temp: Math.round(temp),
    weatherCode,
    rainChance,
    wind: Math.round(useCelsius ? windKmh : windMph),
  };
}

async function fetchWindyBatch(
  samples: { lat: number; lng: number }[],
  useCelsius: boolean,
): Promise<PointWeather[]> {
  const results = await Promise.allSettled(
    samples.map((s) => fetchWindyPoint(s.lat, s.lng, useCelsius)),
  );

  const data = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { temp: 0, weatherCode: 1000, rainChance: 0, wind: 0 },
  );

  // If all failed (all zeros), throw to trigger fallback
  if (data.every((d) => d.temp === 0 && d.weatherCode === 1000 && d.rainChance === 0 && d.wind === 0)) {
    throw new Error('All Windy fetches returned defaults');
  }

  return data;
}

// ---------------------------------------------------------------------------
// Tomorrow.io — fallback
// ---------------------------------------------------------------------------

async function fetchTomorrowFallback(
  samples: { lat: number; lng: number }[],
  units: 'imperial' | 'metric',
): Promise<PointWeather[]> {
  const fields = 'temperature,weatherCode,precipitationProbability,windSpeed';
  const results: PointWeather[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    try {
      const url = `${TOMORROW_BASE}/weather/realtime?location=${s.lat.toFixed(4)},${s.lng.toFixed(4)}&units=${units}&fields=${fields}&apikey=${TOMORROW_KEY}`;
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
    // Stagger to avoid 429
    if (i < samples.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main function — Windy primary, Tomorrow.io fallback
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

  let weatherData: PointWeather[];

  // Try Windy first
  if (WINDY_KEY) {
    try {
      weatherData = await fetchWindyBatch(samples, useCelsius);
    } catch {
      // Windy failed — fall back to Tomorrow.io
      weatherData = await fetchTomorrowFallback(samples, units);
    }
  } else {
    // No Windy key — use Tomorrow.io
    weatherData = await fetchTomorrowFallback(samples, units);
  }

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
// Warning helpers
// ---------------------------------------------------------------------------

export function hasRouteWeatherConcern(points: RouteWeatherPoint[], useCelsius: boolean): boolean {
  const freezeThreshold = useCelsius ? 2 : 35;
  return points.some(
    (p) =>
      p.rainChance > 30 ||
      p.weatherCode >= 5000 ||
      p.temp < freezeThreshold ||
      p.wind > (useCelsius ? 56 : 35),
  );
}

export function getRouteWarningMessage(points: RouteWeatherPoint[], useCelsius: boolean): string | null {
  const freezeThreshold = useCelsius ? 2 : 35;
  const windThreshold = useCelsius ? 56 : 35;

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
