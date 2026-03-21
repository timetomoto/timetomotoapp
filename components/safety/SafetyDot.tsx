import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafetyStore } from '../../lib/store';

export default function SafetyDot() {
  const { isMonitoring, setMonitoring } = useSafetyStore();

  function toggle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMonitoring(!isMonitoring);
  }
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!isMonitoring) {
      pulseAnim.setValue(1);
      opacityAnim.setValue(0.4);
      return;
    }

    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.6, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isMonitoring]);

  return (
    <Pressable
      style={({ pressed }) => [s.wrapper, pressed && s.pressed]}
      onPress={toggle}
      hitSlop={8}
    >
      {/* Pulsing outer ring — only visible when monitoring */}
      {isMonitoring && (
        <Animated.View
          style={[s.ring, { transform: [{ scale: pulseAnim }], opacity: opacityAnim }]}
        />
      )}
      {/* Core dot */}
      <View style={[s.dot, isMonitoring ? s.dotActive : s.dotInactive]} />
      <Text style={[s.label, isMonitoring ? s.labelActive : s.labelInactive]}>
        {isMonitoring ? 'SAFE' : 'OFF'}
      </Text>
    </Pressable>
  );
}

const ACTIVE_COLOR  = '#2E7D32';
const INACTIVE_COLOR = '#383838';

const s = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: { opacity: 0.7 },
  ring: {
    position: 'absolute',
    left: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: ACTIVE_COLOR,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive:   { backgroundColor: ACTIVE_COLOR },
  dotInactive: { backgroundColor: INACTIVE_COLOR },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  labelActive:   { color: ACTIVE_COLOR },
  labelInactive: { color: INACTIVE_COLOR },
});
