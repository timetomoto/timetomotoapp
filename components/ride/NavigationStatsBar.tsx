import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  speedMph: number;
  eta: Date | null;
  remainingMiles: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEta(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatMiles(miles: number): string {
  if (miles < 0.1) return '< 0.1';
  if (miles < 10) return miles.toFixed(1);
  return Math.round(miles).toString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NavigationStatsBar({ speedMph, eta, remainingMiles }: Props) {
  const { theme } = useTheme();

  return (
    <View style={[styles.statsBar, { backgroundColor: 'rgba(20,20,20,0.95)', borderColor: theme.border }]}>
      {/* Speed */}
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: theme.textPrimary }]}>
          {Math.round(speedMph)}
        </Text>
        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>MPH</Text>
      </View>

      <View style={[styles.statDivider, { backgroundColor: theme.border }]} />

      {/* ETA */}
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: theme.textPrimary }]}>
          {eta ? formatEta(eta) : '--:--'}
        </Text>
        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>ETA</Text>
      </View>

      <View style={[styles.statDivider, { backgroundColor: theme.border }]} />

      {/* Remaining distance */}
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: theme.textPrimary }]}>
          {formatMiles(remainingMiles)}
        </Text>
        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>MI LEFT</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  statsBar: {
    position: 'absolute',
    bottom: 54,
    left: 16,
    right: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    marginVertical: 4,
  },
});
