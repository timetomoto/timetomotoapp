import { XMLParser } from 'fast-xml-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackPoint {
  lat: number;
  lng: number;
  ele?: number;    // metres
  time?: string;   // ISO 8601
}

export interface ParsedRoute {
  name: string;
  points: TrackPoint[];
  distanceMiles: number;
  elevationGainFt: number;
  durationSeconds: number | null;  // null if no timestamps
}

// ---------------------------------------------------------------------------
// Maths
// ---------------------------------------------------------------------------

import { haversineMiles as _haversineMiles } from './distance';

function haversineMiles(a: TrackPoint, b: TrackPoint): number {
  return _haversineMiles(a.lat, a.lng, b.lat, b.lng);
}

export function calcDistance(points: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMiles(points[i - 1], points[i]);
  }
  return total;
}

export function calcElevationGain(points: TrackPoint[]): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].ele ?? 0;
    const curr = points[i].ele ?? 0;
    if (curr > prev) gain += curr - prev;
  }
  return gain * 3.28084; // metres → feet
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function toArr<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseGpx(xml: string): ParsedRoute {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);
  const gpx = doc.gpx ?? doc.GPX ?? {};

  let name = 'Imported Route';
  let rawPts: Array<{ '@_lat': string; '@_lon': string; ele?: number | string; time?: string }> = [];

  // Track (trk → trkseg → trkpt)
  const trks = toArr(gpx.trk);
  if (trks.length > 0) {
    name = trks[0].name ?? name;
    for (const seg of toArr<any>(trks[0].trkseg)) {
      rawPts = rawPts.concat(toArr(seg.trkpt));
    }
  }

  // Route (rte → rtept)
  if (rawPts.length === 0) {
    const rtes = toArr<any>(gpx.rte);
    if (rtes.length > 0) {
      name = rtes[0].name ?? name;
      rawPts = toArr(rtes[0].rtept);
    }
  }

  // Waypoints
  if (rawPts.length === 0) {
    rawPts = toArr(gpx.wpt);
  }

  const points: TrackPoint[] = rawPts.map((p) => ({
    lat: parseFloat(p['@_lat']),
    lng: parseFloat(p['@_lon']),
    ele: p.ele !== undefined ? parseFloat(String(p.ele)) : undefined,
    time: p.time,
  }));

  let durationSeconds: number | null = null;
  if (points.length >= 2 && points[0].time && points[points.length - 1].time) {
    const t0 = new Date(points[0].time!).getTime();
    const t1 = new Date(points[points.length - 1].time!).getTime();
    if (!isNaN(t0) && !isNaN(t1)) durationSeconds = Math.round((t1 - t0) / 1000);
  }

  return {
    name,
    points,
    distanceMiles: calcDistance(points),
    elevationGainFt: calcElevationGain(points),
    durationSeconds,
  };
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

export function serializeGpx(name: string, points: TrackPoint[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const trkpts = points
    .map((p) => {
      const ele  = p.ele  !== undefined ? `\n        <ele>${p.ele.toFixed(1)}</ele>` : '';
      const time = p.time ? `\n        <time>${p.time}</time>` : '';
      return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}">${ele}${time}\n      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="timetomoto"
     xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

// ---------------------------------------------------------------------------
// Mapbox helpers
// ---------------------------------------------------------------------------

export function routeGeoJson(points: TrackPoint[]) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
    properties: {},
  };
}

export function routeBounds(
  points: TrackPoint[],
): [[number, number], [number, number]] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [[maxLng, maxLat], [minLng, minLat]]; // ne, sw for Mapbox fitBounds
}
