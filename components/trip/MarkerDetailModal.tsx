import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
  { key: 'fastest', label: 'FAST' },
  { key: 'no_highway', label: 'NO HWY' },
  { key: 'scenic', label: 'SCENIC' },
  { key: 'backroads', label: 'BACK ROADS' },
] as const;

// ---------------------------------------------------------------------------
// Component
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
  const segmentPreferences = useTripPlannerStore((s) => s.tripSegmentPreferences);
  const setSegmentPreference = useTripPlannerStore((s) => s.setTripSegmentPreference);
  const globalPref = useTripPlannerStore((s) => s.tripRoutePreference);

  if (!marker) return null;

  const isWaypoint = marker.type === 'waypoint';
  const idx = marker.index ?? 0;
  const currentPref = isWaypoint ? (segmentPreferences[idx] ?? globalPref ?? 'fastest') : (globalPref ?? 'fastest');

  // Badge label
  const badgeLabel = marker.type === 'origin' ? 'A' : marker.type === 'destination' ? 'B' : `${idx + 1}`;
  const badgeColor = marker.type === 'origin' ? theme.green : theme.red;

  // Distance estimates (approximate from total)
  const wpCount = totalWaypoints + 2; // origin + waypoints + destination
  const position = marker.type === 'origin' ? 0 : marker.type === 'destination' ? wpCount - 1 : idx + 1;
  const fromStart = wpCount > 1 ? (position / (wpCount - 1)) * routeDistance : 0;
  const toEnd = routeDistance - fromStart;
  const fromPrev = wpCount > 1 ? routeDistance / (wpCount - 1) : 0;

  function handleRemove() {
    const label = marker!.type === 'origin' ? 'start point' : marker!.type === 'destination' ? 'destination' : `Stop ${idx + 1}`;
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
    <Modal visible={!!marker} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.container, { backgroundColor: theme.bgPanel }]}>
        {/* Drag handle */}
        <View style={s.handleWrap}>
          <View style={[s.handle, { backgroundColor: theme.border }]} />
        </View>

        {/* Header */}
        <View style={s.header}>
          <View style={[s.badge, { backgroundColor: badgeColor }]}>
            <Text style={s.badgeText}>{badgeLabel}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { color: theme.textPrimary }]} numberOfLines={1}>{marker.name}</Text>
            <Text style={[s.subtitle, { color: theme.textMuted }]}>
              {marker.coordinate[1].toFixed(4)}, {marker.coordinate[0].toFixed(4)}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={20} color={theme.textMuted} />
          </Pressable>
        </View>

        {/* Distance info */}
        <Text style={[s.distLine, { color: theme.textSecondary }]}>
          {fromStart.toFixed(1)} mi from start · {toEnd.toFixed(1)} mi to destination
        </Text>

        {/* Segment route preference (waypoints only) */}
        {isWaypoint && (
          <View style={s.prefSection}>
            <Text style={[s.prefLabel, { color: theme.textSecondary }]}>ROUTE TO THIS STOP</Text>
            <View style={s.prefRow}>
              {PREFS.map((p) => {
                const active = currentPref === p.key;
                return (
                  <Pressable
                    key={p.key}
                    style={[s.prefPill, { backgroundColor: active ? theme.red : theme.bgCard, borderColor: active ? theme.red : theme.border }]}
                    onPress={() => setSegmentPreference(idx, p.key === globalPref ? null : p.key)}
                  >
                    <Text style={[s.prefPillText, { color: active ? '#fff' : theme.textSecondary }]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Stats row */}
        <View style={[s.statsRow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <View style={s.stat}>
            <Feather name="flag" size={12} color={theme.textMuted} />
            <Text style={[s.statValue, { color: theme.textPrimary }]}>{fromStart.toFixed(1)} mi</Text>
            <Text style={[s.statLabel, { color: theme.textMuted }]}>FROM START</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: theme.border }]} />
          <View style={s.stat}>
            <Feather name="map-pin" size={12} color={theme.textMuted} />
            <Text style={[s.statValue, { color: theme.textPrimary }]}>{fromPrev.toFixed(1)} mi</Text>
            <Text style={[s.statLabel, { color: theme.textMuted }]}>FROM PREV</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: theme.border }]} />
          <View style={s.stat}>
            <Feather name="navigation" size={12} color={theme.textMuted} />
            <Text style={[s.statValue, { color: theme.textPrimary }]}>{toEnd.toFixed(1)} mi</Text>
            <Text style={[s.statLabel, { color: theme.textMuted }]}>TO DEST</Text>
          </View>
        </View>

        {/* Move actions (waypoints only) */}
        {isWaypoint && totalWaypoints > 1 && (
          <View style={s.moveRow}>
            {idx > 0 && (
              <Pressable style={s.moveBtn} onPress={() => { onMoveToStart(idx); onClose(); }}>
                <Feather name="arrow-up" size={14} color={theme.textSecondary} />
                <Text style={[s.moveBtnText, { color: theme.textSecondary }]}>Move to First</Text>
              </Pressable>
            )}
            {idx < totalWaypoints - 1 && (
              <Pressable style={s.moveBtn} onPress={() => { onMoveToEnd(idx); onClose(); }}>
                <Feather name="arrow-down" size={14} color={theme.textSecondary} />
                <Text style={[s.moveBtnText, { color: theme.textSecondary }]}>Move to Last</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Remove action */}
        <Pressable style={[s.removeBtn, { borderColor: '#C62828' }]} onPress={handleRemove}>
          <Feather name="trash-2" size={16} color="#C62828" />
          <Text style={s.removeBtnText}>
            {marker.type === 'origin' ? 'REMOVE START' : marker.type === 'destination' ? 'REMOVE DESTINATION' : 'REMOVE THIS STOP'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  handle: { width: 36, height: 4, borderRadius: 2 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  name: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  distLine: { fontSize: 12, marginBottom: 16 },

  prefSection: { marginBottom: 16 },
  prefLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 8 },
  prefRow: { flexDirection: 'row', gap: 6 },
  prefPill: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderRadius: 8 },
  prefPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, paddingVertical: 14, marginBottom: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 14, fontWeight: '700' },
  statLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 0.5 },
  statDivider: { width: 1 },

  moveRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 16 },
  moveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moveBtnText: { fontSize: 13, fontWeight: '600' },

  removeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingVertical: 14, marginTop: 8,
  },
  removeBtnText: { color: '#C62828', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
});
