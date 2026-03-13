import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { EventCardSkeleton } from '../common/SkeletonLoader';
import NetworkError from '../common/NetworkError';
import { useDiscoverStore, type MotoEvent } from '../../lib/discoverStore';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_FILTERS = ['ALL', 'RALLY', 'DUAL SPORT', 'FESTIVAL', 'EXPO', 'GROUP RIDE'] as const;

const DATE_RANGES: Array<{ label: string; value: 30 | 60 | 90 | 'all' }> = [
  { label: 'Next 30 days', value: 30 },
  { label: 'Next 60 days', value: 60 },
  { label: 'Next 90 days', value: 90 },
  { label: 'All',          value: 'all' },
];

const RADIUS_OPTIONS: Array<{ label: string; value: 50 | 100 | 250 | 500 | 'nationwide' }> = [
  { label: '50 mi',      value: 50 },
  { label: '100 mi',     value: 100 },
  { label: '250 mi',     value: 250 },
  { label: '500 mi',     value: 500 },
  { label: 'Nationwide', value: 'nationwide' },
];

const TYPE_COLORS: Record<string, string> = {
  RALLY:       '#E53935',
  'DUAL SPORT':'#4ECDC4',
  FESTIVAL:    '#FF9800',
  EXPO:        '#2196F3',
  'GROUP RIDE':'#9C27B0',
  OTHER:       '#888888',
};

// ---------------------------------------------------------------------------
// Haversine distance (miles)
// ---------------------------------------------------------------------------

function haversineMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Event card
// ---------------------------------------------------------------------------

const EventCard = memo(function EventCard({
  event,
  distanceMi,
}: {
  event: MotoEvent;
  distanceMi?: number;
}) {
  const { theme } = useTheme();
  const typeKey = event.type.toUpperCase();
  const color   = TYPE_COLORS[typeKey] ?? TYPE_COLORS.OTHER;

  function formatDate(d: Date) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      {/* Date badge */}
      <View style={[s.dateBadge, { borderColor: color + '44', backgroundColor: color + '18' }]}>
        <Feather name="flag" size={14} color={color} />
        <Text style={[s.dateBadgeText, { color }]}>{formatDate(event.dateStart)}</Text>
        {event.dateEnd && (
          <Text style={[s.dateBadgeText, { color, opacity: 0.7 }]}>
            {' '}– {formatDate(event.dateEnd)}
          </Text>
        )}
      </View>

      <View style={s.cardBody}>
        <Text style={[s.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>{event.name}</Text>
        <View style={s.cardMeta}>
          <Feather name="map-pin" size={11} color={theme.textSecondary} />
          <Text style={[s.cardMetaText, { color: theme.textSecondary }]} numberOfLines={1}>{event.location}</Text>
          {distanceMi !== undefined && (
            <Text style={[s.cardDistance, { color: theme.textSecondary }]}>{Math.round(distanceMi)} mi away</Text>
          )}
        </View>
        <View style={[s.typePill, { backgroundColor: color + '18', borderColor: color + '55' }]}>
          <Text style={[s.typePillText, { color }]}>{event.type.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// DiscoverEvents
// ---------------------------------------------------------------------------

type LoadState = 'loading' | 'done' | 'error' | 'no-permission';

export default function DiscoverEvents() {
  const { theme } = useTheme();
  const {
    events,
    eventsLastFetched,
    eventTypeFilter,
    eventDateRange,
    eventRadiusMiles,
    userLocation,
    fetchEvents,
    setEventTypeFilter,
    setEventDateRange,
    setEventRadius,
    setUserLocation,
  } = useDiscoverStore();

  const [loadState, setLoadState]   = useState<LoadState>(eventsLastFetched ? 'done' : 'loading');
  const [refreshing, setRefreshing] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoadState('loading');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadState('no-permission');
        return;
      }

      if (!userLocation) {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: lat, longitude: lng } = loc.coords;
        let city = '';
        try {
          const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const c = place?.city ?? place?.subregion ?? '';
          const r = place?.region ?? '';
          city = c && r ? `${c}, ${r}` : c || r;
        } catch {}
        setUserLocation({ lat, lng, city });
      }

      if (isRefresh) {
        useDiscoverStore.setState({ eventsLastFetched: null });
      }
      await fetchEvents();
      setLoadState('done');
    } catch {
      setLoadState('error');
    }
  }, [fetchEvents, userLocation, setUserLocation]);

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const now     = new Date();
    const maxDate = eventDateRange !== 'all'
      ? new Date(Date.now() + eventDateRange * 86_400_000)
      : null;

    return events
      .filter((e) => {
        if (e.dateStart < now) return false;
        if (maxDate && e.dateStart > maxDate) return false;
        if (eventTypeFilter !== 'ALL' && e.type.toUpperCase() !== eventTypeFilter) return false;
        if (eventRadiusMiles !== 'nationwide' && userLocation) {
          const dist = haversineMiles(userLocation.lat, userLocation.lng, e.lat, e.lng);
          if (dist > eventRadiusMiles) return false;
        }
        return true;
      })
      .map((e) => ({
        event: e,
        distanceMi: userLocation
          ? haversineMiles(userLocation.lat, userLocation.lng, e.lat, e.lng)
          : undefined,
      }))
      .sort((a, b) => {
        if (a.distanceMi !== undefined && b.distanceMi !== undefined) {
          return a.distanceMi - b.distanceMi;
        }
        return a.event.dateStart.getTime() - b.event.dateStart.getTime();
      });
  }, [events, eventTypeFilter, eventDateRange, eventRadiusMiles, userLocation]);

  if (loadState === 'error') {
    return <NetworkError onRetry={() => load()} />;
  }

  if (loadState === 'no-permission') {
    return (
      <View style={s.permissionContainer}>
        <Feather name="map-pin" size={36} color={theme.border} />
        <Text style={[s.permissionTitle, { color: theme.textPrimary }]}>LOCATION NEEDED</Text>
        <Text style={[s.permissionBody, { color: theme.textSecondary }]}>Enable location access to find events near you.</Text>
        <Pressable
          style={[s.permissionBtn, { backgroundColor: theme.red }]}
          onPress={() => load()}
          accessibilityLabel="Enable location"
          accessibilityRole="button"
        >
          <Text style={s.permissionBtnText}>ENABLE LOCATION</Text>
        </Pressable>
      </View>
    );
  }

  if (loadState === 'loading') {
    return (
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {[1, 2, 3, 4].map((i) => <EventCardSkeleton key={i} />)}
      </ScrollView>
    );
  }

  const radiusLabel =
    eventRadiusMiles === 'nationwide'
      ? 'Nationwide'
      : `${eventRadiusMiles} mi`;

  const dateRangeLabel =
    eventDateRange === 'all' ? 'all dates' : `the next ${eventDateRange} days`;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} />
      }
    >
      {/* Location + radius row */}
      <View style={[s.locationBar, { borderBottomColor: theme.border }]}>
        <Feather name="map-pin" size={12} color={theme.red} />
        <Text style={[s.locationText, { color: theme.textSecondary }]} numberOfLines={1}>
          {userLocation?.city ? `Near ${userLocation.city}` : 'Detecting location…'}
        </Text>
        <Pressable
          style={[s.radiusBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
          onPress={() => setRadiusOpen((v) => !v)}
          accessibilityLabel="Change search radius"
          accessibilityRole="button"
        >
          <Text style={[s.radiusBtnText, { color: theme.textPrimary }]}>{radiusLabel}</Text>
          <Feather name={radiusOpen ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Radius dropdown */}
      {radiusOpen && (
        <View style={[s.radiusDropdown, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
          {RADIUS_OPTIONS.map((opt) => (
            <Pressable
              key={String(opt.value)}
              style={[
                s.radiusOption,
                { borderBottomColor: theme.border },
                eventRadiusMiles === opt.value && { backgroundColor: theme.red + '18' },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEventRadius(opt.value);
                setRadiusOpen(false);
              }}
              accessibilityLabel={`Set radius to ${opt.label}`}
              accessibilityRole="button"
            >
              <Text style={[
                s.radiusOptionText,
                { color: theme.textSecondary },
                eventRadiusMiles === opt.value && { color: theme.red, fontWeight: '700' },
              ]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Date range pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.pillsRow}
        style={s.pillsContainer}
      >
        {DATE_RANGES.map((dr) => {
          const active = eventDateRange === dr.value;
          return (
            <Pressable
              key={String(dr.value)}
              style={[
                s.pill,
                active
                  ? { backgroundColor: theme.red, borderColor: theme.red }
                  : { backgroundColor: theme.pillBg, borderColor: theme.pillBorder },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEventDateRange(dr.value);
              }}
              accessibilityLabel={`Filter by ${dr.label}`}
              accessibilityRole="button"
            >
              <Text style={[s.pillText, active ? s.pillTextActive : { color: theme.pillText }]}>
                {dr.label.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Type filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.pillsRow}
        style={[s.pillsContainer, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
      >
        {TYPE_FILTERS.map((cat) => {
          const active = eventTypeFilter === cat;
          return (
            <Pressable
              key={cat}
              style={[
                s.pill,
                active
                  ? { backgroundColor: theme.red, borderColor: theme.red }
                  : { backgroundColor: theme.pillBg, borderColor: theme.pillBorder },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEventTypeFilter(cat);
              }}
              accessibilityLabel={`Filter by ${cat}`}
              accessibilityRole="button"
            >
              <Text style={[s.pillText, active ? s.pillTextActive : { color: theme.pillText }]}>
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Events list */}
      <View style={s.content}>
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🏍️</Text>
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>
              {`No events within ${radiusLabel} in ${dateRangeLabel}. Try expanding your search radius or date range.`}
            </Text>
          </View>
        ) : (
          filtered.map(({ event, distanceMi }) => (
            <EventCard key={event.id} event={event} distanceMi={distanceMi} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  locationText: {
    flex: 1,
    fontSize: 12,
  },
  radiusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  radiusBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  radiusDropdown: {
    borderBottomWidth: 1,
  },
  radiusOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  radiusOptionText: {
    fontSize: 13,
  },

  pillsContainer: {},
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pill: {
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'BarlowCondensed',
  },
  pillTextActive: { color: '#fff' },

  content: { padding: 16, paddingBottom: 40 },

  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardBody:     { gap: 6 },
  cardTitle:    { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  cardMeta:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { fontSize: 12, flex: 1 },
  cardDistance: {
    fontSize: 11,
    marginLeft: 'auto',
    fontStyle: 'italic',
  },
  typePill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typePillText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },

  empty: {
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyEmoji: { fontSize: 36 },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
