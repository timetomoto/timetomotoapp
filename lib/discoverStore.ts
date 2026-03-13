import { create } from 'zustand';
import { XMLParser } from 'fast-xml-parser';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NewsItem = {
  id: string;
  source: string;
  accent: string;
  tag: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: Date;
};

export type MotoEvent = {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  dateStart: Date;
  dateEnd?: Date;
  type: string;
  approved: boolean;
};

type DiscoverStore = {
  newsItems: NewsItem[];
  newsLastFetched: Date | null;
  newsFilter: string;
  fetchNews: () => Promise<void>;
  setNewsFilter: (filter: string) => void;

  events: MotoEvent[];
  eventsLastFetched: Date | null;
  eventTypeFilter: string;
  eventDateRange: 30 | 60 | 90 | 'all';
  eventRadiusMiles: 50 | 100 | 250 | 500 | 'nationwide';
  userLocation: { lat: number; lng: number; city: string } | null;
  fetchEvents: () => Promise<void>;
  setEventTypeFilter: (filter: string) => void;
  setEventDateRange: (range: 30 | 60 | 90 | 'all') => void;
  setEventRadius: (miles: 50 | 100 | 250 | 500 | 'nationwide') => void;
  setUserLocation: (loc: { lat: number; lng: number; city: string }) => void;
};

// ---------------------------------------------------------------------------
// RSS sources
// ---------------------------------------------------------------------------

const NEWS_SOURCES = [
  { name: 'ADVrider',                url: 'https://advrider.com/f/forums/-/index.rss',              accent: '#E53935', tag: 'COMMUNITY' },
  { name: 'ADV Pulse',               url: 'https://www.advpulse.com/feed/',                          accent: '#FF6B35', tag: 'ADV' },
  { name: 'Cycle World',             url: 'https://www.cycleworld.com/rss/all.xml',                  accent: '#F7B731', tag: 'NEWS' },
  { name: 'RideApart',               url: 'https://rideapart.com/rss/articles/all',                  accent: '#4ECDC4', tag: 'NEWS' },
  { name: 'Motorcyclist',            url: 'https://www.motorcyclistonline.com/feed/',                 accent: '#A29BFE', tag: 'REVIEWS' },
  { name: 'RevZilla Common Tread',   url: 'https://www.revzilla.com/common-tread/feed',              accent: '#55EFC4', tag: 'GEAR' },
  { name: 'Adventure Motorcycle Mag',url: 'https://adventuremotorcycle.com/feed',                    accent: '#FF6B35', tag: 'ADV' },
  { name: 'Motorcycle Daily',        url: 'https://motorcycledaily.com/feed',                        accent: '#888888', tag: 'INDUSTRY' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
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

    // Support both RSS (<channel><item>) and Atom (<feed><entry>)
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
      const summary = truncate(stripHtml(String(rawSummary)));
      const title   = stripHtml(String(item.title ?? ''));
      const pubDate = item.pubDate ?? item.published ?? item.updated ?? item['dc:date'];

      return {
        id:          url || `${source.name}-${Math.random()}`,
        source:      source.name,
        accent:      source.accent,
        tag:         source.tag,
        title,
        summary,
        url,
        publishedAt: parseDate(String(pubDate ?? '')),
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const CACHE_MS = 30 * 60 * 1000; // 30 minutes

export const useDiscoverStore = create<DiscoverStore>((set, get) => ({
  newsItems:       [],
  newsLastFetched: null,
  newsFilter:      'ALL',

  fetchNews: async () => {
    const { newsLastFetched } = get();
    if (newsLastFetched && Date.now() - newsLastFetched.getTime() < CACHE_MS) return;

    const results = await Promise.allSettled(NEWS_SOURCES.map(fetchSource));
    const all: NewsItem[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
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

    set({ newsItems: unique, newsLastFetched: new Date() });
  },

  setNewsFilter: (newsFilter) => set({ newsFilter }),

  events:           [],
  eventsLastFetched: null,
  eventTypeFilter:  'ALL',
  eventDateRange:   30,
  eventRadiusMiles: 100,
  userLocation:     null,

  fetchEvents: async () => {
    const { eventsLastFetched } = get();
    if (eventsLastFetched && Date.now() - eventsLastFetched.getTime() < CACHE_MS) return;

    const { data, error } = await supabase
      .from('events')
      .select('id, name, location, lat, lng, date_start, date_end, type, approved')
      .eq('approved', true);

    if (error || !data) return;

    const events: MotoEvent[] = data.map((row: any) => ({
      id:        String(row.id),
      name:      row.name ?? '',
      location:  row.location ?? '',
      lat:       Number(row.lat ?? 0),
      lng:       Number(row.lng ?? 0),
      dateStart: new Date(row.date_start ?? row.dateStart ?? row.date ?? ''),
      dateEnd:   row.date_end || row.dateEnd ? new Date(row.date_end ?? row.dateEnd) : undefined,
      type:      row.type ?? 'OTHER',
      approved:  Boolean(row.approved),
    }));

    set({ events, eventsLastFetched: new Date() });
  },

  setEventTypeFilter: (eventTypeFilter) => set({ eventTypeFilter }),
  setEventDateRange:  (eventDateRange)  => set({ eventDateRange }),
  setEventRadius:     (eventRadiusMiles) => set({ eventRadiusMiles }),
  setUserLocation:    (userLocation)    => set({ userLocation }),
}));
