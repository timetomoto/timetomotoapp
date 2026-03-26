// ---------------------------------------------------------------------------
// Service intervals fetcher — shared between Garage UI and Scout tools
// Calls Gemini to get recommended service intervals for a bike model
// ---------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? '';

export interface ServiceItem {
  item: string;
  interval: string;
  notes?: string;
}

export interface CachedIntervals {
  bikeKey: string;
  assumption?: string;
  items: ServiceItem[];
  fetchedAt: string;
}

export function intervalCacheKey(bikeId: string) {
  return `ttm_service_intervals_${bikeId}`;
}

/**
 * Fetch service intervals for a bike. Checks cache first.
 * Returns cached or freshly fetched data, or null on failure.
 */
export async function getOrFetchIntervals(
  bikeId: string,
  year: string | number | undefined,
  make: string | undefined,
  model: string | undefined,
): Promise<CachedIntervals | null> {
  const cacheKey = intervalCacheKey(bikeId);
  const bikeDesc = `${year ?? ''} ${make ?? ''} ${model ?? ''}`.trim();

  // Check cache first
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const cached: CachedIntervals = JSON.parse(raw);
      if (cached.bikeKey === bikeDesc && cached.items?.length > 0) return cached;
    }
  } catch {}

  // No cache — fetch from Gemini
  if (!GEMINI_KEY || !make || !model) return null;

  const prompt = `You are a motorcycle service expert. Provide service intervals for a ${bikeDesc}.

Return ONLY a valid JSON object with this exact structure:
{
  "assumption": "string or null — note if you had to guess the model or used a close variant",
  "items": [
    {"item": "Engine Oil & Filter", "interval": "3,000–5,000 mi or 6 months", "notes": "Use 10W-40 motorcycle-specific oil"}
  ]
}

Include these items where applicable: Engine Oil & Filter, Air Filter, Spark Plugs, Valve Clearance Check, Chain Lubrication, Chain Adjustment/Replacement, Brake Fluid, Coolant (if liquid cooled), Fork Oil, Final Drive Fluid (if shaft drive), Throttle Cables, Brake Pads Inspection, Tire Inspection, Battery Check, Fuel Filter (if applicable).
If the model name is ambiguous use the closest known variant and note it in assumption. Do not include any text outside the JSON.`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
  });

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const resp = await fetch(`${endpoint}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return null;

    const json = await resp.json();
    const raw: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    if (!cleaned) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const salvaged = cleaned.replace(/,\s*$/, '') + (cleaned.includes('[') && !cleaned.endsWith(']') ? ']}' : '}');
      try { parsed = JSON.parse(salvaged); } catch { return null; }
    }

    const result: CachedIntervals = {
      bikeKey: bikeDesc,
      assumption: parsed.assumption || undefined,
      items: parsed.items ?? [],
      fetchedAt: new Date().toISOString(),
    };

    // Cache for future use
    await AsyncStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch {
    clearTimeout(timer);
    return null;
  }
}
