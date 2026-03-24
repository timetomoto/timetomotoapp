import React, { useEffect, useState } from 'react';
import { Dimensions, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_HEIGHT = Dimensions.get('window').height;

const DEFAULT_SPRING = { damping: 20, stiffness: 300, mass: 0.8 };
const CLOSE_DURATION = 280;
const DEFAULT_SWIPE_THRESHOLD = 0.4;
const DEFAULT_VELOCITY_THRESHOLD = 800;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SlideUpWrapperProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  swipeThreshold?: number;
  swipeVelocityThreshold?: number;
  springConfig?: { damping: number; stiffness: number; mass: number };
  bottomOffset?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SlideUpWrapper({
  visible,
  onClose,
  children,
  swipeThreshold = DEFAULT_SWIPE_THRESHOLD,
  swipeVelocityThreshold = DEFAULT_VELOCITY_THRESHOLD,
  springConfig = DEFAULT_SPRING,
  bottomOffset = 0,
}: SlideUpWrapperProps) {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const [mounted, setMounted] = useState(false);

  // Open / close
  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withSpring(0, springConfig);
    } else if (mounted) {
      translateY.value = withTiming(
        SCREEN_HEIGHT,
        { duration: CLOSE_DURATION, easing: Easing.in(Easing.ease) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible]);

  // Swipe gesture
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Only track downward
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      const shouldDismiss =
        e.velocityY > swipeVelocityThreshold ||
        e.translationY > SCREEN_HEIGHT * swipeThreshold;

      if (shouldDismiss) {
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: CLOSE_DURATION, easing: Easing.in(Easing.ease) },
          (finished) => {
            if (finished) {
              runOnJS(onClose)();
            }
          },
        );
      } else {
        // Spring back
        translateY.value = withSpring(0, springConfig);
      }
    })
    .activeOffsetY(10) // Only activate on vertical movement
    .failOffsetX([-20, 20]); // Fail on horizontal

  // Animated styles
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT],
      [0.5, 0],
    ),
  }));

  // Don't render when fully hidden
  if (!visible && !mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, backdropStyle]} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Content */}
      <GestureDetector gesture={pan}>
        <Animated.View style={[s.wrapper, contentStyle, bottomOffset > 0 && { paddingBottom: bottomOffset }]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 999,
  },
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});
