import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { useTheme } from '../../lib/useTheme';
import { useGarageStore, bikeLabel } from '../../lib/store';
import { fetchDirections } from '../../lib/directions';
import type { NavDestination, NavRoute, RoutePreference } from '../../lib/navigationStore';

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
  onStartNavigation: (route: NavRoute, bikeId?: string | null) => void;
  onCancel: () => void;
  isSavedRoute?: boolean;
  /** Start coords of the saved route (first trackpoint) */
  savedRouteStart?: { lat: number; lng: number } | null;
  /** Called when the active geometry changes so the parent can update the map line */
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
  isSavedRoute = false,
  savedRouteStart,
  onGeometryChange,
}: Props) {
  const { theme } = useTheme();
  const { bikes, selectedBikeId } = useGarageStore();
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [navBikeId, setNavBikeId] = useState<string | null>(selectedBikeId);
  const translateY = useRef(new Animated.Value(0)).current;

  // ── Saved route pill state ──
  const [selectedPill, setSelectedPill] = useState<SavedRoutePill>('this_route');
  const [pillLoading, setPillLoading] = useState(false);
  const cacheRef = useRef<Record<string, NavRoute>>({});

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: 600,
            duration: 250,
            useNativeDriver: true,
          }).start(() => onCancel());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 200,
          }).start();
        }
      },
    }),
  ).current;

  // The original saved route is always routes[0]
  const savedRoute = routes[0] ?? null;

  // For destination search, use the user-selected index
  const selectedRoute = isSavedRoute
    ? (selectedPill === 'this_route' ? savedRoute : (cacheRef.current[selectedPill] ?? savedRoute))
    : (routes[selectedRouteIdx] ?? null);

  // Fetch an alternative route from the Directions API
  const fetchAlternative = useCallback(async (pill: 'fastest' | 'no_hwy' | 'no_tolls') => {
    // Use cache if available
    if (cacheRef.current[pill]) {
      setSelectedPill(pill);
      onGeometryChange?.(cacheRef.current[pill].geometry);
      return;
    }

    // Need start + end coords
    const start = savedRouteStart;
    const end = destination;
    if (!start || !end) return;

    setPillLoading(true);
    setSelectedPill(pill);

    try {
      const prefMap: Record<string, RoutePreference> = {
        fastest: 'fastest',
        no_hwy: 'no_highway',
        no_tolls: 'no_tolls',
      };
      const pref = prefMap[pill] ?? 'fastest';
      const results = await fetchDirections(start.lng, start.lat, end.lng, end.lat, pref);
      if (results.length > 0) {
        cacheRef.current[pill] = results[0];
        onGeometryChange?.(results[0].geometry);
      }
    } catch {
      // Revert to saved route on failure
      setSelectedPill('this_route');
      if (savedRoute) onGeometryChange?.(savedRoute.geometry);
    } finally {
      setPillLoading(false);
    }
  }, [savedRouteStart, destination, savedRoute, onGeometryChange]);

  const handleSavedPillPress = useCallback((pill: SavedRoutePill) => {
    if (pill === selectedPill) {
      // Toggle off → back to THIS ROUTE
      if (pill !== 'this_route') {
        setSelectedPill('this_route');
        if (savedRoute) onGeometryChange?.(savedRoute.geometry);
      }
      return;
    }

    if (pill === 'this_route') {
      setSelectedPill('this_route');
      if (savedRoute) onGeometryChange?.(savedRoute.geometry);
    } else {
      fetchAlternative(pill);
    }
  }, [selectedPill, savedRoute, fetchAlternative, onGeometryChange]);

  // Display meta — show loading placeholder when fetching
  const displayMeta = pillLoading
    ? '— mi · — min'
    : selectedRoute
    ? formatRouteMeta(selectedRoute.distanceMiles, selectedRoute.durationSeconds)
    : '';

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Bottom sheet container */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: theme.bgPanel, borderTopColor: theme.border },
          { transform: [{ translateY }] },
        ]}
      >
        {/* Handle — drag zone */}
        <View {...panResponder.panHandlers} style={styles.handleZone}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
        </View>

        {/* Destination header */}
        <View style={[styles.destRow, { borderBottomColor: theme.border }]}>
          <View style={[styles.destIcon, { backgroundColor: theme.red + '22', borderColor: theme.red }]}>
            <Feather name="map-pin" size={18} color={theme.red} />
          </View>
          <View style={styles.destInfo}>
            <Text style={[styles.destName, { color: theme.textPrimary }]} numberOfLines={1}>
              {destination.name}
            </Text>
            {isSavedRoute ? (
              <Text style={[styles.destMeta, { color: theme.textSecondary }]}>
                {displayMeta}
              </Text>
            ) : selectedRoute ? (
              <Text style={[styles.destMeta, { color: theme.textSecondary }]}>
                {formatRouteMeta(selectedRoute.distanceMiles, selectedRoute.durationSeconds)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── Saved route pills ── */}
        {isSavedRoute && !loading && !error && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillsScroll}
            contentContainerStyle={styles.pillsContent}
          >
            {SAVED_ROUTE_PILLS.map((pill) => {
              const active = selectedPill === pill.key;
              return (
                <Pressable
                  key={pill.key}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: active ? theme.red : theme.bgCard,
                      borderColor: active ? theme.red : theme.border,
                    },
                  ]}
                  onPress={() => handleSavedPillPress(pill.key)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: active ? '#fff' : theme.textMuted },
                    ]}
                  >
                    {pill.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* ── Destination search pills ── */}
        {!isSavedRoute && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillsScroll}
            contentContainerStyle={styles.pillsContent}
          >
            {PREFERENCE_PILLS.map((pill) => {
              const active = routePreference === pill.key;
              return (
                <Pressable
                  key={pill.key}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: active ? theme.red : theme.bgCard,
                      borderColor: active ? theme.red : theme.border,
                    },
                  ]}
                  onPress={() => onChangePreference(pill.key)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      { color: active ? '#fff' : theme.textMuted },
                    ]}
                  >
                    {pill.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Content area */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.red} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>
              {isSavedRoute ? 'Loading route…' : 'Finding best routes…'}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={32} color={theme.red} />
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
            <Pressable
              style={[styles.tryAgainBtn, { borderColor: theme.border }]}
              onPress={() => onChangePreference(routePreference)}
            >
              <Text style={[styles.tryAgainText, { color: theme.textSecondary }]}>
                Try Different Route
              </Text>
            </Pressable>
          </View>
        ) : !isSavedRoute ? (
          <>
            {/* Alternate routes list — destination search */}
            {routes.length > 1 && (
              <ScrollView
                style={styles.routeList}
                showsVerticalScrollIndicator={false}
              >
                {routes.map((route, idx) => (
                  <Pressable
                    key={idx}
                    style={[
                      styles.routeRow,
                      {
                        backgroundColor:
                          selectedRouteIdx === idx ? theme.red + '15' : theme.bgCard,
                        borderColor:
                          selectedRouteIdx === idx ? theme.red : theme.border,
                      },
                    ]}
                    onPress={() => setSelectedRouteIdx(idx)}
                  >
                    <View style={styles.routeRowLeft}>
                      <Text
                        style={[
                          styles.routeLabel,
                          {
                            color:
                              selectedRouteIdx === idx ? theme.red : theme.textSecondary,
                          },
                        ]}
                      >
                        {idx === 0 ? 'Recommended' : `Alternate ${idx}`}
                      </Text>
                      <Text style={[styles.routeMeta, { color: theme.textMuted }]}>
                        {formatRouteMeta(route.distanceMiles, route.durationSeconds)}
                      </Text>
                    </View>
                    {selectedRouteIdx === idx && (
                      <Feather name="check-circle" size={18} color={theme.red} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </>
        ) : null}

        {/* Bike selector — shared by saved route and destination search */}
        {!loading && !error && bikes.length > 0 && (
          <View style={styles.bikeSelector}>
            <Text style={[styles.bikeSelectorLabel, { color: theme.textSecondary }]}>RIDE WITH</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bikePills}>
              {bikes.map((bike) => {
                const active = bike.id === navBikeId;
                return (
                  <Pressable
                    key={bike.id}
                    style={[
                      styles.bikePill,
                      { borderColor: active ? theme.red : theme.border },
                      active && { backgroundColor: theme.red + '1F' },
                    ]}
                    onPress={() => setNavBikeId(active ? null : bike.id)}
                  >
                    <Feather name="disc" size={12} color={active ? theme.red : theme.textSecondary} />
                    <Text style={[styles.bikePillText, { color: active ? theme.red : theme.textPrimary }]}>
                      {bikeLabel(bike)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Action buttons — shared */}
        {!loading && !error && (
          <View style={styles.actions}>
            {selectedRoute && (
              <Pressable
                style={[styles.startBtn, { backgroundColor: theme.red }]}
                onPress={() => onStartNavigation(selectedRoute, navBikeId)}
              >
                <Feather name="navigation" size={18} color="#fff" />
                <Text style={styles.startBtnText}>START NAVIGATION</Text>
              </Pressable>
            )}

            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 9996,
    elevation: 17,
  },
  sheet: {
    height: '62%',
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  handleZone: {
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
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
  destInfo: {
    flex: 1,
  },
  destName: {
    fontSize: 17,
    fontWeight: '700',
  },
  destMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  pillsScroll: {
    maxHeight: 48,
  },
  pillsContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  tryAgainBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  tryAgainText: {
    fontSize: 13,
    fontWeight: '600',
  },
  routeList: {
    maxHeight: 150,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  routeRowLeft: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  routeMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 15,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  bikeSelector: {
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  bikeSelectorLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  bikePills: {
    gap: 8,
  },
  bikePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bikePillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 14,
  },
});
