import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Single skeleton bar — pulsing opacity 0.3 → 0.7 → 0.3
// ---------------------------------------------------------------------------

interface SkeletonProps {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height, borderRadius = 6, style }: SkeletonProps) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: theme.bgCard, opacity }, style]}
    />
  );
}

// ---------------------------------------------------------------------------
// Feed article card skeleton
// ---------------------------------------------------------------------------

export function FeedCardSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={[s.feedCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <Skeleton height={180} borderRadius={8} />
      <View style={s.feedMeta}>
        <Skeleton width="30%" height={10} />
        <Skeleton width="70%" height={14} style={{ marginTop: 8 }} />
        <Skeleton width="90%" height={10} style={{ marginTop: 6 }} />
        <Skeleton width="55%" height={10} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Event card skeleton
// ---------------------------------------------------------------------------

export function EventCardSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={[s.eventCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={s.eventCardLeft}>
        <Skeleton width={44} height={44} borderRadius={8} />
      </View>
      <View style={s.eventCardRight}>
        <Skeleton width="60%" height={12} />
        <Skeleton width="85%" height={10} style={{ marginTop: 8 }} />
        <Skeleton width="40%" height={10} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bike card skeleton (garage)
// ---------------------------------------------------------------------------

export function BikeCardSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={[s.bikeCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={s.bikeCardHeader}>
        <View style={{ gap: 8 }}>
          <Skeleton width={60} height={12} />
          <Skeleton width={160} height={22} />
        </View>
        <Skeleton width={72} height={52} borderRadius={6} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  feedCard: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
  },
  feedMeta: { padding: 14, gap: 4 },

  eventCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  eventCardLeft: {},
  eventCardRight: { flex: 1, gap: 4 },

  bikeCard: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bikeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
  },
});
