import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import type { TrackPoint } from '../../lib/gpx';
import { calcDistance, calcElevationGain } from '../../lib/gpx';
import { reverseGeocode } from '../../lib/geocode';
import { useGarageStore } from '../../lib/store';
// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  points: TrackPoint[];
  durationSeconds: number;
  onSave: (name: string) => Promise<void>;
  onDiscard: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${secs % 60}s`;
}

function defaultName() {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }) + ' Ride';
}

// ---------------------------------------------------------------------------
// SaveRideSheet
// ---------------------------------------------------------------------------

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? '';

export default function SaveRideSheet({ visible, points, durationSeconds, onSave, onDiscard }: Props) {
  const { theme } = useTheme();
  const [name, setName]     = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const summaryFetched = useRef(false);

  const distanceMiles   = calcDistance(points);
  const elevationGainFt = calcElevationGain(points);
  const avgSpeedMph     = durationSeconds > 0 ? (distanceMiles / durationSeconds) * 3600 : 0;

  // Bike info
  const bikes = useGarageStore((s) => s.bikes);
  const selectedBikeId = useGarageStore((s) => s.selectedBikeId);
  const activeBike = bikes.find((b) => b.id === selectedBikeId);
  const bikeNickname = activeBike?.nickname ?? activeBike?.model ?? 'bike';

  // Auto-generate ride name + summary via Gemini on mount
  useEffect(() => {
    if (!visible || summaryFetched.current || !GEMINI_KEY) return;
    summaryFetched.current = true;

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    (async () => {
      try {
        // Reverse geocode start city
        let startCity = '';
        if (points.length > 0) {
          startCity = await reverseGeocode(points[0].lat, points[0].lng);
          startCity = startCity.split(',')[0] ?? startCity;
        }

        if (cancelled) return;

        const hrs = Math.floor(durationSeconds / 3600);
        const mins = Math.round((durationSeconds % 3600) / 60);
        const durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

        const prompt =
          `Return JSON only: { "suggestedName": string, "summary": string }\n` +
          `Ride stats: ${distanceMiles.toFixed(1)}mi, ${durationStr}, ${Math.round(elevationGainFt)}ft gain, ` +
          `${Math.round(avgSpeedMph)}mph avg, on ${bikeNickname}, starting near ${startCity}.\n` +
          `Name should be 3-5 words, evocative of the ride.\n` +
          `Summary should be 1-2 sentences, rider-tone, no fluff.`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
            }),
            signal: controller.signal,
          },
        );
        clearTimeout(timer);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const raw: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!cancelled) {
          if (parsed.suggestedName) setName(parsed.suggestedName);
          if (parsed.summary) setSummary(parsed.summary);
        }
      } catch {
        // Fail silently — keep default name
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [visible]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      summaryFetched.current = false;
      setSummary(null);
    }
  }, [visible]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(name.trim() || defaultName());
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDiscard}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onDiscard} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View style={[s.sheet, { maxHeight: Dimensions.get('window').height * 0.75, backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <View style={[s.handle, { backgroundColor: theme.border }]} />

          <Text style={[s.title, { color: theme.textPrimary }]}>SAVE THIS RIDE?</Text>

          {/* Scout summary */}
          {summary && (
            <View style={[s.summaryCard, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
              <View style={{ width: 14, height: 14 }}>
                <View style={{ position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 1.2, borderColor: theme.red }} />
                <View style={{ position: 'absolute', left: 6, top: 2, width: 1.5, height: 4.5, backgroundColor: theme.red, borderRadius: 1 }} />
                <View style={{ position: 'absolute', left: 6, top: 7.5, width: 1.5, height: 4.5, backgroundColor: theme.red, opacity: 0.4, borderRadius: 1 }} />
              </View>
              <Text style={[s.summaryText, { color: theme.textSecondary }]}>{summary}</Text>
            </View>
          )}

          {/* Stats */}
          <View style={[s.statsRow, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: theme.textPrimary }]}>
                {distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)}
              </Text>
              <Text style={[s.statLabel, { color: theme.textSecondary }]}>MILES</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: theme.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: theme.textPrimary }]}>{fmtDuration(durationSeconds)}</Text>
              <Text style={[s.statLabel, { color: theme.textSecondary }]}>MOVING TIME</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: theme.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: theme.textPrimary }]}>{Math.round(avgSpeedMph)}</Text>
              <Text style={[s.statLabel, { color: theme.textSecondary }]}>AVG MPH</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: theme.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: theme.textPrimary }]}>{Math.round(elevationGainFt).toLocaleString()}</Text>
              <Text style={[s.statLabel, { color: theme.textSecondary }]}>FT GAIN</Text>
            </View>
          </View>

          {/* Name input */}
          <Text style={[s.inputLabel, { color: theme.textSecondary }]}>RIDE NAME</Text>
          <TextInput
            style={[s.input, { backgroundColor: theme.bgPanel, borderColor: theme.border, color: theme.textPrimary }]}
            value={name}
            onChangeText={setName}
            placeholder="Enter a name…"
            placeholderTextColor={theme.textSecondary}
            selectionColor={theme.red}
            returnKeyType="done"
            maxLength={80}
          />

          {/* Actions */}
          <Pressable
            style={[s.saveBtn, { backgroundColor: theme.red }, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={theme.white} />
              : <>
                  <Feather name="save" size={18} color={theme.white} />
                  <Text style={s.saveBtnText}>SAVE TO ROUTES</Text>
                </>
            }
          </Pressable>

          <Pressable style={s.discardBtn} onPress={onDiscard} disabled={saving}>
            <Text style={[s.discardBtnText, { color: theme.textSecondary }]}>DISCARD RIDE</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.7,
    textAlign: 'center',
  },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryText: { flex: 1, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  statsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
  },
  statItem:  { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  statDivider: { width: 1, marginVertical: 4 },

  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: -8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 10,
    paddingVertical: 16,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  discardBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  discardBtnText: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
