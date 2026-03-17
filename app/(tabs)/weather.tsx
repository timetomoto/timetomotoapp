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
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchWeather,
  codeMeta,
  windDirLabel,
  type WeatherData,
  type HourlySlot,
  type DailySlot,
  type WeatherAlert,
} from '../../lib/weather';
import RideWindowPlanner from '../../components/weather/RideWindowPlanner';
import HamburgerButton from '../../components/navigation/HamburgerButton';
import HamburgerMenu from '../../components/navigation/HamburgerMenu';
import { useTheme } from '../../lib/useTheme';
import { useAuthStore, useTabResetStore } from '../../lib/store';
import {
  loadFavorites,
  toggleFavorite as toggleFavoriteApi,
  removeFavorite as removeFavoriteApi,
  getHomeFavorite,
  type FavoriteLocation as SharedFavorite,
} from '../../lib/favorites';

// ---------------------------------------------------------------------------
// AsyncStorage keys
// ---------------------------------------------------------------------------

const RECENTS_KEY   = 'ttm_weather_recents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @deprecated Use SharedFavorite from lib/favorites instead. Kept for compat. */
export interface FavoriteLocation {
  name: string;
  lat: number;
  lon: number;
}

// Mapping helpers between weather's `lon` and shared module's `lng`
function toShared(f: FavoriteLocation): SharedFavorite {
  return { name: f.name, lat: f.lat, lng: f.lon };
}
function fromShared(f: SharedFavorite): FavoriteLocation {
  return { name: f.name, lat: f.lat, lon: f.lng };
}

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
// ---------------------------------------------------------------------------

interface GeoResult { lat: number; lng: number; label: string }

async function geocodeQuery(query: string): Promise<GeoResult[]> {
  const results = await Location.geocodeAsync(query);
  const out: GeoResult[] = [];
  for (const r of results.slice(0, 5)) {
    const [place] = await Location.reverseGeocodeAsync(
      { latitude: r.latitude, longitude: r.longitude },
    );
    if (!place) continue;
    const city    = place.city || place.subregion || place.district || '';
    const region  = place.region || '';
    const country = place.isoCountryCode !== 'US' ? (place.country ?? '') : '';
    const label   = [city, region, country].filter(Boolean).join(', ');
    if (label) out.push({ lat: r.latitude, lng: r.longitude, label });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Recents helpers (local only)
// ---------------------------------------------------------------------------

async function loadRecents(): Promise<FavoriteLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveRecents(recents: FavoriteLocation[]): Promise<void> {
  await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

async function addRecentLocation(loc: FavoriteLocation): Promise<FavoriteLocation[]> {
  const existing = await loadRecents();
  const deduped  = existing.filter((r) => r.name !== loc.name);
  const updated  = [loc, ...deduped].slice(0, 3);
  await saveRecents(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Location search modal (with favorites + recents)
// ---------------------------------------------------------------------------

function LocationSearchModal({
  visible,
  onClose,
  onSelect,
  favorites,
  recents,
  onToggleFavorite,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: GeoResult) => void;
  favorites: FavoriteLocation[];
  recents: FavoriteLocation[];
  onToggleFavorite: (loc: FavoriteLocation) => void;
}) {
  const { theme } = useTheme();
  const insets    = useSafeAreaInsets();
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<GeoResult[]>([]);
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

  const showQuickPicks = query.trim().length === 0 && results.length === 0;

  function isFavorite(label: string) {
    return favorites.some((f) => f.name === label);
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.searchBackdrop} />
      </TouchableWithoutFeedback>

      <Animated.View style={[
        styles.searchSheet,
        {
          backgroundColor: theme.bgPanel,
          borderColor: theme.border,
          paddingBottom: insets.bottom + 16,
        },
        { transform: [{ translateY: slideAnim }] },
      ]}>
        <View style={[styles.searchHandle, { backgroundColor: theme.border }]} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.searchHeader}>
            <Text style={[styles.searchHeading, { color: theme.textPrimary }]}>CHANGE LOCATION</Text>
            <Pressable onPress={onClose}>
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          {/* Input */}
          <View style={[styles.searchInputRow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            {searching
              ? <ActivityIndicator size="small" color={theme.red} style={{ marginRight: 8 }} />
              : <Feather name="search" size={16} color={theme.textSecondary} style={{ marginRight: 8 }} />
            }
            <TextInput
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="City, state or zip code…"
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <Feather name="x-circle" size={16} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Error */}
          {!!searchError && (
            <Text style={[styles.searchError, { color: theme.red }]}>{searchError}</Text>
          )}

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 380 }}
          >
            {/* Results */}
            {results.length > 0 && (
              <>
                <Text style={[styles.searchSuggestLabel, { color: theme.textSecondary }]}>RESULTS</Text>
                {results.map((r, i) => (
                  <Pressable
                    key={i}
                    style={[styles.searchSuggestItem, { borderBottomColor: theme.border }]}
                    onPress={() => { onSelect(r); onClose(); }}
                  >
                    <Feather name="map-pin" size={14} color={theme.red} style={{ marginRight: 10 }} />
                    <Text style={[styles.searchSuggestText, { color: theme.textPrimary, flex: 1 }]}>{r.label}</Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => onToggleFavorite({ name: r.label, lat: r.lat, lon: r.lng })}
                    >
                      <Ionicons
                        name={isFavorite(r.label) ? 'heart' : 'heart-outline'}
                        size={16}
                        color={isFavorite(r.label) ? theme.red : theme.textSecondary}
                      />
                    </Pressable>
                  </Pressable>
                ))}
              </>
            )}

            {/* Favorites section */}
            {favorites.length > 0 && (
              <>
                <Text style={[styles.searchSuggestLabel, { color: theme.textSecondary, marginTop: 7 }]}>FAVORITES</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pillRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {favorites.map((fav) => (
                    <Pressable
                      key={fav.name}
                      style={[styles.pill, { backgroundColor: theme.red + '22', borderColor: theme.red }]}
                      onPress={() => {
                        onSelect({ lat: fav.lat, lng: fav.lon, label: fav.name });
                        onClose();
                      }}
                    >
                      <Ionicons name="heart" size={11} color={theme.red} />
                      <Text style={[styles.pillText, { color: theme.red }]}>{fav.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Recents section */}
            {recents.length > 0 && (
              <>
                <Text style={[styles.searchSuggestLabel, { color: theme.textSecondary }]}>RECENT</Text>
                {recents.map((r) => (
                  <Pressable
                    key={r.name}
                    style={[styles.searchSuggestItem, { borderBottomColor: theme.border }]}
                    onPress={() => {
                      onSelect({ lat: r.lat, lng: r.lon, label: r.name });
                      onClose();
                    }}
                  >
                    <Feather name="clock" size={14} color={theme.textSecondary} style={{ marginRight: 10 }} />
                    <Text style={[styles.searchSuggestText, { color: theme.textPrimary, flex: 1 }]}>{r.name}</Text>
                  </Pressable>
                ))}
              </>
            )}

            {/* Quick picks when input is empty */}
            {showQuickPicks && (
              <>
                <Text style={[styles.searchSuggestLabel, { color: theme.textSecondary }]}>QUICK PICKS</Text>
                {quickPicks.map((r) => (
                  <Pressable
                    key={r.label}
                    style={[styles.searchSuggestItem, { borderBottomColor: theme.border }]}
                    onPress={() => { onSelect(r); onClose(); }}
                  >
                    <Feather name="map-pin" size={14} color={theme.textSecondary} style={{ marginRight: 10 }} />
                    <Text style={[styles.searchSuggestText, { color: theme.textPrimary, flex: 1 }]}>{r.label}</Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => onToggleFavorite({ name: r.label, lat: r.lat, lon: r.lng })}
                    >
                      <Ionicons
                        name={isFavorite(r.label) ? 'heart' : 'heart-outline'}
                        size={16}
                        color={isFavorite(r.label) ? theme.red : theme.textSecondary}
                      />
                    </Pressable>
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Alert banner
// ---------------------------------------------------------------------------

function AlertBanner({ alert, onDismiss }: { alert: WeatherAlert; onDismiss: () => void }) {
  const { theme } = useTheme();
  const fmt = (iso: string) =>
    iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const start = fmt(alert.startTime);
  const end   = fmt(alert.endTime);

  return (
    <View style={[styles.alertBanner, { backgroundColor: theme.red }]}>
      <View style={styles.alertLeft}>
        <Feather name="alert-triangle" size={16} color={theme.white} style={{ marginTop: 1 }} />
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

function CurrentCard({
  current,
  locationLabel,
  isFav,
  onToggleFav,
}: {
  current: WeatherData['current'];
  locationLabel: string;
  isFav: boolean;
  onToggleFav: () => void;
}) {
  const { theme } = useTheme();
  const meta = codeMeta(current.weatherCode);
  return (
    <View style={[styles.currentCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={styles.currentTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.tempText, { color: theme.textPrimary }]}>{round(current.temperature)}°</Text>
          <Text style={[styles.feelsLike, { color: theme.textSecondary }]}>Feels {round(current.temperatureApparent)}°</Text>
          <Text style={[styles.conditionLabel, { color: theme.red }]}>{meta.label.toUpperCase()}</Text>
        </View>
        <View style={styles.currentTopRight}>
          <Feather name={meta.icon as any} size={64} color={theme.red} />
          {!!locationLabel && (
            <Pressable onPress={onToggleFav} style={styles.favBtn} hitSlop={8}>
              <Ionicons
                name={isFav ? 'heart' : 'heart-outline'}
                size={20}
                color={isFav ? theme.red : theme.textSecondary}
                style={{ marginTop: 6 }}
              />
            </Pressable>
          )}
        </View>
      </View>
      <View style={[styles.statsGrid, { borderTopColor: theme.border }]}>
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
  const { theme } = useTheme();
  return (
    <View style={styles.statCell}>
      <Feather name={icon as any} size={14} color={theme.textSecondary} />
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hourly strip
// ---------------------------------------------------------------------------

function HourlyStrip({ slots }: { slots: HourlySlot[] }) {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>HOURLY</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyScroll}>
        {slots.map((slot, i) => {
          const meta = codeMeta(slot.weatherCode);
          return (
            <View key={i} style={[styles.hourCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Text style={[styles.hourTime, { color: theme.textSecondary }]}>{i === 0 ? 'NOW' : formatHour(slot.time)}</Text>
              <Feather name={meta.icon as any} size={20} color={theme.textPrimary} style={{ marginVertical: 6 }} />
              <Text style={[styles.hourTemp, { color: theme.textPrimary }]}>{round(slot.temperature)}°</Text>
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
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>5-DAY FORECAST</Text>
      <View style={[styles.dailyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        {slots.map((slot, i) => {
          const meta   = codeMeta(slot.weatherCode);
          const isLast = i === slots.length - 1;
          return (
            <View key={i} style={[styles.dayRow, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <Text style={[styles.dayName, { color: theme.textPrimary }]}>{i === 0 ? 'TODAY' : formatDay(slot.time)}</Text>
              <Feather name={meta.icon as any} size={18} color={theme.textSecondary} />
              <Text style={styles.dayPrecip}>
                {slot.precipitationProbability > 0 ? `${round(slot.precipitationProbability)}%` : ''}
              </Text>
              <View style={styles.dayTemps}>
                <Text style={[styles.dayHigh, { color: theme.textPrimary }]}>{round(slot.temperatureMax)}°</Text>
                <Text style={[styles.dayLow, { color: theme.textSecondary }]}>{round(slot.temperatureMin)}°</Text>
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
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const userId = user?.id ?? 'local';
  const [activeTab, setActiveTab]   = useState<WeatherTab>('current');
  const weatherReset = useTabResetStore((s) => s.weatherReset);
  const pendingSubTab = useTabResetStore((s) => s.pendingWeatherSubTab);
  const setPendingWeatherSubTab = useTabResetStore((s) => s.setPendingWeatherSubTab);
  useEffect(() => {
    if (weatherReset > 0) setActiveTab('current');
  }, [weatherReset]);
  useEffect(() => {
    if (pendingSubTab) {
      setActiveTab(pendingSubTab);
      setPendingWeatherSubTab(null);
    }
  }, [pendingSubTab]);
  const [state, setState]           = useState<LoadState>('idle');
  const [data, setData]             = useState<WeatherData | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [errorMsg, setErrorMsg]     = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Favorites + recents state
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [recents, setRecents]     = useState<FavoriteLocation[]>([]);

  // Load recents on mount
  useEffect(() => {
    loadRecents().then(setRecents);
  }, [userId]);

  // Is current location a favorite?
  const isCurrentFav = !!locationLabel && favorites.some((f) => f.name === locationLabel);

  // Toggle favorite for current displayed location
  async function toggleCurrentFavorite() {
    if (!locationLabel || !coordsRef.current) return;
    const loc: FavoriteLocation = {
      name: locationLabel,
      lat: coordsRef.current.lat,
      lon: coordsRef.current.lng,
    };
    const updated = await toggleFavoriteApi(toShared(loc), userId);
    setFavorites(updated.map(fromShared));
  }

  // Toggle favorite from search modal
  async function handleToggleFavorite(loc: FavoriteLocation) {
    const updated = await toggleFavoriteApi(toShared(loc), userId);
    setFavorites(updated.map(fromShared));
  }

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

      let loc: Location.LocationObject | null = null;

      // 1) Try last-known position first (instant, works in simulator)
      try {
        loc = await Location.getLastKnownPositionAsync({ maxAge: 300_000 });
      } catch {
        loc = null;
      }

      // 2) If no cached position, request a fresh fix with generous timeout
      if (!loc) {
        try {
          const locationPromise = Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Low,
          });
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000));
          loc = await Promise.race([locationPromise, timeoutPromise]);
        } catch {
          loc = null;
        }
      }

      if (!loc) {
        setErrorMsg('Location unavailable — search for a city above');
        setState('error');
        return;
      }

      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      coordsRef.current = { lat, lng };

      // Reverse geocode for display name
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (place) {
          const city   = place.city || place.subregion || place.region || '';
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
      setErrorMsg('Location unavailable — search for a city above');
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

      // Update recents
      const loc: FavoriteLocation = { name: result.label, lat: result.lat, lon: result.lng };
      const updated = await addRecentLocation(loc);
      setRecents(updated);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to load weather.');
      setState('error');
    }
  }

  useEffect(() => {
    // Load favorites, check for home, use as default weather location
    loadFavorites(userId).then((favs) => {
      setFavorites(favs.map(fromShared));
      const home = getHomeFavorite(favs);
      if (home) {
        coordsRef.current = { lat: home.lat, lng: home.lng };
        // Show nickname/name immediately, then refine with reverse geocode
        setLocationLabel(home.nickname || home.name);
        setState('fetching');

        // Reverse geocode for clean city name
        Location.reverseGeocodeAsync({ latitude: home.lat, longitude: home.lng })
          .then(([place]) => {
            if (place) {
              const city = place.city || place.subregion || place.region || '';
              const region = place.region || '';
              const label = city && region ? `${city}, ${region}` : city || region;
              if (label) setLocationLabel(label);
            }
          })
          .catch(() => {});

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
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <HamburgerButton onPress={() => setMenuOpen(true)} />
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={[styles.heading, { color: theme.textPrimary }]}>WEATHER</Text>
            </View>
          </View>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.red} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            {state === 'locating' ? 'Getting your location…' : 'Loading conditions…'}
          </Text>
          <Pressable
            style={[styles.loadingSearchBtn, { borderColor: theme.border }]}
            onPress={() => setShowSearch(true)}
          >
            <Feather name="search" size={14} color={theme.textSecondary} />
            <Text style={[styles.loadingSearchText, { color: theme.textSecondary }]}>
              Or search a city
            </Text>
          </Pressable>
        </View>
        <LocationSearchModal
          visible={showSearch}
          onClose={() => setShowSearch(false)}
          onSelect={loadByGeoResult}
          favorites={favorites}
          recents={recents}
          onToggleFavorite={handleToggleFavorite}
        />
        <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </SafeAreaView>
    );
  }

  if (state === 'error' && !data) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.centered}>
          <Feather name="cloud-off" size={48} color={theme.textSecondary} />
          <Text style={[styles.errorTitle, { color: theme.textPrimary }]}>WEATHER UNAVAILABLE</Text>
          <Text style={[styles.errorMsg, { color: theme.textSecondary }]}>{errorMsg}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.red }]} onPress={() => loadByGPS(true)}>
            <Text style={styles.retryText}>USE MY LOCATION</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.bgCard, marginTop: 8 }]}
            onPress={() => setShowSearch(true)}
          >
            <Text style={[styles.retryText, { color: theme.textPrimary }]}>SEARCH A CITY</Text>
          </TouchableOpacity>
        </View>
        <LocationSearchModal
          visible={showSearch}
          onClose={() => setShowSearch(false)}
          onSelect={loadByGeoResult}
          favorites={favorites}
          recents={recents}
          onToggleFavorite={handleToggleFavorite}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <HamburgerButton onPress={() => setMenuOpen(true)} />
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none" >
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[styles.heading, { color: theme.textPrimary }]}>WEATHER</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => loadByGPS(true)} style={styles.headerBtn}>
            <Feather name="navigation" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sub-tab bar */}
      <View style={[styles.subTabBar, { backgroundColor: theme.subNavBg, borderBottomColor: theme.subNavBorder }]}>
        <Pressable style={styles.subTab} onPress={() => setActiveTab('current')}>
          <Text style={[styles.subTabText, { color: theme.pillText }, activeTab === 'current' && { color: theme.red }]}>
            CURRENT
          </Text>
          {activeTab === 'current' && <View style={[styles.subTabUnderline, { backgroundColor: theme.red }]} />}
        </Pressable>
        <Pressable style={styles.subTab} onPress={() => setActiveTab('ride-window')}>
          <Text style={[styles.subTabText, { color: theme.pillText }, activeTab === 'ride-window' && { color: theme.red }]}>
            RIDE WINDOW
          </Text>
          {activeTab === 'ride-window' && <View style={[styles.subTabUnderline, { backgroundColor: theme.red }]} />}
        </Pressable>
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} />
          }
        >
          {!!locationLabel && (
            <TouchableOpacity
              style={[styles.locationRow, { borderColor: theme.border }]}
              onPress={() => setShowSearch(true)}
            >
              <Feather name="map-pin" size={12} color={theme.red} />
              <Text style={[styles.locationText, { color: theme.textSecondary }]}>{locationLabel}</Text>
              <Feather name="chevron-down" size={12} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
          {data && (
            <>
              <CurrentCard
                current={data.current}
                locationLabel={locationLabel}
                isFav={isCurrentFav}
                onToggleFav={toggleCurrentFavorite}
              />
              {data.hourly.length > 0 && <HourlyStrip slots={data.hourly} />}
              {data.daily.length > 0 && <DailyForecast slots={data.daily} />}
              <Text style={[styles.cacheNote, { color: theme.textSecondary }]}>
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
        favorites={favorites}
        recents={recents}
        onToggleFavorite={handleToggleFavorite}
      />

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerRight: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  headerBtn: { padding: 6 },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  locationText: {
    fontSize: 12,
    letterSpacing: 0.2,
  },

  // Sub-tab bar
  subTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    height: 44,
  },
  subTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  subTabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
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
  loadingText: { fontSize: 13, letterSpacing: 0.3, marginTop: 8 },
  loadingSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
  loadingSearchText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 16,
  },
  errorMsg: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    borderRadius: 6,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.7 },

  // Alert banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  alertLeft:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  alertText:  { flex: 1 },
  alertTitle: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  alertMeta:  { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },

  // Current card
  currentCard: {
    borderWidth: 1,
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
  currentTopRight: {
    alignItems: 'center',
    gap: 8,
  },
  favBtn: {
    padding: 4,
  },
  tempText:       { fontSize: 64, fontWeight: '700', lineHeight: 70 },
  feelsLike:      { fontSize: 14, marginTop: 4 },
  conditionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    paddingTop: 16,
  },
  statCell:  { width: '50%', paddingVertical: 10, paddingRight: 16, gap: 4 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginTop: 4 },
  statValue: { fontSize: 15, fontWeight: '600' },

  // Section
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  // Hourly
  hourlyScroll: { gap: 8, paddingRight: 4 },
  hourCard: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minWidth: 64,
  },
  hourTime:   { fontSize: 11, fontWeight: '600' },
  hourTemp:   { fontSize: 16, fontWeight: '700' },
  hourPrecip: { color: '#5B9BD5', fontSize: 11, fontWeight: '600', marginTop: 2 },

  // Daily
  dailyCard: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dayName:    { fontSize: 13, fontWeight: '600', letterSpacing: 0.3, width: 56 },
  dayPrecip:  { color: '#5B9BD5', fontSize: 12, fontWeight: '600', width: 36, marginLeft: 12, textAlign: 'right' },
  dayTemps:   { flexDirection: 'row', marginLeft: 'auto', gap: 12 },
  dayHigh:    { fontSize: 15, fontWeight: '700' },
  dayLow:     { fontSize: 15, fontWeight: '500' },

  // Cache note
  cacheNote: { fontSize: 11, textAlign: 'center', marginTop: 8 },

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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    maxHeight: '85%',
  },
  searchHandle: {
    width: 40,
    height: 4,
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
  searchHeading: { fontSize: 14, fontWeight: '700', letterSpacing: 1.2 },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  searchError: {
    fontSize: 12,
    marginBottom: 12,
    letterSpacing: 0.1,
  },
  searchSuggestLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
    marginTop: 4,
  },
  searchSuggestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  searchSuggestText: { fontSize: 15 },

  // Favorites pills
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
    paddingRight: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
