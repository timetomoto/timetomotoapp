import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuthStore, useGarageStore, useRoutesStore, bikeLabel } from '../../lib/store';
import {
  deleteRoute,
  updateRouteName,
  updateRouteCategory,
} from '../../lib/routes';
import { serializeGpx } from '../../lib/gpx';
import type { Route } from '../../lib/routes';
import { useTheme } from '../../lib/useTheme';

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

function routeDateLabel(route: Route): string | null {
  const src = route.source;
  if (src === 'planned') {
    const parts: string[] = [];
    if (route.departure_time) parts.push(`Departure: ${fmtDate(route.departure_time)}`);
    parts.push(`Saved: ${fmtDate(route.created_at)}`);
    return parts.join('  ·  ');
  }
  if (src === 'recorded') return `Recorded: ${fmtDate(route.recorded_at || route.created_at)}`;
  if (src === 'imported') return `Imported: ${fmtDate(route.created_at)}`;
  return route.created_at ? `Added: ${fmtDate(route.created_at)}` : null;
}

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

/** Thumbnail with error fallback */
function RouteThumbnail({ url }: { url: string }) {
  const { theme } = useTheme();
  const [error, setError] = useState(false);
  if (error) return (
    <View style={[styles.cardThumbnail, { backgroundColor: theme.bgCard, alignItems: 'center', justifyContent: 'center' }]}>
      <Feather name="map" size={24} color={theme.border} />
    </View>
  );
  return <Image source={{ uri: url }} style={styles.cardThumbnail} cachePolicy="memory-disk" contentFit="cover" onError={() => setError(true)} />;
}

/** Encode coordinates as Mapbox polyline (Google polyline encoding) */
function encodePolyline(coords: { lat: number; lng: number }[]): string {
  let encoded = '';
  let pLat = 0;
  let pLng = 0;
  for (const c of coords) {
    const lat = Math.round(c.lat * 1e5);
    const lng = Math.round(c.lng * 1e5);
    let dLat = lat - pLat;
    let dLng = lng - pLng;
    pLat = lat;
    pLng = lng;
    for (const d of [dLat, dLng]) {
      let v = d < 0 ? ~(d << 1) : d << 1;
      while (v >= 0x20) {
        encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
      }
      encoded += String.fromCharCode(v + 63);
    }
  }
  return encoded;
}

/** Build Mapbox Static Image URL for a route thumbnail */
function routeThumbnailUrl(points: { lat: number; lng: number }[], mapStyleUrl?: string | null): string | null {
  const styleId = mapStyleUrl
    ? mapStyleUrl.replace('mapbox://styles/mapbox/', '')
    : 'satellite-streets-v12';
  if (!MAPBOX_TOKEN || points.length < 2) return null;

  // Check minimum bounding box — skip if route is essentially a single point
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  if (latSpan < 0.001 && lngSpan < 0.001) return null;

  // Sample points to keep URL under length limits (~50 points max)
  const sampled = points.length <= 50 ? points : points.filter((_, i) => i % Math.ceil(points.length / 50) === 0 || i === points.length - 1);
  const poly = encodePolyline(sampled);
  const encoded = encodeURIComponent(poly);

  // Use auto fit with generous padding; fall back to explicit zoom if URL is too long
  if (encoded.length > 1800) {
    // URL too long for auto — use midpoint with zoom 10
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/static/path-4+E53935-0.8(${encoded})/${midLng},${midLat},10/400x200@2x?access_token=${MAPBOX_TOKEN}&padding=40`;
  }

  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/static/path-4+E53935-0.8(${encoded})/auto/400x200@2x?access_token=${MAPBOX_TOKEN}&padding=40`;
}

const UNCATEGORIZED = '__uncategorized__';
const CATEGORY_ORDER_KEY = 'ttm_route_category_order';
const ROUTE_SORT_KEY = (userId: string) => `@ttm/routes_sort_order_${userId}`;
const EXPANDED_STATE_KEY = (userId: string) => `@ttm/routes_expanded_state_${userId}`;

function applyPersistedOrder(routes: Route[], savedOrder: string[]): Route[] {
  if (!savedOrder.length) return routes;
  const orderMap = new Map(savedOrder.map((id, i) => [id, i]));
  const ordered = [...routes].sort((a, b) => {
    const aIdx = orderMap.get(a.id) ?? Infinity;
    const bIdx = orderMap.get(b.id) ?? Infinity;
    return aIdx - bIdx;
  });
  return ordered;
}

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
    let key = route.category?.trim() || 'My Routes';
    if (route.source === 'recorded' && key === 'My Routes') key = 'Recorded Rides';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(route);
  }
  return map;
}

async function shareRoute(route: Route) {
  try {
    if (route.points.length > 0) {
      const xml = serializeGpx(route.name, route.points);
      const safeName = route.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const outFile = new File(Paths.cache, `${safeName}.gpx`);
      outFile.write(xml);
      await Sharing.shareAsync(outFile.uri, {
        mimeType: 'application/gpx+xml',
        dialogTitle: `Share ${route.name}`,
        UTI: 'com.topografix.gpx',
      });
    } else {
      await Share.share({
        title: route.name,
        message: `Check out this route on Time to Moto: ${route.name} — ${fmtMiles(route.distance_miles)} mi.`,
      });
    }
  } catch {
    // User cancelled or share failed
  }
}

// ---------------------------------------------------------------------------
// Route card
// ---------------------------------------------------------------------------

function RouteCard({
  route,
  categories,
  onNavigate,
  onViewInPlanner,
  onExport,
  onDelete,
  onRename,
  onMoveCategory,
}: {
  route: Route;
  categories: string[];
  onNavigate: () => void;
  onViewInPlanner?: () => void;
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
    <View style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border, marginHorizontal: 8 }, theme.cardBorderTop && { borderTopColor: theme.cardBorderTop, borderBottomColor: theme.cardBorderBottom, borderTopWidth: 1, borderBottomWidth: 1 }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardName, { color: theme.textPrimary }]} numberOfLines={1}>{route.name}</Text>
      </View>

      <View style={styles.cardMeta}>
        <Text style={[styles.statsText, { color: theme.textSecondary }]}>
          {fmtMiles(route.distance_miles)} mi | {fmtEle(route.elevation_gain_ft)} ft{dur ? ` | ${dur}` : ''}
        </Text>
        <View style={styles.cardIconRow}>
          <Pressable onPress={onRename} hitSlop={6} style={styles.cardHeaderBtn}>
            <Feather name="edit-2" size={13} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={showCategorySheet} hitSlop={6} style={styles.cardHeaderBtn}>
            <Feather name="folder" size={13} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={onExport} hitSlop={6} style={styles.cardHeaderBtn}>
            <Feather name="download" size={13} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={6} style={styles.cardHeaderBtn}>
            <Feather name="trash-2" size={13} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      {route.points.length >= 2 && (() => {
        const url = routeThumbnailUrl(route.points, route.map_style);
        return url ? (
          <RouteThumbnail url={url} />
        ) : null;
      })()}

      {routeDateLabel(route) && (
        <Text style={{ fontSize: 11, color: theme.textMuted, paddingHorizontal: 16, paddingVertical: 6 }}>{routeDateLabel(route)}</Text>
      )}

      <View style={[styles.cardActions, { borderTopColor: theme.cardDivider }]}>
        <Pressable style={styles.actionBtn} onPress={onNavigate}>
          <Feather name="navigation" size={13} color={theme.red} />
          <Text style={[styles.actionText, { color: theme.red }]}>NAVIGATE</Text>
        </Pressable>
        {onViewInPlanner && (
          <>
            <View style={[styles.actionDivider, { backgroundColor: theme.cardDivider }]} />
            <Pressable style={styles.actionBtn} onPress={onViewInPlanner}>
              <Feather name="map" size={13} color={theme.textSecondary} />
              <Text style={[styles.actionText, { color: theme.textSecondary }]}>VIEW</Text>
            </Pressable>
          </>
        )}
        <View style={[styles.actionDivider, { backgroundColor: theme.cardDivider }]} />
        <Pressable style={styles.actionBtn} onPress={() => shareRoute(route)}>
          <Feather name="share-2" size={13} color={theme.textSecondary} />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>SHARE</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Compact list row
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Saved ride card
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
    <View style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border, marginHorizontal: 8 }, theme.cardBorderTop && { borderTopColor: theme.cardBorderTop, borderBottomColor: theme.cardBorderBottom, borderTopWidth: 1, borderBottomWidth: 1 }]}>
      <View style={styles.cardHeader}>
        <View style={srStyles.nameRow}>
          <View style={srStyles.recBadge}>
            <View style={srStyles.recDot} />
            <Text style={srStyles.recText}>REC</Text>
          </View>
          <Text style={[styles.cardName, { color: theme.textPrimary }]} numberOfLines={1}>{route.name}</Text>
        </View>
        <View style={styles.cardHeaderActions}>
          <Pressable onPress={onRename} hitSlop={8} style={styles.cardHeaderBtn}>
            <Feather name="edit-2" size={14} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={onExport} hitSlop={8} style={styles.cardHeaderBtn}>
            <Feather name="download" size={14} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={styles.cardHeaderBtn}>
            <Feather name="trash-2" size={15} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.cardMeta}>
        {dateStr ? (
          <>
            <View style={styles.metaItem}>
              <Feather name="calendar" size={11} color={theme.textSecondary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>{dateStr}</Text>
            </View>
            <View style={[styles.metaSep, { backgroundColor: theme.cardDivider }]} />
          </>
        ) : null}
        <View style={styles.metaItem}>
          <Feather name="map" size={11} color={theme.textSecondary} />
          <Text style={[styles.metaText, { color: theme.textSecondary }]}>{fmtMiles(route.distance_miles)} mi</Text>
        </View>
        {dur && (
          <>
            <View style={[styles.metaSep, { backgroundColor: theme.cardDivider }]} />
            <View style={styles.metaItem}>
              <Feather name="clock" size={11} color={theme.textSecondary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>{dur}</Text>
            </View>
          </>
        )}
        <View style={[styles.metaSep, { backgroundColor: theme.cardDivider }]} />
        <View style={styles.metaItem}>
          <Feather name="trending-up" size={11} color={theme.textSecondary} />
          <Text style={[styles.metaText, { color: theme.textSecondary }]}>{fmtEle(route.elevation_gain_ft)} ft</Text>
        </View>
      </View>

      {bikeName ? (
        <View style={[srStyles.bikeRow, { borderTopColor: theme.border }]}>
          <Feather name="disc" size={11} color={theme.textMuted} />
          <Text style={[srStyles.bikeText, { color: theme.textMuted }]}>{bikeName}</Text>
        </View>
      ) : null}

      {route.points.length >= 2 && (() => {
        const url = routeThumbnailUrl(route.points, route.map_style);
        return url ? (
          <RouteThumbnail url={url} />
        ) : null;
      })()}

      <View style={[styles.cardActions, { borderTopColor: theme.cardDivider }]}>
        <Pressable style={styles.actionBtn} onPress={onNavigate}>
          <Feather name="navigation" size={13} color={theme.red} />
          <Text style={[styles.actionText, { color: theme.red }]}>NAVIGATE</Text>
        </Pressable>
        <View style={[styles.actionDivider, { backgroundColor: theme.cardDivider }]} />
        <Pressable style={styles.actionBtn} onPress={() => shareRoute(route)}>
          <Feather name="share-2" size={13} color={theme.textSecondary} />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>SHARE</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Category header (no sort pills — global sort at top instead)
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
}: {
  label: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  isDragging?: boolean;
  onRenameCategory: (oldName: string) => void;
  onDeleteCategory: (name: string) => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      style={[
        styles.categoryHeader,
        { borderBottomColor: isExpanded ? theme.border : 'transparent' },
      ]}
      onPress={onToggle}
    >
      <Feather
        name={isExpanded ? 'chevron-up' : 'chevron-down'}
        size={16}
        color={theme.textSecondary}
        style={{ marginRight: 8 }}
      />
      <Text style={[styles.categoryLabel, { color: theme.textSecondary }]}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.categoryHeaderRight}>
        {!isExpanded && count > 0 && (
          <View style={[styles.categoryCountBadge, { backgroundColor: theme.red }]}>
            <Text style={styles.categoryCountText}>{count}</Text>
          </View>
        )}
        <Pressable onPress={() => onRenameCategory(label)} hitSlop={6} style={{ padding: 4 }}>
          <Feather name="edit-2" size={12} color={theme.textMuted} />
        </Pressable>
        <Pressable onPress={() => onDeleteCategory(label)} hitSlop={6} style={{ padding: 4 }}>
          <Feather name="trash-2" size={12} color={theme.red} />
        </Pressable>
        <Pressable onLongPress={onLongPress} delayLongPress={150} hitSlop={6} style={{ padding: 4 }}>
          <Feather name="menu" size={16} color={theme.textMuted} />
        </Pressable>
      </View>
    </Pressable>
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

  return (
    <View style={{ marginBottom: 0 }}>
      <Pressable
        style={[styles.categoryHeader, { borderBottomColor: open ? theme.border : 'transparent' }]}
        onPress={() => setOpen((v) => !v)}
      >
        <Text style={[styles.categoryLabel, { color: theme.textSecondary }]}>SAVED RIDES</Text>
        <View style={styles.categoryHeaderRight}>
          {!open && rides.length > 0 && (
            <View style={[styles.categoryCountBadge, { backgroundColor: theme.red }]}>
              <Text style={styles.categoryCountText}>{rides.length}</Text>
            </View>
          )}
          <Feather
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textSecondary}
          />
        </View>
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
// RouteList — shared component
// ---------------------------------------------------------------------------

interface RouteListProps {
  showSavedRides: boolean;
  onNavigate: (route: Route) => void;
  onViewInPlanner?: (route: Route) => void;
  headerExtra?: React.ReactNode;
  onImport?: () => void;
  onNewCategory?: () => void;
  importing?: boolean;
}

export default function RouteList({ showSavedRides, onNavigate, onViewInPlanner, headerExtra, onImport, onNewCategory, importing }: RouteListProps) {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const {
    routes, loading,
    removeRoute,
    updateRouteName: updateRouteNameStore,
    updateRouteCategory: updateRouteCategoryStore,
  } = useRoutesStore();

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [routeSortOrder, setRouteSortOrder] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const orderLoadedRef = useRef(false);
  const autoExpandedRef = useRef(false);
  const userId = user?.id ?? 'local';

  // Load persisted category order, route sort order, and expanded state
  useEffect(() => {
    AsyncStorage.getItem(CATEGORY_ORDER_KEY).then((stored) => {
      if (stored) {
        try { setCategoryOrder(JSON.parse(stored)); } catch { /* ignore */ }
      }
      orderLoadedRef.current = true;
    }).catch((e) => console.error('AsyncStorage read failed:', e));
    AsyncStorage.getItem(ROUTE_SORT_KEY(userId)).then((stored) => {
      if (stored) {
        try { setRouteSortOrder(JSON.parse(stored)); } catch { /* ignore */ }
      }
    }).catch((e) => console.error('AsyncStorage read failed:', e));
    AsyncStorage.getItem(EXPANDED_STATE_KEY(userId)).then((stored) => {
      if (stored) {
        try { setExpandedCategories(JSON.parse(stored)); autoExpandedRef.current = true; } catch { /* ignore */ }
      }
    }).catch((e) => console.error('AsyncStorage read failed:', e));
  }, [userId]);

  const { bikes } = useGarageStore();
  const bikesById = new Map(bikes.map((b) => [b.id, b]));

  const query = searchQuery.trim().toLowerCase();
  const sortedRoutes = routeSortOrder.length > 0 ? applyPersistedOrder(routes, routeSortOrder) : routes;
  const filteredRoutes = query
    ? sortedRoutes.filter((r) =>
        r.name.toLowerCase().includes(query) ||
        (r.category ?? '').toLowerCase().includes(query))
    : sortedRoutes;
  const grouped = groupRoutes(filteredRoutes);
  const allCategories = [...grouped.keys()];

  // Build ordered category list — exclude empty categories
  const allGroupKeys = [...grouped.keys()].filter((k) => (grouped.get(k)?.length ?? 0) > 0);
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
      AsyncStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(current)).catch((e) => console.error('AsyncStorage write failed:', e));
    }
  }, [allGroupKeys.join(','), loading]);

  // Auto-expand first category with items on initial load
  useEffect(() => {
    if (autoExpandedRef.current || loading || orderedKeys.length === 0) return;
    const first = orderedKeys.find((k) => (grouped.get(k) ?? []).length > 0);
    if (first) {
      setExpandedCategories((prev) => ({ ...prev, [first]: true }));
      autoExpandedRef.current = true;
    }
  }, [orderedKeys, grouped, loading]);

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => {
      const next = { ...prev, [category]: !prev[category] };
      AsyncStorage.setItem(EXPANDED_STATE_KEY(userId), JSON.stringify(next)).catch((e) => console.error('AsyncStorage write failed:', e));
      return next;
    });
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
    // Use the same grouping logic to find the exact routes in this category
    const categoryRoutes = grouped.get(categoryName) ?? [];
    const toUpdate = categoryRoutes;
    const count = toUpdate.length;

    if (count === 0) {
      setCategoryOrder((prev) => prev.filter((c) => c !== categoryName));
      return;
    }

    Alert.alert(
      'Delete Folder',
      `Delete "${categoryName}"? The ${count} route${count !== 1 ? 's' : ''} inside will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Folder',
          style: 'destructive',
          onPress: async () => {
            const userId = user?.id ?? 'local';
            for (const r of toUpdate) {
              removeRoute(r.id);
              await deleteRoute(r.id, userId);
            }
            setCategoryOrder((prev) => prev.filter((c) => c !== categoryName));
          },
        },
      ],
    );
  }

  const handleDragEnd = useCallback(({ data }: { data: string[] }) => {
    setCategoryOrder(data);
    AsyncStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(data)).catch((e) => console.error('AsyncStorage write failed:', e));
    // Persist route order based on new category arrangement
    const allIds = data.flatMap((cat) => (grouped.get(cat) ?? []).map((r) => r.id));
    setRouteSortOrder(allIds);
    AsyncStorage.setItem(ROUTE_SORT_KEY(userId), JSON.stringify(allIds)).catch((e) => console.error('AsyncStorage write failed:', e));
  }, [grouped, userId]);

  const renderCategoryItem = useCallback(({ item, drag, isActive }: RenderItemParams<string>) => {
    const rawRoutes = grouped.get(item) ?? [];
    const categoryRoutes = sortRoutes(rawRoutes, sortMode);
    const isExpanded = query ? true : (expandedCategories[item] ?? false);

    // Hide empty categories during search
    if (query && rawRoutes.length === 0) return null;

    return (
      <View style={[
        styles.categoryCard,
        { backgroundColor: theme.bgCard, borderColor: theme.border },
        isActive && { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
      ]}>
        <CategoryHeader
          label={item}
          count={rawRoutes.length}
          isExpanded={isExpanded}
          onToggle={() => toggleCategory(item)}
          onLongPress={drag}
          isDragging={isActive}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
        />
        {isExpanded && (
          <View style={styles.categoryContent}>
            {categoryRoutes.map((route, idx) => (
              <View key={route.id} style={idx === 0 ? { marginTop: 5 } : undefined}>
                <RouteCard
                  route={route}
                  categories={allCategories}
                  onNavigate={() => onNavigate(route)}
                  onViewInPlanner={onViewInPlanner ? () => onViewInPlanner(route) : undefined}
                  onExport={() => handleExport(route)}
                  onDelete={() => handleDelete(route)}
                  onRename={() => handleRename(route)}
                  onMoveCategory={(cat) => handleMoveCategory(route, cat)}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }, [grouped, expandedCategories, allCategories, sortMode, onNavigate, query]);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: theme.bg }]}>
      <DraggableFlatList
        data={orderedKeys}
        keyExtractor={(item) => item}
        onDragEnd={handleDragEnd}
        renderItem={renderCategoryItem}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={styles.content}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {headerExtra}

            {/* Toolbar row: folder + import + search */}
            {(
              <View style={styles.toolbarRow}>
                {onNewCategory && (
                  <Pressable
                    style={[styles.toolbarIconBtn, { borderColor: theme.border }]}
                    onPress={onNewCategory}
                  >
                    <Feather name="folder-plus" size={14} color={theme.textSecondary} />
                  </Pressable>
                )}
                {onImport && (
                  <Pressable
                    style={[styles.toolbarImportBtn, { backgroundColor: theme.red }, importing && { opacity: 0.6 }]}
                    onPress={onImport}
                    disabled={importing}
                  >
                    {importing
                      ? <ActivityIndicator size="small" color={theme.white} />
                      : <Feather name="upload" size={14} color={theme.white} />
                    }
                    <Text style={styles.toolbarImportText}>{importing ? 'IMPORTING…' : 'IMPORT GPX'}</Text>
                  </Pressable>
                )}
                <View style={[styles.toolbarSearch, { borderColor: theme.border, backgroundColor: theme.bgCard }]}>
                  <Feather name="search" size={14} color={theme.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: theme.textPrimary }]}
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
              </View>
            )}

            {loading && (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyDetail, { color: theme.textSecondary }]}>Loading…</Text>
              </View>
            )}

            {!loading && routes.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="map" size={32} color={theme.border} />
                <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No routes yet</Text>
                <Text style={[styles.emptyDetail, { color: theme.textSecondary }]}>
                  Import a GPX file under Routes, record a ride, or plan a trip to get started.
                </Text>
              </View>
            )}

            {/* Search returned no results */}
            {!loading && routes.length > 0 && query && filteredRoutes.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="search" size={28} color={theme.border} />
                <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No routes match "{searchQuery}"</Text>
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

const styles = StyleSheet.create({
  root:    { flex: 1 },
  content: { padding: 20, paddingBottom: 120 },

  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  toolbarIconBtn: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },
  toolbarImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolbarImportText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  toolbarSearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },

  categoryCard: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  categoryContent: {
    paddingHorizontal: 8,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 10,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    flex: 1,
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

  card: {
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardThumbnail: {
    width: '100%',
    height: 120,
    marginTop: 2,
    marginBottom: 0,
  },

  cardHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  cardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
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
    marginTop: 4,
    paddingBottom: 10,
  },
  statsText: {
    fontSize: 11,
    flex: 1,
  },
  cardIconRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 116,
    gap: 8,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  metaSep:  { width: 1, height: 12 },

  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    marginTop: 0,
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
    letterSpacing: 0.3,
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

const srStyles = StyleSheet.create({
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
    backgroundColor: '#C62828',
  },
  recText: {
    color: '#C62828',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
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
