import { memo, useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { EventCardSkeleton } from '../../components/common/SkeletonLoader';
import NetworkError from '../../components/common/NetworkError';
import { Colors } from '../../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MotoEvent {
  id: string;
  title: string;
  date: string;        // ISO
  location: string;
  type: 'rally' | 'ride' | 'track' | 'meetup' | 'show';
  distanceMi?: number;
  url?: string;
}

// ---------------------------------------------------------------------------
// Fetch — Overpass API for motorcycle-related POIs near user
// Returns nearby motorcycle clubs / events as a placeholder until a real
// events backend is wired up.
// ---------------------------------------------------------------------------

async function fetchNearbyEvents(_lat: number, _lng: number): Promise<MotoEvent[]> {
  // Placeholder: a real implementation would query an events API here.
  // Return empty so the empty state renders correctly.
  return [];
}

const TYPE_COLORS: Record<MotoEvent['type'], string> = {
  rally:  '#D32F2F',
  ride:   '#4ECDC4',
  track:  '#FF9800',
  meetup: '#9C27B0',
  show:   '#2196F3',
};

const TYPE_ICONS: Record<MotoEvent['type'], string> = {
  rally:  'flag',
  ride:   'navigation',
  track:  'activity',
  meetup: 'users',
  show:   'star',
};

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Event card — memoized
// ---------------------------------------------------------------------------

const EventCard = memo(function EventCard({ event }: { event: MotoEvent }) {
  const color = TYPE_COLORS[event.type];
  const icon  = TYPE_ICONS[event.type];

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && { opacity: 0.82 }]}
      onPress={handlePress}
      accessibilityLabel={`${event.title}, ${formatEventDate(event.date)}, ${event.location}`}
      accessibilityRole="button"
    >
      {/* Date badge */}
      <View style={[s.dateBadge, { borderColor: color + '44', backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={16} color={color} />
        <Text style={[s.dateBadgeText, { color }]}>
          {formatEventDate(event.date)}
        </Text>
      </View>

      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={2}>{event.title}</Text>
        <View style={s.cardMeta}>
          <Feather name="map-pin" size={11} color={Colors.TEXT_SECONDARY} />
          <Text style={s.cardMetaText} numberOfLines={1}>{event.location}</Text>
          {event.distanceMi !== undefined && (
            <Text style={s.cardDistance}>{Math.round(event.distanceMi)} mi away</Text>
          )}
        </View>
        <View style={[s.typePill, { backgroundColor: color + '18', borderColor: color + '55' }]}>
          <Text style={[s.typePillText, { color }]}>{event.type.toUpperCase()}</Text>
        </View>
      </View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// EventsScreen
// ---------------------------------------------------------------------------

type LoadState = 'loading' | 'done' | 'error' | 'no-permission';

export default function EventsScreen() {
  const [state, setState]           = useState<LoadState>('loading');
  const [events, setEvents]         = useState<MotoEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [locationLabel, setLocationLabel] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setState('loading');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState('no-permission');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;

      // Reverse geocode for display
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (place) {
          const city = place.city || place.subregion || '';
          const region = place.region || '';
          setLocationLabel(city && region ? `${city}, ${region}` : city || region);
        }
      } catch {}

      const data = await fetchNearbyEvents(lat, lng);
      setEvents(data);
      setState('done');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <View>
          <Text style={s.heading}>EVENTS</Text>
          {!!locationLabel && (
            <View style={s.locationRow}>
              <Feather name="map-pin" size={11} color={Colors.TTM_RED} />
              <Text style={s.locationText}>Near {locationLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {state === 'error' ? (
        <NetworkError onRetry={() => load()} />
      ) : state === 'no-permission' ? (
        <View style={s.empty}>
          <Feather name="map-pin" size={36} color={Colors.TTM_BORDER} />
          <Text style={s.emptyTitle}>LOCATION NEEDED</Text>
          <Text style={s.emptyBody}>Enable location access to find events near you.</Text>
          <Pressable
            style={s.emptyBtn}
            onPress={() => load()}
            accessibilityLabel="Enable location"
            accessibilityRole="button"
          >
            <Text style={s.emptyBtnText}>ENABLE LOCATION</Text>
          </Pressable>
        </View>
      ) : state === 'loading' ? (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {[1, 2, 3, 4].map((i) => <EventCardSkeleton key={i} />)}
        </ScrollView>
      ) : events.length === 0 ? (
        <ScrollView
          contentContainerStyle={s.emptyScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.TTM_RED} />
          }
        >
          <View style={s.empty}>
            <Feather name="flag" size={36} color={Colors.TTM_BORDER} />
            <Text style={s.emptyTitle}>NOTHING NEARBY</Text>
            <Text style={s.emptyBody}>
              No events found near you — check back soon.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.TTM_RED} />
          }
        >
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.TTM_DARK },

  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  heading: { color: Colors.TEXT_PRIMARY, fontSize: 20, fontWeight: '700', letterSpacing: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  locationText: { color: Colors.TEXT_SECONDARY, fontSize: 12, letterSpacing: 0.5 },

  content: { padding: 16, paddingBottom: 40 },
  emptyScroll: { flex: 1 },

  card: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dateBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  cardBody: { gap: 6 },
  cardTitle: { color: Colors.TEXT_PRIMARY, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { color: Colors.TEXT_SECONDARY, fontSize: 12, flex: 1 },
  cardDistance: {
    color: Colors.TEXT_SECONDARY,
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyTitle: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  emptyBody: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    backgroundColor: Colors.TTM_RED,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  emptyBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
});
