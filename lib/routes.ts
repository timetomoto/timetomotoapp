import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { TrackPoint } from './gpx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Route {
  id: string;
  user_id: string;
  name: string;
  points: TrackPoint[];
  distance_miles: number;
  elevation_gain_ft: number;
  duration_seconds: number | null;
  category?: string | null;
  source?: string | null;
  recorded_at?: string | null;
  bike_id?: string | null;
  departure_time?: string | null;
  map_style?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// AsyncStorage helpers (local-first)
// ---------------------------------------------------------------------------

const localKey = (userId: string) => `ttm_routes_${userId}`;

async function loadLocalRoutes(userId: string): Promise<Route[]> {
  try {
    const raw = await AsyncStorage.getItem(localKey(userId));
    return raw ? (JSON.parse(raw) as Route[]) : [];
  } catch {
    return [];
  }
}

async function saveLocalRoutes(userId: string, routes: Route[]): Promise<void> {
  try {
    await AsyncStorage.setItem(localKey(userId), JSON.stringify(routes));
  } catch {
    // non-fatal
  }
}

function makeId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// CRUD — local-first, Supabase as optional sync
// ---------------------------------------------------------------------------

export async function fetchUserRoutes(userId: string): Promise<Route[]> {
  try {
    const { data, error } = await supabase
      .from('saved_routes')
      .select('id, user_id, name, points, distance_miles, elevation_gain_ft, duration_seconds, category, source, recorded_at, bike_id, departure_time, map_style, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) console.error('fetchUserRoutes error:', error.message);

    if (!error && data && data.length > 0) {
      const localRoutes = await loadLocalRoutes(userId);
      const supabaseIds = new Set(data.map((r: Route) => r.id));
      const localOnly = localRoutes.filter((r) => !supabaseIds.has(r.id));
      const all = [...localOnly, ...(data as Route[])];
      return all;
    }
  } catch (e) {
    console.error('fetchUserRoutes exception:', e);
  }
  const local = await loadLocalRoutes(userId);
  return local;
}

export async function createRoute(
  userId: string,
  name: string,
  points: TrackPoint[],
  distanceMiles: number,
  elevationGainFt: number,
  durationSeconds: number | null,
  category?: string | null,
  source: string = 'recorded',
  bikeId?: string | null,
  departureTime?: string | null,
  mapStyle?: string | null,
): Promise<Route | null> {
  const recordedAt = source === 'recorded' ? new Date().toISOString() : null;
  try {
    const { data, error } = await supabase
      .from('saved_routes')
      .insert({
        user_id: userId,
        name,
        points,
        distance_miles: Math.round(distanceMiles * 100) / 100,
        elevation_gain_ft: Math.round(elevationGainFt),
        duration_seconds: Math.round(durationSeconds ?? 0),
        category: category ?? null,
        source,
        recorded_at: recordedAt,
        bike_id: bikeId ?? null,
        departure_time: departureTime ?? null,
        map_style: mapStyle ?? null,
      })
      .select()
      .single();
    if (error) console.error('createRoute Supabase error:', error.message, error.details, error.hint);
    if (!error && data) return data as Route;
  } catch (e) {
    console.error('createRoute exception:', e);
  }

  const route: Route = {
    id: makeId(),
    user_id: userId,
    name,
    points,
    distance_miles: distanceMiles,
    elevation_gain_ft: elevationGainFt,
    duration_seconds: durationSeconds,
    category: category ?? null,
    source,
    recorded_at: recordedAt,
    bike_id: bikeId ?? null,
    map_style: mapStyle ?? 'mapbox://styles/mapbox/satellite-streets-v12',
    created_at: new Date().toISOString(),
  };
  const local = await loadLocalRoutes(userId);
  await saveLocalRoutes(userId, [route, ...local]);
  return route;
}

export async function updateRouteCategory(id: string, category: string | null, userId?: string): Promise<void> {
  try {
    await supabase.from('saved_routes').update({ category }).eq('id', id);
  } catch {
    // non-fatal
  }
  if (userId) {
    const local = await loadLocalRoutes(userId);
    await saveLocalRoutes(userId, local.map((r) => r.id === id ? { ...r, category } : r));
  }
}

export async function deleteRoute(id: string, userId?: string): Promise<void> {
  try {
    await supabase.from('saved_routes').delete().eq('id', id);
  } catch {
    // non-fatal
  }
  if (userId) {
    const local = await loadLocalRoutes(userId);
    await saveLocalRoutes(userId, local.filter((r) => r.id !== id));
  }
}

export async function updateRouteName(id: string, name: string, userId?: string): Promise<void> {
  try {
    await supabase.from('saved_routes').update({ name }).eq('id', id);
  } catch {
    // non-fatal
  }
  if (userId) {
    const local = await loadLocalRoutes(userId);
    await saveLocalRoutes(userId, local.map((r) => r.id === id ? { ...r, name } : r));
  }
}

// ---------------------------------------------------------------------------
// Seed cleanup — removes old low-res BDR seed data on first launch
// ---------------------------------------------------------------------------

const BDR_CATEGORIES = new Set([
  'Backcountry Discovery Routes',
  'BDR Routes',
  'Backcountry Discovery Routes (BDR)',
]);

/**
 * One-time cleanup: removes seeded BDR routes (low-res data).
 * Only deletes routes with source='seeded' — user-imported GPX routes are untouched.
 * After cleanup, this function becomes a no-op.
 */
export async function seedRoutes(userId: string): Promise<void> {
  const cleanupKey = `@ttm/bdr_cleanup_done_${userId}`;
  try {
    if ((await AsyncStorage.getItem(cleanupKey)) === 'true') return;
  } catch {}

  try {
    // Delete seeded BDR routes from Supabase (source='seeded' only — never touch user data)
    for (const cat of BDR_CATEGORIES) {
      await supabase
        .from('saved_routes')
        .delete()
        .eq('user_id', userId)
        .eq('source', 'seeded')
        .eq('category', cat);
    }
    // Also delete the test route
    await supabase
      .from('saved_routes')
      .delete()
      .eq('user_id', userId)
      .eq('source', 'seeded')
      .eq('name', 'LV Short Test Route');

    // Clean local AsyncStorage too
    const local = await loadLocalRoutes(userId);
    const cleaned = local.filter(
      (r) => !(r.source === 'seeded' && (BDR_CATEGORIES.has(r.category ?? '') || r.name === 'LV Short Test Route')),
    );
    if (cleaned.length !== local.length) {
      await saveLocalRoutes(userId, cleaned);
    }

    // Remove old seed flag
    await AsyncStorage.removeItem(`@ttm/routes_seeded_${userId}`).catch(() => {});
    await AsyncStorage.setItem(cleanupKey, 'true');
  } catch {
    // Non-fatal — will retry next launch
  }
}
