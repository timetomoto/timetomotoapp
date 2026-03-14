import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FavoriteLocation {
  id?: string;
  name: string;
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// AsyncStorage cache key
// ---------------------------------------------------------------------------

const CACHE_KEY = 'ttm_favorite_locations';

// ---------------------------------------------------------------------------
// Local cache helpers
// ---------------------------------------------------------------------------

async function loadCache(): Promise<FavoriteLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as FavoriteLocation[]) : [];
  } catch {
    return [];
  }
}

async function saveCache(favs: FavoriteLocation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(favs));
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load favorites — syncs from Supabase for authenticated users,
 * falls back to local cache for offline / unauthenticated.
 */
export async function loadFavorites(userId?: string | null): Promise<FavoriteLocation[]> {
  if (!userId || userId === 'local') {
    return loadCache();
  }

  try {
    const { data, error } = await supabase
      .from('favorite_locations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const favs: FavoriteLocation[] = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      lat: Number(row.latitude),
      lng: Number(row.longitude),
    }));

    // Update local cache
    await saveCache(favs);
    return favs;
  } catch {
    // Offline — use cache
    return loadCache();
  }
}

/**
 * Add a favorite location. Writes to Supabase + updates local cache.
 */
export async function addFavorite(
  fav: FavoriteLocation,
  userId?: string | null,
): Promise<FavoriteLocation[]> {
  const cached = await loadCache();

  // Dedupe by name + coords
  const exists = cached.some(
    (f) => f.name === fav.name && f.lat === fav.lat && f.lng === fav.lng,
  );
  if (exists) return cached;

  const updated = [fav, ...cached];
  await saveCache(updated);

  if (userId && userId !== 'local') {
    try {
      const { data } = await supabase
        .from('favorite_locations')
        .insert({
          user_id: userId,
          name: fav.name,
          latitude: fav.lat,
          longitude: fav.lng,
        })
        .select()
        .single();

      if (data) {
        // Update cache entry with server id
        updated[0] = { ...updated[0], id: data.id };
        await saveCache(updated);
      }
    } catch {
      // Supabase write failed — local cache is still updated
    }
  }

  return updated;
}

/**
 * Remove a favorite location. Deletes from Supabase + updates local cache.
 */
export async function removeFavorite(
  fav: FavoriteLocation,
  userId?: string | null,
): Promise<FavoriteLocation[]> {
  const cached = await loadCache();
  const updated = cached.filter(
    (f) => !(f.name === fav.name && f.lat === fav.lat && f.lng === fav.lng),
  );
  await saveCache(updated);

  if (userId && userId !== 'local') {
    try {
      // Try by id first, fall back to name+coords match
      if (fav.id) {
        await supabase.from('favorite_locations').delete().eq('id', fav.id);
      } else {
        await supabase
          .from('favorite_locations')
          .delete()
          .eq('user_id', userId)
          .eq('name', fav.name)
          .eq('latitude', fav.lat)
          .eq('longitude', fav.lng);
      }
    } catch {
      // Supabase delete failed — local cache is still updated
    }
  }

  return updated;
}

/**
 * Toggle a favorite — add if not present, remove if already favorited.
 * Returns the updated list.
 */
export async function toggleFavorite(
  fav: FavoriteLocation,
  userId?: string | null,
): Promise<FavoriteLocation[]> {
  const cached = await loadCache();
  const exists = cached.some(
    (f) => f.name === fav.name && f.lat === fav.lat && f.lng === fav.lng,
  );
  if (exists) {
    // Find the cached entry (may have an id)
    const match = cached.find(
      (f) => f.name === fav.name && f.lat === fav.lat && f.lng === fav.lng,
    );
    return removeFavorite(match ?? fav, userId);
  }
  return addFavorite(fav, userId);
}

/**
 * Check if a location is favorited (local cache check — instant).
 */
export function isFavorited(
  name: string,
  favorites: FavoriteLocation[],
): boolean {
  return favorites.some((f) => f.name === name);
}
