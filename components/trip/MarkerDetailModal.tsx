import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/useTheme';

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
  totalWaypoints: number;
  routeDistance: number;
  routeDuration: number;
}

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
  totalWaypoints,
  routeDistance,
  routeDuration,
}: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  if (!marker) return null;

  const isWaypoint = marker.type === 'waypoint';
  const isOrigin = marker.type === 'origin';
  const idx = marker.index ?? 0;

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
      <View style={[s.card, { backgroundColor: theme.bgPanel, borderColor: theme.border, top: insets.top + 80, paddingBottom: 14 }]}>

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

        {/* Remove action */}
        <View style={s.bottomRow}>
          <View style={{ flex: 1 }} />
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

  // Stats
  stats: { gap: 6, marginBottom: 16 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statText: { fontSize: 13 },

  // Bottom actions
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  removeBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
