import { useEffect, useState } from 'react';
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
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  });

  // Try endpoints in order until one succeeds
  const endpoints = [
    'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent',
  ];
  let lastError = 'No models available';

  for (const endpoint of endpoints) {
    const resp = await fetch(
      `${endpoint}?key=${GEMINI_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      lastError = `${endpoint.split('/models/')[1]?.split(':')[0]} ${resp.status}: ${text.slice(0, 120)}`;
      continue; // try next model
    }

    const json = await resp.json();
    const raw: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
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

export default function ServiceIntervalsSection({ bike }: { bike: Bike }) {
  const { theme } = useTheme();
  const [result, setResult]   = useState<CachedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Load cached result on mount / bike change
  useEffect(() => {
    const key = cacheKey(bike.id);
    AsyncStorage.getItem(key).then((v) => {
      if (v) {
        const cached: CachedResult = JSON.parse(v);
        setResult(cached);
      } else {
        setResult(null);
      }
    });
    setError(null);
  }, [bike.id]);

  async function handleLookup() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchServiceIntervals(bike);
      const cached: CachedResult = {
        bikeKey: bike.id,
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

  const bikeLabel = `${bike.year ?? ''} ${bike.make ?? ''} ${bike.model ?? ''}`.trim();

  return (
    <View style={s.root}>
      {/* Header row */}
      <View style={s.headerRow}>
        <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>SERVICE INTERVALS</Text>
        {result && (
          <Pressable onPress={handleRefresh} hitSlop={8} style={s.iconBtn}>
            <Feather name="refresh-cw" size={15} color={theme.textSecondary} />
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
            <Feather name="search" size={15} color="#fff" />
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

      {/* Results */}
      {result && !loading && (
        <>
          <Text style={[s.fetchedAt, { color: theme.textMuted }]}>
            Last updated {new Date(result.fetchedAt).toLocaleDateString()}
          </Text>
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
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { padding: 16 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  iconBtn: { padding: 4 },

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
  emptyTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
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
  lookupBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 2 },

  loadingState: { alignItems: 'center', paddingVertical: 40, gap: 14 },
  loadingText: { fontSize: 13 },

  fetchedAt: { fontSize: 10, letterSpacing: 1, marginBottom: 10 },

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
});
