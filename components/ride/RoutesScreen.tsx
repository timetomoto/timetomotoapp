import { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import { useAuthStore, useRoutesStore } from '../../lib/store';
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

const UNCATEGORIZED = '__uncategorized__';

function groupRoutes(routes: Route[]): Map<string, Route[]> {
  const map = new Map<string, Route[]>();
  for (const route of routes) {
    const key = route.category?.trim() || UNCATEGORIZED;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(route);
  }
  // Sort: named categories alphabetically, Uncategorized last
  const sorted = new Map<string, Route[]>();
  const keys = [...map.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });
  for (const k of keys) sorted.set(k, map.get(k)!);
  return sorted;
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
      // Android: build alert with each category as a button
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
        <View style={[s.metaSep, { backgroundColor: theme.border }]} />
        <View style={s.metaItem}>
          <Feather name="trending-up" size={11} color={theme.textSecondary} />
          <Text style={[s.metaText, { color: theme.textSecondary }]}>{fmtEle(route.elevation_gain_ft)} ft</Text>
        </View>
        {dur && (
          <>
            <View style={[s.metaSep, { backgroundColor: theme.border }]} />
            <View style={s.metaItem}>
              <Feather name="clock" size={11} color={theme.textSecondary} />
              <Text style={[s.metaText, { color: theme.textSecondary }]}>{dur}</Text>
            </View>
          </>
        )}
      </View>

      <View style={[s.cardActions, { borderTopColor: theme.border }]}>
        <Pressable style={s.actionBtn} onPress={onNavigate}>
          <Feather name="navigation" size={13} color={theme.red} />
          <Text style={[s.actionText, { color: theme.red }]}>NAVIGATE</Text>
        </Pressable>
        <View style={[s.actionDivider, { backgroundColor: theme.border }]} />
        <Pressable style={s.actionBtn} onPress={onExport}>
          <Feather name="download" size={13} color={theme.textSecondary} />
          <Text style={[s.actionText, { color: theme.textSecondary }]}>EXPORT GPX</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Category section (collapsible)
// ---------------------------------------------------------------------------

function CategorySection({
  label,
  routes,
  categories,
  onNavigate,
  onExport,
  onDelete,
  onRename,
  onMoveCategory,
  onRenameCategory,
  defaultOpen,
}: {
  label: string;
  routes: Route[];
  categories: string[];
  onNavigate: (r: Route) => void;
  onExport: (r: Route) => void;
  onDelete: (r: Route) => void;
  onRename: (r: Route) => void;
  onMoveCategory: (r: Route, category: string | null) => void;
  onRenameCategory: (oldName: string) => void;
  onDeleteCategory: (name: string) => void;
  defaultOpen: boolean;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const rotation = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;
  const isUncategorized = label === UNCATEGORIZED;

  function toggle() {
    const toValue = open ? 0 : 1;
    Animated.timing(rotation, { toValue, duration: 180, useNativeDriver: true }).start();
    setOpen((v) => !v);
  }

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View style={s.categorySection}>
      <Pressable style={[s.categoryHeader, { borderBottomColor: theme.border }]} onPress={toggle}>
        <View style={s.categoryHeaderLeft}>
          <Feather name={isUncategorized ? 'inbox' : 'folder'} size={14} color={theme.textSecondary} />
          <Text style={[s.categoryLabel, { color: theme.textSecondary }]}>
            {isUncategorized ? 'UNCATEGORIZED' : label.toUpperCase()}
          </Text>
          <Text style={[s.categoryCount, { color: theme.textMuted }]}>{routes.length}</Text>
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

      {open && routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          categories={categories}
          onNavigate={() => onNavigate(route)}
          onExport={() => onExport(route)}
          onDelete={() => onDelete(route)}
          onRename={() => onRename(route)}
          onMoveCategory={(cat) => onMoveCategory(route, cat)}
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

  const grouped = groupRoutes(routes);
  const allCategories = [...grouped.keys()].filter((k) => k !== UNCATEGORIZED);

  async function handleImport() {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/gpx+xml', 'text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const xml = await FileSystem.readAsStringAsync(result.assets[0].uri);
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
    try {
      const xml = serializeGpx(route.name, route.points);
      const safeName = route.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const path = `${FileSystem.cacheDirectory}${safeName}.gpx`;
      await FileSystem.writeAsStringAsync(path, xml, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'application/gpx+xml', UTI: 'com.topografix.gpx' });
    } catch {
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
        // Update all routes in this category
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
      // Category is created by assigning it — prompt user to select a route
      Alert.alert('Category Created', `"${name.trim()}" will appear when you move a route into it. Use the folder icon on any route card to assign it.`);
    });
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: theme.bg }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={[s.heading, { color: theme.textSecondary }]}>SAVED ROUTES</Text>
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

      {!loading && [...grouped.entries()].map(([label, groupRoutes]) => (
        <CategorySection
          key={label}
          label={label}
          routes={groupRoutes}
          categories={allCategories}
          onNavigate={onNavigate}
          onExport={handleExport}
          onDelete={handleDelete}
          onRename={handleRename}
          onMoveCategory={handleMoveCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          defaultOpen={true}
        />
      ))}
    </ScrollView>
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
