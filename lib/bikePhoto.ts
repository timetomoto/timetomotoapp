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
const CACHE_VERSION = 2;

// In-memory cache keyed by bikeId
const wikiPhotoCache: Record<string, string> = {};

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
    // Strategy 1 — direct title lookup (most accurate)
    // Try "Make Model" first, e.g. "Honda CRF250L"
    const directThumb = await getThumbnail(`${make} ${model}`);
    if (directThumb) return directThumb;

    // Strategy 2 — search, but only accept results that contain the model name
    const searchQuery = encodeURIComponent(`${make} ${model} motorcycle`);
    const searchRes = await fetch(
      `${WIKI_API}?action=query&list=search&srsearch=${searchQuery}` +
      `&format=json&origin=*&srlimit=5`,
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData?.query?.search ?? [];

    // Find the first result whose title contains the model (or a key part of it)
    const modelLower = model.toLowerCase();
    // Extract the main model identifier (first word/number, e.g. "CRF250L" from "CRF250L Rally")
    const modelKey = model.split(/\s+/)[0].toLowerCase();

    for (const result of results) {
      const titleLower = (result.title as string).toLowerCase();
      if (titleLower.includes(modelLower) || titleLower.includes(modelKey)) {
        const thumb = await getThumbnail(result.title);
        if (thumb) return thumb;
      }
    }

    return null;
  } catch {
    return null;
  }
}
