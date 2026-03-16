import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  distanceMiles: number;
  durationSeconds: number;
  onSaveRide: () => void;
  onDismiss: () => void;
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

function formatAvgSpeed(distanceMiles: number, durationSeconds: number): string {
  if (durationSeconds <= 0) return '0';
  const hours = durationSeconds / 3600;
  const mph = distanceMiles / hours;
  return `${Math.round(mph)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompletionScreen({
  distanceMiles,
  durationSeconds,
  onSaveRide,
  onDismiss,
}: Props) {
  const { theme } = useTheme();

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
        {/* Icon */}
        <View style={[styles.iconCircle, { backgroundColor: '#4CAF50' + '22', borderColor: '#4CAF50' }]}>
          <Feather name="check-circle" size={40} color="#4CAF50" />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: theme.textPrimary }]}>Destination Reached!</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>You have arrived at your destination</Text>

        {/* Stats grid */}
        <View style={[styles.statsGrid, { borderColor: theme.border }]}>
          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: theme.textPrimary }]}>
              {distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>MILES</Text>
          </View>

          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />

          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: theme.textPrimary }]}>
              {formatDuration(durationSeconds)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>TIME</Text>
          </View>

          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />

          <View style={styles.statCell}>
            <Text style={[styles.statValue, { color: theme.textPrimary }]}>
              {formatAvgSpeed(distanceMiles, durationSeconds)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>AVG MPH</Text>
          </View>
        </View>

        {/* Actions */}
        <Pressable
          style={[styles.saveBtn, { backgroundColor: theme.red }]}
          onPress={onSaveRide}
        >
          <Feather name="save" size={16} color="#fff" />
          <Text style={styles.saveBtnText}>SAVE RIDE</Text>
        </Pressable>

        <Pressable style={styles.dismissBtn} onPress={onDismiss}>
          <Text style={[styles.dismissBtnText, { color: theme.textMuted }]}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9995,
    elevation: 16,
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    width: '100%',
    marginVertical: 16,
    paddingVertical: 14,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    marginVertical: 4,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dismissBtn: {
    paddingVertical: 10,
  },
  dismissBtnText: {
    fontSize: 14,
  },
});
