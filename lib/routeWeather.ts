import AsyncStorage from '@react-native-async-storage/async-storage';
import { codeMeta } from './weather';

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
// Settings helpers
// ---------------------------------------------------------------------------

async function getTempUnit(): Promise<'fahrenheit' | 'celsius'> {
  try {
    const val = await AsyncStorage.getItem('ttm_units_temp');
    return val === 'celsius' ? 'celsius' : 'fahrenheit';
  } catch {
    return 'fahrenheit';
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
// Coordinate sampling — pick points every ~25-30km along the route
// ---------------------------------------------------------------------------

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
// Open-Meteo weather fetch for route checkpoints
// ---------------------------------------------------------------------------

type PointWeather = { temp: number; weatherCode: number; rainChance: number; wind: number };

async function fetchPointWeather(
  lat: number,
  lng: number,
  tempUnit: 'fahrenheit' | 'celsius',
  departureDate?: Date,
  hourOffset?: number,
): Promise<PointWeather> {
  const windUnit = tempUnit === 'celsius' ? 'kmh' : 'mph';

  // If departure is provided and not right now, use hourly forecast for that time
  const useHourly = departureDate && (
    departureDate.toDateString() !== new Date().toDateString() ||
    Math.abs(departureDate.getTime() - Date.now()) > 2 * 3600_000
  );

  let url: string;
  if (useHourly) {
    const targetDate = new Date(departureDate.getTime() + (hourOffset ?? 0) * 3600_000);
    const dateStr = targetDate.toISOString().split('T')[0];
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&hourly=temperature_2m,weathercode,precipitation_probability,windspeed_10m` +
      `&start_date=${dateStr}&end_date=${dateStr}` +
      `&temperature_unit=${tempUnit}&windspeed_unit=${windUnit}&timezone=auto`;
  } else {
    url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=temperature_2m,weathercode,precipitation_probability,windspeed_10m` +
      `&temperature_unit=${tempUnit}&windspeed_unit=${windUnit}&timezone=auto`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (useHourly && json.hourly) {
      const targetDate = new Date(departureDate.getTime() + (hourOffset ?? 0) * 3600_000);
      const targetHour = targetDate.getHours();
      const h = json.hourly;
      const idx = Math.min(targetHour, (h.time?.length ?? 1) - 1);
      return {
        temp: Math.round(Number(h.temperature_2m?.[idx]) || 0),
        weatherCode: Number(h.weathercode?.[idx]) || 0,
        rainChance: Number(h.precipitation_probability?.[idx]) || 0,
        wind: Math.round(Number(h.windspeed_10m?.[idx]) || 0),
      };
    }

    const c = json.current ?? {};
    return {
      temp: Math.round(Number(c.temperature_2m) || 0),
      weatherCode: Number(c.weathercode) || 0,
      rainChance: Number(c.precipitation_probability) || 0,
      wind: Math.round(Number(c.windspeed_10m) || 0),
    };
  } catch {
    clearTimeout(timer);
    return { temp: 0, weatherCode: 0, rainChance: 0, wind: 0 };
  }
}

// ---------------------------------------------------------------------------
// Main function — fetch weather for sampled route points
// ---------------------------------------------------------------------------

export async function fetchRouteWeather(
  coordinates: [number, number][],
  departureDate?: Date,
  routeDurationSec?: number,
): Promise<{ points: RouteWeatherPoint[]; useCelsius: boolean; useMiles: boolean }> {
  const samples = sampleRouteCoordinates(coordinates);
  if (samples.length === 0) return { points: [], useCelsius: false, useMiles: true };

  const tempUnit = await getTempUnit();
  const distUnit = await getDistanceUnit();
  const useCelsius = tempUnit === 'celsius';
  const useMiles = distUnit === 'miles';

  const totalDistKm = samples[samples.length - 1]?.distanceKm ?? 1;
  const totalHours = (routeDurationSec ?? 0) / 3600;

  // Fetch sequentially with 300ms delay to be polite to free API
  const weatherData: PointWeather[] = [];
  for (let i = 0; i < samples.length; i++) {
    // Estimate hours into the ride for this checkpoint
    const progress = totalDistKm > 0 ? (samples[i].distanceKm / totalDistKm) : 0;
    const hourOffset = totalHours > 0 ? progress * totalHours : 0;
    const w = await fetchPointWeather(samples[i].lat, samples[i].lng, tempUnit, departureDate, hourOffset);
    weatherData.push(w);
    if (i < samples.length - 1) await new Promise((r) => setTimeout(r, 300));
  }

  const points = samples.map((s, i) => {
    const weather = weatherData[i] ?? { temp: 0, weatherCode: 0, rainChance: 0, wind: 0 };
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
      p.weatherCode >= 51 || // any precipitation WMO code
      p.temp < freezeThreshold ||
      p.wind > (useCelsius ? 56 : 35),
  );
}

export function getRouteWarningMessage(points: RouteWeatherPoint[], useCelsius: boolean): string | null {
  const freezeThreshold = useCelsius ? 2 : 35;
  const windThreshold = useCelsius ? 56 : 35;

  const thunder = points.find((p) => p.weatherCode >= 95);
  if (thunder) return `Thunderstorms near ${thunder.label}`;

  const snow = points.find((p) => p.weatherCode >= 71 && p.weatherCode <= 77 || p.weatherCode >= 85 && p.weatherCode <= 86);
  if (snow) return `Snow conditions near ${snow.label}`;

  const freezing = points.find((p) => p.weatherCode >= 56 && p.weatherCode <= 57 || p.weatherCode >= 66 && p.weatherCode <= 67);
  if (freezing) return `Freezing rain near ${freezing.label}`;

  const cold = points.find((p) => p.temp < freezeThreshold && p.temp > 0);
  if (cold) return `Below freezing near ${cold.label} — risk of ice`;

  const rain = points.find((p) => p.rainChance > 30);
  if (rain) return `Rain expected near ${rain.label} (${rain.rainChance}%)`;

  const windy = points.find((p) => p.wind > windThreshold);
  if (windy) return `High winds near ${windy.label} (${windy.wind} ${useCelsius ? 'km/h' : 'mph'})`;

  return null;
}
