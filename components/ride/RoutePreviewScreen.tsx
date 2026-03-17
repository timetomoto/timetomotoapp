import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchRouteWeather,
  hasRouteWeatherConcern,
  getRouteWarningMessage,
  type RouteWeatherPoint,
} from '../../lib/routeWeather';
import { useTheme } from '../../lib/useTheme';
import { useAuthStore, useGarageStore, useSafetyStore, bikeLabel } from '../../lib/store';
import { fetchDirections } from '../../lib/directions';
import type { NavDestination, NavRoute, RoutePreference } from '../../lib/navigationStore';
import {
  loadFavorites,
  toggleFavorite as toggleFavoriteApi,
  type FavoriteLocation,
} from '../../lib/favorites';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SavedRoutePill = 'this_route' | 'fastest' | 'no_hwy' | 'no_tolls';

interface Props {
  destination: NavDestination;
  routes: NavRoute[];
  loading: boolean;
  error: string | null;
  routePreference: RoutePreference;
  onChangePreference: (p: RoutePreference) => void;
  onStartNavigation: (route: NavRoute, bikeId?: string | null, recordRide?: boolean, shareLocation?: boolean) => void;
  onCancel: () => void;
  onTryDifferentRoute?: () => void;
  onNavigateToRideWindow?: () => void;
  isSavedRoute?: boolean;
  savedRouteStart?: { lat: number; lng: number } | null;
  onGeometryChange?: (geometry: NavRoute['geometry']) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatDistance(miles: number): string {
  if (miles < 0.1) return '< 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function formatRouteMeta(distanceMiles: number, durationSeconds: number): string {
  const dist = formatDistance(distanceMiles);
  if (durationSeconds <= 0) return dist;
  return `${dist} · ${formatDuration(durationSeconds)}`;
}

const PREFERENCE_PILLS: { key: RoutePreference; label: string }[] = [
  { key: 'fastest', label: 'FASTEST' },
  { key: 'scenic', label: 'SCENIC' },
  { key: 'no_highway', label: 'NO HWY' },
  { key: 'offroad', label: 'OFFROAD' },
];

const SAVED_ROUTE_PILLS: { key: SavedRoutePill; label: string }[] = [
  { key: 'this_route', label: 'THIS ROUTE' },
  { key: 'fastest', label: 'FASTEST' },
  { key: 'no_hwy', label: 'NO HWY' },
  { key: 'no_tolls', label: 'NO TOLLS' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RoutePreviewScreen({
  destination,
  routes,
  loading,
  error,
  routePreference,
  onChangePreference,
  onStartNavigation,
  onCancel,
  onTryDifferentRoute,
  onNavigateToRideWindow,
  isSavedRoute = false,
  savedRouteStart,
  onGeometryChange,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const userId = user?.id ?? 'local';
  const { bikes, selectedBikeId } = useGarageStore();
  const {
    isMonitoring, setMonitoring, shareActive,
    setCrashDetectionOverride, setLocationSharingOverride,
  } = useSafetyStore();
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [navBikeId, setNavBikeId] = useState<string | null>(selectedBikeId);
  const [recordRide, setRecordRide] = useState(false);
  const [crashOn, setCrashOn] = useState(isMonitoring);
  const [crashOverride, setCrashOverride] = useState(false);
  const [locationOn, setLocationOn] = useState(shareActive);
  const [locationOverride, setLocationOverride] = useState(false);

  // Weather summary
  const [weatherMsg, setWeatherMsg] = useState<string | null>(null);
  const [weatherSeverity, setWeatherSeverity] = useState<'clear' | 'minor' | 'moderate' | 'severe'>('clear');
  const [weatherLoading, setWeatherLoading] = useState(false);

  const handleCrashToggle = useCallback(() => {
    if (!crashOn && !isMonitoring) {
      Alert.alert(
        'Crash Detection is Disabled',
        'Crash Detection is turned off in your Settings. Would you like to enable it?',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Enable in Settings', onPress: () => { setMonitoring(true); setCrashOn(true); } },
          { text: 'Enable for This Ride', onPress: () => { setCrashOn(true); setCrashOverride(true); } },
        ],
      );
      return;
    }
    setCrashOn((v) => !v);
    setCrashOverride(false);
  }, [crashOn, isMonitoring, setMonitoring]);

  const handleLocationToggle = useCallback(() => {
    if (!locationOn && !shareActive) {
      Alert.alert(
        'Live Location Sharing is Disabled',
        'Live Location Sharing is turned off in your Settings. Would you like to enable it?',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Enable in Settings', onPress: () => { useSafetyStore.getState().setShareActive(true); setLocationOn(true); } },
          { text: 'Enable for This Ride', onPress: () => { setLocationOn(true); setLocationOverride(true); } },
        ],
      );
      return;
    }
    setLocationOn((v) => !v);
    setLocationOverride(false);
  }, [locationOn, shareActive]);

  // ── Saved route pill state ──
  const [selectedPill, setSelectedPill] = useState<SavedRoutePill>('this_route');
  const [pillLoading, setPillLoading] = useState(false);
  const cacheRef = useRef<Record<string, NavRoute>>({});

  const savedRoute = routes[0] ?? null;
  const selectedRoute = isSavedRoute
    ? (selectedPill === 'this_route' ? savedRoute : (cacheRef.current[selectedPill] ?? savedRoute))
    : (routes[selectedRouteIdx] ?? null);

  const handleStartNav = useCallback(() => {
    if (!selectedRoute) return;
    if (crashOn && !isMonitoring) {
      setCrashDetectionOverride(true);
      setMonitoring(true);
    }
    if (locationOn && !shareActive) {
      setLocationSharingOverride(true);
    }
    onStartNavigation(selectedRoute, navBikeId, recordRide, locationOn);
  }, [selectedRoute, crashOn, isMonitoring, locationOn, shareActive, navBikeId, recordRide, setCrashDetectionOverride, setMonitoring, setLocationSharingOverride, onStartNavigation]);

  const [isFavorite, setIsFavorite] = useState(false);
  const [favList, setFavList] = useState<FavoriteLocation[]>([]);

  // Load favorites once on mount
  useEffect(() => {
    loadFavorites(userId).then((favs) => {
      setFavList(favs);
    });
  }, [userId]);

  // Derive isFavorite from local list whenever destination or list changes
  useEffect(() => {
    setIsFavorite(favList.some((f) => f.name === destination.name && f.lat === destination.lat && f.lng === destination.lng));
  }, [favList, destination.name, destination.lat, destination.lng]);

  // Fetch route weather summary
  useEffect(() => {
    const coords = selectedRoute?.geometry?.coordinates;
    if (!coords || coords.length < 2) { setWeatherMsg(null); return; }
    setWeatherLoading(true);
    fetchRouteWeather(coords)
      .then(({ points, useCelsius }) => {
        // No data or all zeros = failed
        if (points.length === 0 || points.every((p) => p.temp === 0 && p.weatherCode === 1000 && p.rainChance === 0)) {
          setWeatherMsg('Unable to check route weather right now.');
          setWeatherSeverity('clear');
          return;
        }
        const concern = hasRouteWeatherConcern(points, useCelsius);
        if (!concern) {
          setWeatherMsg('Weather looks good. Ride on.');
          setWeatherSeverity('clear');
          return;
        }
        const warning = getRouteWarningMessage(points, useCelsius);
        if (!warning) {
          setWeatherMsg('Weather looks good. Ride on.');
          setWeatherSeverity('clear');
          return;
        }

        // Determine severity tier
        const worst = points.reduce((max, p) => Math.max(max, p.weatherCode), 0);
        const freezeT = useCelsius ? 2 : 35;
        const windT = useCelsius ? 56 : 35;
        const hasFreeze = points.some((p) => p.temp < freezeT);
        const hasSevereWind = points.some((p) => p.wind > windT);

        if (worst >= 5000 || hasFreeze) {
          setWeatherSeverity('severe');
        } else if (points.some((p) => p.rainChance > 50) || hasSevereWind) {
          setWeatherSeverity('moderate');
        } else {
          setWeatherSeverity('minor');
        }
        setWeatherMsg(warning);
      })
      .catch(() => {
        setWeatherMsg('Unable to check route weather right now.');
        setWeatherSeverity('clear');
      })
      .finally(() => setWeatherLoading(false));
  }, [selectedRoute]);

  const toggleFavorite = useCallback(async () => {
    const fav: FavoriteLocation = { name: destination.name, lat: destination.lat, lng: destination.lng };
    const updated = await toggleFavoriteApi(fav, userId);
    setFavList(updated);
  }, [destination.name, destination.lat, destination.lng, userId]);

  const fetchAlternative = useCallback(async (pill: 'fastest' | 'no_hwy' | 'no_tolls') => {
    if (cacheRef.current[pill]) {
      setSelectedPill(pill);
      onGeometryChange?.(cacheRef.current[pill].geometry);
      return;
    }
    const start = savedRouteStart;
    const end = destination;
    if (!start || !end) return;
    setPillLoading(true);
    setSelectedPill(pill);
    try {
      const prefMap: Record<string, RoutePreference> = { fastest: 'fastest', no_hwy: 'no_highway', no_tolls: 'no_tolls' };
      const results = await fetchDirections(start.lng, start.lat, end.lng, end.lat, prefMap[pill] ?? 'fastest');
      if (results.length > 0) { cacheRef.current[pill] = results[0]; onGeometryChange?.(results[0].geometry); }
    } catch {
      setSelectedPill('this_route');
      if (savedRoute) onGeometryChange?.(savedRoute.geometry);
    } finally { setPillLoading(false); }
  }, [savedRouteStart, destination, savedRoute, onGeometryChange]);

  const handleSavedPillPress = useCallback((pill: SavedRoutePill) => {
    if (pill === selectedPill) {
      if (pill !== 'this_route') { setSelectedPill('this_route'); if (savedRoute) onGeometryChange?.(savedRoute.geometry); }
      return;
    }
    if (pill === 'this_route') { setSelectedPill('this_route'); if (savedRoute) onGeometryChange?.(savedRoute.geometry); }
    else fetchAlternative(pill);
  }, [selectedPill, savedRoute, fetchAlternative, onGeometryChange]);

  const handleRecordToggle = useCallback(() => setRecordRide((v) => !v), []);

  const displayMeta = pillLoading ? '— mi · — min' : selectedRoute ? formatRouteMeta(selectedRoute.distanceMiles, selectedRoute.durationSeconds) : '';

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={[st.root, { backgroundColor: theme.bgPanel }]}>
        {/* Header */}
        <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: theme.border }]}>
          <View style={{ width: 40 }} />
          <Text style={[st.headerTitle, { color: theme.textPrimary }]}>Start Ride</Text>
          <Pressable onPress={onCancel} hitSlop={8} style={{ width: 40, alignItems: 'flex-end' }}>
            <Feather name="x" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        {/* Scrollable body */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={st.body} showsVerticalScrollIndicator={false}>
          {/* Destination header */}
          <View style={[st.destRow, { borderBottomColor: theme.border }]}>
            <View style={[st.destIcon, { backgroundColor: theme.red + '22', borderColor: theme.red }]}>
              <Feather name="map-pin" size={18} color={theme.red} />
            </View>
            <View style={st.destInfo}>
              <Text style={[st.destName, { color: theme.textPrimary }]} numberOfLines={1}>{destination.name}</Text>
              {isSavedRoute ? (
                <Text style={[st.destMeta, { color: theme.textSecondary }]}>{displayMeta}</Text>
              ) : selectedRoute ? (
                <Text style={[st.destMeta, { color: theme.textSecondary }]}>{formatRouteMeta(selectedRoute.distanceMiles, selectedRoute.durationSeconds)}</Text>
              ) : null}
            </View>
            <Pressable onPress={toggleFavorite} hitSlop={8} style={st.favBtn}>
              <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? theme.red : theme.textMuted} />
            </Pressable>
          </View>

          {/* Saved route pills */}
          {isSavedRoute && !loading && !error && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.pillsScroll} contentContainerStyle={st.pillsContent}>
              {SAVED_ROUTE_PILLS.map((pill) => {
                const active = selectedPill === pill.key;
                return (
                  <Pressable key={pill.key} style={[st.pill, { backgroundColor: active ? theme.red : theme.bgCard, borderColor: active ? theme.red : theme.border }]} onPress={() => handleSavedPillPress(pill.key)}>
                    <Text style={[st.pillText, { color: active ? theme.white : theme.textMuted }]}>{pill.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Destination search pills */}
          {!isSavedRoute && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.pillsScroll} contentContainerStyle={st.pillsContent}>
              {PREFERENCE_PILLS.map((pill) => {
                const active = routePreference === pill.key;
                return (
                  <Pressable key={pill.key} style={[st.pill, { backgroundColor: active ? theme.red : theme.bgCard, borderColor: active ? theme.red : theme.border }]} onPress={() => onChangePreference(pill.key)}>
                    <Text style={[st.pillText, { color: active ? theme.white : theme.textMuted }]}>{pill.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Content area */}
          {loading ? (
            <View style={st.centeredState}>
              <ActivityIndicator size="large" color={theme.red} />
              <Text style={[st.stateText, { color: theme.textMuted }]}>{isSavedRoute ? 'Loading route…' : 'Finding best routes…'}</Text>
            </View>
          ) : error ? (
            <View style={st.centeredState}>
              <Feather name="alert-circle" size={32} color={theme.red} />
              <Text style={[st.stateText, { color: theme.textSecondary }]}>{error}</Text>
              <Pressable style={[st.tryAgainBtn, { borderColor: theme.border }]} onPress={() => onTryDifferentRoute ? onTryDifferentRoute() : onChangePreference(routePreference)}>
                <Text style={[st.tryAgainText, { color: theme.textSecondary }]}>Try Different Route</Text>
              </Pressable>
            </View>
          ) : !isSavedRoute && routes.length > 1 ? (
            <View style={st.routeCards}>
              {routes.map((route, idx) => {
                const active = selectedRouteIdx === idx;
                const label = idx === 0 ? 'RECOMMENDED' : route.distanceMiles < routes[0].distanceMiles ? 'SHORTER' : route.durationSeconds < routes[0].durationSeconds ? 'FASTER' : `ALT ${idx}`;
                return (
                  <Pressable
                    key={idx}
                    style={[st.routeCard, { backgroundColor: active ? theme.red + '12' : theme.bgCard, borderColor: active ? theme.red : theme.border }]}
                    onPress={() => setSelectedRouteIdx(idx)}
                  >
                    <Text style={[st.routeCardLabel, { color: active ? theme.red : theme.textMuted }]}>{label}</Text>
                    <Text style={[st.routeCardDist, { color: theme.textPrimary }]}>{formatDistance(route.distanceMiles)}</Text>
                    <Text style={[st.routeCardEta, { color: theme.textSecondary }]}>{formatDuration(route.durationSeconds)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Route weather summary */}
          {!loading && !error && selectedRoute && (
            <View style={st.weatherLine}>
              {weatherLoading ? (
                <Text style={[st.weatherText, { color: theme.textMuted }]}>Checking conditions along route...</Text>
              ) : weatherMsg ? (
                <>
                  <View style={st.weatherMsgRow}>
                    {(weatherSeverity === 'severe' || weatherSeverity === 'moderate') && (
                      <Feather name="alert-triangle" size={14} color={weatherSeverity === 'severe' ? theme.red : '#FF9800'} style={{ marginRight: 6 }} />
                    )}
                    {weatherSeverity === 'clear' && (
                      <Feather name="check-circle" size={14} color={theme.green} style={{ marginRight: 6 }} />
                    )}
                    <Text style={[
                      st.weatherText,
                      { color: weatherSeverity === 'clear' ? theme.textMuted : weatherSeverity === 'severe' ? theme.red : '#FF9800', flex: 1 },
                    ]}>
                      {weatherMsg}
                    </Text>
                  </View>
                  {(weatherSeverity === 'moderate' || weatherSeverity === 'severe') && onNavigateToRideWindow && (
                    <Pressable onPress={onNavigateToRideWindow} style={st.rideWindowLink}>
                      <Text style={[st.weatherText, { color: theme.textMuted }]}>
                        For full route details, check Weather →{' '}
                      </Text>
                      <Text style={[st.weatherText, { color: theme.textPrimary, textDecorationLine: 'underline' }]}>
                        Ride Window
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : null}
            </View>
          )}

          {/* Bike selector */}
          {!loading && !error && bikes.length > 0 && (
            <View style={st.bikeSelector}>
              <Text style={[st.bikeSelectorLabel, { color: theme.textSecondary }]}>RIDE WITH</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.bikePills}>
                {bikes.map((bike) => {
                  const active = bike.id === navBikeId;
                  return (
                    <Pressable key={bike.id} style={[st.bikePill, { borderColor: active ? theme.red : theme.border }, active && { backgroundColor: theme.red + '1F' }]} onPress={() => setNavBikeId(active ? null : bike.id)}>
                      <Feather name="disc" size={12} color={active ? theme.red : theme.textSecondary} />
                      <Text style={[st.bikePillText, { color: active ? theme.red : theme.textPrimary }]}>{bikeLabel(bike)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Ride option toggles */}
          {!loading && !error && selectedRoute && (
            <View style={st.toggleGroup}>
              <Pressable style={[st.toggleRow, { borderColor: theme.border }]} onPress={handleRecordToggle}>
                <View style={st.toggleLeft}>
                  <Feather name="play-circle" size={16} color={recordRide ? theme.toggleTrackOn : theme.textMuted} />
                  <Text style={[st.toggleText, { color: theme.textPrimary }]}>Record this ride</Text>
                </View>
                <View style={[st.toggleTrack, { backgroundColor: recordRide ? theme.toggleTrackOn : theme.toggleTrackOff }]}>
                  <View style={[st.toggleThumb, { backgroundColor: recordRide ? theme.toggleThumbOn : theme.toggleThumbOff }, recordRide && st.toggleThumbOn_]} />
                </View>
              </Pressable>

              <Pressable style={[st.toggleRow, { borderColor: theme.border }]} onPress={handleCrashToggle}>
                <View style={st.toggleLeft}>
                  <Feather name="shield" size={16} color={crashOn ? theme.toggleTrackOn : theme.textMuted} />
                  <Text style={[st.toggleText, { color: theme.textPrimary }]}>Crash detection</Text>
                </View>
                <View style={[st.toggleTrack, { backgroundColor: crashOn ? theme.toggleTrackOn : theme.toggleTrackOff }]}>
                  <View style={[st.toggleThumb, { backgroundColor: crashOn ? theme.toggleThumbOn : theme.toggleThumbOff }, crashOn && st.toggleThumbOn_]} />
                </View>
              </Pressable>

              <Pressable style={[st.toggleRow, { borderColor: theme.border }]} onPress={handleLocationToggle}>
                <View style={st.toggleLeft}>
                  <Feather name="map-pin" size={16} color={locationOn ? theme.toggleTrackOn : theme.textMuted} />
                  <Text style={[st.toggleText, { color: theme.textPrimary }]}>Share my location</Text>
                </View>
                <View style={[st.toggleTrack, { backgroundColor: locationOn ? theme.toggleTrackOn : theme.toggleTrackOff }]}>
                  <View style={[st.toggleThumb, { backgroundColor: locationOn ? theme.toggleThumbOn : theme.toggleThumbOff }, locationOn && st.toggleThumbOn_]} />
                </View>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {/* Sticky footer — always visible */}
        {!loading && !error && (
          <View style={[st.footer, { backgroundColor: theme.bgPanel, borderTopColor: theme.border, paddingBottom: insets.bottom + 16 }]}>
            {selectedRoute && (
              <Pressable style={[st.startBtn, { backgroundColor: recordRide ? theme.green : theme.red }, theme.btnBorderTop && { borderTopColor: theme.btnBorderTop, borderBottomColor: theme.btnBorderBottom, borderTopWidth: 1, borderBottomWidth: 1 }]} onPress={handleStartNav}>
                <Feather name={recordRide ? 'play-circle' : 'navigation'} size={18} color={theme.white} />
                <Text style={st.startBtnText}>{recordRide ? 'START & RECORD' : 'START NAVIGATION'}</Text>
              </Pressable>
            )}
            <Pressable style={st.cancelBtn} onPress={onCancel}>
              <Text style={[st.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },

  body: {
    paddingBottom: 120,
  },

  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  destIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destInfo: { flex: 1 },
  favBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  destName: { fontSize: 17, fontWeight: '700' },
  destMeta: { fontSize: 13, marginTop: 2 },

  pillsScroll: { maxHeight: 48 },
  pillsContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 6 },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  centeredState: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 24 },
  stateText: { fontSize: 14, textAlign: 'center' },
  tryAgainBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  tryAgainText: { fontSize: 13, fontWeight: '600' },

  routeCards: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  routeCard: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  routeCardLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  routeCardDist: { fontSize: 17, fontWeight: '700' },
  routeCardEta: { fontSize: 12, marginTop: 2 },

  weatherLine: { paddingHorizontal: 20, paddingVertical: 10 },
  weatherMsgRow: { flexDirection: 'row', alignItems: 'center' },
  weatherText: { fontSize: 13, lineHeight: 18 },
  rideWindowLink: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },

  bikeSelector: { paddingHorizontal: 20, marginTop: 16, marginBottom: 8 },
  bikeSelectorLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  bikePills: { gap: 8 },
  bikePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  bikePillText: { fontSize: 13, fontWeight: '600' },

  toggleGroup: { gap: 6, marginTop: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleText: { fontSize: 14, fontWeight: '600' },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 2 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10 },
  toggleThumbOn_: { alignSelf: 'flex-end' as const },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 15 },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  cancelBtn: { alignItems: 'center', paddingVertical: 6 },
  cancelBtnText: { fontSize: 14 },
});
