import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  loadFavorites,
  toggleFavorite as toggleFavoriteApi,
  type FavoriteLocation,
} from '../../lib/favorites';
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
import RideSettingsBlock, { type RideSettingsValues } from './RideSettingsBlock';
import { fetchDirections } from '../../lib/directions';
import type { NavDestination, NavRoute, RoutePreference } from '../../lib/navigationStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  isTripPlannerRoute?: boolean;
  tripPlannerName?: string;
  onSaveRoute?: (name: string, route: NavRoute) => void;
  onViewInPlanner?: () => void;
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
  { key: 'offroad', label: 'BACK ROADS' },
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
  isTripPlannerRoute = false,
  tripPlannerName,
  onSaveRoute,
  onViewInPlanner,
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
  const rideSettingsRef = useRef<RideSettingsValues>({
    crashOn: false, crashOverride: false,
    shareEnabled: false, shareOverride: false,
    checkInOn: false, checkInMins: 60,
    notifyContactIds: [],
  });

  // Weather summary
  const [weatherMsg, setWeatherMsg] = useState<string | null>(null);
  const [weatherSeverity, setWeatherSeverity] = useState<'clear' | 'minor' | 'moderate' | 'severe'>('clear');
  const [weatherLoading, setWeatherLoading] = useState(false);

  const savedRoute = routes[0] ?? null;
  const selectedRoute = isSavedRoute ? savedRoute : (routes[selectedRouteIdx] ?? null);

  const handleStartNav = useCallback(() => {
    if (!selectedRoute) return;
    const rs = rideSettingsRef.current;
    if (rs.crashOn && !isMonitoring) {
      setCrashDetectionOverride(true);
      setMonitoring(true);
    }
    if (rs.shareEnabled && !shareActive) {
      setLocationSharingOverride(true);
    }
    onStartNavigation(selectedRoute, navBikeId, rs.crashOn, rs.shareEnabled);
  }, [selectedRoute, isMonitoring, shareActive, navBikeId, setCrashDetectionOverride, setMonitoring, setLocationSharingOverride, onStartNavigation]);

  const [routeSaved, setRouteSaved] = useState(false);

  // Favorites — only for destination search / drop pin (no saved route, no trip planner)
  const showHeart = !isSavedRoute && !isTripPlannerRoute;
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    if (!showHeart) return;
    loadFavorites(userId).then((favs) => {
      setIsFavorite(favs.some((f) => f.name === destination.name && f.lat === destination.lat && f.lng === destination.lng));
    });
  }, [showHeart, userId, destination.name, destination.lat, destination.lng]);

  const toggleFavorite = useCallback(async () => {
    const fav: FavoriteLocation = { name: destination.name, lat: destination.lat, lng: destination.lng };
    const updated = await toggleFavoriteApi(fav, userId);
    setIsFavorite(updated.some((f) => f.name === destination.name && f.lat === destination.lat && f.lng === destination.lng));
  }, [destination.name, destination.lat, destination.lng, userId]);

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


  const displayMeta = selectedRoute ? formatRouteMeta(selectedRoute.distanceMiles, selectedRoute.durationSeconds) : '';

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={[st.root, { backgroundColor: theme.bgPanel }]}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginTop: 8, marginBottom: 4 }} />
        {/* Header */}
        <View style={[st.header, { paddingTop: 8, borderBottomColor: theme.border }]}>
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
            {showHeart && (
              <Pressable onPress={toggleFavorite} hitSlop={8} style={st.favBtn}>
                <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? theme.red : theme.textMuted} />
              </Pressable>
            )}
          </View>

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
            (() => {
              const rec = routes[0];
              const meaningful: { idx: number; label: string }[] = [];

              for (let i = 1; i < routes.length; i++) {
                const durationDiff = (rec.durationSeconds - routes[i].durationSeconds) / rec.durationSeconds;
                const distanceDiff = (rec.distanceMiles - routes[i].distanceMiles) / rec.distanceMiles;
                // Only show if >5% different in either dimension
                if (Math.abs(durationDiff) > 0.05 || Math.abs(distanceDiff) > 0.05) {
                  const label = durationDiff > 0.05 ? 'FASTEST' : distanceDiff > 0.05 ? 'SHORTEST' : 'ALTERNATE';
                  // Avoid duplicate labels
                  if (!meaningful.some((m) => m.label === label)) {
                    meaningful.push({ idx: i, label });
                  }
                }
              }

              const cards = [{ idx: 0, label: meaningful.length > 0 ? 'RECOMMENDED' : 'YOUR ROUTE' }, ...meaningful];

              return (
                <View style={cards.length > 1 ? st.routeCards : st.routeCardSingle}>
                  {cards.map(({ idx, label }) => {
                    const route = routes[idx];
                    const active = selectedRouteIdx === idx;
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
              );
            })()
          ) : null}

          {/* Back roads disclaimer */}
          {!loading && !error && routePreference === 'offroad' && (
            <Text style={[st.backRoadsNote, { color: theme.textMuted }]}>
              Prefers smaller roads — ETA estimated
            </Text>
          )}

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
              <Text style={[st.bikeSelectorLabel, { color: theme.textSecondary }]}>RIDING</Text>
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

          {/* Ride settings + notify contacts */}
          {!loading && !error && selectedRoute && (
            <View style={{ paddingHorizontal: 20 }}>
              <RideSettingsBlock
                onChange={(v) => { rideSettingsRef.current = v; }}
                onCloseModal={onCancel}
              />
            </View>
          )}

          {/* Action buttons — inside scroll */}
          {!loading && !error && (
            <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 30, gap: 8 }}>
              {selectedRoute && (
                <Pressable style={[st.startBtn, { backgroundColor: theme.red }, theme.btnBorderTop && { borderTopColor: theme.btnBorderTop, borderBottomColor: theme.btnBorderBottom, borderTopWidth: 1, borderBottomWidth: 1 }]} onPress={handleStartNav}>
                  <Feather name="navigation" size={18} color={theme.white} />
                  <Text style={st.startBtnText}>START NAVIGATION</Text>
                </Pressable>
              )}
              {isTripPlannerRoute && !isSavedRoute && selectedRoute && onSaveRoute && (
                <Pressable
                  style={[st.saveRouteBtn, { borderColor: theme.border }]}
                  onPress={() => {
                    const name = tripPlannerName || destination.name;
                    onSaveRoute(name, selectedRoute);
                    setRouteSaved(true);
                  }}
                  disabled={routeSaved}
                >
                  <Feather name={routeSaved ? 'check' : 'bookmark'} size={14} color={routeSaved ? theme.green : theme.textSecondary} />
                  <Text style={[st.saveRouteBtnText, { color: routeSaved ? theme.green : theme.textSecondary }]}>
                    {routeSaved ? 'ROUTE SAVED' : 'SAVE ROUTE'}
                  </Text>
                </Pressable>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
                {onViewInPlanner && (
                  <Pressable style={st.cancelBtn} onPress={onViewInPlanner}>
                    <Text style={[st.cancelBtnText, { color: theme.red }]}>View in Trip Planner</Text>
                  </Pressable>
                )}
                <Pressable style={st.cancelBtn} onPress={onCancel}>
                  <Text style={[st.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
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
    paddingBottom: 20,
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
  routeCardSingle: { paddingHorizontal: 16, paddingTop: 8 },
  routeCard: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  routeCardLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  routeCardDist: { fontSize: 17, fontWeight: '700' },
  routeCardEta: { fontSize: 12, marginTop: 2 },

  backRoadsNote: { fontSize: 11, paddingHorizontal: 20, paddingTop: 6 },
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
  saveRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  saveRouteBtnText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  cancelBtn: { alignItems: 'center', paddingVertical: 6 },
  cancelBtnText: { fontSize: 14 },
});
