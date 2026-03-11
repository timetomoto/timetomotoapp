import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { fetchUserRoutes, deleteRoute } from '../../lib/routes';
import { parseGpx, serializeGpx, routeBounds } from '../../lib/gpx';
import type { Route } from '../../lib/routes';
import type { TrackPoint } from '../../lib/gpx';
import { Colors } from '../../lib/theme';

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

// ---------------------------------------------------------------------------
// Route card
// ---------------------------------------------------------------------------

function RouteCard({
  route,
  onNavigate,
  onExport,
  onDelete,
}: {
  route: Route;
  onNavigate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const dur = fmtDuration(route.duration_seconds);

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.cardName} numberOfLines={1}>{route.name}</Text>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Feather name="trash-2" size={15} color={Colors.TEXT_SECONDARY} />
        </Pressable>
      </View>

      <View style={s.cardMeta}>
        <View style={s.metaItem}>
          <Feather name="map" size={11} color={Colors.TEXT_SECONDARY} />
          <Text style={s.metaText}>{fmtMiles(route.distance_miles)} mi</Text>
        </View>
        <View style={s.metaSep} />
        <View style={s.metaItem}>
          <Feather name="trending-up" size={11} color={Colors.TEXT_SECONDARY} />
          <Text style={s.metaText}>{fmtEle(route.elevation_gain_ft)} ft</Text>
        </View>
        {dur && (
          <>
            <View style={s.metaSep} />
            <View style={s.metaItem}>
              <Feather name="clock" size={11} color={Colors.TEXT_SECONDARY} />
              <Text style={s.metaText}>{dur}</Text>
            </View>
          </>
        )}
      </View>

      <View style={s.cardActions}>
        <Pressable style={s.actionBtn} onPress={onNavigate}>
          <Feather name="navigation" size={13} color={Colors.TTM_RED} />
          <Text style={[s.actionText, { color: Colors.TTM_RED }]}>NAVIGATE</Text>
        </Pressable>
        <View style={s.actionDivider} />
        <Pressable style={s.actionBtn} onPress={onExport}>
          <Feather name="download" size={13} color={Colors.TEXT_SECONDARY} />
          <Text style={s.actionText}>EXPORT GPX</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// RoutesScreen
// ---------------------------------------------------------------------------

export default function RoutesScreen({ onImportRoute, onNavigate }: Props) {
  const { user } = useAuthStore();
  const { routes, loading, setRoutes, setLoading, addRoute, removeRoute } = useRoutesStore();
  const [importing, setImporting] = useState(false);

  // Load routes on mount
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchUserRoutes(user.id)
      .then(setRoutes)
      .finally(() => setLoading(false));
  }, [user?.id]);

  // ── Import GPX ──
  async function handleImport() {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/gpx+xml', 'text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const uri = result.assets[0].uri;
      const xml = await FileSystem.readAsStringAsync(uri);
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

  // ── Export GPX ──
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

  // ── Delete ──
  function handleDelete(route: Route) {
    Alert.alert(
      'Delete route',
      `Delete "${route.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            removeRoute(route.id);
            await deleteRoute(route.id);
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.heading}>SAVED ROUTES</Text>
        <Pressable
          style={[s.importBtn, importing && s.importBtnDisabled]}
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

      {/* Loading */}
      {loading && (
        <ActivityIndicator color={Colors.TEXT_SECONDARY} style={{ marginTop: 40 }} />
      )}

      {/* Empty state */}
      {!loading && routes.length === 0 && (
        <View style={s.emptyState}>
          <Feather name="map" size={32} color={Colors.TTM_BORDER} />
          <Text style={s.emptyTitle}>No saved routes</Text>
          <Text style={s.emptyDetail}>Import a GPX file or save a recorded ride</Text>
        </View>
      )}

      {/* Route cards */}
      {routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          onNavigate={() => onNavigate(route)}
          onExport={() => handleExport(route)}
          onDelete={() => handleDelete(route)}
        />
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.TTM_DARK },
  content: { padding: 20, paddingBottom: 80 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
  },

  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.TTM_RED,
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

  // Cards
  card: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 10,
    marginBottom: 12,
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
    color: Colors.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginRight: 12,
  },

  // Meta row
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: Colors.TEXT_SECONDARY, fontSize: 12 },
  metaSep:  { width: 1, height: 12, backgroundColor: Colors.TTM_BORDER },

  // Action bar
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.TTM_BORDER,
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
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  actionDivider: { width: 1, backgroundColor: Colors.TTM_BORDER, marginVertical: 8 },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyDetail: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    textAlign: 'center',
  },
});
