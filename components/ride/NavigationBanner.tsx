import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import type { NavStep } from '../../lib/navigationStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  step: NavStep | null;
  nextStep: NavStep | null;
  isOffRoute: boolean;
  isRecalculating: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function turnIcon(type: NavStep['type']): string {
  switch (type) {
    case 'turn_left':     return 'corner-up-left';
    case 'turn_right':    return 'corner-up-right';
    case 'continue':      return 'arrow-up';
    case 'roundabout':    return 'rotate-cw';
    case 'arrive':        return 'map-pin';
    case 'depart':        return 'navigation';
    case 'merge':
    case 'fork':          return 'git-merge';
    default:              return 'arrow-up';
  }
}

function formatStepDistance(miles: number): string {
  if (miles < 0.1) {
    const feet = Math.round(miles * 5280);
    return `${feet} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NavigationBanner({
  step,
  nextStep,
  isOffRoute,
  isRecalculating,
}: Props) {
  const { theme } = useTheme();

  if (isRecalculating) {
    return (
      <View style={[styles.banner, styles.bannerDark]}>
        <ActivityIndicator size="small" color="#F59E0B" />
        <Text style={[styles.offRouteText, { color: '#F59E0B' }]}>Recalculating…</Text>
      </View>
    );
  }

  if (isOffRoute) {
    return (
      <View style={[styles.banner, styles.bannerDark]}>
        <Feather name="alert-triangle" size={24} color="#F59E0B" />
        <Text style={[styles.offRouteText, { color: '#F59E0B' }]}>
          OFF ROUTE — Recalculating…
        </Text>
      </View>
    );
  }

  if (!step) return null;

  const isArriving = step.type === 'arrive';

  return (
    <View style={[styles.banner, styles.bannerDark]}>
      {/* Turn icon */}
      <View style={styles.iconContainer}>
        <Feather
          name={turnIcon(step.type) as any}
          size={36}
          color="#fff"
        />
      </View>

      {/* Road + instruction */}
      <View style={styles.textContainer}>
        {isArriving ? (
          <Text style={styles.arrivingText}>Arriving at destination</Text>
        ) : (
          <>
            <Text style={styles.roadName} numberOfLines={1}>
              {step.road || step.instruction}
            </Text>
            {step.road && step.instruction && (
              <Text style={styles.instruction} numberOfLines={1}>
                {step.instruction}
              </Text>
            )}
          </>
        )}
        {/* Next step preview */}
        {nextStep && !isArriving && (
          <Text style={styles.nextStepText} numberOfLines={1}>
            Then: {nextStep.instruction}
          </Text>
        )}
      </View>

      {/* Distance to turn */}
      {!isArriving && (
        <View style={styles.distanceContainer}>
          <Text style={styles.distanceValue}>
            {formatStepDistance(step.distanceMiles)}
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9990,
    elevation: 15,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    minHeight: 90,
  },
  bannerDark: {
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  iconContainer: {
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  roadName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  instruction: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  nextStepText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  arrivingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  distanceContainer: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  distanceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'right',
  },
  offRouteText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
