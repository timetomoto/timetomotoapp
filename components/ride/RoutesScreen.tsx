import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import { useAuthStore, useGarageStore, useRoutesStore, bikeLabel } from '../../lib/store';
import {
  fetchUserRoutes,
  deleteRoute,
  updateRouteName,
  updateRouteCategory,
  seedRoutes,
} from '../../lib/routes';
import { parseGpx, serializeGpx } from '../../lib/gpx';
import type { Route } from '../../lib/routes';
import type { TrackPoint } from '../../lib/gpx';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onImportRoute: (points: TrackPoint[], name: string) => void;
  onNavigate: (route: Route) => void;
}

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

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const UNCATEGORIZED = '__uncategorized__';
const CATEGORY_ORDER_KEY = 'ttm_route_category_order';

type SortMode = 'name' | 'distance' | 'elevation';
const SORT_OPTIONS: { key: SortMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'name', label: 'A-Z', icon: 'type' },
  { key: 'distance', label: 'DIST', icon: 'map' },
  { key: 'elevation', label: 'ELEV', icon: 'trending-up' },
];

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
// Route card
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
// Saved ride card (recorded rides)
// ---------------------------------------------------------------------------

function SavedRideCard({
  route,
  bikeName,
  onNavigate,
  onExport,
  onDelete,
  onRename,
}: {
  route: Route;
  bikeName?: string;
  onNavigate: () => void;
  onExport: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const { theme } = useTheme();
  const dur = fmtDuration(route.duration_seconds);
  const dateStr = fmtDate(route.recorded_at ?? route.created_at);

  return (
    <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={s.cardHeader}>
        <View style={sr.nameRow}>
          <View style={sr.recBadge}>
            <View style={sr.recDot} />
            <Text style={sr.recText}>REC</Text>
          </View>
          <Text style={[s.cardName, { color: theme.textPrimary }]} numberOfLines={1}>{route.name}</Text>
        </View>
        <View style={s.cardHeaderActions}>
          <Pressable onPress={onRename} hitSlop={8} style={s.cardHeaderBtn}>
            <Feather name="edit-2" size={14} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={s.cardHeaderBtn}>
            <Feather name="trash-2" size={15} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={s.cardMeta}>
        {dateStr ? (
          <>
            <View style={s.metaItem}>
              <Feather name="calendar" size={11} color={theme.textSecondary} />
              <Text style={[s.metaText, { color: theme.textSecondary }]}>{dateStr}</Text>
            </View>
            <View style={[s.metaSep, { backgroundColor: theme.cardDivider }]} />
          </>
        ) : null}
        <View style={s.metaItem}>
          <Feather name="map" size={11} color={theme.textSecondary} />
          <Text style={[s.metaText, { color: theme.textSecondary }]}>{fmtMiles(route.distance_miles)} mi</Text>
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
        <View style={[s.metaSep, { backgroundColor: theme.cardDivider }]} />
        <View style={s.metaItem}>
          <Feather name="trending-up" size={11} color={theme.textSecondary} />
          <Text style={[s.metaText, { color: theme.textSecondary }]}>{fmtEle(route.elevation_gain_ft)} ft</Text>
        </View>
      </View>

      {bikeName ? (
        <View style={[sr.bikeRow, { borderTopColor: theme.border }]}>
          <Feather name="disc" size={11} color={theme.textMuted} />
          <Text style={[sr.bikeText, { color: theme.textMuted }]}>{bikeName}</Text>
        </View>
      ) : null}

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
// Collapsible category header
// ---------------------------------------------------------------------------

function CategoryHeader({
  label,
  count,
  isExpanded,
  onToggle,
  onLongPress,
  isDragging,
  onRenameCategory,
  onDeleteCategory,
  sortMode,
  onSortChange,
}: {
  label: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  isDragging?: boolean;
  onRenameCategory: (oldName: string) => void;
  onDeleteCategory: (name: string) => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
}) {
  const { theme } = useTheme();
  const rotation = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const isUncategorized = label === UNCATEGORIZED;

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: isExpanded ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [isExpanded]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View>
      <Pressable
        style={[
          s.categoryHeader,
          !isExpanded && { borderBottomColor: theme.border },
          isExpanded && { borderBottomWidth: 0 },
          isDragging && {
            backgroundColor: theme.bgCard,
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 6,
            opacity: 0.95,
          },
        ]}
        onPress={onToggle}
        onLongPress={onLongPress}
      >
        <View style={s.categoryHeaderLeft}>
          <Feather name={isUncategorized ? 'inbox' : 'folder'} size={14} color={theme.textSecondary} />
          <Text style={[s.categoryLabel, { color: theme.textSecondary }]}>
            {isUncategorized ? 'UNCATEGORIZED' : label.toUpperCase()}
          </Text>
          <Text style={[s.categoryCount, { color: theme.textMuted }]}>{count}</Text>
        </View>
        <View style={s.categoryHeaderRight}>
          {!isUncategorized && (
            <>
              <Pressable onPress={() => onRenameCategory(label)} hitSlop={8} style={{ marginRight: 10 }}>
                <Feather name="edit-2" size={12} color={theme.textMuted} />
              </Pressable>
              <Pressable onPress={() => onDeleteCategory(label)} hitSlop={8} style={{ marginRight: 8 }}>
                <Feather name="trash-2" size={12} color={theme.red} />
              </Pressable>
            </>
          )}
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Feather name="chevron-right" size={16} color={theme.textMuted} />
          </Animated.View>
        </View>
      </Pressable>

      {/* Sort pills — visible when expanded */}
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
// Saved Rides collapsible section
// ---------------------------------------------------------------------------

function SavedRidesSection({
  rides,
  bikesById,
  onNavigate,
  onExport,
  onDelete,
  onRename,
}: {
  rides: Route[];
  bikesById: Map<string, any>;
  onNavigate: (r: Route) => void;
  onExport: (r: Route) => void;
  onDelete: (r: Route) => void;
  onRename: (r: Route) => void;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;

  function toggle() {
    const toValue = open ? 0 : 1;
    Animated.timing(rotation, { toValue, duration: 180, useNativeDriver: true }).start();
    setOpen((v) => !v);
  }

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View style={{ marginBottom: 20 }}>
      <Pressable style={[s.categoryHeader, { borderBottomColor: theme.border }]} onPress={toggle}>
        <View style={s.categoryHeaderLeft}>
          <Feather name="disc" size={14} color={theme.textSecondary} />
          <Text style={[s.categoryLabel, { color: theme.textSecondary }]}>SAVED RIDES</Text>
          <View style={[sr.countBadge, { backgroundColor: theme.red }]}>
            <Text style={sr.countText}>{rides.length}</Text>
          </View>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Feather name="chevron-right" size={16} color={theme.textMuted} />
        </Animated.View>
      </Pressable>

      {open && rides.map((route) => (
        <SavedRideCard
          key={route.id}
          route={route}
          bikeName={route.bike_id ? bikeLabel(bikesById.get(route.bike_id) ?? null) : undefined}
          onNavigate={() => onNavigate(route)}
          onExport={() => onExport(route)}
          onDelete={() => onDelete(route)}
          onRename={() => onRename(route)}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// RoutesScreen
// ---------------------------------------------------------------------------

export default function RoutesScreen({ onImportRoute, onNavigate }: Props) {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const {
    routes, loading, setRoutes, setLoading, addRoute, removeRoute,
    updateRouteName: updateRouteNameStore, updateRouteCategory: updateRouteCategoryStore,
  } = useRoutesStore();
  const [importing, setImporting] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySorts, setCategorySorts] = useState<Record<string, SortMode>>({});
  const orderLoadedRef = useRef(false);

  useEffect(() => {
    const userId = user?.id ?? 'local';
    setLoading(true);
    seedRoutes(userId)
      .catch(() => {})
      .finally(() => {
        fetchUserRoutes(userId)
          .then(setRoutes)
          .finally(() => setLoading(false));
      });
  }, [user?.id]);

  // Load persisted category order
  useEffect(() => {
    AsyncStorage.getItem(CATEGORY_ORDER_KEY).then((stored) => {
      if (stored) {
        try { setCategoryOrder(JSON.parse(stored)); } catch { /* ignore */ }
      }
      orderLoadedRef.current = true;
    });
  }, []);

  const { bikes } = useGarageStore();
  const bikesById = new Map(bikes.map((b) => [b.id, b]));

  const query = searchQuery.trim().toLowerCase();
  const filteredRoutes = query
    ? routes.filter((r) => r.name.toLowerCase().includes(query))
    : routes;
  const savedRides = filteredRoutes.filter((r) => r.source === 'recorded');
  const otherRoutes = filteredRoutes.filter((r) => r.source !== 'recorded');
  const grouped = groupRoutes(otherRoutes);
  const allCategories = [...grouped.keys()].filter((k) => k !== UNCATEGORIZED);

  // Build ordered category list: persisted order first, new categories appended
  const allGroupKeys = [...grouped.keys()];
  const orderedKeys = [
    ...categoryOrder.filter((k) => allGroupKeys.includes(k)),
    ...allGroupKeys.filter((k) => !categoryOrder.includes(k)),
  ];

  // Sync new categories into persisted order
  useEffect(() => {
    if (!orderLoadedRef.current || loading) return;
    const current = orderedKeys;
    if (JSON.stringify(current) !== JSON.stringify(categoryOrder)) {
      setCategoryOrder(current);
      AsyncStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(current));
    }
  }, [allGroupKeys.join(','), loading]);

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  }

  function handleSortChange(category: string, mode: SortMode) {
    setCategorySorts((prev) => ({ ...prev, [category]: mode }));
  }

  async function handleImport() {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/gpx+xml', 'text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = new File(result.assets[0].uri);
      const xml = await file.text();
      const parsed = parseGpx(xml);
      if (parsed.points.length < 2) {
        Alert.alert('Invalid GPX', 'No track points found in this file.');
        return;
      }
      onImportRoute(parsed.points, parsed.name);
    } catch {
      Alert.alert('Import failed', 'Could not read this GPX file.');
    } finally {
      setImporting(false);
    }
  }

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

  function handleNewCategory() {
    Alert.prompt('New Category', 'Enter a name for the new category', (name) => {
      if (!name?.trim()) return;
      Alert.alert('Category Created', `"${name.trim()}" will appear when you move a route into it. Use the folder icon on any route card to assign it.`);
    });
  }

  const handleDragEnd = useCallback(({ data }: { data: string[] }) => {
    setCategoryOrder(data);
    AsyncStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(data));
  }, []);

  const renderCategoryItem = useCallback(({ item, drag, isActive }: RenderItemParams<string>) => {
    const rawRoutes = grouped.get(item) ?? [];
    const sort = categorySorts[item] ?? 'name';
    const categoryRoutes = sortRoutes(rawRoutes, sort);
    const isExpanded = query ? true : (expandedCategories[item] ?? false);

    return (
      <View style={s.categorySection}>
        <CategoryHeader
          label={item}
          count={rawRoutes.length}
          isExpanded={isExpanded}
          onToggle={() => toggleCategory(item)}
          onLongPress={drag}
          isDragging={isActive}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          sortMode={sort}
          onSortChange={(mode) => handleSortChange(item, mode)}
        />
        {isExpanded && categoryRoutes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            categories={allCategories}
            onNavigate={() => onNavigate(route)}
            onExport={() => handleExport(route)}
            onDelete={() => handleDelete(route)}
            onRename={() => handleRename(route)}
            onMoveCategory={(cat) => handleMoveCategory(route, cat)}
          />
        ))}
      </View>
    );
  }, [grouped, expandedCategories, allCategories, categorySorts, onNavigate]);

  return (
    <GestureHandlerRootView style={[s.root, { backgroundColor: theme.bg }]}>
      <DraggableFlatList
        data={orderedKeys}
        keyExtractor={(item) => item}
        onDragEnd={handleDragEnd}
        renderItem={renderCategoryItem}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={s.headerRow}>
              <Text style={[s.heading, { color: theme.textSecondary }]}>ROUTE LIBRARY</Text>
              <View style={s.headerActions}>
                <Pressable
                  style={[s.headerBtn, { borderColor: theme.border }]}
                  onPress={handleNewCategory}
                >
                  <Feather name="folder-plus" size={14} color={theme.textSecondary} />
                </Pressable>
                <Pressable
                  style={[s.importBtn, { backgroundColor: theme.red }, importing && s.importBtnDisabled]}
                  onPress={handleImport}
                  disabled={importing}
                >
                  {importing
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Feather name="upload" size={14} color="#fff" />
                  }
                  <Text style={s.importBtnText}>{importing ? 'IMPORTING…' : 'IMPORT GPX'}</Text>
                </Pressable>
              </View>
            </View>

            {/* Search bar */}
            {!loading && routes.length > 0 && (
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

            {loading && (
              <ActivityIndicator color={theme.textSecondary} style={{ marginTop: 40 }} />
            )}

            {!loading && routes.length === 0 && (
              <View style={s.emptyState}>
                <Feather name="map" size={32} color={theme.border} />
                <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>No saved routes</Text>
                <Text style={[s.emptyDetail, { color: theme.textSecondary }]}>Import a GPX file or save a recorded ride</Text>
              </View>
            )}

            {/* Search returned no results */}
            {!loading && routes.length > 0 && query && filteredRoutes.length === 0 && (
              <View style={s.emptyState}>
                <Feather name="search" size={28} color={theme.border} />
                <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>No routes match your search</Text>
              </View>
            )}

            {/* Saved Rides section — collapsible */}
            {!loading && savedRides.length > 0 && (
              <SavedRidesSection
                rides={savedRides}
                bikesById={bikesById}
                onNavigate={onNavigate}
                onExport={handleExport}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            )}

            {!loading && !query && savedRides.length === 0 && otherRoutes.length > 0 && (
              <View style={sr.emptyRides}>
                <Feather name="disc" size={20} color={theme.border} />
                <Text style={[s.emptyDetail, { color: theme.textSecondary }]}>No saved rides yet. Head to the RECORD tab to log your first ride.</Text>
              </View>
            )}

            {/* ROUTES heading */}
            {!loading && otherRoutes.length > 0 && (
              <View style={sr.sectionHeader}>
                <Text style={[s.heading, { color: theme.textSecondary }]}>ROUTES</Text>
              </View>
            )}
          </>
        }
      />
    </GestureHandlerRootView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root:    { flex: 1 },
  content: { padding: 20, paddingBottom: 80 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },

  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  importBtnDisabled: { opacity: 0.6 },
  importBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  categorySection: {
    marginBottom: 8,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
    letterSpacing: 1,
  },

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
  metaSep:  { width: 1, height: 12 },

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
    letterSpacing: 1,
  },
  actionDivider: { width: 1, marginVertical: 8 },

  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyDetail: {
    fontSize: 13,
    textAlign: 'center',
  },
});

const sr = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  nameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(211,47,47,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E53935',
  },
  recText: {
    color: '#E53935',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  emptyRides: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
    marginBottom: 20,
  },
  bikeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  bikeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
