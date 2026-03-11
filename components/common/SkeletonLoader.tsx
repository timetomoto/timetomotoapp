import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { Colors } from '../../lib/theme';

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
      style={[{ width, height, borderRadius, backgroundColor: Colors.TTM_CARD, opacity }, style]}
    />
  );
}

// ---------------------------------------------------------------------------
// Feed article card skeleton
// ---------------------------------------------------------------------------

export function FeedCardSkeleton() {
  return (
    <View style={s.feedCard}>
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
  return (
    <View style={s.eventCard}>
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
  return (
    <View style={s.bikeCard}>
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
// Weather conditions skeleton
// ---------------------------------------------------------------------------

export function WeatherCardSkeleton() {
  return (
    <View style={s.weatherCard}>
      <View style={s.weatherTop}>
        <View style={{ gap: 8 }}>
          <Skeleton width={80} height={60} />
          <Skeleton width={120} height={12} />
          <Skeleton width={80} height={10} />
        </View>
        <Skeleton width={72} height={72} borderRadius={36} />
      </View>
      <View style={s.weatherGrid}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={s.weatherCell}>
            <Skeleton width={18} height={18} borderRadius={9} />
            <Skeleton width="70%" height={9} style={{ marginTop: 6 }} />
            <Skeleton width="50%" height={12} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  feedCard: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
  },
  feedMeta: { padding: 14, gap: 4 },

  eventCard: {
    flexDirection: 'row',
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  eventCardLeft: {},
  eventCardRight: { flex: 1, gap: 4 },

  bikeCard: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bikeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
  },

  weatherCard: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  weatherTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  weatherGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: Colors.TTM_BORDER,
    paddingTop: 16,
  },
  weatherCell: { width: '50%', paddingVertical: 10, paddingRight: 16 },
});
