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
      <Skeleton width="100%" height={180} borderRadius={0} />
      <View style={s.bikeCardHeader}>
        <View style={{ gap: 8, flex: 1 }}>
          <Skeleton width="70%" height={18} />
          <Skeleton width="40%" height={14} />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Service section skeleton (3 list item rows)
// ---------------------------------------------------------------------------

export function ServiceSectionSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={{ paddingLeft: 16, paddingRight: 16, gap: 10, paddingVertical: 12 }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[s.serviceRow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Skeleton width="80%" height={14} />
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Weather skeleton (current conditions + hourly strip)
// ---------------------------------------------------------------------------

export function WeatherSkeleton() {
  const { theme } = useTheme();
  return (
    <View style={s.weatherWrap}>
      {/* Current conditions card */}
      <View style={[s.weatherCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 16 }}>
          <Skeleton width={80} height={80} borderRadius={40} />
          <Skeleton width={120} height={40} borderRadius={8} />
          <Skeleton width="60%" height={16} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 }}>
          <Skeleton width={50} height={12} />
          <Skeleton width={50} height={12} />
          <Skeleton width={50} height={12} />
        </View>
      </View>
      {/* Hourly strip */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <View key={i} style={[s.weatherHourCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Skeleton width={28} height={10} />
            <Skeleton width={24} height={24} borderRadius={12} />
            <Skeleton width={32} height={12} />
          </View>
        ))}
      </View>
      {/* Daily forecast rows */}
      <View style={{ gap: 10, paddingHorizontal: 16, marginTop: 16 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Skeleton width={36} height={12} />
            <Skeleton width={24} height={24} borderRadius={12} />
            <View style={{ flex: 1 }}><Skeleton width="100%" height={8} borderRadius={4} /></View>
            <Skeleton width={40} height={12} />
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

  serviceRow: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  weatherWrap: { paddingTop: 16 },
  weatherCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  weatherHourCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
  },
});
