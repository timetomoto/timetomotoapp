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

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
    const url =
      `${HERE_INCIDENTS_URL}?locationReferencing=shape` +
      `&in=circle:${lat},${lng};r=${RADIUS_METERS}` +
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
// Conditions fetcher — TxDOT ArcGIS (Texas supplemental)
// ---------------------------------------------------------------------------

const TXDOT_EVENTS_URL =
  'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/' +
  'Highway_Events_LN/FeatureServer/0/query';

function mapTxDOTToCondition(feature: any, userLat: number, userLng: number): RoadCondition | null {
  const a = feature.attributes;
  const lat = a.latitude;
  const lng = a.longitude;
  if (lat == null || lng == null) return null;

  const severity: RoadCondition['severity'] =
    ['Road Closure', 'Flooding', 'Debris on Road'].includes(a.event_type) ? 'severe' :
    ['Construction', 'Bridge Work', 'Lane Restriction'].includes(a.event_type) ? 'moderate' :
    'minor';

  const type: RoadCondition['type'] =
    a.event_type === 'Road Closure' ? 'closure' :
    ['Pothole', 'Debris on Road', 'Flooding', 'Signal Outage'].includes(a.event_type) ? 'hazard' :
    ['Construction', 'Bridge Work', 'Utility Work'].includes(a.event_type) ? 'construction' :
    'hazard';

  return {
    id: `txdot_${a.OBJECTID ?? Math.random()}`,
    type,
    severity,
    title: a.event_type ?? 'Unknown',
    description: `${a.route_prefix_type ?? ''} ${a.route_name ?? ''}`.trim(),
    lat,
    lng,
    reportedAt: a.event_created_timestamp
      ? new Date(a.event_created_timestamp)
      : new Date(),
  };
}

async function fetchTxDOTConditions(lat: number, lng: number): Promise<RoadCondition[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const delta = 2.2;
    const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

    const params = new URLSearchParams({
      where: "event_status='Active'",
      geometry: bbox,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'event_type,route_name,route_prefix_type,latitude,longitude,event_created_timestamp,event_status,OBJECTID',
      returnGeometry: 'false',
      f: 'json',
      resultRecordCount: '100',
    });

    const res = await fetch(`${TXDOT_EVENTS_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) return [];
    const json = await res.json();
    if (json.error) return [];

    const features: any[] = json.features ?? [];
    const conditions: RoadCondition[] = [];
    for (const f of features) {
      const mapped = mapTxDOTToCondition(f, lat, lng);
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

function isTexas(lat: number, lng: number): boolean {
  return lat > 25.8 && lat < 36.5 && lng > -106.7 && lng < -93.5;
}

async function fetchAllConditions(lat: number, lng: number): Promise<RoadCondition[]> {
  // Always fetch HERE (nationwide)
  const conditions = await fetchHEREConditions(lat, lng);

  // Supplement with TxDOT for Texas locations
  if (isTexas(lat, lng)) {
    const txConditions = await fetchTxDOTConditions(lat, lng);
    // Deduplicate: skip TxDOT item if HERE already has one within 0.5 miles
    for (const tx of txConditions) {
      const isDupe = conditions.some((h) => haversineDistance(h.lat, h.lng, tx.lat, tx.lng) < 0.5);
      if (!isDupe) conditions.push(tx);
    }
  }

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
