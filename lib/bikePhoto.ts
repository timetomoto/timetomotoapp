import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

/**
 * Launch image picker, compress/resize, upload to Supabase Storage.
 * Returns the public URL on success, or null if cancelled/failed.
 */
export async function pickAndUploadBikePhoto(
  userId: string,
  bikeId: string,
): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  // Resize then center-crop to exactly 16:9
  const asset = result.assets[0];
  const targetW = 1200;
  const targetH = Math.round(targetW * (9 / 16)); // 675

  // First resize so width = 1200 (height may overshoot if not exactly 16:9)
  const resized = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: targetW } }],
    { format: ImageManipulator.SaveFormat.JPEG },
  );

  // Center-crop to exact 16:9 if height exceeds target
  const rW = resized.width;
  const rH = resized.height;
  const cropH = Math.min(rH, targetH);
  const cropY = Math.round((rH - cropH) / 2);

  const compressed = await ImageManipulator.manipulateAsync(
    resized.uri,
    [{ crop: { originX: 0, originY: cropY, width: rW, height: cropH } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );

  // Read file as arraybuffer for upload (blob can be empty in RN)
  const response = await fetch(compressed.uri);
  const arrayBuffer = await response.arrayBuffer();

  const path = `${userId}/${bikeId}.jpg`;

  const { error } = await supabase.storage
    .from('bike-photos')
    .upload(path, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    console.error('Bike photo upload error:', error.message);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('bike-photos')
    .getPublicUrl(path);

  // Append cache-buster so the image refreshes after re-upload
  return `${urlData.publicUrl}?t=${Date.now()}`;
}

/**
 * Save photo_url to the bikes table in Supabase.
 */
export async function saveBikePhotoUrl(bikeId: string, photoUrl: string): Promise<void> {
  await supabase
    .from('bikes')
    .update({ photo_url: photoUrl })
    .eq('id', bikeId);
}

// ---------------------------------------------------------------------------
// Wikimedia default photo lookup
// ---------------------------------------------------------------------------

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

// Cache version — bump to invalidate all cached results after logic changes
const CACHE_VERSION = 3;

// In-memory cache keyed by bikeId
const wikiPhotoCache: Record<string, string> = {};

/**
 * Clear cached Wikimedia photo for a bike (call when make/model changes).
 */
export async function clearWikiPhotoCache(bikeId: string): Promise<void> {
  delete wikiPhotoCache[bikeId];
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(`wiki_photo_${bikeId}`);
  } catch { /* ignore */ }
}

/**
 * Fetch a default bike photo from Wikipedia using make + model search.
 * Returns a thumbnail URL or null. Results are cached in memory per bikeId
 * and persisted to AsyncStorage for 30 days.
 */
export async function fetchWikimediaBikePhoto(
  make: string,
  model: string,
  bikeId: string,
): Promise<string | null> {
  // Check in-memory cache
  if (wikiPhotoCache[bikeId]) return wikiPhotoCache[bikeId];

  // Check AsyncStorage cache
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const cacheKey = `wiki_photo_${bikeId}`;
    const stored = await AsyncStorage.getItem(cacheKey);
    if (stored) {
      const { url, ts, v } = JSON.parse(stored);
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      if (url && v === CACHE_VERSION && Date.now() - ts < THIRTY_DAYS) {
        wikiPhotoCache[bikeId] = url;
        return url;
      }
    }
  } catch { /* ignore storage errors */ }

  // Fetch from Wikipedia
  const url = await fetchFromWiki(make, model);
  if (url) wikiPhotoCache[bikeId] = url;

  // Persist to AsyncStorage (only cache successful results)
  if (url) {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem(
        `wiki_photo_${bikeId}`,
        JSON.stringify({ url, ts: Date.now(), v: CACHE_VERSION }),
      );
    } catch { /* ignore */ }
  }

  return url;
}

/** Try to get a thumbnail from a Wikipedia article by exact title. */
async function getThumbnail(title: string): Promise<string | null> {
  const res = await fetch(
    `${WIKI_API}?action=query&titles=${encodeURIComponent(title)}` +
    `&prop=pageimages&format=json&pithumbsize=600&origin=*`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  const page = Object.values(data?.query?.pages ?? {})[0] as any;
  // Pages that don't exist have "missing" key
  if (page?.missing !== undefined) return null;
  return page?.thumbnail?.source ?? null;
}

async function fetchFromWiki(make: string, model: string): Promise<string | null> {
  try {
    // Strategy 1 — direct Wikipedia title lookup (most accurate)
    const directThumb = await getThumbnail(`${make} ${model}`);
    if (directThumb) return directThumb;

    // Strategy 2 — Wikimedia Commons search (has newer/more specific photos)
    const commonsUrl = await fetchFromCommons(make, model);
    if (commonsUrl) return commonsUrl;

    // Strategy 3 — Wikipedia search, accept results that match the bike
    const searchQuery = encodeURIComponent(`${make} ${model} motorcycle`);
    const searchRes = await fetch(
      `${WIKI_API}?action=query&list=search&srsearch=${searchQuery}` +
      `&format=json&origin=*&srlimit=5`,
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData?.query?.search ?? [];

    const modelLower = model.toLowerCase();
    const fullName = `${make} ${model}`.toLowerCase();
    const modelKey = model.split(/\s+/)[0].toLowerCase();

    for (const result of results) {
      const titleLower = (result.title as string).toLowerCase();
      const titleMatch = titleLower.includes(modelLower) || titleLower.includes(modelKey);
      const titleModelPart = titleLower.replace(make.toLowerCase(), '').trim();
      const reverseMatch = titleModelPart.length > 2 && (fullName.includes(titleModelPart) || modelLower.includes(titleModelPart));
      if (titleMatch || reverseMatch) {
        const thumb = await getThumbnail(result.title);
        if (thumb) return thumb;
      }
    }

    return null;
  } catch {
    return null;
  }
}

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/** Search Wikimedia Commons for a bike photo (often has newer, more specific images). */
async function fetchFromCommons(make: string, model: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${make} ${model}`);
    const res = await fetch(
      `${COMMONS_API}?action=query&list=search&srsearch=${query}` +
      `&srnamespace=6&format=json&origin=*&srlimit=3`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.query?.search ?? [];

    const modelLower = model.toLowerCase();
    const modelKey = model.split(/\s+/)[0].toLowerCase();

    for (const result of results) {
      const titleLower = (result.title as string).toLowerCase();
      if (!titleLower.includes(modelKey) && !titleLower.includes(make.toLowerCase())) continue;
      // Only accept image files
      if (!titleLower.match(/\.(jpg|jpeg|png)$/)) continue;

      const infoRes = await fetch(
        `${COMMONS_API}?action=query&titles=${encodeURIComponent(result.title)}` +
        `&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json&origin=*`,
      );
      if (!infoRes.ok) continue;
      const infoData = await infoRes.json();
      const page = Object.values(infoData?.query?.pages ?? {})[0] as any;
      const thumbUrl = page?.imageinfo?.[0]?.thumburl;
      if (thumbUrl) return thumbUrl;
    }
    return null;
  } catch {
    return null;
  }
}
