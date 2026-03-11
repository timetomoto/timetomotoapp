import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import {
  fetchWeather,
  codeMeta,
  windDirLabel,
  type WeatherData,
  type HourlySlot,
  type DailySlot,
  type WeatherAlert,
} from '../../lib/weather';
import { Colors } from '../../lib/theme';
import RideWindowPlanner from '../../components/weather/RideWindowPlanner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHour(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function round(n: number) { return Math.round(n); }

// ---------------------------------------------------------------------------
// Geocode a query (city name, zip, address) → { lat, lng, label }
// Uses expo-location's device geocoding — free, no API key
// ---------------------------------------------------------------------------

interface GeoResult { lat: number; lng: number; label: string }

async function geocodeQuery(query: string): Promise<GeoResult[]> {
  const results = await Location.geocodeAsync(query, { useGoogleMaps: false });
  const out: GeoResult[] = [];
  for (const r of results.slice(0, 5)) {
    const [place] = await Location.reverseGeocodeAsync(
      { latitude: r.latitude, longitude: r.longitude },
      { useGoogleMaps: false },
    );
    if (!place) continue;
    const city   = place.city || place.subregion || place.district || '';
    const region = place.region || '';
    const country = place.isoCountryCode !== 'US' ? (place.country ?? '') : '';
    const label = [city, region, country].filter(Boolean).join(', ');
    if (label) out.push({ lat: r.latitude, lng: r.longitude, label });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Location search modal
// ---------------------------------------------------------------------------

function LocationSearchModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: GeoResult) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const slideAnim = useRef(new Animated.Value(400)).current;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setSearchError('');
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Debounced geocode as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError('');
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      try {
        const geo = await geocodeQuery(trimmed);
        setResults(geo);
        if (geo.length === 0) setSearchError('No locations found. Try a city name or zip code.');
      } catch {
        setSearchError('Search failed. Check your connection.');
      } finally {
        setSearching(false);
      }
    }, 600);
  }, [query]);

  const quickPicks: GeoResult[] = [
    { lat: 30.2672, lng: -97.7431, label: 'Austin, TX' },
    { lat: 34.0522, lng: -118.2437, label: 'Los Angeles, CA' },
    { lat: 40.7128, lng: -74.0060,  label: 'New York, NY' },
    { lat: 39.7392, lng: -104.9903, label: 'Denver, CO' },
    { lat: 36.1627, lng: -86.7816,  label: 'Nashville, TN' },
    { lat: 45.5051, lng: -122.6750, label: 'Portland, OR' },
  ];

  const showQuickPicks = query.trim().length === 0;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.searchBackdrop} />
      </TouchableWithoutFeedback>

      <Animated.View style={[
        styles.searchSheet,
        { paddingBottom: insets.bottom + 16 },
        { transform: [{ translateY: slideAnim }] },
      ]}>
        <View style={styles.searchHandle} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.searchHeader}>
            <Text style={styles.searchHeading}>CHANGE LOCATION</Text>
            <Pressable onPress={onClose}>
              <Feather name="x" size={20} color={Colors.TEXT_SECONDARY} />
            </Pressable>
          </View>

          {/* Input */}
          <View style={styles.searchInputRow}>
            {searching
              ? <ActivityIndicator size="small" color={Colors.TTM_RED} style={{ marginRight: 8 }} />
              : <Feather name="search" size={16} color={Colors.TEXT_SECONDARY} style={{ marginRight: 8 }} />
            }
            <TextInput
              style={styles.searchInput}
              placeholder="City, state or zip code…"
              placeholderTextColor={Colors.TEXT_SECONDARY}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <Feather name="x-circle" size={16} color={Colors.TEXT_SECONDARY} />
              </Pressable>
            )}
          </View>

          {/* Error */}
          {!!searchError && (
            <Text style={styles.searchError}>{searchError}</Text>
          )}

          {/* Results */}
          {results.length > 0 && (
            <>
              <Text style={styles.searchSuggestLabel}>RESULTS</Text>
              {results.map((r, i) => (
                <Pressable
                  key={i}
                  style={styles.searchSuggestItem}
                  onPress={() => { onSelect(r); onClose(); }}
                >
                  <Feather name="map-pin" size={14} color={Colors.TTM_RED} style={{ marginRight: 10 }} />
                  <Text style={styles.searchSuggestText}>{r.label}</Text>
                </Pressable>
              ))}
            </>
          )}

          {/* Quick picks when input is empty */}
          {showQuickPicks && (
            <>
              <Text style={styles.searchSuggestLabel}>QUICK PICKS</Text>
              {quickPicks.map((r) => (
                <Pressable
                  key={r.label}
                  style={styles.searchSuggestItem}
                  onPress={() => { onSelect(r); onClose(); }}
                >
                  <Feather name="map-pin" size={14} color={Colors.TEXT_SECONDARY} style={{ marginRight: 10 }} />
                  <Text style={styles.searchSuggestText}>{r.label}</Text>
                </Pressable>
              ))}
            </>
          )}
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Alert banner
// ---------------------------------------------------------------------------

function AlertBanner({ alert, onDismiss }: { alert: WeatherAlert; onDismiss: () => void }) {
  const fmt = (iso: string) =>
    iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const start = fmt(alert.startTime);
  const end = fmt(alert.endTime);

  return (
    <View style={styles.alertBanner}>
      <View style={styles.alertLeft}>
        <Feather name="alert-triangle" size={16} color="#fff" style={{ marginTop: 1 }} />
        <View style={styles.alertText}>
          <Text style={styles.alertTitle}>{alert.title.toUpperCase()}</Text>
          {!!alert.affectedArea && <Text style={styles.alertMeta}>{alert.affectedArea}</Text>}
          {(start || end) && (
            <Text style={styles.alertMeta}>{start}{start && end ? ' – ' : ''}{end}</Text>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Current conditions card
// ---------------------------------------------------------------------------

function CurrentCard({ current }: { current: WeatherData['current'] }) {
  const meta = codeMeta(current.weatherCode);
  return (
    <View style={styles.currentCard}>
      <View style={styles.currentTop}>
        <View>
          <Text style={styles.tempText}>{round(current.temperature)}°</Text>
          <Text style={styles.feelsLike}>Feels {round(current.temperatureApparent)}°</Text>
          <Text style={styles.conditionLabel}>{meta.label.toUpperCase()}</Text>
        </View>
        <Feather name={meta.icon as any} size={72} color={Colors.TTM_RED} />
      </View>
      <View style={styles.statsGrid}>
        <StatCell icon="wind"        label="WIND"
          value={`${round(current.windSpeed)} mph ${windDirLabel(current.windDirection)}`} />
        <StatCell icon="eye"         label="VISIBILITY"
          value={`${round(current.visibility)} mi`} />
        <StatCell icon="droplet"     label="HUMIDITY"
          value={`${round(current.humidity)}%`} />
        <StatCell icon="thermometer" label="APPARENT"
          value={`${round(current.temperatureApparent)}°F`} />
      </View>
    </View>
  );
}

function StatCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Feather name={icon as any} size={14} color={Colors.TEXT_SECONDARY} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hourly strip
// ---------------------------------------------------------------------------

function HourlyStrip({ slots }: { slots: HourlySlot[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>HOURLY</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyScroll}>
        {slots.map((slot, i) => {
          const meta = codeMeta(slot.weatherCode);
          return (
            <View key={i} style={styles.hourCard}>
              <Text style={styles.hourTime}>{i === 0 ? 'NOW' : formatHour(slot.time)}</Text>
              <Feather name={meta.icon as any} size={20} color={Colors.TEXT_PRIMARY} style={{ marginVertical: 6 }} />
              <Text style={styles.hourTemp}>{round(slot.temperature)}°</Text>
              {slot.precipitationProbability > 0 && (
                <Text style={styles.hourPrecip}>{round(slot.precipitationProbability)}%</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Daily forecast
// ---------------------------------------------------------------------------

function DailyForecast({ slots }: { slots: DailySlot[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>5-DAY FORECAST</Text>
      <View style={styles.dailyCard}>
        {slots.map((slot, i) => {
          const meta = codeMeta(slot.weatherCode);
          const isLast = i === slots.length - 1;
          return (
            <View key={i} style={[styles.dayRow, !isLast && styles.dayRowBorder]}>
              <Text style={styles.dayName}>{i === 0 ? 'TODAY' : formatDay(slot.time)}</Text>
              <Feather name={meta.icon as any} size={18} color={Colors.TEXT_SECONDARY} />
              <Text style={styles.dayPrecip}>
                {slot.precipitationProbability > 0 ? `${round(slot.precipitationProbability)}%` : ''}
              </Text>
              <View style={styles.dayTemps}>
                <Text style={styles.dayHigh}>{round(slot.temperatureMax)}°</Text>
                <Text style={styles.dayLow}>{round(slot.temperatureMin)}°</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main WeatherScreen
// ---------------------------------------------------------------------------

type LoadState = 'idle' | 'locating' | 'fetching' | 'done' | 'error';
type WeatherTab = 'current' | 'ride-window';

export default function WeatherScreen() {
  const [activeTab, setActiveTab] = useState<WeatherTab>('current');
  const [state, setState] = useState<LoadState>('idle');
  const [data, setData] = useState<WeatherData | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Load by GPS coords
  async function loadByGPS(force = false) {
    try {
      setState('locating');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Location permission denied. Enable it in Settings or search for a city.');
        setState('error');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      coordsRef.current = { lat, lng };

      // Reverse geocode for display name
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (place) {
          const city = place.city || place.subregion || place.region || '';
          const region = place.region || '';
          setLocationLabel(city && region ? `${city}, ${region}` : city || region || 'Current Location');
        }
      } catch {
        setLocationLabel('Current Location');
      }

      setState('fetching');
      const weather = await fetchWeather(lat, lng, force);
      setData(weather);
      setState('done');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to load weather.');
      setState('error');
    }
  }

  // Load by pre-geocoded result (real lat/lng + proper label)
  async function loadByGeoResult(result: GeoResult) {
    try {
      setState('fetching');
      setLocationLabel(result.label);
      coordsRef.current = { lat: result.lat, lng: result.lng };
      const weather = await fetchWeather(result.lat, result.lng, true);
      setData(weather);
      setState('done');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to load weather.');
      setState('error');
    }
  }

  useEffect(() => { loadByGPS(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (coordsRef.current) {
      await loadByGPS(true);
    }
    setRefreshing(false);
  }, []);

  const visibleAlerts = data?.alerts.filter((a) => !dismissedAlerts.has(a.id)) ?? [];

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  const isLoading = state === 'idle' || state === 'locating' || state === 'fetching';

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.TTM_RED} />
          <Text style={styles.loadingText}>
            {state === 'locating' ? 'Getting location…' : 'Loading weather…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'error' && !data) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centered}>
          <Feather name="cloud-off" size={48} color={Colors.TEXT_SECONDARY} />
          <Text style={styles.errorTitle}>WEATHER UNAVAILABLE</Text>
          <Text style={styles.errorMsg}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadByGPS(true)}>
            <Text style={styles.retryText}>USE MY LOCATION</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: Colors.TTM_CARD, marginTop: 8 }]}
            onPress={() => setShowSearch(true)}
          >
            <Text style={[styles.retryText, { color: Colors.TEXT_PRIMARY }]}>SEARCH A CITY</Text>
          </TouchableOpacity>
        </View>
        <LocationSearchModal
          visible={showSearch}
          onClose={() => setShowSearch(false)}
          onSelect={loadByGeoResult}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.heading}>WEATHER</Text>
          {!!locationLabel && activeTab === 'current' && (
            <TouchableOpacity
              style={styles.locationRow}
              onPress={() => setShowSearch(true)}
            >
              <Feather name="map-pin" size={12} color={Colors.TTM_RED} />
              <Text style={styles.locationText}>{locationLabel}</Text>
              <Feather name="chevron-down" size={12} color={Colors.TEXT_SECONDARY} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.headerRight}>
          {activeTab === 'current' && (
            <>
              <TouchableOpacity
                onPress={() => setShowSearch(true)}
                style={styles.headerBtn}
              >
                <Feather name="search" size={18} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => loadByGPS(true)}
                style={styles.headerBtn}
              >
                <Feather name="navigation" size={18} color={Colors.TEXT_SECONDARY} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Sub-tab bar */}
      <View style={styles.subTabBar}>
        {(['current', 'ride-window'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.subTab, activeTab === tab && styles.subTabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.subTabText, activeTab === tab && styles.subTabTextActive]}>
              {tab === 'current' ? 'CURRENT' : 'RIDE WINDOW'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Alert banners (current tab only) */}
      {activeTab === 'current' && visibleAlerts.map((alert) => (
        <AlertBanner
          key={alert.id}
          alert={alert}
          onDismiss={() => setDismissedAlerts((p) => new Set([...p, alert.id]))}
        />
      ))}

      {activeTab === 'current' ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.TTM_RED} />
          }
        >
          {data && (
            <>
              <CurrentCard current={data.current} />
              {data.hourly.length > 0 && <HourlyStrip slots={data.hourly} />}
              {data.daily.length > 0 && <DailyForecast slots={data.daily} />}
              <Text style={styles.cacheNote}>
                Updated {new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </>
          )}
        </ScrollView>
      ) : (
        <RideWindowPlanner />
      )}

      <LocationSearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={loadByGeoResult}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.TTM_DARK },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', gap: 4 },
  headerBtn: { padding: 6 },
  heading: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  locationText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    letterSpacing: 0.5,
  },

  // Sub-tab bar
  subTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  subTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabActive: {
    borderBottomColor: Colors.TTM_RED,
  },
  subTabText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  subTabTextActive: {
    color: Colors.TEXT_PRIMARY,
  },

  // Scroll
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Loading / error
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { color: Colors.TEXT_SECONDARY, fontSize: 13, letterSpacing: 1, marginTop: 8 },
  errorTitle: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 16,
  },
  errorMsg: { color: Colors.TEXT_SECONDARY, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    backgroundColor: Colors.TTM_RED,
    borderRadius: 6,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 2 },

  // Alert banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: Colors.TTM_RED,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  alertLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  alertText: { flex: 1 },
  alertTitle: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  alertMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },

  // Current card
  currentCard: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  currentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  tempText: { color: Colors.TEXT_PRIMARY, fontSize: 64, fontWeight: '700', lineHeight: 70 },
  feelsLike: { color: Colors.TEXT_SECONDARY, fontSize: 14, marginTop: 4 },
  conditionLabel: {
    color: Colors.TTM_RED,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: Colors.TTM_BORDER,
    paddingTop: 16,
  },
  statCell: { width: '50%', paddingVertical: 10, paddingRight: 16, gap: 4 },
  statLabel: { color: Colors.TEXT_SECONDARY, fontSize: 9, fontWeight: '700', letterSpacing: 2, marginTop: 4 },
  statValue: { color: Colors.TEXT_PRIMARY, fontSize: 15, fontWeight: '600' },

  // Section
  section: { marginBottom: 16 },
  sectionTitle: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 10,
  },

  // Hourly
  hourlyScroll: { gap: 8, paddingRight: 4 },
  hourCard: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minWidth: 64,
  },
  hourTime: { color: Colors.TEXT_SECONDARY, fontSize: 11, fontWeight: '600' },
  hourTemp: { color: Colors.TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  hourPrecip: { color: '#5B9BD5', fontSize: 11, fontWeight: '600', marginTop: 2 },

  // Daily
  dailyCard: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dayRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.TTM_BORDER },
  dayName: { color: Colors.TEXT_PRIMARY, fontSize: 13, fontWeight: '600', letterSpacing: 1, width: 56 },
  dayPrecip: { color: '#5B9BD5', fontSize: 12, fontWeight: '600', width: 36, marginLeft: 12, textAlign: 'right' },
  dayTemps: { flexDirection: 'row', marginLeft: 'auto', gap: 12 },
  dayHigh: { color: Colors.TEXT_PRIMARY, fontSize: 15, fontWeight: '700' },
  dayLow: { color: Colors.TEXT_SECONDARY, fontSize: 15, fontWeight: '500' },

  // Cache note
  cacheNote: { color: Colors.TEXT_SECONDARY, fontSize: 11, textAlign: 'center', marginTop: 8 },

  // Location search modal
  searchBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  searchSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.TTM_PANEL,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: Colors.TTM_BORDER,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  searchHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.TTM_BORDER,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  searchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  searchHeading: { color: Colors.TEXT_PRIMARY, fontSize: 14, fontWeight: '700', letterSpacing: 3 },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
  },
  searchGoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.TTM_RED,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 20,
  },
  searchGoBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  searchError: {
    color: Colors.TTM_RED,
    fontSize: 12,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  searchSuggestLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  searchSuggestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  searchSuggestText: { color: Colors.TEXT_PRIMARY, fontSize: 15 },
});
