import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  useDiscoverStore,
  geocodeLocation,
  reverseGeocode,
  type WindyCamera,
  type CamsFilter,
} from '../../lib/discoverStore';
import { useTheme } from '../../lib/useTheme';

let WebView: any;
try {
  WebView = require('react-native-webview').WebView;
} catch {
  WebView = null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_W = (SCREEN_W - 32 - CARD_GAP) / 2;
const THUMB_H = Math.round(CARD_W * (9 / 16));

const FILTER_PILLS: { label: string; value: CamsFilter }[] = [
  { label: 'ALL', value: 'all' },
  { label: 'TRAFFIC', value: 'traffic' },
  { label: 'ROAD', value: 'road' },
  { label: 'WEATHER', value: 'weather' },
  { label: 'SCENIC', value: 'scenic' },
];

const THUMB_REFRESH_MS = 60_000;

// ---------------------------------------------------------------------------
// CameraCard
// ---------------------------------------------------------------------------

interface CameraCardProps {
  camera: WindyCamera;
  onPress: (camera: WindyCamera) => void;
}

const CameraCard = memo(function CameraCard({ camera, onPress }: CameraCardProps) {
  const { theme } = useTheme();
  const [imgKey, setImgKey] = useState(0);
  const [imgError, setImgError] = useState(false);

  // Auto-refresh thumbnail every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      setImgKey((k) => k + 1);
      setImgError(false);
    }, THUMB_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const isOffline = camera.status !== 'active';
  const previewUrl = camera.images?.current?.preview;
  const cityRegion = [camera.location.city, camera.location.region].filter(Boolean).join(', ');

  return (
    <Pressable
      style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border, width: CARD_W }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress(camera);
      }}
      accessibilityLabel={`View camera: ${camera.title}`}
      accessibilityRole="button"
    >
      {/* Thumbnail */}
      <View style={[s.thumbWrap, { height: THUMB_H }]}>
        {previewUrl && !imgError ? (
          <Image
            key={imgKey}
            source={{ uri: `${previewUrl}${previewUrl.includes('?') ? '&' : '?'}t=${imgKey}` }}
            style={s.thumbImage}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={[s.thumbPlaceholder, { backgroundColor: theme.border }]}>
            <Feather name="camera-off" size={20} color={theme.textMuted} />
          </View>
        )}

        {/* LIVE badge */}
        {!isOffline && (
          <View style={[s.liveBadge, { backgroundColor: theme.red }]}>
            <Text style={s.liveBadgeText}>LIVE</Text>
          </View>
        )}

        {/* Offline overlay */}
        {isOffline && (
          <View style={s.offlineOverlay}>
            <Text style={s.offlineText}>Camera offline</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={s.cardInfo}>
        <Text style={[s.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {camera.title}
        </Text>
        {!!cityRegion && (
          <Text style={[s.cardSubtitle, { color: theme.textMuted }]} numberOfLines={1}>
            {cityRegion}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// CameraModal — full-screen camera view
// ---------------------------------------------------------------------------

function CameraModal({
  camera,
  onClose,
}: {
  camera: WindyCamera;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const embedUrl = camera.player?.day?.embed;
  const cityRegion = [camera.location.city, camera.location.region].filter(Boolean).join(', ');
  const country = camera.location.country;
  const locationLine = [cityRegion, country].filter(Boolean).join(' · ');

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[s.modalRoot, { backgroundColor: theme.bg }]}>
        {/* Header */}
        <View style={[s.modalHeader, { borderBottomColor: theme.border }]}>
          <Pressable onPress={onClose} hitSlop={12} style={s.modalBack}>
            <Feather name="chevron-left" size={22} color={theme.textPrimary} />
          </Pressable>
          <Text style={[s.modalTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {camera.title}
          </Text>
          <View style={s.modalBack} />
        </View>

        {/* Player */}
        <View style={s.playerWrap}>
          {embedUrl && WebView ? (
            <WebView
              source={{ uri: embedUrl }}
              style={s.webview}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
            />
          ) : (
            <View style={[s.noPlayer, { backgroundColor: theme.bgCard }]}>
              <Feather name="camera-off" size={36} color={theme.textMuted} />
              <Text style={[s.noPlayerText, { color: theme.textMuted }]}>No live feed available</Text>
            </View>
          )}
        </View>

        {/* Location info */}
        <View style={[s.modalInfo, { borderTopColor: theme.border }]}>
          <View style={s.modalInfoRow}>
            <Feather name="map-pin" size={13} color={theme.red} />
            <Text style={[s.modalInfoText, { color: theme.textSecondary }]}>{locationLine || 'Unknown location'}</Text>
          </View>
          <Text style={[s.modalInfoSub, { color: theme.textMuted }]}>Updated every 60s</Text>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// DiscoverCams
// ---------------------------------------------------------------------------

export default function DiscoverCams() {
  const { theme } = useTheme();
  const {
    cameras,
    camsLoading,
    camsError,
    camsLocation,
    activeCamsFilter,
    fetchCameras,
    setCamsLocation,
    setActiveCamsFilter,
  } = useDiscoverStore();

  const [gpsLoc, setGpsLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsName, setGpsName] = useState('');
  const [locDenied, setLocDenied] = useState(false);
  const [gpsFallback, setGpsFallback] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<WindyCamera | null>(null);

  // Search state
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveLoc = camsLocation ?? (gpsLoc ? { ...gpsLoc, name: gpsName } : null);

  const loadCameras = useCallback(
    async (lat: number, lng: number, filter?: CamsFilter) => {
      await fetchCameras(lat, lng, filter ?? activeCamsFilter !== 'all' ? activeCamsFilter : undefined);
      setInitialLoaded(true);
    },
    [fetchCameras, activeCamsFilter],
  );

  // Get GPS on mount
  useEffect(() => {
    (async () => {
      const DEFAULT_LAT = 30.2672;
      const DEFAULT_LNG = -97.7431;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocDenied(true);
        return;
      }

      let lat = DEFAULT_LAT;
      let lng = DEFAULT_LNG;
      let didFallback = false;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch {
        didFallback = true;
        setGpsFallback(true);
      }

      setGpsLoc({ lat, lng });

      const name = didFallback ? 'Austin, TX' : await reverseGeocode(lat, lng);
      setGpsName(name);

      if (!useDiscoverStore.getState().camsLocation) {
        loadCameras(lat, lng);
      }
    })();
  }, []);

  // If custom location already set on mount
  useEffect(() => {
    if (camsLocation) {
      loadCameras(camsLocation.lat, camsLocation.lng);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const target = camsLocation ?? gpsLoc;
    if (target) {
      await loadCameras(target.lat, target.lng);
    }
    setRefreshing(false);
  }, [loadCameras, camsLocation, gpsLoc]);

  // Filter pill change
  const handleFilterChange = useCallback(
    (filter: CamsFilter) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveCamsFilter(filter);
      const target = camsLocation ?? gpsLoc;
      if (target) {
        fetchCameras(target.lat, target.lng, filter !== 'all' ? filter : undefined);
      }
    },
    [setActiveCamsFilter, fetchCameras, camsLocation, gpsLoc],
  );

  // Debounced search
  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const results = await geocodeLocation(text);
      setSearchResults(results);
    }, 350);
  }, []);

  const handleSelectResult = useCallback(
    (result: { name: string; lat: number; lng: number }) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Keyboard.dismiss();
      setSearchText(result.name);
      setSearchResults([]);
      setSearchFocused(false);
      setCamsLocation(result);
      loadCameras(result.lat, result.lng);
    },
    [setCamsLocation, loadCameras],
  );

  const handleClearSearch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchText('');
    setSearchResults([]);
    setCamsLocation(null);
    if (gpsLoc) {
      loadCameras(gpsLoc.lat, gpsLoc.lng);
    }
  }, [setCamsLocation, gpsLoc, loadCameras]);

  const usingGps = camsLocation === null;
  const displayName = searchFocused
    ? searchText
    : camsLocation
      ? camsLocation.name
      : gpsName || '';

  const locationName = camsLocation?.name ?? gpsName ?? '';

  // Build 2-column rows
  const rows: WindyCamera[][] = [];
  for (let i = 0; i < cameras.length; i += 2) {
    rows.push(cameras.slice(i, i + 2));
  }

  return (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} />}
      >
        {/* GPS fallback banner */}
        {gpsFallback && !camsLocation && (
          <View style={[s.fallbackBanner, { backgroundColor: theme.yellow + '22' }]}>
            <Feather name="info" size={12} color={theme.yellow} />
            <Text style={[s.fallbackText, { color: theme.yellow }]}>
              Using default location — enable location access in Settings.
            </Text>
          </View>
        )}

        {/* Location search */}
        <View style={[s.searchSection, { borderBottomColor: theme.border }]}>
          <View style={[s.searchRow, { backgroundColor: theme.bgCard, borderColor: searchFocused ? theme.red : theme.border }]}>
            <Feather name="map-pin" size={14} color={theme.red} />
            <TextInput
              style={[s.searchInput, { color: theme.textPrimary }]}
              value={searchFocused ? searchText : displayName}
              onChangeText={handleSearchChange}
              onFocus={() => {
                setSearchFocused(true);
                setSearchText('');
              }}
              onBlur={() => {
                setTimeout(() => {
                  setSearchFocused(false);
                  setSearchResults([]);
                }, 200);
              }}
              placeholder="Search city, address, or zip"
              placeholderTextColor={theme.textMuted}
              returnKeyType="search"
              autoCorrect={false}
            />
            {(!!camsLocation || (searchFocused && searchText.length > 0)) && (
              <Pressable onPress={handleClearSearch} hitSlop={8}>
                <Feather name="x" size={16} color={theme.textMuted} />
              </Pressable>
            )}
          </View>
          {usingGps && !searchFocused && gpsLoc && (
            <Text style={[s.helperText, { color: theme.textMuted }]}>Cameras near your location</Text>
          )}
          {locDenied && !camsLocation && !searchFocused && (
            <Text style={[s.helperText, { color: theme.textMuted }]}>Search a location to view cameras</Text>
          )}

          {/* Search dropdown */}
          {searchFocused && searchResults.length > 0 && (
            <View style={[s.dropdown, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              {searchResults.map((result, idx) => (
                <Pressable
                  key={`${result.lat}-${result.lng}-${idx}`}
                  style={[s.dropdownItem, { borderBottomColor: theme.border }]}
                  onPress={() => handleSelectResult(result)}
                >
                  <Feather name="map-pin" size={12} color={theme.textSecondary} />
                  <Text style={[s.dropdownText, { color: theme.textPrimary }]} numberOfLines={1}>
                    {result.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pillsRow}
          style={[s.pillsContainer, { borderBottomColor: theme.border }]}
        >
          {FILTER_PILLS.map((pill) => {
            const active = activeCamsFilter === pill.value;
            return (
              <Pressable
                key={pill.value}
                style={[
                  s.pill,
                  active
                    ? { backgroundColor: theme.red, borderColor: theme.red }
                    : { backgroundColor: theme.pillBg, borderColor: theme.pillBorder },
                ]}
                onPress={() => handleFilterChange(pill.value)}
                accessibilityLabel={`Filter by ${pill.label}`}
                accessibilityRole="button"
              >
                <Text style={[s.pillText, active ? s.pillTextActive : { color: theme.pillText }]}>{pill.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Camera grid */}
        <View style={s.content}>
          {camsLoading && !initialLoaded ? (
            <View style={s.loadingWrap}>
              <Text style={[s.loadingText, { color: theme.textSecondary }]}>Loading cameras…</Text>
            </View>
          ) : camsError ? (
            <View style={s.empty}>
              <Feather name="camera-off" size={36} color={theme.border} />
              <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>CAMERAS UNAVAILABLE</Text>
              <Text style={[s.emptyBody, { color: theme.textSecondary }]}>{camsError}</Text>
              <Pressable
                style={[s.retryBtn, { backgroundColor: theme.red }]}
                onPress={onRefresh}
                accessibilityLabel="Retry loading cameras"
                accessibilityRole="button"
              >
                <Text style={s.retryBtnText}>RETRY</Text>
              </Pressable>
            </View>
          ) : !effectiveLoc && locDenied ? (
            <View style={s.empty}>
              <Feather name="camera" size={36} color={theme.border} />
              <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>SEARCH A LOCATION</Text>
              <Text style={[s.emptyBody, { color: theme.textSecondary }]}>
                Enter a city or zip code above to view nearby cameras.
              </Text>
            </View>
          ) : initialLoaded && cameras.length === 0 ? (
            <View style={s.empty}>
              <Feather name="camera-off" size={36} color={theme.border} />
              <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>NO CAMERAS FOUND</Text>
              <Text style={[s.emptyBody, { color: theme.textSecondary }]}>
                No cameras found near {locationName || 'this location'}.{'\n'}Try searching a larger city or highway corridor.
              </Text>
            </View>
          ) : (
            rows.map((row, rowIdx) => (
              <View key={rowIdx} style={s.gridRow}>
                {row.map((camera) => (
                  <CameraCard
                    key={camera.webcamId}
                    camera={camera}
                    onPress={setSelectedCamera}
                  />
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Full-screen camera modal */}
      {selectedCamera && (
        <CameraModal camera={selectedCamera} onClose={() => setSelectedCamera(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  fallbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fallbackText: {
    fontSize: 11,
    fontWeight: '600',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  helperText: {
    fontSize: 10,
    marginTop: 6,
    letterSpacing: 0.3,
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 6,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  dropdownText: {
    fontSize: 13,
    flex: 1,
  },

  pillsContainer: {
    borderBottomWidth: 1,
  },
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
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  pillTextActive: { color: '#fff' },

  content: { padding: 16, paddingBottom: 40 },

  gridRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },

  card: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbWrap: {
    width: '100%',
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  offlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cardInfo: {
    padding: 8,
    gap: 2,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 10,
  },

  loadingWrap: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  retryBtn: {
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 4,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Modal
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    paddingTop: 54,
  },
  modalBack: {
    width: 40,
    alignItems: 'center',
  },
  modalTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  playerWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  webview: {
    flex: 1,
  },
  noPlayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  noPlayerText: {
    fontSize: 13,
  },
  modalInfo: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    gap: 4,
  },
  modalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalInfoText: {
    fontSize: 13,
  },
  modalInfoSub: {
    fontSize: 11,
    marginLeft: 19,
  },
});
