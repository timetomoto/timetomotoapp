import { create } from 'zustand';
import { XMLParser } from 'fast-xml-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NewsCategory =
  | 'all'
  | 'adv'
  | 'sport'
  | 'touring'
  | 'cruiser'
  | 'gear'
  | 'safety'
  | 'moto_news'
  | 'events';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  imageUrl: string | null;
  publishedAt: Date;
  source: string;
  category: NewsCategory;
}

export type CamsFilter = 'all' | 'traffic' | 'road' | 'weather' | 'scenic';

export interface WindyCamera {
  webcamId: string;
  title: string;
  status: 'active' | 'inactive';
  location: {
    city: string;
    region: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  images: {
    current: {
      preview: string;
      icon: string;
    };
    sizes?: {
      medium?: { width: number; height: number };
    };
  };
  player: {
    day: { embed: string };
  };
}

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
// RSS sources
// ---------------------------------------------------------------------------

const NEWS_SOURCES = [
  { name: 'Motorcyclist Online', url: 'https://www.motorcyclistonline.com/feed/', category: 'moto_news' as NewsCategory },
  { name: 'Cycle World', url: 'https://www.cycleworld.com/rss/all.xml/', category: 'moto_news' as NewsCategory },
  { name: 'RideApart', url: 'https://www.rideapart.com/rss/', category: 'moto_news' as NewsCategory },
  { name: 'Asphalt & Rubber', url: 'https://www.asphaltandrubber.com/feed/', category: 'moto_news' as NewsCategory },
  { name: 'MCN — Motorcycle News', url: 'https://www.motorcyclenews.com/rss/', category: 'moto_news' as NewsCategory },
  { name: 'RevZilla Common Tread', url: 'https://www.revzilla.com/common-tread/feed', category: 'gear' as NewsCategory },
  { name: 'Rider Magazine', url: 'https://ridermagazine.com/feed/', category: 'touring' as NewsCategory },
  { name: 'Motorcycle Cruiser', url: 'https://www.motorcyclecruiser.com/feed/', category: 'cruiser' as NewsCategory },
  { name: 'ADVRider News', url: 'https://www.advrider.com/category/news/feed/', category: 'adv' as NewsCategory },
  { name: 'ADVMoto', url: 'https://adventuremotorcycle.com/feed', category: 'adv' as NewsCategory },
  { name: 'Adventure Rider Radio', url: 'https://feeds.transistor.fm/adventure-rider-radio', category: 'adv' as NewsCategory },
  { name: 'BikeEXIF', url: 'https://www.bikeexif.com/feed', category: 'moto_news' as NewsCategory },
  { name: 'Return of the Cafe Racers', url: 'https://www.returnofthecaferacers.com/feed/', category: 'moto_news' as NewsCategory },
];

// ---------------------------------------------------------------------------
// Auto-categorization
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  safety: ['recall', 'nhtsa', 'crash', 'safety', 'warning', 'injury', 'death', 'fire', 'defect', 'accident', 'fatality'],
  events: ['rally', 'event', 'festival', 'show', 'expo', 'bike week', 'bike fest', 'sturgis', 'daytona', 'laconia', 'thunder beach', 'lone star rally', 'republic of texas', 'rot rally', 'moto jam', 'iron butt', 'distinguished gentleman', 'toy run', 'motogp', 'moto gp', 'wsbk', 'ama', 'race', 'championship', 'supercross', 'enduro gp'],
  gear: ['helmet', 'jacket', 'boots', 'gloves', 'gear', 'luggage', 'suit', 'apparel', 'protection', 'airbag', 'hi-viz', 'riding pants', 'base layer', 'intercom', 'camera mount'],
  sport: ['supersport', 'superbike', 'sportbike', 'track day', 'circuit', 'cbr', 'gsxr', 'r1', 'r6', 'zx-', 'naked', 'streetfighter', 'cafe racer', 'custom', 'hypermotard', 'duke', 'speed triple'],
  touring: ['touring', 'long distance', 'road trip', 'bagger', 'gold wing', 'k1600', 'pan america', 'multistrada', 'tracer', 'concours', 'versys', 'nt1100', 'rt', 'lt'],
  cruiser: ['cruiser', 'harley', 'indian', 'chopper', 'bobber', 'softail', 'sportster', 'v-twin', 'thunderbird', 'boulevard', 'vulcan', 'shadow', 'rebel', 'scout', 'chief', 'dark horse'],
  adv: ['adventure', 'offroad', 'off-road', 'dual sport', 'gravel', 'trail', 'bdr', 'backcountry', 'overlanding', 'adv', 'dirt', 'enduro', 'scrambler', 'gs ', 'africa twin', 'tiger', 'tenere', 'ktm adventure', 'tuareg'],
  moto_news: ['review', 'new model', 'launch', 'first ride', 'test ride', 'announced', 'revealed', 'preview', '2025', '2026', '2027'],
};

const CATEGORY_PRIORITY: string[] = [
  'safety', 'events', 'gear', 'sport', 'touring', 'cruiser', 'adv', 'moto_news',
];

function categorize(item: NewsItem): NewsCategory {
  const text = (item.title + ' ' + item.summary).toLowerCase();
  for (const cat of CATEGORY_PRIORITY) {
    if (CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))) {
      return cat as NewsCategory;
    }
  }
  return item.category;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    // Named entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&hellip;/g, '\u2026')
    // Decimal numeric entities &#NNN;
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCharCode(parseInt(dec, 10))
    )
    // Hex numeric entities &#xHHH;
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    // Strip any remaining HTML tags
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function truncate(text: string, max = 180): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function parseDate(raw: string | undefined): Date {
  if (!raw) return new Date(0);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return 'n_' + Math.abs(hash).toString(36);
}

function extractImage(item: any): string | null {
  // <media:content url="...">
  const media = item['media:content'] ?? item['media:thumbnail'];
  if (media) {
    const url = typeof media === 'string' ? media : media?.['@_url'];
    if (url) return url;
  }
  // <enclosure url="..." type="image/...">
  const enc = item.enclosure;
  if (enc) {
    const url = enc?.['@_url'];
    const type = enc?.['@_type'] ?? '';
    if (url && type.startsWith('image')) return url;
    if (url && /\.(jpg|jpeg|png|webp|gif)/i.test(url)) return url;
  }
  // Try to extract first image from content
  const content = item['content:encoded'] ?? item.description ?? item.summary ?? '';
  const imgMatch = String(content).match(/<img[^>]+src=["']([^"']+)["']/);
  if (imgMatch?.[1]) return imgMatch[1];
  return null;
}

async function fetchSource(
  source: (typeof NEWS_SOURCES)[number],
): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'timetomoto/1.0' },
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed = parser.parse(xml);

    const channel = parsed?.rss?.channel ?? parsed?.feed;
    if (!channel) return [];

    const rawItems: any[] = Array.isArray(channel.item)
      ? channel.item
      : channel.item
        ? [channel.item]
        : Array.isArray(channel.entry)
          ? channel.entry
          : channel.entry
            ? [channel.entry]
            : [];

    return rawItems.map((item: any): NewsItem => {
      const url: string =
        (typeof item.link === 'string' ? item.link : item.link?.['#text'] ?? item.link?.['@_href']) ?? '';
      const rawSummary: string =
        item.description ?? item.summary ?? item['content:encoded'] ?? item.content?.['#text'] ?? '';
      const summary = truncate(decodeHtmlEntities(String(rawSummary)));
      const title = decodeHtmlEntities(String(item.title ?? ''));
      const pubDate = item.pubDate ?? item.published ?? item.updated ?? item['dc:date'];
      const imageUrl = extractImage(item);

      const newsItem: NewsItem = {
        id: simpleHash(url || `${source.name}-${title}`),
        source: source.name,
        category: source.category,
        title,
        summary,
        url,
        imageUrl,
        publishedAt: parseDate(String(pubDate ?? '')),
      };

      // Auto-categorize
      newsItem.category = categorize(newsItem);

      return newsItem;
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
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

async function fetchHEREConditions(lat: number, lng: number): Promise<RoadCondition[]> {
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
// Geocoding helpers (Mapbox)
// ---------------------------------------------------------------------------

export async function geocodeLocation(query: string): Promise<Array<{ name: string; lat: number; lng: number }>> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token || !query.trim()) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${token}&types=place,address,postcode&country=us&limit=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? []).map((f: any) => ({
      name: f.place_name ?? '',
      lat: f.center[1],
      lng: f.center[0],
    }));
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) return 'Your location';
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${token}&types=place`;
  try {
    const res = await fetch(url);
    if (!res.ok) return 'Your location';
    const json = await res.json();
    return json.features?.[0]?.place_name ?? 'Your location';
  } catch {
    return 'Your location';
  }
}

// ---------------------------------------------------------------------------
// Windy Webcams fetcher
// ---------------------------------------------------------------------------

const WINDY_CATEGORY_MAP: Record<CamsFilter, string | null> = {
  all: null,
  traffic: 'traffic',
  road: 'driving',
  weather: 'weather',
  scenic: 'landscape',
};

async function fetchWindyCameras(
  lat: number,
  lng: number,
  category?: CamsFilter,
): Promise<WindyCamera[]> {
  const apiKey = process.env.EXPO_PUBLIC_WINDY_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({
      lang: 'en',
      near: `${lat},${lng},50`,
      include: 'location,images,player',
      limit: '20',
      offset: '0',
    });

    const windyCat = category ? WINDY_CATEGORY_MAP[category] : null;
    if (windyCat) params.set('categories', windyCat);

    const res = await fetch(
      `https://api.windy.com/webcams/api/v3/webcams?${params}`,
      {
        signal: controller.signal,
        headers: { 'x-windy-api-key': apiKey },
      },
    );
    if (!res.ok) return [];
    const json = await res.json();

    const items: any[] = json.webcams ?? json.result?.webcams ?? [];

    return items.map((cam: any): WindyCamera => ({
      webcamId: String(cam.webcamId ?? cam.id ?? ''),
      title: String(cam.title ?? ''),
      status: cam.status === 'active' ? 'active' : 'inactive',
      location: {
        city: cam.location?.city ?? '',
        region: cam.location?.region ?? '',
        country: cam.location?.country ?? '',
        latitude: Number(cam.location?.latitude ?? 0),
        longitude: Number(cam.location?.longitude ?? 0),
      },
      images: {
        current: {
          preview: cam.images?.current?.preview ?? cam.image?.current?.preview ?? '',
          icon: cam.images?.current?.icon ?? cam.image?.current?.icon ?? '',
        },
        sizes: cam.images?.sizes,
      },
      player: {
        day: {
          embed: cam.player?.day?.embed ?? cam.player?.lifetime?.embed ?? '',
        },
      },
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const CACHE_MS = 30 * 60 * 1000;
const CONDITIONS_CACHE_MS = 10 * 60 * 1000;

interface DiscoverStore {
  // News
  newsItems: NewsItem[];
  newsLoading: boolean;
  newsError: string | null;
  newsLastFetched: number | null;
  activeNewsFilter: NewsCategory;
  fetchNews: () => Promise<void>;
  setNewsFilter: (cat: NewsCategory) => void;

  // Conditions
  conditions: RoadCondition[];
  conditionsLoading: boolean;
  conditionsLastFetched: number | null;
  activeConditionsFilter: string;
  conditionsLocation: { lat: number; lng: number; name: string } | null;
  fetchConditions: (lat: number, lng: number) => Promise<void>;
  setConditionsFilter: (filter: string) => void;
  setConditionsLocation: (loc: { lat: number; lng: number; name: string } | null) => void;

  // Cams
  cameras: WindyCamera[];
  camsLoading: boolean;
  camsError: string | null;
  camsLocation: { lat: number; lng: number; name: string } | null;
  activeCamsFilter: CamsFilter;
  fetchCameras: (lat: number, lng: number, category?: CamsFilter) => Promise<void>;
  setCamsLocation: (loc: { lat: number; lng: number; name: string } | null) => void;
  setActiveCamsFilter: (filter: CamsFilter) => void;
}

export const useDiscoverStore = create<DiscoverStore>((set, get) => ({
  // News
  newsItems: [],
  newsLoading: false,
  newsError: null,
  newsLastFetched: null,
  activeNewsFilter: 'all',

  fetchNews: async () => {
    const { newsLastFetched } = get();
    if (newsLastFetched && Date.now() - newsLastFetched < CACHE_MS) return;

    set({ newsLoading: true, newsError: null });

    const results = await Promise.allSettled(NEWS_SOURCES.map(fetchSource));
    const all: NewsItem[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }

    if (all.length === 0) {
      set({ newsLoading: false, newsError: 'Could not load news. Check your connection.' });
      return;
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = all.filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    // Sort newest first
    unique.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    set({ newsItems: unique, newsLastFetched: Date.now(), newsLoading: false });
  },

  setNewsFilter: (activeNewsFilter) => set({ activeNewsFilter }),

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

  // Cams
  cameras: [],
  camsLoading: false,
  camsError: null,
  camsLocation: null,
  activeCamsFilter: 'all',

  fetchCameras: async (lat: number, lng: number, category?: CamsFilter) => {
    if (!process.env.EXPO_PUBLIC_WINDY_API_KEY) {
      set({ cameras: [], camsLoading: false, camsError: 'Add your Windy API key to enable cameras.' });
      return;
    }

    set({ camsLoading: true, camsError: null });

    const cameras = await fetchWindyCameras(lat, lng, category);
    set({ cameras, camsLoading: false });
  },

  setCamsLocation: (camsLocation) => set({ camsLocation }),
  setActiveCamsFilter: (activeCamsFilter) => set({ activeCamsFilter }),
}));
