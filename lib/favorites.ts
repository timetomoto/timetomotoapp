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
  nickname?: string | null;
  is_home?: boolean;
  address?: string | null;
}

// ---------------------------------------------------------------------------
// AsyncStorage cache key
// ---------------------------------------------------------------------------

const CACHE_KEY_PREFIX = 'ttm_favorite_locations';

function cacheKey(userId?: string | null): string {
  return userId && userId !== 'local'
    ? `${CACHE_KEY_PREFIX}_${userId}`
    : CACHE_KEY_PREFIX;
}

// ---------------------------------------------------------------------------
// Local cache helpers
// ---------------------------------------------------------------------------

async function loadCache(userId?: string | null): Promise<FavoriteLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as FavoriteLocation[]) : [];
  } catch {
    return [];
  }
}

async function saveCache(favs: FavoriteLocation[], userId?: string | null): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(favs));
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
    return loadCache(userId);
  }

  try {
    const { data, error } = await supabase
      .from('favorite_locations')
      .select('id, user_id, name, latitude, longitude, nickname, is_home, address, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const favs: FavoriteLocation[] = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      nickname: row.nickname ?? null,
      is_home: row.is_home ?? false,
      address: row.address ?? null,
    }));

    // Update local cache
    await saveCache(favs, userId);
    return favs;
  } catch {
    // Offline — use cache
    return loadCache(userId);
  }
}

/**
 * Add a favorite location. Writes to Supabase + updates local cache.
 */
export async function addFavorite(
  fav: FavoriteLocation,
  userId?: string | null,
): Promise<FavoriteLocation[]> {
  const cached = await loadCache(userId);

  // Dedupe by name + coords
  const exists = cached.some(
    (f) => f.name === fav.name && f.lat === fav.lat && f.lng === fav.lng,
  );
  if (exists) return cached;

  const updated = [fav, ...cached];
  await saveCache(updated, userId);

  if (userId && userId !== 'local') {
    try {
      const { data } = await supabase
        .from('favorite_locations')
        .insert({
          user_id: userId,
          name: fav.name,
          latitude: fav.lat,
          longitude: fav.lng,
          nickname: fav.nickname ?? null,
          is_home: fav.is_home ?? false,
          address: fav.address ?? null,
        })
        .select()
        .single();

      if (data) {
        // Update cache entry with server id
        updated[0] = { ...updated[0], id: data.id };
        await saveCache(updated, userId);
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
  const cached = await loadCache(userId);
  const updated = cached.filter(
    (f) => !(f.name === fav.name && f.lat === fav.lat && f.lng === fav.lng),
  );
  await saveCache(updated, userId);

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
  const cached = await loadCache(userId);
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
 * Update a favorite's nickname.
 */
export async function updateFavoriteNickname(
  fav: FavoriteLocation,
  nickname: string | null,
  userId?: string | null,
): Promise<FavoriteLocation[]> {
  const cached = await loadCache(userId);
  const updated = cached.map((f) =>
    f.id === fav.id || (f.name === fav.name && f.lat === fav.lat && f.lng === fav.lng)
      ? { ...f, nickname }
      : f,
  );
  await saveCache(updated, userId);

  if (userId && userId !== 'local' && fav.id) {
    try {
      await supabase.from('favorite_locations').update({ nickname }).eq('id', fav.id);
    } catch { /* best-effort */ }
  }

  return updated;
}

/**
 * Set a favorite as home. Clears is_home on all others first.
 */
export async function setAsHome(
  fav: FavoriteLocation,
  userId?: string | null,
): Promise<FavoriteLocation[]> {
  const cached = await loadCache(userId);
  const isMatch = (f: FavoriteLocation) =>
    (fav.id && f.id === fav.id) || (f.name === fav.name && f.lat === fav.lat && f.lng === fav.lng);
  const updated = cached.map((f) => ({
    ...f,
    is_home: isMatch(f),
  }));
  await saveCache(updated, userId);

  if (userId && userId !== 'local') {
    try {
      // Clear all homes for this user first
      await supabase.from('favorite_locations').update({ is_home: false }).eq('user_id', userId);
      // Set the new home by id, or fall back to name+coords match
      if (fav.id) {
        await supabase.from('favorite_locations').update({ is_home: true }).eq('id', fav.id);
      } else {
        await supabase.from('favorite_locations').update({ is_home: true })
          .eq('user_id', userId).eq('name', fav.name).eq('latitude', fav.lat).eq('longitude', fav.lng);
      }
    } catch { /* best-effort */ }
  }

  return updated;
}

/**
 * Get the home favorite from a list (instant).
 */
export function getHomeFavorite(favs: FavoriteLocation[]): FavoriteLocation | null {
  return favs.find((f) => f.is_home) ?? null;
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
