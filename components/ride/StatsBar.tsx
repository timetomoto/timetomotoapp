import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafetyStore, useMapStyleStore } from '../../lib/store';
import { useTheme } from '../../lib/useTheme';

type Stat = { value: string; label: string; customValue?: () => React.ReactNode };

interface StatsBarProps {
  stats: Stat[];
}

const ACTIVE_BG = 'rgba(76, 175, 80, 0.15)';
const ACTIVE_BORDER = 'rgba(76, 175, 80, 0.4)';
const PAUSED_BG = 'rgba(229, 57, 53, 0.15)';
const PAUSED_BORDER = 'rgba(229, 57, 53, 0.4)';

export default function StatsBar({ stats }: StatsBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { isRecording, isRidePaused } = useSafetyStore();
  const mapStyleUrl = useMapStyleStore((s) => s.mapStyle);
  const isDarkMap = mapStyleUrl.includes('satellite') || mapStyleUrl.includes('dark');

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording && !isRidePaused) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.7, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [isRecording, isRidePaused]);

  const stateStyle = isRecording
    ? isRidePaused
      ? { backgroundColor: PAUSED_BG, borderColor: PAUSED_BORDER }
      : { backgroundColor: ACTIVE_BG, borderColor: ACTIVE_BORDER }
    : { backgroundColor: theme.mapOverlayBg, borderColor: theme.border };

  return (
    <View style={[styles.bar, { bottom: insets.bottom + 170 }, stateStyle]}>
      {/* Animated border overlay — pulses when active */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          styles.borderOverlay,
          {
            borderColor: stateStyle.borderColor,
            opacity: pulseAnim,
          },
        ]}
      />
      {stats.map((stat, i) => (
        <View key={stat.label} style={styles.itemWrap}>
          {i > 0 && <View style={[styles.divider, { backgroundColor: isDarkMap ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.15)' }]} />}
          <View style={styles.item}>
            {stat.customValue ? stat.customValue() : <Text style={[styles.value, isDarkMap ? styles.lightText : styles.darkText]}>{stat.value}</Text>}
            <Text style={[styles.label, isDarkMap ? styles.lightText : styles.darkText]}>{stat.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: '3%',
    right: '3%',
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    overflow: 'hidden',
  },
  borderOverlay: {
    borderWidth: 2,
    borderRadius: 12,
  },
  itemWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 4,
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  lightText: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  darkText: {
    color: '#111111',
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
