// WeatherContent — the current weather view extracted from weather.tsx
// This is a thin wrapper that renders the full weather screen content
// without the SafeAreaView/header/sub-tabs chrome, so it can be embedded
// inside the NEWS → WEATHER sub-tab.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WeatherSkeleton } from '../common/SkeletonLoader';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import {
  fetchWeather,
  codeMeta,
  type WeatherData,
  type HourlySlot,
  type DailySlot,
} from '../../lib/weather';
import { useTheme } from '../../lib/useTheme';
import { useAuthStore } from '../../lib/store';
import {
  loadFavorites,
  toggleFavorite as toggleFavoriteApi,
  getHomeFavorite,
  type FavoriteLocation as SharedFavorite,
} from '../../lib/favorites';

// ---------------------------------------------------------------------------
// Inline sub-components (CurrentCard, HourlyStrip, DailyForecast)
// These are simplified versions of what weather.tsx uses
// ---------------------------------------------------------------------------

function CurrentCard({ current, locationLabel }: { current: WeatherData['current']; locationLabel: string }) {
  const { theme } = useTheme();
  const meta = codeMeta(current.weatherCode);
  return (
    <View style={[cs.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <Text style={[cs.temp, { color: theme.textPrimary }]}>{Math.round(current.temperature)}°</Text>
      <View style={cs.condRow}>
        <Feather name={meta.icon as any} size={18} color={theme.textSecondary} />
        <Text style={[cs.condText, { color: theme.textSecondary }]}>{meta.label}</Text>
      </View>
      <Text style={[cs.feelsLike, { color: theme.textMuted }]}>Feels like {Math.round(current.temperatureApparent)}°</Text>
      <View style={cs.statsRow}>
        <View style={cs.stat}>
          <Feather name="wind" size={12} color={theme.textMuted} />
          <Text style={[cs.statText, { color: theme.textMuted }]}>{Math.round(current.windSpeed)} mph</Text>
        </View>
        <View style={cs.stat}>
          <Feather name="droplet" size={12} color={theme.textMuted} />
          <Text style={[cs.statText, { color: theme.textMuted }]}>{current.humidity}%</Text>
        </View>
      </View>
    </View>
  );
}

function HourlyStrip({ slots }: { slots: HourlySlot[] }) {
  const { theme } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.hourlyContent}>
      {slots.map((slot, i) => {
        const meta = codeMeta(slot.weatherCode);
        const hour = new Date(slot.time).toLocaleTimeString('en-US', { hour: 'numeric' });
        return (
          <View key={i} style={[cs.hourlyItem, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[cs.hourlyTime, { color: theme.textMuted }]}>{hour}</Text>
            <Feather name={meta.icon as any} size={16} color={theme.textSecondary} />
            <Text style={[cs.hourlyTemp, { color: theme.textPrimary }]}>{Math.round(slot.temperature)}°</Text>
            {slot.precipitationProbability > 0 && (
              <Text style={[cs.hourlyRain, { color: '#5B9BD5' }]}>{slot.precipitationProbability}%</Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function DailyForecast({ slots }: { slots: DailySlot[] }) {
  const { theme } = useTheme();
  return (
    <View style={[cs.dailyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      {slots.map((slot, i) => {
        const meta = codeMeta(slot.weatherCode);
        const day = new Date(slot.time).toLocaleDateString('en-US', { weekday: 'short' });
        return (
          <View key={i} style={[cs.dailyRow, i < slots.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
            <Text style={[cs.dailyDay, { color: theme.textPrimary }]}>{i === 0 ? 'Today' : day}</Text>
            <Feather name={meta.icon as any} size={14} color={theme.textSecondary} />
            <Text style={[cs.dailyHi, { color: theme.textPrimary }]}>{Math.round(slot.temperatureMax)}°</Text>
            <Text style={[cs.dailyLo, { color: theme.textMuted }]}>{Math.round(slot.temperatureMin)}°</Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type LoadState = 'idle' | 'locating' | 'fetching' | 'done' | 'error';

export default function WeatherContent() {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const userId = user?.id ?? 'local';
  const [state, setState] = useState<LoadState>('idle');
  const [data, setData] = useState<WeatherData | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  async function loadByGPS(force = false) {
    try {
      setState('locating');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Location permission denied.');
        setState('error');
        return;
      }
      let loc: Location.LocationObject | null = null;
      try { loc = await Location.getLastKnownPositionAsync({ maxAge: 300_000 }); } catch { loc = null; }
      if (!loc) {
        try {
          const p = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          const t = new Promise<null>((r) => setTimeout(() => r(null), 15_000));
          loc = await Promise.race([p, t]);
        } catch { loc = null; }
      }
      if (!loc) { setErrorMsg('Location unavailable'); setState('error'); return; }
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      coordsRef.current = { lat, lng };
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (place) {
          const city = place.city || place.subregion || place.region || '';
          const region = place.region || '';
          setLocationLabel(city && region ? `${city}, ${region}` : city || region || 'Current Location');
        }
      } catch { setLocationLabel('Current Location'); }
      setState('fetching');
      const weather = await fetchWeather(lat, lng, force);
      setData(weather);
      setState('done');
    } catch {
      setErrorMsg('Location unavailable');
      setState('error');
    }
  }

  useEffect(() => {
    loadFavorites(userId).then((favs) => {
      const home = getHomeFavorite(favs);
      if (home) {
        coordsRef.current = { lat: home.lat, lng: home.lng };
        setLocationLabel(home.nickname || home.name);
        setState('fetching');
        Location.reverseGeocodeAsync({ latitude: home.lat, longitude: home.lng })
          .then(([place]) => {
            if (place) {
              const city = place.city || place.subregion || place.region || '';
              const region = place.region || '';
              const label = city && region ? `${city}, ${region}` : city || region;
              if (label) setLocationLabel(label);
            }
          }).catch(() => {});
        fetchWeather(home.lat, home.lng, true)
          .then((w) => { setData(w); setState('done'); })
          .catch(() => loadByGPS());
      } else {
        loadByGPS();
      }
    }).catch(() => loadByGPS());
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (coordsRef.current) await loadByGPS(true);
    setRefreshing(false);
  }, []);

  if (state === 'idle' || state === 'locating' || state === 'fetching') {
    return <WeatherSkeleton />;
  }

  if (state === 'error') {
    return (
      <View style={cs.centered}>
        <Feather name="cloud-off" size={48} color={theme.textSecondary} />
        <Text style={[cs.errorTitle, { color: theme.textPrimary }]}>WEATHER UNAVAILABLE</Text>
        <Text style={[cs.errorMsg, { color: theme.textSecondary }]}>{errorMsg}</Text>
        <TouchableOpacity style={[cs.retryBtn, { backgroundColor: theme.red }]} onPress={() => loadByGPS(true)}>
          <Text style={cs.retryText}>USE MY LOCATION</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={cs.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} />}
    >
      {!!locationLabel && (
        <View style={[cs.locationRow, { borderColor: theme.border }]}>
          <Feather name="map-pin" size={12} color={theme.red} />
          <Text style={[cs.locationText, { color: theme.textSecondary }]}>{locationLabel}</Text>
          <TouchableOpacity onPress={() => loadByGPS(true)}>
            <Feather name="navigation" size={14} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
      {data && (
        <>
          <CurrentCard current={data.current} locationLabel={locationLabel} />
          {data.hourly.length > 0 && <HourlyStrip slots={data.hourly} />}
          {data.daily.length > 0 && <DailyForecast slots={data.daily} />}
          <Text style={[cs.cacheNote, { color: theme.textSecondary }]}>
            Updated {new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
          <Text style={[cs.cacheNote, { color: theme.textMuted, marginTop: 4 }]}>
            Weather data: Open-Meteo.com
          </Text>
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const cs = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { fontSize: 14, marginTop: 12 },
  errorTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  errorMsg: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  retryBtn: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, marginTop: 16 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  locationText: { flex: 1, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16 },
  temp: { fontSize: 56, fontWeight: '700' },
  condRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  condText: { fontSize: 15 },
  feelsLike: { fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 20, marginTop: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12 },
  hourlyContent: { gap: 8, paddingBottom: 12 },
  hourlyItem: { alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, gap: 4, minWidth: 60 },
  hourlyTime: { fontSize: 10, fontWeight: '600' },
  hourlyTemp: { fontSize: 14, fontWeight: '700' },
  hourlyRain: { fontSize: 10 },
  dailyCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  dailyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  dailyDay: { width: 50, fontSize: 13, fontWeight: '600' },
  dailyHi: { fontSize: 14, fontWeight: '700', width: 35, textAlign: 'right' },
  dailyLo: { fontSize: 14, width: 35, textAlign: 'right' },
  cacheNote: { fontSize: 11, textAlign: 'center' },
});
