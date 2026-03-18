// ---------------------------------------------------------------------------
// Open-Meteo weather API helpers (no API key required)
// Attribution: Weather data by Open-Meteo.com (CC BY 4.0)
// ---------------------------------------------------------------------------

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
  time: string;
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
// WMO weather codes → human labels + icon names
// ---------------------------------------------------------------------------

interface CodeMeta { label: string; icon: string; iconSet: 'Feather' | 'Ionicons' }

const WMO_MAP: Record<number, CodeMeta> = {
  0:  { label: 'Clear',           icon: 'sun',            iconSet: 'Feather' },
  1:  { label: 'Mostly Clear',    icon: 'sun',            iconSet: 'Feather' },
  2:  { label: 'Partly Cloudy',   icon: 'cloud',          iconSet: 'Feather' },
  3:  { label: 'Overcast',        icon: 'cloud',          iconSet: 'Feather' },
  45: { label: 'Fog',             icon: 'wind',           iconSet: 'Feather' },
  48: { label: 'Rime Fog',        icon: 'wind',           iconSet: 'Feather' },
  51: { label: 'Light Drizzle',   icon: 'cloud-drizzle',  iconSet: 'Feather' },
  53: { label: 'Drizzle',         icon: 'cloud-drizzle',  iconSet: 'Feather' },
  55: { label: 'Heavy Drizzle',   icon: 'cloud-drizzle',  iconSet: 'Feather' },
  56: { label: 'Freezing Drizzle',icon: 'cloud-drizzle',  iconSet: 'Feather' },
  57: { label: 'Heavy Frz Drizzle',icon:'cloud-drizzle',  iconSet: 'Feather' },
  61: { label: 'Light Rain',      icon: 'cloud-rain',     iconSet: 'Feather' },
  63: { label: 'Rain',            icon: 'cloud-rain',     iconSet: 'Feather' },
  65: { label: 'Heavy Rain',      icon: 'cloud-rain',     iconSet: 'Feather' },
  66: { label: 'Freezing Rain',   icon: 'cloud-rain',     iconSet: 'Feather' },
  67: { label: 'Heavy Frz Rain',  icon: 'cloud-rain',     iconSet: 'Feather' },
  71: { label: 'Light Snow',      icon: 'cloud-snow',     iconSet: 'Feather' },
  73: { label: 'Snow',            icon: 'cloud-snow',     iconSet: 'Feather' },
  75: { label: 'Heavy Snow',      icon: 'cloud-snow',     iconSet: 'Feather' },
  77: { label: 'Snow Grains',     icon: 'cloud-snow',     iconSet: 'Feather' },
  80: { label: 'Light Showers',   icon: 'cloud-rain',     iconSet: 'Feather' },
  81: { label: 'Showers',         icon: 'cloud-rain',     iconSet: 'Feather' },
  82: { label: 'Heavy Showers',   icon: 'cloud-rain',     iconSet: 'Feather' },
  85: { label: 'Snow Showers',    icon: 'cloud-snow',     iconSet: 'Feather' },
  86: { label: 'Heavy Snow Shwrs',icon: 'cloud-snow',     iconSet: 'Feather' },
  95: { label: 'Thunderstorm',    icon: 'cloud-lightning', iconSet: 'Feather' },
  96: { label: 'T-Storm w/ Hail', icon: 'cloud-lightning', iconSet: 'Feather' },
  99: { label: 'Heavy T-Storm',   icon: 'cloud-lightning', iconSet: 'Feather' },
};

const FALLBACK: CodeMeta = { label: 'Unknown', icon: 'cloud', iconSet: 'Feather' };

export function codeMeta(code: number): CodeMeta {
  return WMO_MAP[code] ?? FALLBACK;
}

// ---------------------------------------------------------------------------
// Open-Meteo fetch helpers
// ---------------------------------------------------------------------------

const OM_BASE = 'https://api.open-meteo.com/v1/forecast';

async function fetchCurrent(lat: number, lng: number): Promise<CurrentWeather> {
  const url = `${OM_BASE}?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,winddirection_10m,relativehumidity_2m,visibility` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo current HTTP ${res.status}`);
  const json = await res.json();
  const c = json.current ?? {};
  return {
    temperature: c.temperature_2m ?? 0,
    temperatureApparent: c.apparent_temperature ?? c.temperature_2m ?? 0,
    windSpeed: c.windspeed_10m ?? 0,
    windDirection: c.winddirection_10m ?? 0,
    humidity: c.relativehumidity_2m ?? 0,
    visibility: (c.visibility ?? 10000) / 1000, // m → km
    weatherCode: c.weathercode ?? 0,
    fetchedAt: Date.now(),
  };
}

async function fetchForecast(lat: number, lng: number) {
  const url = `${OM_BASE}?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,weathercode,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo forecast HTTP ${res.status}`);
  const json = await res.json();

  const hourlyTimes: string[] = json.hourly?.time ?? [];
  const hourlyTemps: number[] = json.hourly?.temperature_2m ?? [];
  const hourlyCodes: number[] = json.hourly?.weathercode ?? [];
  const hourlyPrecip: number[] = json.hourly?.precipitation_probability ?? [];

  // Find the index closest to now, take next 12 hours
  const now = Date.now();
  let startIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < hourlyTimes.length; i++) {
    const diff = Math.abs(new Date(hourlyTimes[i]).getTime() - now);
    if (diff < bestDiff) { bestDiff = diff; startIdx = i; }
  }

  const hourly: HourlySlot[] = hourlyTimes
    .slice(startIdx, startIdx + 12)
    .map((t, i) => ({
      time: t,
      temperature: hourlyTemps[startIdx + i] ?? 0,
      weatherCode: hourlyCodes[startIdx + i] ?? 0,
      precipitationProbability: hourlyPrecip[startIdx + i] ?? 0,
    }));

  const dailyTimes: string[] = json.daily?.time ?? [];
  const dailyMax: number[] = json.daily?.temperature_2m_max ?? [];
  const dailyMin: number[] = json.daily?.temperature_2m_min ?? [];
  const dailyCodes: number[] = json.daily?.weathercode ?? [];
  const dailyPrecipMax: number[] = json.daily?.precipitation_probability_max ?? [];

  const daily: DailySlot[] = dailyTimes.slice(0, 5).map((t, i) => ({
    time: t,
    temperatureMax: dailyMax[i] ?? 0,
    temperatureMin: dailyMin[i] ?? 0,
    weatherCode: dailyCodes[i] ?? 0,
    precipitationProbability: dailyPrecipMax[i] ?? 0,
  }));

  return { hourly, daily };
}

// ---------------------------------------------------------------------------
// Main fetch — with cache
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

  const [current, { hourly, daily }] = await Promise.all([
    fetchCurrent(lat, lng),
    fetchForecast(lat, lng),
  ]);

  // Open-Meteo doesn't have weather alerts — return empty
  const alerts: WeatherAlert[] = [];

  const data: WeatherData = { current, hourly, daily, alerts, fetchedAt: Date.now() };
  cache = { data, key, ts: Date.now() };
  return data;
}
