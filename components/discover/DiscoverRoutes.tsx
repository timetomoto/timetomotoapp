import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRoutesStore, useAuthStore } from '../../lib/store';
import { fetchUserRoutes, seedRoutes, type Route } from '../../lib/routes';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type SortMode = 'name' | 'distance' | 'elevation';
const SORT_OPTIONS: { key: SortMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'name', label: 'A-Z', icon: 'type' },
  { key: 'distance', label: 'DIST', icon: 'map' },
  { key: 'elevation', label: 'ELEV', icon: 'trending-up' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRouteType(route: Route): string {
  const cat = (route.category ?? '').toLowerCase();
  if (cat.includes('backcountry') || cat.includes('bdr') || cat.includes('adv')) return 'ADV';
  if (cat.includes('scenic')) return 'Scenic';
  if (cat.includes('touring')) return 'Touring';
  if (cat.includes('offroad') || cat.includes('off-road')) return 'Offroad';
  if (cat.includes('local')) return 'Scenic';
  return 'Scenic';
}

function sortRoutes(routes: Route[], mode: SortMode): Route[] {
  const sorted = [...routes];
  switch (mode) {
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'distance':
      return sorted.sort((a, b) => b.distance_miles - a.distance_miles);
    case 'elevation':
      return sorted.sort((a, b) => b.elevation_gain_ft - a.elevation_gain_ft);
    default:
      return sorted;
  }
}

const UNCATEGORIZED = '__uncategorized__';

function groupRoutes(routes: Route[]): Map<string, Route[]> {
  const map = new Map<string, Route[]>();
  for (const route of routes) {
    const key = route.category?.trim() || UNCATEGORIZED;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(route);
  }
  return map;
}

// ---------------------------------------------------------------------------
// RouteCard
// ---------------------------------------------------------------------------

interface RouteCardProps {
  route: Route;
  onPreview: (route: Route) => void;
  onNavigate: (route: Route) => void;
}

const RouteCard = memo(function RouteCard({ route, onPreview, onNavigate }: RouteCardProps) {
  const { theme } = useTheme();
  const routeType = getRouteType(route);

  const metaParts = [
    route.distance_miles > 0 ? `${Math.round(route.distance_miles)} mi` : null,
    routeType,
  ].filter(Boolean);

  return (
    <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <Text style={[s.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>
        {route.name}
      </Text>

      <Text style={[s.cardMeta, { color: theme.textMuted }]}>{metaParts.join('  ·  ')}</Text>

      {route.elevation_gain_ft > 0 && (
        <Text style={[s.cardElevation, { color: theme.textMuted }]}>
          {Math.round(route.elevation_gain_ft).toLocaleString()} ft elevation gain
        </Text>
      )}

      <View style={s.cardActions}>
        <Pressable
          style={[s.actionBtn, { borderColor: theme.border }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPreview(route);
          }}
          accessibilityLabel={`Preview ${route.name}`}
          accessibilityRole="button"
        >
          <Text style={[s.actionBtnText, { color: theme.textSecondary }]}>PREVIEW</Text>
        </Pressable>
        <Pressable
          style={[s.actionBtn, s.actionBtnPrimary, { backgroundColor: theme.red }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onNavigate(route);
          }}
          accessibilityLabel={`Navigate ${route.name}`}
          accessibilityRole="button"
        >
          <Text style={s.actionBtnTextPrimary}>NAVIGATE</Text>
          <Feather name="chevron-right" size={14} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// DiscoverRoutes
// ---------------------------------------------------------------------------

interface Props {
  onPreviewRoute?: (route: Route) => void;
  onNavigateRoute?: (route: Route) => void;
}

export default function DiscoverRoutes({ onPreviewRoute, onNavigateRoute }: Props) {
  const { theme } = useTheme();
  const { user, loading: authLoading } = useAuthStore();
  const { routes, setRoutes, setLoading } = useRoutesStore();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');

  // Load routes — wait for auth, then seed + fetch
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const userId = user?.id ?? 'local';
      setLoading(true);
      await seedRoutes(userId).catch(() => {});
      const fetched = await fetchUserRoutes(userId);
      if (!cancelled) {
        setRoutes(fetched);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const userId = user?.id ?? 'local';
    await seedRoutes(userId).catch(() => {});
    const fetched = await fetchUserRoutes(userId);
    setRoutes(fetched);
    setRefreshing(false);
  }, [user?.id, setRoutes]);

  // Search filter — matches name and category
  const query = searchQuery.trim().toLowerCase();
  const filteredRoutes = useMemo(() => {
    if (!query) return routes;
    return routes.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        (r.category ?? '').toLowerCase().includes(query),
    );
  }, [routes, query]);

  // Sort and group
  const sorted = useMemo(() => sortRoutes(filteredRoutes, sortMode), [filteredRoutes, sortMode]);
  const grouped = useMemo(() => groupRoutes(sorted), [sorted]);

  const handlePreview = useCallback(
    (route: Route) => { onPreviewRoute?.(route); },
    [onPreviewRoute],
  );

  const handleNavigate = useCallback(
    (route: Route) => { onNavigateRoute?.(route); },
    [onNavigateRoute],
  );

  const orderedKeys = useMemo(() => {
    const keys = [...grouped.keys()];
    // Put UNCATEGORIZED last
    const uncatIdx = keys.indexOf(UNCATEGORIZED);
    if (uncatIdx >= 0) {
      keys.splice(uncatIdx, 1);
      keys.push(UNCATEGORIZED);
    }
    return keys;
  }, [grouped]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} />}
    >
      <View style={s.content}>
        {/* Search bar */}
        {routes.length > 0 && (
          <View style={[s.searchRow, { borderColor: theme.border, backgroundColor: theme.bgCard }]}>
            <Feather name="search" size={14} color={theme.textMuted} />
            <TextInput
              style={[s.searchInput, { color: theme.textPrimary }]}
              placeholder="Search routes…"
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Feather name="x" size={14} color={theme.textMuted} />
              </Pressable>
            )}
          </View>
        )}

        {/* Sort pills */}
        {routes.length > 0 && (
          <View style={s.sortRow}>
            {SORT_OPTIONS.map((opt) => {
              const active = sortMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[
                    s.sortPill,
                    { borderColor: active ? theme.red : theme.border },
                    active && { backgroundColor: theme.red + '1A' },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSortMode(opt.key);
                  }}
                >
                  <Feather name={opt.icon} size={10} color={active ? theme.red : theme.textMuted} />
                  <Text style={[s.sortPillText, { color: active ? theme.red : theme.textMuted }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Grouped route list */}
        {orderedKeys.map((category) => {
          const categoryRoutes = grouped.get(category) ?? [];
          const label = category === UNCATEGORIZED ? 'UNCATEGORIZED' : category.toUpperCase();
          return (
            <View key={category} style={s.categorySection}>
              <View style={s.categoryHeader}>
                <Feather
                  name={category === UNCATEGORIZED ? 'inbox' : 'folder'}
                  size={13}
                  color={theme.textSecondary}
                />
                <Text style={[s.categoryLabel, { color: theme.textSecondary }]}>{label}</Text>
                <Text style={[s.categoryCount, { color: theme.textMuted }]}>{categoryRoutes.length}</Text>
              </View>
              {categoryRoutes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  onPreview={handlePreview}
                  onNavigate={handleNavigate}
                />
              ))}
            </View>
          );
        })}

        {/* Empty states */}
        {routes.length > 0 && filteredRoutes.length === 0 && (
          <View style={s.empty}>
            <Feather name="search" size={28} color={theme.textMuted} />
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>
              No routes match "{searchQuery}"
            </Text>
          </View>
        )}

        {routes.length === 0 && (
          <View style={s.empty}>
            <Feather name="map" size={32} color={theme.border} />
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>
              No routes yet. Import a GPX or record a ride.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },

  sortRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sortPillText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  categorySection: {
    marginBottom: 8,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  categoryCount: {
    fontSize: 10,
    fontWeight: '600',
  },

  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  cardMeta: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  cardElevation: {
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  actionBtnPrimary: {
    borderWidth: 0,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  actionBtnTextPrimary: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  empty: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
