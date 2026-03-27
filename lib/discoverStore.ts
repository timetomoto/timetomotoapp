import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoadCondition {
  id: string;
  type: 'construction' | 'hazard' | 'closure';
  severity: 'severe' | 'moderate' | 'minor';
  title: string;
  description: string;
  lat: number;
  lng: number;
  reportedAt: Date;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

import { haversineMiles as haversineDistance } from './distance';

// ---------------------------------------------------------------------------
// Conditions fetcher — HERE Traffic API (nationwide, primary)
// ---------------------------------------------------------------------------

const HERE_INCIDENTS_URL = 'https://data.traffic.hereapi.com/v7/incidents';
const RADIUS_METERS = 50000; // ~31 miles (HERE API max)

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  accident: 'Accident',
  construction: 'Construction',
  roadClosure: 'Road Closure',
  congestion: 'Heavy Traffic',
  disabledVehicle: 'Disabled Vehicle',
  laneRestriction: 'Lane Restriction',
  roadHazard: 'Road Hazard',
  plannedEvent: 'Planned Event',
  weather: 'Weather Hazard',
};

function getHEREFirstPoint(result: any): { lat: number; lng: number } | null {
  const links = result.location?.shape?.links;
  if (!links || links.length === 0) return null;
  const points = links[0].points;
  if (!points || points.length === 0) return null;
  return { lat: points[0].lat, lng: points[0].lng };
}

function mapHEREToCondition(result: any, userLat: number, userLng: number): RoadCondition | null {
  const details = result.incidentDetails;
  if (!details) return null;

  const point = getHEREFirstPoint(result);
  if (!point) return null;

  const { lat, lng } = point;
  const incidentType = details.type ?? '';
  const criticality = (details.criticality ?? '').toLowerCase();

  const severity: RoadCondition['severity'] =
    criticality === 'critical' || details.roadClosed ? 'severe' :
    criticality === 'major' ? 'moderate' : 'minor';

  const type: RoadCondition['type'] =
    details.roadClosed || incidentType === 'roadClosure' ? 'closure' :
    ['construction', 'plannedEvent'].includes(incidentType) ? 'construction' :
    'hazard';

  const title = details.typeDescription?.value
    ?? INCIDENT_TYPE_LABELS[incidentType]
    ?? incidentType
    ?? 'Unknown';

  return {
    id: details.id ?? String(Math.random()),
    type,
    severity,
    title,
    description: details.description?.value ?? details.summary?.value ?? '',
    lat,
    lng,
    reportedAt: details.startTime ? new Date(details.startTime) : new Date(),
  };
}

export async function fetchHEREConditions(lat: number, lng: number): Promise<RoadCondition[]> {
  const key = process.env.EXPO_PUBLIC_HERE_API_KEY;
  if (!key) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    // Only fetch incidents from the last 14 days
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const url =
      `${HERE_INCIDENTS_URL}?locationReferencing=shape` +
      `&in=circle:${lat},${lng};r=${RADIUS_METERS}` +
      `&startTime=${twoWeeksAgo}` +
      `&apiKey=${key}`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const json = await res.json();

    const results: any[] = json.results ?? [];
    const conditions: RoadCondition[] = [];
    for (const r of results) {
      const mapped = mapHEREToCondition(r, lat, lng);
      if (mapped) conditions.push(mapped);
    }
    return conditions;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Combined conditions fetcher
// ---------------------------------------------------------------------------

async function fetchAllConditions(lat: number, lng: number): Promise<RoadCondition[]> {
  const conditions = await fetchHEREConditions(lat, lng);

  // Sort by distance from user
  conditions.sort((a, b) => {
    const distA = haversineDistance(lat, lng, a.lat, a.lng);
    const distB = haversineDistance(lat, lng, b.lat, b.lng);
    return distA - distB;
  });

  return conditions;
}

// ---------------------------------------------------------------------------
// Geocoding helpers — re-exported from shared module
// ---------------------------------------------------------------------------

export { geocodeLocation, reverseGeocode } from './geocode';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const CONDITIONS_CACHE_MS = 10 * 60 * 1000;

interface DiscoverStore {
  // Conditions
  conditions: RoadCondition[];
  conditionsLoading: boolean;
  conditionsLastFetched: number | null;
  activeConditionsFilter: string;
  conditionsLocation: { lat: number; lng: number; name: string } | null;
  fetchConditions: (lat: number, lng: number) => Promise<void>;
  setConditionsFilter: (filter: string) => void;
  setConditionsLocation: (loc: { lat: number; lng: number; name: string } | null) => void;
}

export const useDiscoverStore = create<DiscoverStore>((set, get) => ({
  // Conditions
  conditions: [],
  conditionsLoading: false,
  conditionsLastFetched: null,
  activeConditionsFilter: 'all',
  conditionsLocation: null,

  fetchConditions: async (lat: number, lng: number) => {
    const { conditionsLastFetched } = get();
    if (conditionsLastFetched && Date.now() - conditionsLastFetched < CONDITIONS_CACHE_MS) return;

    set({ conditionsLoading: true });

    const conditions = await fetchAllConditions(lat, lng);

    set({
      conditions,
      conditionsLoading: false,
      conditionsLastFetched: Date.now(),
    });
  },

  setConditionsFilter: (activeConditionsFilter) => set({ activeConditionsFilter }),
  setConditionsLocation: (conditionsLocation) => set({ conditionsLocation }),
}));
