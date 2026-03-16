import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRoutesStore, useAuthStore } from '../../lib/store';
import {
  fetchUserRoutes,
  deleteRoute,
  updateRouteName,
  updateRouteCategory,
  seedRoutes,
  type Route,
} from '../../lib/routes';
import { serializeGpx } from '../../lib/gpx';
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

function fmtMiles(m: number) {
  return m < 10 ? m.toFixed(1) : Math.round(m).toString();
}

function fmtEle(ft: number) {
  return Math.round(ft).toLocaleString();
}

function fmtDuration(secs: number | null) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
// RouteCard — matches Route Library exactly
// ---------------------------------------------------------------------------

function RouteCard({
  route,
  categories,
  onNavigate,
  onExport,
  onDelete,
  onRename,
  onMoveCategory,
}: {
  route: Route;
  categories: string[];
  onNavigate: () => void;
  onExport: () => void;
  onDelete: () => void;
  onRename: () => void;
  onMoveCategory: (category: string | null) => void;
}) {
  const { theme } = useTheme();
  const dur = fmtDuration(route.duration_seconds);

  function showCategorySheet() {
    const options = [
      ...categories.filter((c) => c !== route.category),
      'New Category…',
      'Remove from Category',
      'Cancel',
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: options.indexOf('Remove from Category'),
          title: 'Move to Category',
        },
        (idx) => {
          const selected = options[idx];
          if (selected === 'Cancel') return;
          if (selected === 'Remove from Category') {
            onMoveCategory(null);
          } else if (selected === 'New Category…') {
            Alert.prompt('New Category', 'Enter a name for the new category', (name) => {
              if (name?.trim()) onMoveCategory(name.trim());
            });
          } else {
            onMoveCategory(selected);
          }
        },
      );
    } else {
      const buttons = [
        ...categories
          .filter((c) => c !== route.category)
          .map((c) => ({ text: c, onPress: () => onMoveCategory(c) })),
        { text: 'Remove from Category', onPress: () => onMoveCategory(null) },
        { text: 'Cancel', style: 'cancel' as const },
      ];
      Alert.alert('Move to Category', undefined, buttons);
    }
  }

  return (
    <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardName, { color: theme.textPrimary }]} numberOfLines={1}>{route.name}</Text>
        <View style={s.cardHeaderActions}>
          <Pressable onPress={onRename} hitSlop={8} style={s.cardHeaderBtn}>
            <Feather name="edit-2" size={14} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={showCategorySheet} hitSlop={8} style={s.cardHeaderBtn}>
            <Feather name="folder" size={14} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={s.cardHeaderBtn}>
            <Feather name="trash-2" size={15} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={s.cardMeta}>
        <View style={s.metaItem}>
          <Feather name="map" size={11} color={theme.textSecondary} />
          <Text style={[s.metaText, { color: theme.textSecondary }]}>{fmtMiles(route.distance_miles)} mi</Text>
        </View>
        <View style={[s.metaSep, { backgroundColor: theme.cardDivider }]} />
        <View style={s.metaItem}>
          <Feather name="trending-up" size={11} color={theme.textSecondary} />
          <Text style={[s.metaText, { color: theme.textSecondary }]}>{fmtEle(route.elevation_gain_ft)} ft</Text>
        </View>
        {dur && (
          <>
            <View style={[s.metaSep, { backgroundColor: theme.cardDivider }]} />
            <View style={s.metaItem}>
              <Feather name="clock" size={11} color={theme.textSecondary} />
              <Text style={[s.metaText, { color: theme.textSecondary }]}>{dur}</Text>
            </View>
          </>
        )}
      </View>

      <View style={[s.cardActions, { borderTopColor: theme.cardDivider }]}>
        <Pressable style={s.actionBtn} onPress={onNavigate}>
          <Feather name="navigation" size={13} color={theme.red} />
          <Text style={[s.actionText, { color: theme.red }]}>NAVIGATE</Text>
        </Pressable>
        <View style={[s.actionDivider, { backgroundColor: theme.cardDivider }]} />
        <Pressable style={s.actionBtn} onPress={onExport}>
          <Feather name="download" size={13} color={theme.textSecondary} />
          <Text style={[s.actionText, { color: theme.textSecondary }]}>EXPORT GPX</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Collapsible category header — matches Route Library
// ---------------------------------------------------------------------------

function CategoryHeader({
  label,
  count,
  isExpanded,
  onToggle,
  onRenameCategory,
  onDeleteCategory,
  sortMode,
  onSortChange,
}: {
  label: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  onRenameCategory: (oldName: string) => void;
  onDeleteCategory: (name: string) => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
}) {
  const { theme } = useTheme();
  const isUncategorized = label === UNCATEGORIZED;

  return (
    <View>
      <Pressable
        style={[
          s.categoryHeader,
          { borderBottomColor: isExpanded ? theme.border : 'transparent' },
        ]}
        onPress={onToggle}
      >
        <Text style={[s.categoryLabel, { color: theme.textSecondary }]}>
          {isUncategorized ? 'UNCATEGORIZED' : label.toUpperCase()}
        </Text>
        <View style={s.categoryHeaderRight}>
          {!isExpanded && count > 0 && (
            <View style={[s.categoryCountBadge, { backgroundColor: theme.red }]}>
              <Text style={s.categoryCountText}>{count}</Text>
            </View>
          )}
          {!isUncategorized && (
            <>
              <Pressable onPress={() => onRenameCategory(label)} hitSlop={8}>
                <Feather name="edit-2" size={12} color={theme.textMuted} />
              </Pressable>
              <Pressable onPress={() => onDeleteCategory(label)} hitSlop={8}>
                <Feather name="trash-2" size={12} color={theme.red} />
              </Pressable>
            </>
          )}
          <Feather
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textSecondary}
          />
        </View>
      </Pressable>

      {isExpanded && (
        <View style={[s.sortRow, { borderBottomColor: theme.border }]}>
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
                onPress={() => onSortChange(opt.key)}
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
    </View>
  );
}

// ---------------------------------------------------------------------------
// DiscoverRoutes
// ---------------------------------------------------------------------------

export default function DiscoverRoutes() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const {
    routes, setRoutes, setLoading, removeRoute,
    updateRouteName: updateRouteNameStore,
    updateRouteCategory: updateRouteCategoryStore,
    setPendingNavigateRoute,
  } = useRoutesStore();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [categorySorts, setCategorySorts] = useState<Record<string, SortMode>>({});
  const autoExpandedRef = useRef(false);

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

  // Search filter
  const query = searchQuery.trim().toLowerCase();
  const filteredRoutes = useMemo(() => {
    if (!query) return routes;
    return routes.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        (r.category ?? '').toLowerCase().includes(query),
    );
  }, [routes, query]);

  // Group
  const grouped = useMemo(() => groupRoutes(filteredRoutes), [filteredRoutes]);
  const allCategories = useMemo(
    () => [...grouped.keys()].filter((k) => k !== UNCATEGORIZED),
    [grouped],
  );

  const orderedKeys = useMemo(() => {
    const keys = [...grouped.keys()];
    const uncatIdx = keys.indexOf(UNCATEGORIZED);
    if (uncatIdx >= 0) {
      keys.splice(uncatIdx, 1);
      keys.push(UNCATEGORIZED);
    }
    return keys;
  }, [grouped]);

  // Auto-expand first category with items on initial load
  useEffect(() => {
    if (autoExpandedRef.current || orderedKeys.length === 0) return;
    const first = orderedKeys.find((k) => (grouped.get(k) ?? []).length > 0);
    if (first) {
      setExpandedCategories((prev) => ({ ...prev, [first]: true }));
      autoExpandedRef.current = true;
    }
  }, [orderedKeys, grouped]);

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  }

  function handleSortChange(category: string, mode: SortMode) {
    setCategorySorts((prev) => ({ ...prev, [category]: mode }));
  }

  // ── Action handlers ──

  async function handleExport(route: Route) {
    if (!route.points || route.points.length === 0) {
      Alert.alert('No GPS Data', 'This ride has no GPS points to export.');
      return;
    }
    try {
      const xml = serializeGpx(route.name, route.points);
      const safeName = route.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const outFile = new File(Paths.cache, `${safeName}.gpx`);
      outFile.write(xml);
      await Sharing.shareAsync(outFile.uri, { mimeType: 'application/gpx+xml', UTI: 'com.topografix.gpx' });
    } catch (err) {
      console.error('GPX export error:', err);
      Alert.alert('Export failed', 'Could not export this route.');
    }
  }

  function handleDelete(route: Route) {
    Alert.alert('Delete this route?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          removeRoute(route.id);
          await deleteRoute(route.id, user?.id ?? 'local');
        },
      },
    ]);
  }

  function handleRename(route: Route) {
    if (Platform.OS === 'ios') {
      Alert.prompt('Rename Route', 'Enter a new name', async (newName) => {
        if (newName?.trim()) {
          const trimmed = newName.trim();
          updateRouteNameStore(route.id, trimmed);
          await updateRouteName(route.id, trimmed, user?.id ?? 'local');
        }
      }, 'plain-text', route.name);
    } else {
      Alert.alert('Rename Route', `Current name: "${route.name}"\n\nRename feature coming soon on Android.`, [{ text: 'OK' }]);
    }
  }

  async function handleMoveCategory(route: Route, category: string | null) {
    updateRouteCategoryStore(route.id, category);
    await updateRouteCategory(route.id, category, user?.id ?? 'local');
  }

  function handleRenameCategory(oldName: string) {
    if (Platform.OS === 'ios') {
      Alert.prompt('Rename Category', 'Enter a new name', async (newName) => {
        if (!newName?.trim() || newName.trim() === oldName) return;
        const trimmed = newName.trim();
        const toUpdate = routes.filter((r) => r.category === oldName);
        for (const r of toUpdate) {
          updateRouteCategoryStore(r.id, trimmed);
          await updateRouteCategory(r.id, trimmed, user?.id ?? 'local');
        }
      }, 'plain-text', oldName);
    }
  }

  function handleDeleteCategory(categoryName: string) {
    const count = routes.filter((r) => r.category === categoryName).length;
    Alert.alert(
      'Delete Folder',
      `Delete "${categoryName}"? The ${count} route${count !== 1 ? 's' : ''} inside will be moved to Uncategorized.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Folder',
          style: 'destructive',
          onPress: async () => {
            const userId = user?.id ?? 'local';
            const toUpdate = routes.filter((r) => r.category === categoryName);
            for (const r of toUpdate) {
              updateRouteCategoryStore(r.id, null);
              await updateRouteCategory(r.id, null, userId);
            }
          },
        },
      ],
    );
  }

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

        {/* Grouped route list with collapsible categories */}
        {orderedKeys.map((category, idx) => {
          const rawRoutes = grouped.get(category) ?? [];
          const sort = categorySorts[category] ?? 'name';
          const categoryRoutes = sortRoutes(rawRoutes, sort);
          const isExpanded = query ? true : (expandedCategories[category] ?? false);

          return (
            <View key={category}>
              {idx > 0 && (
                <View style={[s.categoryDivider, { backgroundColor: theme.border }]} />
              )}
              <View style={s.categorySection}>
                <CategoryHeader
                  label={category}
                  count={rawRoutes.length}
                  isExpanded={isExpanded}
                  onToggle={() => toggleCategory(category)}
                  onRenameCategory={handleRenameCategory}
                  onDeleteCategory={handleDeleteCategory}
                  sortMode={sort}
                  onSortChange={(mode) => handleSortChange(category, mode)}
                />
                {isExpanded && categoryRoutes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    categories={allCategories}
                    onNavigate={() => {
                      setPendingNavigateRoute(route);
                      router.navigate('/(tabs)/ride');
                    }}
                    onExport={() => handleExport(route)}
                    onDelete={() => handleDelete(route)}
                    onRename={() => handleRename(route)}
                    onMoveCategory={(cat) => handleMoveCategory(route, cat)}
                  />
                ))}
              </View>
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
// Styles — matching Route Library exactly
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  content: { padding: 20, paddingBottom: 80 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },

  categorySection: {
    marginBottom: 0,
  },
  categoryDivider: {
    height: 1,
    marginHorizontal: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  categoryCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  categoryCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  sortRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 10,
    marginBottom: 8,
    borderBottomWidth: 1,
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
    letterSpacing: 0.7,
  },

  card: {
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  cardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginRight: 8,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cardHeaderBtn: {
    padding: 4,
  },

  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  metaSep: { width: 1, height: 12 },

  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  actionDivider: { width: 1, marginVertical: 8 },

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
