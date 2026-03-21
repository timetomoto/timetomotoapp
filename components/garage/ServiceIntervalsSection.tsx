import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../lib/useTheme';
import type { Bike } from '../../lib/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceItem {
  item: string;
  interval: string;
  notes?: string;
}

interface CachedResult {
  bikeKey: string;
  assumption?: string;
  items: ServiceItem[];
  fetchedAt: string;
}

function cacheKey(bikeId: string) {
  return `ttm_service_intervals_${bikeId}`;
}

// ---------------------------------------------------------------------------
// Gemini fetch
// ---------------------------------------------------------------------------

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? '';

async function fetchServiceIntervals(bike: Bike): Promise<{ assumption?: string; items: ServiceItem[] }> {
  const bikeDesc = `${bike.year ?? ''} ${bike.make ?? ''} ${bike.model ?? ''}`.trim();

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

  // Try endpoints in order until one succeeds (fast non-thinking models first)
  const endpoints = [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
  ];
  let lastError = 'No models available';

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let resp: Response;
    try {
      resp = await fetch(
        `${endpoint}?key=${GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal },
      );
    } catch (e: any) {
      lastError = e.name === 'AbortError' ? 'Request timed out — try again' : (e.message ?? 'Network error');
      clearTimeout(timer);
      continue;
    }
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      lastError = `${endpoint.split('/models/')[1]?.split(':')[0]} ${resp.status}: ${text.slice(0, 120)}`;
      continue; // try next model
    }

    const json = await resp.json();
    const raw: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    if (!cleaned) {
      lastError = 'Empty response from AI';
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to salvage truncated JSON by closing open brackets
      const salvaged = cleaned.replace(/,\s*$/, '') + (cleaned.includes('[') && !cleaned.endsWith(']') ? ']}' : '}');
      try {
        parsed = JSON.parse(salvaged);
      } catch {
        lastError = 'AI returned invalid data — try again';
        continue;
      }
    }

    return {
      assumption: parsed.assumption || undefined,
      items: parsed.items ?? [],
    };
  }

  throw new Error(lastError);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ServiceIntervalsSection({ bike, onCountChange }: { bike: Bike; onCountChange?: (n: number) => void }) {
  const { theme } = useTheme();
  const collapsed = false; // controlled by parent garage section
  const [result, setResult]   = useState<CachedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Load cached result on mount / bike change; invalidate if make/model/year changed
  const bikeDesc = `${bike.year ?? ''} ${bike.make ?? ''} ${bike.model ?? ''}`.trim();
  useEffect(() => {
    const key = cacheKey(bike.id);
    AsyncStorage.getItem(key).then((v) => {
      if (v) {
        const cached: CachedResult = JSON.parse(v);
        // If cached data was for a different make/model/year, clear it
        if (cached.bikeKey !== bikeDesc) {
          AsyncStorage.removeItem(key);
          setResult(null);
          return;
        }
        setResult(cached);
      } else {
        setResult(null);
      }
    });
    setError(null);
  }, [bike.id, bike.make, bike.model, bike.year]);

  async function handleLookup() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchServiceIntervals(bike);
      const cached: CachedResult = {
        bikeKey: bikeDesc,
        ...data,
        fetchedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(cacheKey(bike.id), JSON.stringify(cached));
      setResult(cached);
    } catch (e: any) {
      setError(e.message ?? 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    await AsyncStorage.removeItem(cacheKey(bike.id));
    setResult(null);
    handleLookup();
  }

  // Auto-lookup on first expand if no cached data
  const hasTriggered = useRef(false);
  useEffect(() => {
    if (collapsed || loading || hasTriggered.current) return;
    if (!result && bike.make && bike.model) {
      hasTriggered.current = true;
      handleLookup();
    }
  }, [collapsed]);

  const bikeLabel = `${bike.year ?? ''} ${bike.make ?? ''} ${bike.model ?? ''}`.trim();

  const itemCount = result?.items?.length ?? 0;

  useEffect(() => { onCountChange?.(itemCount); }, [itemCount]);

  return (
    <View style={s.root}>
      <View>
      {/* Action row */}
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          {result && (
            <Text style={[s.checkedAt, { color: theme.textMuted }]}>
              Last checked {new Date(result.fetchedAt).toLocaleDateString()}
            </Text>
          )}
        </View>
        {result && !loading && (
          <Pressable
            style={[s.refreshBtn, { backgroundColor: theme.red }]}
            onPress={handleRefresh}
            hitSlop={6}
          >
            <Feather name="refresh-cw" size={12} color={theme.white} />
            <Text style={s.refreshBtnText}>REFRESH</Text>
          </Pressable>
        )}
      </View>

      {/* Assumption banner */}
      {result?.assumption && (
        <View style={[s.assumptionBanner, { backgroundColor: '#FF980018', borderColor: '#FF9800' }]}>
          <Feather name="info" size={13} color="#FF9800" />
          <Text style={[s.assumptionText, { color: '#FF9800' }]}>{result.assumption}</Text>
        </View>
      )}

      {/* Empty / lookup prompt */}
      {!result && !loading && (
        <View style={s.emptyState}>
          <Feather name="tool" size={28} color={theme.border} />
          <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>No service data yet</Text>
          <Text style={[s.emptySubtitle, { color: theme.textSecondary }]}>
            Look up recommended service intervals for your {bikeLabel} using AI.
          </Text>
          {error && (
            <Text style={[s.errorText, { color: theme.red }]}>{error}</Text>
          )}
          <Pressable
            style={({ pressed }) => [s.lookupBtn, { backgroundColor: theme.red }, pressed && { opacity: 0.8 }]}
            onPress={handleLookup}
          >
            <Feather name="search" size={15} color={theme.white} />
            <Text style={s.lookupBtnText}>LOOK UP INTERVALS</Text>
          </Pressable>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={s.loadingState}>
          <ActivityIndicator color={theme.red} />
          <Text style={[s.loadingText, { color: theme.textSecondary }]}>
            Looking up {bikeLabel}…
          </Text>
        </View>
      )}

      {/* Data source caption */}
      {result && !loading && (
        <Text style={[s.dataSource, { color: theme.textMuted }]}>
          Data sourced from Google Gemini. Intervals are general guidelines and may vary by model year, region, or riding conditions. Always consult your owner's manual for manufacturer-recommended service schedules.
        </Text>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {result.items.map((item, i) => (
            <View
              key={i}
              style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            >
              <Text style={[s.cardItem, { color: theme.textPrimary }]}>{item.item}</Text>
              <Text style={[s.cardInterval, { color: theme.red }]}>{item.interval}</Text>
              {item.notes && (
                <Text style={[s.cardNotes, { color: theme.textSecondary }]}>{item.notes}</Text>
              )}
            </View>
          ))}

          {error && (
            <Text style={[s.errorText, { color: theme.red }]}>{error}</Text>
          )}
        </>
      )}

      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },

  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collapseRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  headerLeft: { flex: 1, gap: 2 },
  checkedAt: { fontSize: 10, letterSpacing: 0.2 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshBtnText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  assumptionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  assumptionText: { flex: 1, fontSize: 12, lineHeight: 17 },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
    paddingHorizontal: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 19 },

  lookupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  lookupBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

  loadingState: { alignItems: 'center', paddingVertical: 40, gap: 14 },
  loadingText: { fontSize: 13 },

  fetchedAt: { fontSize: 10, letterSpacing: 0.3, marginBottom: 10 },

  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    gap: 4,
  },
  cardItem: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardInterval: { fontSize: 13, fontWeight: '600', lineHeight: 18, marginTop: 2 },
  cardNotes: { fontSize: 11, lineHeight: 17, marginTop: 4 },

  errorText: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  dataSource: { fontSize: 10, lineHeight: 14, marginTop: 16, marginBottom: 8, fontStyle: 'italic' },
});
