import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useTheme } from '../../lib/useTheme';
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
  onStartNavigation: (route: NavRoute) => void;
  onSaveRoute: (route: NavRoute) => void;
  onCancel: () => void;
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

const PREFERENCE_PILLS: { key: RoutePreference; label: string }[] = [
  { key: 'fastest', label: 'FASTEST' },
  { key: 'scenic', label: 'SCENIC' },
  { key: 'no_highway', label: 'NO HWY' },
  { key: 'offroad', label: 'OFFROAD' },
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
  onSaveRoute,
  onCancel,
}: Props) {
  const { theme } = useTheme();
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const translateY = useRef(new Animated.Value(0)).current;

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

  const selectedRoute = routes[selectedRouteIdx] ?? null;

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
            {selectedRoute && (
              <Text style={[styles.destMeta, { color: theme.textSecondary }]}>
                {formatDistance(selectedRoute.distanceMiles)} · {formatDuration(selectedRoute.durationSeconds)}
              </Text>
            )}
          </View>
        </View>

        {/* Route preference pills */}
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

        {/* Content area */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.red} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>
              Finding best routes…
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
        ) : (
          <>
            {/* Alternate routes list */}
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
                        {formatDistance(route.distanceMiles)} · {formatDuration(route.durationSeconds)}
                      </Text>
                    </View>
                    {selectedRouteIdx === idx && (
                      <Feather name="check-circle" size={18} color={theme.red} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {/* Action buttons */}
            <View style={styles.actions}>
              {selectedRoute && (
                <>
                  <Pressable
                    style={[styles.startBtn, { backgroundColor: theme.red }]}
                    onPress={() => onStartNavigation(selectedRoute)}
                  >
                    <Feather name="navigation" size={18} color="#fff" />
                    <Text style={styles.startBtnText}>START NAVIGATION</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.saveBtn, { borderColor: theme.border }]}
                    onPress={() => onSaveRoute(selectedRoute)}
                  >
                    <Feather name="bookmark" size={16} color={theme.textSecondary} />
                    <Text style={[styles.saveBtnText, { color: theme.textSecondary }]}>
                      Save Route
                    </Text>
                  </Pressable>
                </>
              )}

              <Pressable style={styles.cancelBtn} onPress={onCancel}>
                <Text style={[styles.cancelBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </Pressable>
            </View>
          </>
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
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  saveBtnText: {
    fontSize: 14,
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
