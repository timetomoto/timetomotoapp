import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/useTheme';
import { useTripPlannerStore } from '../../lib/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectedMarker = {
  type: 'origin' | 'waypoint' | 'destination';
  index?: number;
  name: string;
  coordinate: [number, number]; // [lng, lat]
} | null;

interface Props {
  marker: SelectedMarker;
  onClose: () => void;
  onRemove: (type: 'origin' | 'waypoint' | 'destination', index?: number) => void;
  onMoveToStart: (index: number) => void;
  onMoveToEnd: (index: number) => void;
  totalWaypoints: number;
  routeDistance: number;
  routeDuration: number;
}

// ---------------------------------------------------------------------------
// Route preference pills
// ---------------------------------------------------------------------------

const PREFS = [
  { key: 'fastest', label: 'Fast', icon: 'zap' },
  { key: 'no_highway', label: 'No Hwy', icon: 'slash' },
  { key: 'scenic', label: 'Scenic', icon: 'sunrise' },
  { key: 'backroads', label: 'Back Rds', icon: 'git-branch' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(secs: number): string {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Component — compact floating card
// ---------------------------------------------------------------------------

export default function MarkerDetailModal({
  marker,
  onClose,
  onRemove,
  onMoveToStart,
  onMoveToEnd,
  totalWaypoints,
  routeDistance,
  routeDuration,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const segmentPreferences = useTripPlannerStore((s) => s.tripSegmentPreferences);
  const setSegmentPreference = useTripPlannerStore((s) => s.setTripSegmentPreference);
  const globalPref = useTripPlannerStore((s) => s.tripRoutePreference);

  if (!marker) return null;

  const isWaypoint = marker.type === 'waypoint';
  const isOrigin = marker.type === 'origin';
  const idx = marker.index ?? 0;
  const currentPref = isWaypoint ? (segmentPreferences[idx] ?? globalPref ?? 'fastest') : (globalPref ?? 'fastest');

  // Badge
  const badgeLabel = isOrigin ? 'A' : marker.type === 'destination' ? 'B' : `${idx + 1}`;
  const badgeColor = isOrigin ? theme.green : theme.red;

  // Distance + time estimates (proportional from total)
  const wpCount = totalWaypoints + 2; // origin + waypoints + destination
  const position = isOrigin ? 0 : marker.type === 'destination' ? wpCount - 1 : idx + 1;
  const fraction = wpCount > 1 ? position / (wpCount - 1) : 0;
  const fromStartMi = fraction * routeDistance;
  const fromStartSec = fraction * routeDuration;
  const toEndMi = routeDistance - fromStartMi;
  const prevFraction = wpCount > 1 ? 1 / (wpCount - 1) : 0;
  const fromPrevMi = prevFraction * routeDistance;

  function handleRemove() {
    const label = isOrigin ? 'start point' : marker!.type === 'destination' ? 'destination' : `Stop ${idx + 1}`;
    Alert.alert(
      'Remove this stop?',
      `Remove "${marker!.name}" as your ${label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onRemove(marker!.type, marker!.index);
            onClose();
          },
        },
      ],
    );
  }

  return (
    <Modal visible={!!marker} animationType="fade" transparent onRequestClose={onClose}>
      {/* Tap backdrop to close */}
      <Pressable style={s.backdrop} onPress={onClose} />

      {/* Card pinned to bottom */}
      <View style={[s.card, { backgroundColor: theme.bgPanel, borderColor: theme.border, top: insets.top + 60, paddingBottom: 14 }]}>

        {/* Header: badge + name + close */}
        <View style={s.header}>
          <View style={[s.badge, { backgroundColor: badgeColor }]}>
            <Text style={s.badgeText}>{badgeLabel}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: theme.textPrimary }]} numberOfLines={2}>{marker.name}</Text>
            <Text style={[s.coords, { color: theme.textMuted }]}>
              {marker.coordinate[1].toFixed(4)}, {marker.coordinate[0].toFixed(4)}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn}>
            <Feather name="x" size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        {/* Route preference (waypoints only) */}
        {isWaypoint && (
          <View style={s.prefSection}>
            <Text style={[s.prefLabel, { color: theme.textSecondary }]}>ROUTE TO HERE</Text>
            <View style={s.prefRow}>
              {PREFS.map((p) => {
                const active = currentPref === p.key;
                return (
                  <Pressable
                    key={p.key}
                    style={[s.prefPill, { backgroundColor: active ? theme.red : theme.bgCard, borderColor: active ? theme.red : theme.border }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSegmentPreference(idx, p.key === globalPref ? null : p.key);
                    }}
                  >
                    <Feather name={p.icon as any} size={14} color={active ? '#fff' : theme.textSecondary} />
                    <Text style={[s.prefPillText, { color: active ? '#fff' : theme.textSecondary }]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={s.stats}>
          {!isOrigin && (
            <View style={s.statRow}>
              <Feather name="flag" size={12} color={theme.textMuted} />
              <Text style={[s.statText, { color: theme.textSecondary }]}>
                {fromStartMi.toFixed(1)} mi / {fmtDuration(fromStartSec)} from starting point
              </Text>
            </View>
          )}
          {isWaypoint && (
            <View style={s.statRow}>
              <Feather name="map-pin" size={12} color={theme.textMuted} />
              <Text style={[s.statText, { color: theme.textSecondary }]}>
                {fromPrevMi.toFixed(1)} mi from previous stop
              </Text>
            </View>
          )}
          {marker.type !== 'destination' && (
            <View style={s.statRow}>
              <Feather name="navigation" size={12} color={theme.textMuted} />
              <Text style={[s.statText, { color: theme.textSecondary }]}>
                {toEndMi.toFixed(1)} mi to destination
              </Text>
            </View>
          )}
        </View>

        {/* Bottom actions */}
        <View style={s.bottomRow}>
          {/* Move buttons (waypoints with siblings) */}
          {isWaypoint && totalWaypoints > 1 && (
            <View style={s.moveGroup}>
              {idx > 0 && (
                <Pressable style={[s.moveBtn, { borderColor: theme.border }]} onPress={() => { onMoveToStart(idx); onClose(); }}>
                  <Feather name="chevrons-up" size={14} color={theme.textSecondary} />
                </Pressable>
              )}
              {idx < totalWaypoints - 1 && (
                <Pressable style={[s.moveBtn, { borderColor: theme.border }]} onPress={() => { onMoveToEnd(idx); onClose(); }}>
                  <Feather name="chevrons-down" size={14} color={theme.textSecondary} />
                </Pressable>
              )}
            </View>
          )}
          <View style={{ flex: 1 }} />
          {/* Remove */}
          <Pressable style={[s.removeBtn, { borderColor: theme.border }]} onPress={handleRemove}>
            <Feather name="trash-2" size={16} color="#C62828" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20,
  },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  badgeText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  coords: { fontSize: 11, marginTop: 2 },
  closeBtn: { marginTop: 2 },

  // Route preference
  prefSection: { marginBottom: 14 },
  prefLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 8 },
  prefRow: { flexDirection: 'row', gap: 6 },
  prefPill: {
    flex: 1, paddingVertical: 10, alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 10,
  },
  prefPillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  // Stats
  stats: { gap: 6, marginBottom: 16 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statText: { fontSize: 13 },

  // Bottom actions
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  moveGroup: { flexDirection: 'row', gap: 8 },
  moveBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  removeBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
