import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { geocodePlace, planRideWindow, type GeoPlace, type RideWindowResult, type RiskLevel } from '../../lib/rideWindow';
import { useRideWindowStore } from '../../lib/store';
import { codeMeta } from '../../lib/weather';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_COLOR: Record<RiskLevel, string> = {
  CLEAR:   '#4CAF50',
  WATCH:   '#FF9800',
  WARNING: '#F44336',
  DANGER:  '#E53935',
};

function formatETA(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// ---------------------------------------------------------------------------
// City input with debounced geocode
// ---------------------------------------------------------------------------

interface CityInputProps {
  label: string;
  value: string;
  place: GeoPlace | null;
  onChange: (text: string) => void;
  onGeocode: (place: GeoPlace | null) => void;
  placeholder: string;
}

function CityInput({ label, value, place, onChange, onGeocode, placeholder }: CityInputProps) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(text: string) {
    onChange(text);
    onGeocode(null);
    setError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const result = await geocodePlace(text.trim());
      setLoading(false);
      if (result) {
        onGeocode(result);
        onChange(result.label);
      } else {
        setError('Location not found');
      }
    }, 700);
  }

  return (
    <View style={s.cityGroup}>
      <Text style={[s.cityLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={[s.cityInputRow, { backgroundColor: theme.bgPanel, borderColor: theme.border }, place && { borderColor: RISK_COLOR.CLEAR + '66' }]}>
        {loading
          ? <ActivityIndicator size="small" color={theme.red} style={{ marginRight: 8 }} />
          : place
            ? <Feather name="check-circle" size={16} color={RISK_COLOR.CLEAR} style={{ marginRight: 8 }} />
            : <Feather name="map-pin" size={16} color={theme.textSecondary} style={{ marginRight: 8 }} />
        }
        <TextInput
          style={[s.cityInputText, { color: theme.textPrimary }]}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="done"
        />
        {value.length > 0 && !loading && (
          <Pressable onPress={() => { onChange(''); onGeocode(null); setError(''); }}>
            <Feather name="x" size={14} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={[s.cityError, { color: theme.red }]}>{error}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Date chip row
// ---------------------------------------------------------------------------

function DateChips({
  selected,
  onChange,
}: {
  selected: Date;
  onChange: (d: Date) => void;
}) {
  const { theme } = useTheme();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [today, addDays(today, 1), addDays(today, 2)];

  return (
    <View style={s.chipRow}>
      {days.map((d, i) => {
        const isActive = selected.toDateString() === d.toDateString();
        const label = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : formatDate(d).toUpperCase();
        return (
          <Pressable
            key={i}
            style={[
              s.chip,
              { backgroundColor: theme.bgPanel, borderColor: theme.border },
              isActive && { backgroundColor: theme.red + '22', borderColor: theme.red },
            ]}
            onPress={() => {
              const next = new Date(d);
              next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
              onChange(next);
            }}
          >
            <Text style={[s.chipText, { color: theme.textSecondary }, isActive && { color: theme.red }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Time picker (hour + AM/PM)
// ---------------------------------------------------------------------------

function TimePicker({
  departure,
  onChange,
}: {
  departure: Date;
  onChange: (d: Date) => void;
}) {
  const { theme } = useTheme();
  const rawHour = departure.getHours();
  const displayHour = rawHour % 12 === 0 ? 12 : rawHour % 12;
  const ampm = rawHour < 12 ? 'AM' : 'PM';

  function setHour(delta: number) {
    const next = new Date(departure);
    next.setHours((rawHour + delta + 24) % 24, 0, 0, 0);
    onChange(next);
  }

  function toggleAMPM() {
    const next = new Date(departure);
    next.setHours((rawHour + 12) % 24, 0, 0, 0);
    onChange(next);
  }

  return (
    <View style={s.timeRow}>
      <Pressable style={[s.timeBtn, { backgroundColor: theme.bgPanel, borderColor: theme.border }]} onPress={() => setHour(-1)}>
        <Feather name="chevron-left" size={20} color={theme.textSecondary} />
      </Pressable>
      <View style={[s.timeDisplay, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
        <Text style={[s.timeText, { color: theme.textPrimary }]}>{displayHour}:00</Text>
      </View>
      <Pressable style={[s.timeBtn, { backgroundColor: theme.bgPanel, borderColor: theme.border }]} onPress={() => setHour(1)}>
        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
      </Pressable>
      <Pressable
        style={[s.ampmBtn, { backgroundColor: theme.bgPanel, borderColor: theme.border }, ampm === 'AM' && { backgroundColor: theme.red + '22', borderColor: theme.red }]}
        onPress={toggleAMPM}
      >
        <Text style={[s.ampmText, { color: theme.textSecondary }, ampm === 'AM' && { color: theme.red }]}>AM</Text>
      </Pressable>
      <Pressable
        style={[s.ampmBtn, { backgroundColor: theme.bgPanel, borderColor: theme.border }, ampm === 'PM' && { backgroundColor: theme.red + '22', borderColor: theme.red }]}
        onPress={toggleAMPM}
      >
        <Text style={[s.ampmText, { color: theme.textSecondary }, ampm === 'PM' && { color: theme.red }]}>PM</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Segment card
// ---------------------------------------------------------------------------

function SegmentCard({ seg }: { seg: RideWindowResult['segments'][0] }) {
  const { theme } = useTheme();
  const meta = codeMeta(seg.weatherCode);
  const riskColor = RISK_COLOR[seg.risk];

  return (
    <View style={[s.segCard, { backgroundColor: theme.bgCard, borderColor: theme.border, borderLeftColor: riskColor }]}>
      <View style={s.segHeader}>
        <Text style={[s.segName, { color: theme.textPrimary }]}>{seg.name}</Text>
        <View style={[s.riskBadge, { backgroundColor: riskColor + '22', borderColor: riskColor }]}>
          <Text style={[s.riskText, { color: riskColor }]}>{seg.risk}</Text>
        </View>
      </View>
      <View style={s.segBody}>
        <View style={s.segStat}>
          <Feather name="clock" size={12} color={theme.textSecondary} />
          <Text style={[s.segStatText, { color: theme.textSecondary }]}>{formatETA(seg.eta)}</Text>
        </View>
        <View style={s.segStat}>
          <Feather name={meta.icon as any} size={12} color={theme.textSecondary} />
          <Text style={[s.segStatText, { color: theme.textSecondary }]}>{Math.round(seg.temperature)}°F</Text>
        </View>
        {seg.precipProbability > 0 && (
          <View style={s.segStat}>
            <Feather name="cloud-rain" size={12} color="#5B9BD5" />
            <Text style={[s.segStatText, { color: '#5B9BD5' }]}>{Math.round(seg.precipProbability)}%</Text>
          </View>
        )}
        {seg.windSpeed > 0 && (
          <View style={s.segStat}>
            <Feather name="wind" size={12} color={theme.textSecondary} />
            <Text style={[s.segStatText, { color: theme.textSecondary }]}>{Math.round(seg.windSpeed)} mph</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Recommendation box
// ---------------------------------------------------------------------------

function RecommendationBox({ result }: { result: RideWindowResult }) {
  const { theme } = useTheme();
  const worstRisk: RiskLevel = result.segments.reduce<RiskLevel>((worst, s) => {
    const order: RiskLevel[] = ['CLEAR', 'WATCH', 'WARNING', 'DANGER'];
    return order.indexOf(s.risk) > order.indexOf(worst) ? s.risk : worst;
  }, 'CLEAR');

  const borderColor = RISK_COLOR[worstRisk];

  return (
    <View style={[s.recBox, { backgroundColor: theme.bgCard, borderColor: theme.border, borderLeftColor: borderColor }]}>
      <View style={s.recHeader}>
        <Feather name="flag" size={14} color={borderColor} />
        <Text style={[s.recTitle, { color: borderColor }]}>RIDE WINDOW</Text>
      </View>
      <Text style={[s.recSubtitle, { color: theme.textPrimary }]}>
        {result.fromLabel} → {result.toLabel}
      </Text>
      <Text style={[s.recMeta, { color: theme.textSecondary }]}>
        {Math.round(result.totalMiles)} mi · ~{
          result.estimatedHours < 1
            ? `${Math.round(result.estimatedHours * 60)} min`
            : `${result.estimatedHours.toFixed(1)} hr`
        } · Depart {formatETA(result.departureTime)}, {formatDate(result.departureTime)}
      </Text>
      <Text style={[s.recText, { color: theme.textPrimary }]}>{result.recommendation}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main RideWindowPlanner
// ---------------------------------------------------------------------------

export default function RideWindowPlanner() {
  const { theme } = useTheme();
  const { result, setResult } = useRideWindowStore();

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromPlace, setFromPlace] = useState<GeoPlace | null>(null);
  const [toPlace, setToPlace] = useState<GeoPlace | null>(null);

  const defaultDeparture = () => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  };
  const [departure, setDeparture] = useState<Date>(defaultDeparture);

  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState('');

  // Auto-populate FROM with current GPS location on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: lat, longitude: lng } = loc.coords;
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (!place) return;
        const city   = place.city || place.subregion || place.region || '';
        const region = place.region || '';
        const label  = city && region ? `${city}, ${region}` : city || region;
        if (!label) return;
        setFromText(label);
        setFromPlace({ lat, lng, label });
      } catch {
        // Non-fatal — user can type manually
      }
    })();
  }, []);

  async function handlePlan() {
    if (!fromPlace) { setPlanError('Enter a valid starting city.'); return; }
    if (!toPlace)   { setPlanError('Enter a valid destination city.'); return; }
    setPlanError('');
    setPlanning(true);
    try {
      const r = await planRideWindow(fromPlace, toPlace, departure);
      setResult(r);
    } catch (e: any) {
      setPlanError(e?.message ?? 'Failed to plan ride window.');
    } finally {
      setPlanning(false);
    }
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: theme.bg }]}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Route inputs */}
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Text style={[s.cardTitle, { color: theme.textSecondary }]}>ROUTE</Text>
        <CityInput
          label="FROM"
          value={fromText}
          place={fromPlace}
          onChange={setFromText}
          onGeocode={setFromPlace}
          placeholder="Starting city or zip"
        />
        <View style={s.routeArrow}>
          <Feather name="arrow-down" size={16} color={theme.textSecondary} />
        </View>
        <CityInput
          label="TO"
          value={toText}
          place={toPlace}
          onChange={setToText}
          onGeocode={setToPlace}
          placeholder="Destination city or zip"
        />
      </View>

      {/* Departure time */}
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Text style={[s.cardTitle, { color: theme.textSecondary }]}>DEPARTURE</Text>
        <DateChips selected={departure} onChange={setDeparture} />
        <View style={s.timeLabelRow}>
          <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>TIME</Text>
        </View>
        <TimePicker departure={departure} onChange={setDeparture} />
      </View>

      {/* Plan button */}
      {!!planError && <Text style={[s.planError, { color: theme.red }]}>{planError}</Text>}
      <Pressable
        style={({ pressed }) => [s.planBtn, { backgroundColor: theme.red }, pressed && s.planBtnPressed, planning && s.planBtnDisabled]}
        onPress={handlePlan}
        disabled={planning}
      >
        {planning
          ? <ActivityIndicator color="#fff" />
          : (
            <>
              <Feather name="compass" size={16} color="#fff" />
              <Text style={s.planBtnText}>PLAN WINDOW</Text>
            </>
          )
        }
      </Pressable>

      {/* Results */}
      {result && (
        <>
          <RecommendationBox result={result} />

          <Text style={[s.segSectionTitle, { color: theme.textSecondary }]}>ROUTE SEGMENTS</Text>
          {result.segments.map((seg, i) => (
            <SegmentCard key={i} seg={seg} />
          ))}

          <Text style={[s.plannedNote, { color: theme.textSecondary }]}>
            Planned {new Date(result.plannedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },

  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 14,
  },

  // City input
  cityGroup: { marginBottom: 4 },
  cityLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  cityInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  cityInputText: {
    flex: 1,
    fontSize: 15,
  },
  cityError: { fontSize: 11, marginTop: 4 },
  routeArrow: { alignItems: 'center', paddingVertical: 6 },

  // Date chips
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chipText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  // Time picker
  timeLabelRow: { marginBottom: 8 },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeBtn: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
  },
  timeDisplay: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  timeText: { fontSize: 18, fontWeight: '700' },
  ampmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 6,
  },
  ampmText: { fontSize: 13, fontWeight: '700' },

  // Plan button
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 6,
    paddingVertical: 16,
    marginBottom: 20,
  },
  planBtnPressed: { opacity: 0.8 },
  planBtnDisabled: { opacity: 0.5 },
  planBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 2 },
  planError: { fontSize: 13, marginBottom: 10, textAlign: 'center' },

  // Recommendation box
  recBox: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  recTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  recSubtitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  recMeta: { fontSize: 12, marginBottom: 10 },
  recText: { fontSize: 14, lineHeight: 20 },

  // Segment cards
  segSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 10,
  },
  segCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  segHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  segName: { fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 },
  riskBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  riskText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  segBody: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  segStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  segStatText: { fontSize: 13 },

  // Planned note
  plannedNote: { fontSize: 11, textAlign: 'center', marginTop: 8 },
});
