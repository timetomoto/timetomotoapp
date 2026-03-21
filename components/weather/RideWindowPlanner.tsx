import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { planRideWindow, type GeoPlace, type RideWindowResult, type RiskLevel } from '../../lib/rideWindow';
import { loadFavorites, type FavoriteLocation } from '../../lib/favorites';
import { useAuthStore, useRoutesStore } from '../../lib/store';
import { useRideWindowStore } from '../../lib/store';
import type { Route } from '../../lib/routes';
import { codeMeta } from '../../lib/weather';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_COLOR: Record<RiskLevel, string> = {
  CLEAR:   '#2E7D32',
  WATCH:   '#FF9800',
  WARNING: '#F44336',
  DANGER:  '#C62828',
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
// Location search input with Mapbox autocomplete
// ---------------------------------------------------------------------------

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

interface LocationSearchResult {
  name: string;
  lat: number;
  lng: number;
}

interface CityInputProps {
  label: string;
  value: string;
  place: GeoPlace | null;
  onChange: (text: string) => void;
  onGeocode: (place: GeoPlace | null) => void;
  placeholder: string;
  userLocation?: { lat: number; lng: number } | null;
  favorites?: FavoriteLocation[];
}

function CityInput({ label, value, place, onChange, onGeocode, placeholder, userLocation, favorites = [] }: CityInputProps) {
  const { theme } = useTheme();
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(text: string) {
    onChange(text);
    onGeocode(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const proxLng = userLocation?.lng ?? -97.7431;
        const proxLat = userLocation?.lat ?? 30.2672;
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text.trim())}.json?access_token=${MAPBOX_TOKEN}&types=place,address,postcode&country=us&limit=5&proximity=${proxLng},${proxLat}`;
        const res = await fetch(url);
        const json = await res.json();
        setResults((json.features ?? []).map((f: any) => ({
          name: f.place_name,
          lat: f.center[1],
          lng: f.center[0],
        })));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  function selectResult(r: LocationSearchResult) {
    onChange(r.name);
    onGeocode({ lat: r.lat, lng: r.lng, label: r.name });
    setResults([]);
    setFocused(false);
    Keyboard.dismiss();
  }

  function selectFavorite(fav: FavoriteLocation) {
    const name = fav.nickname || fav.name;
    onChange(name);
    onGeocode({ lat: fav.lat, lng: fav.lng, label: name });
    setResults([]);
    setFocused(false);
    Keyboard.dismiss();
  }

  const showFavorites = focused && !value.trim() && favorites.length > 0 && results.length === 0;
  const showResults = results.length > 0;

  return (
    <View style={s.cityGroup}>
      <Text style={[s.cityLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={[s.cityInputRow, { backgroundColor: theme.bgPanel, borderColor: theme.border }, place && { borderColor: RISK_COLOR.CLEAR + '66' }]}>
        {searching
          ? <ActivityIndicator size="small" color={theme.red} style={{ marginRight: 8 }} />
          : place
            ? <Feather name="check-circle" size={16} color={RISK_COLOR.CLEAR} style={{ marginRight: 8 }} />
            : <Feather name="map-pin" size={16} color={theme.textSecondary} style={{ marginRight: 8 }} />
        }
        <TextInput
          style={[s.cityInputText, { color: theme.textPrimary }]}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => { setFocused(false); setResults([]); }, 200)}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="done"
        />
        {value.length > 0 && !searching && (
          <Pressable onPress={() => { onChange(''); onGeocode(null); setResults([]); }}>
            <Feather name="x" size={14} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>
      {(showResults || showFavorites) && (
        <View style={[s.dropdown, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
          {showFavorites && (
            <>
              <Text style={[s.dropdownSectionLabel, { color: theme.textMuted }]}>FAVORITES</Text>
              {[...favorites].sort((a, b) => (b.is_home ? 1 : 0) - (a.is_home ? 1 : 0)).map((fav, i) => (
                <Pressable
                  key={`fav-${i}`}
                  style={[s.dropdownItem, { borderBottomColor: theme.border }]}
                  onPress={() => selectFavorite(fav)}
                >
                  <Feather name="heart" size={12} color={theme.red} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[s.dropdownText, { color: theme.textPrimary }]} numberOfLines={1}>
                        {fav.nickname || fav.name}
                      </Text>
                      {fav.is_home && <Feather name="home" size={12} color={theme.green} style={{ marginLeft: 4 }} />}
                    </View>
                    {fav.nickname ? (
                      <Text style={[s.dropdownSubtext, { color: theme.textMuted }]} numberOfLines={1}>{fav.name}</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </>
          )}
          {showResults && results.map((r, i) => (
            <Pressable
              key={`${r.lat}-${r.lng}-${i}`}
              style={[s.dropdownItem, { borderBottomColor: theme.border }]}
              onPress={() => selectResult(r)}
            >
              <Feather name="map-pin" size={12} color={theme.textSecondary} />
              <Text style={[s.dropdownText, { color: theme.textPrimary }]} numberOfLines={1}>{r.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
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

interface RideWindowPlannerProps {
  onNavigate?: (from: GeoPlace, to: GeoPlace) => void;
  onNavigateRoute?: (route: Route) => void;
}

type PlannerMode = 'plan' | 'saved';

export default function RideWindowPlanner({ onNavigate, onNavigateRoute }: RideWindowPlannerProps = {}) {
  const { theme } = useTheme();
  const { result, setResult } = useRideWindowStore();
  const { routes: savedRoutes } = useRoutesStore();
  const { user } = useAuthStore();
  const userId = user?.id ?? 'local';
  const [mode, setModeRaw] = useState<PlannerMode>('plan');
  const setMode = (m: PlannerMode) => { setModeRaw(m); setResult(null); };

  // Clear stale results on mount
  useEffect(() => { setResult(null); }, []);

  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromPlace, setFromPlace] = useState<GeoPlace | null>(null);
  const [toPlace, setToPlace] = useState<GeoPlace | null>(null);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  const defaultDeparture = () => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  };
  const [departure, setDeparture] = useState<Date>(defaultDeparture);

  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState('');

  // Saved route mode state
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  // Auto-populate FROM with current GPS + load favorites on mount
  useEffect(() => {
    loadFavorites(userId).then(setFavorites).catch(() => {});
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: lat, longitude: lng } = loc.coords;
        setUserLoc({ lat, lng });
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

  const lastFetchRef = useRef<{ key: string; ts: number }>({ key: '', ts: 0 });
  const planTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handlePlan() {
    if (!fromPlace) { setPlanError('Enter a valid starting city.'); return; }
    if (!toPlace)   { setPlanError('Enter a valid destination city.'); return; }

    // Skip if same coordinates were fetched within 5 minutes
    const cacheKey = `${fromPlace.lat.toFixed(3)},${fromPlace.lng.toFixed(3)}-${toPlace.lat.toFixed(3)},${toPlace.lng.toFixed(3)}`;
    if (cacheKey === lastFetchRef.current.key && Date.now() - lastFetchRef.current.ts < 5 * 60 * 1000 && result) {
      return; // Already have fresh results for these coords
    }

    // Debounce 1s
    if (planTimerRef.current) clearTimeout(planTimerRef.current);
    setPlanError('');
    setPlanning(true);
    planTimerRef.current = setTimeout(async () => {
      try {
        const r = await planRideWindow(fromPlace, toPlace, departure);
        setResult(r);
        lastFetchRef.current = { key: cacheKey, ts: Date.now() };
      } catch (e: any) {
        setPlanError(e?.message ?? 'Failed to plan ride window.');
      } finally {
        setPlanning(false);
      }
    }, 1000);
  }

  function handleSelectSavedRoute(route: Route) {
    setSelectedRoute(route);
    setResult(null);
  }

  function handleSavedRoutePlan() {
    if (!selectedRoute || selectedRoute.points.length < 2) return;
    const first = selectedRoute.points[0];
    const last = selectedRoute.points[selectedRoute.points.length - 1];
    const from: GeoPlace = { lat: first.lat, lng: first.lng, label: selectedRoute.name.split('→')[0]?.trim() || 'Start' };
    const to: GeoPlace = { lat: last.lat, lng: last.lng, label: selectedRoute.name.split('→')[1]?.trim() || selectedRoute.name };
    setPlanError('');
    setPlanning(true);
    setTimeout(async () => {
      try {
        const r = await planRideWindow(from, to, departure);
        setResult(r);
      } catch (e: any) {
        setPlanError(e?.message ?? 'Failed to load weather for this route.');
      } finally {
        setPlanning(false);
      }
    }, 1000);
  }

  function clearSavedRoute() {
    setSelectedRoute(null);
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: theme.bg }]}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Mode toggle */}
      <View style={[s.modeRow, { borderColor: theme.border }]}>
        <Pressable
          style={[s.modeBtn, mode === 'plan' && { backgroundColor: theme.red }]}
          onPress={() => setMode('plan')}
        >
          <Text style={[s.modeBtnText, { color: mode === 'plan' ? theme.white : theme.textSecondary }]}>PLAN A ROUTE</Text>
        </Pressable>
        <Pressable
          style={[s.modeBtn, mode === 'saved' && { backgroundColor: theme.red }]}
          onPress={() => setMode('saved')}
        >
          <Text style={[s.modeBtnText, { color: mode === 'saved' ? theme.white : theme.textSecondary }]}>USE SAVED ROUTE</Text>
        </Pressable>
      </View>

      {/* SAVED ROUTE mode */}
      {mode === 'saved' && (
        <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          {selectedRoute ? (
            <>
              <View style={s.selectedRouteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: theme.textSecondary }]}>SELECTED ROUTE</Text>
                  <Text style={[s.selectedRouteName, { color: theme.textPrimary }]}>{selectedRoute.name}</Text>
                  <Text style={[s.selectedRouteMeta, { color: theme.textMuted }]}>
                    {selectedRoute.distance_miles.toFixed(1)} mi
                    {selectedRoute.duration_seconds ? ` · ${Math.floor(selectedRoute.duration_seconds / 3600)}h ${Math.floor((selectedRoute.duration_seconds % 3600) / 60)}m` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => { clearSavedRoute(); setResult(null); }} hitSlop={8} style={{ padding: 4 }}>
                  <Feather name="x" size={18} color={theme.textMuted} />
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={[s.cardTitle, { color: theme.textSecondary }]}>SELECT A ROUTE</Text>
              {savedRoutes.length === 0 ? (
                <Text style={[s.noRoutesText, { color: theme.textMuted }]}>No saved routes yet.</Text>
              ) : (
                savedRoutes.map((route) => (
                  <Pressable
                    key={route.id}
                    style={[s.routePickerRow, { borderBottomColor: theme.border }]}
                    onPress={() => handleSelectSavedRoute(route)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.routePickerName, { color: theme.textPrimary }]} numberOfLines={1}>{route.name}</Text>
                      <Text style={[s.routePickerMeta, { color: theme.textMuted }]}>{route.distance_miles.toFixed(1)} mi{route.category ? ` · ${route.category}` : ''}</Text>
                    </View>
                    <Feather name="chevron-right" size={14} color={theme.textMuted} />
                  </Pressable>
                ))
              )}
            </>
          )}
        </View>
      )}

      {/* PLAN A ROUTE mode */}
      {mode === 'plan' && (
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Text style={[s.cardTitle, { color: theme.textSecondary }]}>ROUTE</Text>
        <CityInput
          label="FROM"
          value={fromText}
          place={fromPlace}
          onChange={setFromText}
          onGeocode={(p) => { setFromPlace(p); if (!p) setResult(null); }}
          placeholder="Search a location"
          userLocation={userLoc}
          favorites={favorites}
        />
        <View style={s.routeArrow}>
          <Feather name="arrow-down" size={16} color={theme.textSecondary} />
        </View>
        <CityInput
          label="TO"
          value={toText}
          place={toPlace}
          onChange={setToText}
          onGeocode={(p) => { setToPlace(p); if (!p) setResult(null); }}
          placeholder="Search a location"
          userLocation={userLoc}
          favorites={favorites}
        />
      </View>
      )}

      {/* Departure time — both modes */}
      {(mode === 'plan' || (mode === 'saved' && selectedRoute)) && (
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Text style={[s.cardTitle, { color: theme.textSecondary }]}>DEPARTURE</Text>
        <DateChips selected={departure} onChange={setDeparture} />
        <View style={s.timeLabelRow}>
          <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>TIME</Text>
        </View>
        <TimePicker departure={departure} onChange={setDeparture} />
      </View>
      )}

      {/* Plan button */}
      {mode === 'plan' && (
      <>
      {!!planError && <Text style={[s.planError, { color: theme.red }]}>{planError}</Text>}
      <Pressable
        style={({ pressed }) => [s.planBtn, { backgroundColor: theme.red }, pressed && s.planBtnPressed, planning && s.planBtnDisabled]}
        onPress={handlePlan}
        disabled={planning}
      >
        {planning
          ? <ActivityIndicator color={theme.white} />
          : (
            <>
              <Feather name="cloud" size={16} color={theme.white} />
              <Text style={s.planBtnText}>{result ? 'REFRESH WEATHER CONDITIONS' : 'GET WEATHER CONDITIONS'}</Text>
            </>
          )
        }
      </Pressable>

      </>
      )}

      {/* GET WEATHER CONDITIONS — saved route mode */}
      {mode === 'saved' && selectedRoute && (
      <>
      {!!planError && <Text style={[s.planError, { color: theme.red }]}>{planError}</Text>}
      <Pressable
        style={({ pressed }) => [s.planBtn, { backgroundColor: theme.red }, pressed && s.planBtnPressed, planning && s.planBtnDisabled]}
        onPress={handleSavedRoutePlan}
        disabled={planning}
      >
        {planning
          ? <ActivityIndicator color={theme.white} />
          : (
            <>
              <Feather name="cloud" size={16} color={theme.white} />
              <Text style={s.planBtnText}>{result ? 'REFRESH WEATHER CONDITIONS' : 'GET WEATHER CONDITIONS'}</Text>
            </>
          )
        }
      </Pressable>
      </>
      )}

      {/* Shared results — both modes */}
      {result && (mode === 'plan' ? (fromPlace && toPlace) : selectedRoute) && (
        <>
          <RecommendationBox result={result} />

          <Text style={[s.segSectionTitle, { color: theme.textSecondary }]}>ROUTE SEGMENTS</Text>
          {result.segments.map((seg, i) => (
            <SegmentCard key={i} seg={seg} />
          ))}

          <Text style={[s.plannedNote, { color: theme.textSecondary }]}>
            Planned {new Date(result.plannedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>

          {/* Navigate — plan mode */}
          {mode === 'plan' && onNavigate && fromPlace && toPlace && (
            <Pressable
              style={[s.navigateBtn, { backgroundColor: theme.red }]}
              onPress={() => onNavigate(fromPlace, toPlace)}
            >
              <Feather name="navigation" size={16} color={theme.white} />
              <Text style={s.navigateBtnText}>NAVIGATE</Text>
            </Pressable>
          )}

          {/* Navigate — saved route mode */}
          {mode === 'saved' && onNavigateRoute && selectedRoute && (
            <Pressable
              style={[s.navigateBtn, { backgroundColor: theme.red }]}
              onPress={() => onNavigateRoute(selectedRoute)}
            >
              <Feather name="navigation" size={16} color={theme.white} />
              <Text style={s.navigateBtnText}>NAVIGATE</Text>
            </Pressable>
          )}
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
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  // City input
  cityGroup: { marginBottom: 4 },
  cityLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
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
  dropdown: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownText: {
    flex: 1,
    fontSize: 13,
  },
  dropdownSubtext: {
    fontSize: 11,
    marginTop: 1,
  },
  dropdownSectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
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
  chipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // Time picker
  timeLabelRow: { marginBottom: 8 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
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
  planBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.7 },
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
  recTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7 },
  recSubtitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  recMeta: { fontSize: 12, marginBottom: 10 },
  recText: { fontSize: 14, lineHeight: 20 },

  // Segment cards
  segSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
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
  riskText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  segBody: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  segStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  segStatText: { fontSize: 13 },

  // Planned note
  plannedNote: { fontSize: 11, textAlign: 'center', marginTop: 8 },

  // Mode toggle
  modeRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Saved route picker
  selectedRouteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  selectedRouteName: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  selectedRouteMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  routePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  routePickerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  routePickerMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  noRoutesText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 16,
  },
  navigateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
});
