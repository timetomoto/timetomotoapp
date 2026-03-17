// ---------------------------------------------------------------------------
// Tomorrow.io weather API helpers
// ---------------------------------------------------------------------------

const API_KEY = process.env.EXPO_PUBLIC_TOMORROW_API_KEY ?? '';
const BASE = 'https://api.tomorrow.io/v4';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CurrentWeather {
  temperature: number;
  temperatureApparent: number;
  windSpeed: number;
  windDirection: number;
  humidity: number;
  visibility: number;
  weatherCode: number;
  fetchedAt: number;
}

export interface HourlySlot {
  time: string;          // ISO string
  temperature: number;
  weatherCode: number;
  precipitationProbability: number;
}

export interface DailySlot {
  time: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  precipitationProbability: number;
}

export interface WeatherAlert {
  id: string;
  title: string;
  description: string;
  severity: string;
  affectedArea: string;
  startTime: string;
  endTime: string;
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlySlot[];
  daily: DailySlot[];
  alerts: WeatherAlert[];
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cache: { data: WeatherData; key: string; ts: number } | null = null;

function cacheKey(lat: number, lng: number) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Wind direction label
// ---------------------------------------------------------------------------

export function windDirLabel(degrees: number): string {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

// ---------------------------------------------------------------------------
// Tomorrow.io weather codes → human labels + icon names (Feather/Ionicons)
// ---------------------------------------------------------------------------

interface CodeMeta { label: string; icon: string; iconSet: 'Feather' | 'Ionicons' }

const CODE_MAP: Record<number, CodeMeta> = {
  1000: { label: 'Clear',           icon: 'sun',          iconSet: 'Feather'  },
  1100: { label: 'Mostly Clear',    icon: 'sun',          iconSet: 'Feather'  },
  1101: { label: 'Partly Cloudy',   icon: 'cloud',        iconSet: 'Feather'  },
  1102: { label: 'Mostly Cloudy',   icon: 'cloud',        iconSet: 'Feather'  },
  1001: { label: 'Cloudy',          icon: 'cloud',        iconSet: 'Feather'  },
  2000: { label: 'Fog',             icon: 'wind',         iconSet: 'Feather'  },
  2100: { label: 'Light Fog',       icon: 'wind',         iconSet: 'Feather'  },
  4000: { label: 'Drizzle',         icon: 'cloud-drizzle',iconSet: 'Feather'  },
  4001: { label: 'Rain',            icon: 'cloud-rain',   iconSet: 'Feather'  },
  4200: { label: 'Light Rain',      icon: 'cloud-rain',   iconSet: 'Feather'  },
  4201: { label: 'Heavy Rain',      icon: 'cloud-rain',   iconSet: 'Feather'  },
  5000: { label: 'Snow',            icon: 'cloud-snow',   iconSet: 'Feather'  },
  5001: { label: 'Flurries',        icon: 'cloud-snow',   iconSet: 'Feather'  },
  5100: { label: 'Light Snow',      icon: 'cloud-snow',   iconSet: 'Feather'  },
  5101: { label: 'Heavy Snow',      icon: 'cloud-snow',   iconSet: 'Feather'  },
  6000: { label: 'Freezing Drizzle',icon: 'cloud-drizzle',iconSet: 'Feather'  },
  6001: { label: 'Freezing Rain',   icon: 'cloud-rain',   iconSet: 'Feather'  },
  6200: { label: 'Light Freezing',  icon: 'cloud-rain',   iconSet: 'Feather'  },
  6201: { label: 'Heavy Freezing',  icon: 'cloud-rain',   iconSet: 'Feather'  },
  7000: { label: 'Ice Pellets',     icon: 'cloud-snow',   iconSet: 'Feather'  },
  7101: { label: 'Heavy Ice',       icon: 'cloud-snow',   iconSet: 'Feather'  },
  7102: { label: 'Light Ice',       icon: 'cloud-snow',   iconSet: 'Feather'  },
  8000: { label: 'Thunderstorm',    icon: 'cloud-lightning',iconSet: 'Feather'},
};

const FALLBACK: CodeMeta = { label: 'Unknown', icon: 'cloud', iconSet: 'Feather' };

export function codeMeta(code: number): CodeMeta {
  return CODE_MAP[code] ?? FALLBACK;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchRealtime(lat: number, lng: number): Promise<CurrentWeather> {
  const fields = [
    'temperature','temperatureApparent','windSpeed','windDirection',
    'humidity','visibility','weatherCode',
  ].join(',');
  const url =
    `${BASE}/weather/realtime?location=${lat},${lng}&units=imperial&fields=${fields}&apikey=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Realtime HTTP ${res.status}`);
  const json = await res.json();
  return { ...json.data.values, fetchedAt: Date.now() };
}

async function fetchForecast(lat: number, lng: number) {
  const fields = [
    'temperature','weatherCode','precipitationProbability',
    'temperatureMax','temperatureMin',
  ].join(',');
  const url =
    `${BASE}/weather/forecast?location=${lat},${lng}&units=imperial&timesteps=1h,1d&fields=${fields}&apikey=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Forecast HTTP ${res.status}`);
  const json = await res.json();

  const hourly: HourlySlot[] = (json.timelines?.hourly ?? [])
    .slice(0, 12)
    .map((h: any) => ({
      time: h.time,
      temperature: h.values.temperature,
      weatherCode: h.values.weatherCode,
      precipitationProbability: h.values.precipitationProbability ?? 0,
    }));

  const daily: DailySlot[] = (json.timelines?.daily ?? [])
    .slice(0, 5)
    .map((d: any) => ({
      time: d.time,
      temperatureMax: d.values.temperatureMax,
      temperatureMin: d.values.temperatureMin,
      weatherCode: d.values.weatherCode,
      precipitationProbability: d.values.precipitationProbability ?? 0,
    }));

  return { hourly, daily };
}

async function fetchAlerts(lat: number, lng: number): Promise<WeatherAlert[]> {
  try {
    const url =
      `${BASE}/weather/alerts?location=${lat},${lng}&apikey=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data?.events ?? []).map((e: any) => ({
      id: e.id ?? String(Math.random()),
      title: e.title ?? e.eventType ?? 'Weather Alert',
      description: e.description ?? '',
      severity: e.severity ?? 'Advisory',
      affectedArea: e.affectedArea ?? '',
      startTime: e.startTime ?? '',
      endTime: e.endTime ?? '',
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main fetch — with cache
// Accepts either lat/lng coords OR a freeform location string (city name etc.)
// ---------------------------------------------------------------------------

export async function fetchWeather(
  lat: number,
  lng: number,
  force = false,
): Promise<WeatherData> {
  const key = cacheKey(lat, lng);
  if (!force && cache && cache.key === key && Date.now() - cache.ts < CACHE_TTL) {
    return cache.data;
  }

  const [current, { hourly, daily }, alerts] = await Promise.all([
    fetchRealtime(lat, lng),
    fetchForecast(lat, lng),
    fetchAlerts(lat, lng),
  ]);

  const data: WeatherData = { current, hourly, daily, alerts, fetchedAt: Date.now() };
  cache = { data, key, ts: Date.now() };
  return data;
}

// Fetch by freeform location string — Tomorrow.io accepts city names, zip codes, etc.
// Returns coords from the API response for cache keying.
export async function fetchWeatherByLocation(
  location: string,
  force = false,
): Promise<{ data: WeatherData; lat: number; lng: number }> {
  const fields = [
    'temperature','temperatureApparent','windSpeed','windDirection',
    'humidity','visibility','weatherCode',
  ].join(',');
  const realtimeUrl =
    `${BASE}/weather/realtime?location=${encodeURIComponent(location)}&units=imperial&fields=${fields}&apikey=${API_KEY}`;
  const res = await fetch(realtimeUrl);
  if (!res.ok) throw new Error(`Location not found: "${location}"`);
  const json = await res.json();
  const lat: number = json.location?.lat ?? 0;
  const lng: number = json.location?.lon ?? 0;

  const key = cacheKey(lat, lng);
  if (!force && cache && cache.key === key && Date.now() - cache.ts < CACHE_TTL) {
    return { data: cache.data, lat, lng };
  }

  const current: CurrentWeather = { ...json.data.values, fetchedAt: Date.now() };
  const [{ hourly, daily }, alerts] = await Promise.all([
    fetchForecast(lat, lng),
    fetchAlerts(lat, lng),
  ]);

  const data: WeatherData = { current, hourly, daily, alerts, fetchedAt: Date.now() };
  cache = { data, key, ts: Date.now() };
  return { data, lat, lng };
}
