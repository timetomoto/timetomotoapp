import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavStep } from '../../lib/navigationStore';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  step: NavStep | null;
  isOffRoute: boolean;
  isRecalculating: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_LEFT = 12;
const TAB_WIDTH = 28;
const ANIM_DURATION = 280;
const EASING = Easing.out(Easing.cubic);

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
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-300)).current;
  const [collapsed, setCollapsed] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const [cardWidth, setCardWidth] = useState(160);
  const prevStepRef = useRef<string | null>(null);
  const collapsedRef = useRef(false);

  // Keep ref in sync
  collapsedRef.current = collapsed;

  const expandedX = 0;
  // Collapsed: slide left so only the tab peeks out at screen edge
  const collapsedX = -(cardWidth + CARD_LEFT);

  // Whether the card should be in the DOM at all
  const shouldShow = isOffRoute || isRecalculating || (step != null && step.distanceMiles <= 0.5);

  // Slide in / fully off-screen
  useEffect(() => {
    if (shouldShow) {
      setCardVisible(true);
      setCollapsed(false);
      collapsedRef.current = false;
      Animated.timing(translateX, {
        toValue: expandedX,
        duration: ANIM_DURATION,
        easing: EASING,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(translateX, {
        toValue: -300,
        duration: ANIM_DURATION,
        easing: EASING,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) setCardVisible(false);
      });
    }
  }, [shouldShow]);

  // When step changes, fly out then back in
  useEffect(() => {
    if (!step) return;
    const stepKey = `${step.type}_${step.road}_${step.instruction}`;
    if (prevStepRef.current && prevStepRef.current !== stepKey) {
      setCollapsed(false);
      collapsedRef.current = false;
      Animated.timing(translateX, {
        toValue: -300,
        duration: 200,
        easing: EASING,
        useNativeDriver: false,
      }).start(() => {
        Animated.timing(translateX, {
          toValue: expandedX,
          duration: ANIM_DURATION,
          easing: EASING,
          useNativeDriver: false,
        }).start();
      });
    }
    prevStepRef.current = stepKey;
  }, [step?.type, step?.road, step?.instruction]);

  // Toggle collapsed / expanded
  const toggleCollapse = useCallback(() => {
    const next = !collapsedRef.current;
    setCollapsed(next);
    collapsedRef.current = next;
    Animated.timing(translateX, {
      toValue: next ? collapsedX : expandedX,
      duration: ANIM_DURATION,
      easing: EASING,
      useNativeDriver: false,
    }).start();
  }, [collapsedX]);

  // Swipe gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) {
          translateX.setValue(g.dx);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60 || g.vx < -0.5) {
          setCollapsed(true);
          collapsedRef.current = true;
          Animated.timing(translateX, {
            toValue: -(cardWidth + CARD_LEFT),
            duration: ANIM_DURATION,
            easing: EASING,
            useNativeDriver: false,
          }).start();
        } else {
          setCollapsed(false);
          collapsedRef.current = false;
          Animated.timing(translateX, {
            toValue: expandedX,
            duration: ANIM_DURATION,
            easing: EASING,
            useNativeDriver: false,
          }).start();
        }
      },
    }),
  ).current;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== cardWidth) setCardWidth(w);
  }, [cardWidth]);

  if (!cardVisible) return null;

  // Render content based on state
  const isAlert = isRecalculating || isOffRoute;
  const showStep = !isAlert && step;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { bottom: insets.bottom + 283, transform: [{ translateX }] },
      ]}
    >
      {/* Card body */}
      <View
        style={[styles.card, { backgroundColor: theme.mapOverlayBg }]}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        {isAlert ? (
          <>
            <Feather name="alert-triangle" size={28} color="#F59E0B" />
            <Text style={[styles.streetName, { color: theme.textPrimary }]}>
              {isRecalculating ? 'Recalculating...' : 'OFF ROUTE'}
            </Text>
            <Text style={[styles.distance, { color: theme.red }]}>Rerouting...</Text>
          </>
        ) : showStep ? (
          <>
            <Feather name={turnIcon(showStep.type)} size={28} color={theme.textPrimary} />
            <Text style={[styles.streetName, { color: theme.textPrimary }]} numberOfLines={2}>
              {showStep.type === 'arrive'
                ? 'Arriving at destination'
                : showStep.road || showStep.instruction}
            </Text>
            {showStep.type !== 'arrive' && (
              <Text style={[styles.distance, { color: theme.red }]}>
                {formatStepDistance(showStep.distanceMiles)}
              </Text>
            )}
          </>
        ) : null}
      </View>

      {/* Chevron tab */}
      <Pressable
        style={[styles.chevronTab, { backgroundColor: theme.red }]}
        onPress={toggleCollapse}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Show turn card' : 'Hide turn card'}
        hitSlop={4}
      >
        <Feather
          name={collapsed ? 'chevron-right' : 'chevron-left'}
          size={18}
          color={theme.white}
        />
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: CARD_LEFT,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 9990,
    elevation: 15,
  },
  card: {
    width: 160,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  streetName: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 20,
  },
  distance: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  chevronTab: {
    width: TAB_WIDTH,
    height: 56,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
