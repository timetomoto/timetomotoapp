import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NavStep } from '../../lib/navigationStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  step: NavStep | null;
  isOffRoute: boolean;
  isRecalculating: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function turnIcon(type: NavStep['type']): keyof typeof Feather.glyphMap {
  switch (type) {
    case 'turn_left':     return 'corner-up-left';
    case 'turn_right':    return 'corner-up-right';
    case 'continue':      return 'arrow-up';
    case 'roundabout':    return 'rotate-cw';
    case 'arrive':        return 'map-pin';
    case 'depart':        return 'navigation';
    case 'merge':
    case 'fork':          return 'git-merge';
    case 'exit_highway':
    case 'off_ramp':      return 'corner-down-right';
    case 'on_ramp':       return 'corner-up-right';
    case 'end_of_road':   return 'arrow-up';
    default:              return 'arrow-up';
  }
}

function formatStepDistance(miles: number): string {
  if (miles < 0.1) {
    const feet = Math.round(miles * 5280);
    return `In ${feet} ft`;
  }
  return `In ${miles.toFixed(1)} mi`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TurnCard({ step, isOffRoute, isRecalculating }: Props) {
  const translateX = useRef(new Animated.Value(-200)).current;
  const [dismissed, setDismissed] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const prevStepRef = useRef<string | null>(null);

  // Determine whether the card should show
  const shouldShow = !dismissed && (isOffRoute || isRecalculating || (step && step.distanceMiles <= 0.5));

  // Fly in / out based on shouldShow
  useEffect(() => {
    if (shouldShow) {
      setCardVisible(true);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateX, {
        toValue: -200,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setCardVisible(false);
      });
    }
  }, [shouldShow]);

  // When step changes (new instruction), fly out then back in
  useEffect(() => {
    if (!step) return;
    const stepKey = `${step.type}_${step.road}_${step.instruction}`;
    if (prevStepRef.current && prevStepRef.current !== stepKey && !dismissed) {
      // Fly out
      Animated.timing(translateX, {
        toValue: -200,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        // Content updates via React, fly back in
        Animated.timing(translateX, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    }
    prevStepRef.current = stepKey;
  }, [step?.type, step?.road, step?.instruction]);

  // Reset dismissed state when step changes
  useEffect(() => {
    setDismissed(false);
  }, [step?.type, step?.road]);

  // Swipe to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) {
          translateX.setValue(g.dx);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) {
          Animated.timing(translateX, {
            toValue: -200,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            setDismissed(true);
          });
        } else {
          Animated.timing(translateX, {
            toValue: 0,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  // Pull-tab to bring card back
  const handlePullTab = () => {
    setDismissed(false);
  };

  if (!cardVisible && !dismissed) return null;

  // Off-route / recalculating state
  if (isRecalculating || isOffRoute) {
    return (
      <Animated.View
        style={[styles.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Feather name="alert-triangle" size={28} color="#F59E0B" />
        <Text style={styles.streetName}>
          {isRecalculating ? 'Recalculating...' : 'OFF ROUTE'}
        </Text>
        <Text style={styles.distance}>Rerouting...</Text>
      </Animated.View>
    );
  }

  // Dismissed — show pull tab
  if (dismissed && shouldShow) {
    return (
      <Pressable style={styles.pullTab} onPress={handlePullTab}>
        <View style={styles.pullTabInner} />
      </Pressable>
    );
  }

  if (!step || !cardVisible) return null;

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateX }] }]}
      {...panResponder.panHandlers}
    >
      <Feather name={turnIcon(step.type)} size={28} color="#fff" />
      <Text style={styles.streetName} numberOfLines={2}>
        {step.type === 'arrive'
          ? 'Arriving at destination'
          : step.road || step.instruction}
      </Text>
      {step.type !== 'arrive' && (
        <Text style={styles.distance}>
          {formatStepDistance(step.distanceMiles)}
        </Text>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    top: '50%',
    marginTop: -60,
    width: 160,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 20, 20, 0.92)',
    zIndex: 9990,
    elevation: 15,
  },
  streetName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 20,
  },
  distance: {
    color: '#D32F2F',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  pullTab: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -20,
    width: 16,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9990,
    elevation: 15,
  },
  pullTabInner: {
    width: 4,
    height: 40,
    borderRadius: 2,
    backgroundColor: '#D32F2F',
  },
});
