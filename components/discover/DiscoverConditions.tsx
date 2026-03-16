import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
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
  type RoadCondition,
} from '../../lib/discoverStore';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_PILLS = [
  { label: 'ALL', value: 'all' },
  { label: 'CLOSURES', value: 'closures' },
  { label: 'HAZARDS', value: 'hazards' },
  { label: 'CONSTRUCTION', value: 'construction' },
  { label: 'NEAR ME < 50mi', value: 'near_me' },
];

const AUTO_REFRESH_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Haversine
// ---------------------------------------------------------------------------

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return `${Math.floor(diffMin / 1440)}d ago`;
}

function getConditionIcon(type: RoadCondition['type']): string {
  switch (type) {
    case 'closure':
      return 'alert-triangle';
    case 'construction':
      return 'tool';
    case 'hazard':
      return 'alert-circle';
    default:
      return 'info';
  }
}

// ---------------------------------------------------------------------------
// ConditionCard
// ---------------------------------------------------------------------------

interface ConditionCardProps {
  condition: RoadCondition;
  distanceMi?: number;
  hasLocation: boolean;
}

const ConditionCard = memo(function ConditionCard({ condition, distanceMi, hasLocation }: ConditionCardProps) {
  const { theme } = useTheme();

  const icon = getConditionIcon(condition.type);

  let badgeColor = theme.textMuted;
  if (distanceMi !== undefined) {
    if (distanceMi < 10) badgeColor = theme.red;
    else if (distanceMi <= 50) badgeColor = theme.yellow;
  }

  const severityColor =
    condition.severity === 'severe'
      ? theme.red
      : condition.severity === 'moderate'
        ? theme.yellow
        : theme.textMuted;

  return (
    <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={s.cardTopRow}>
        <View style={s.cardTopLeft}>
          <Feather name={icon as any} size={16} color={badgeColor} />
          {hasLocation && distanceMi !== undefined && (
            <Text style={[s.distanceText, { color: badgeColor }]}>{distanceMi.toFixed(1)} mi away</Text>
          )}
        </View>
        {condition.severity !== 'minor' && (
          <View style={[s.severityBadge, { backgroundColor: severityColor + '18', borderColor: severityColor + '55' }]}>
            <Text style={[s.severityText, { color: severityColor }]}>{condition.severity.toUpperCase()}</Text>
          </View>
        )}
      </View>

      <Text style={[s.cardRoad, { color: theme.textPrimary }]} numberOfLines={2}>
        {condition.title}
        {condition.description ? ` — ${condition.description}` : ''}
      </Text>

      <Text style={[s.cardTime, { color: theme.textMuted }]}>Reported {relativeTime(condition.reportedAt)}</Text>
    </View>
  );
});

// ---------------------------------------------------------------------------
// DiscoverConditions
// ---------------------------------------------------------------------------

export default function DiscoverConditions() {
  const { theme } = useTheme();
  const {
    conditions,
    conditionsLoading,
    conditionsLastFetched,
    activeConditionsFilter,
    conditionsLocation,
    fetchConditions,
    setConditionsFilter,
    setConditionsLocation,
  } = useDiscoverStore();

  const [gpsLoc, setGpsLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsName, setGpsName] = useState<string>('');
  const [locDenied, setLocDenied] = useState(false);
  const [gpsFallback, setGpsFallback] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(conditionsLastFetched !== null);

  // Search state
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The effective location for fetching + distance calculation
  const effectiveLoc = conditionsLocation ?? (gpsLoc ? { ...gpsLoc, name: gpsName } : null);
  const usingGps = conditionsLocation === null;

  // Load conditions for a given location
  const loadConditions = useCallback(
    async (lat: number, lng: number, isRefresh = false) => {
      if (isRefresh) {
        useDiscoverStore.setState({ conditionsLastFetched: null });
      }
      await fetchConditions(lat, lng);
      setInitialLoaded(true);
    },
    [fetchConditions],
  );

  // Get GPS location on mount
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

      // Reverse geocode for display name
      const name = didFallback ? 'Austin, TX' : await reverseGeocode(lat, lng);
      setGpsName(name);

      // If no custom location set, fetch conditions for GPS
      if (!useDiscoverStore.getState().conditionsLocation) {
        loadConditions(lat, lng);
      }
    })();
  }, []);

  // If a custom location is already set on mount, fetch for it
  useEffect(() => {
    if (conditionsLocation) {
      loadConditions(conditionsLocation.lat, conditionsLocation.lng);
    }
  }, []);

  // Auto-refresh every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      const loc = useDiscoverStore.getState().conditionsLocation;
      const target = loc ?? gpsLoc;
      if (target) {
        useDiscoverStore.setState({ conditionsLastFetched: null });
        fetchConditions(target.lat, target.lng);
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchConditions, gpsLoc]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const target = conditionsLocation ?? gpsLoc;
    if (target) {
      await loadConditions(target.lat, target.lng, true);
    }
    setRefreshing(false);
  }, [loadConditions, conditionsLocation, gpsLoc]);

  // Debounced geocoding search
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
      setConditionsLocation(result);
      useDiscoverStore.setState({ conditionsLastFetched: null });
      loadConditions(result.lat, result.lng);
    },
    [setConditionsLocation, loadConditions],
  );

  const handleClearSearch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchText('');
    setSearchResults([]);
    setConditionsLocation(null);
    // Re-fetch for GPS location
    if (gpsLoc) {
      useDiscoverStore.setState({ conditionsLastFetched: null });
      loadConditions(gpsLoc.lat, gpsLoc.lng);
    }
  }, [setConditionsLocation, gpsLoc, loadConditions]);

  // Distance calculations
  const conditionsWithDistance = useMemo(() => {
    const loc = effectiveLoc;
    return conditions.map((c) => {
      const dist = loc ? haversineMiles(loc.lat, loc.lng, c.lat, c.lng) : undefined;
      return { condition: c, distanceMi: dist };
    });
  }, [conditions, effectiveLoc]);

  const filtered = useMemo(() => {
    let list = [...conditionsWithDistance];

    switch (activeConditionsFilter) {
      case 'closures':
        list = list.filter((c) => c.condition.type === 'closure');
        break;
      case 'hazards':
        list = list.filter((c) => c.condition.type === 'hazard');
        break;
      case 'construction':
        list = list.filter((c) => c.condition.type === 'construction');
        break;
      case 'near_me':
        list = list.filter((c) => c.distanceMi !== undefined && c.distanceMi <= 50);
        break;
    }

    if (effectiveLoc) {
      list.sort((a, b) => (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity));
    } else {
      const sevOrder = { severe: 0, moderate: 1, minor: 2 };
      list.sort((a, b) => sevOrder[a.condition.severity] - sevOrder[b.condition.severity]);
    }

    return list;
  }, [conditionsWithDistance, activeConditionsFilter, effectiveLoc]);

  const lastUpdatedText = useMemo(() => {
    if (!conditionsLastFetched) return '';
    const mins = Math.floor((Date.now() - conditionsLastFetched) / 60_000);
    if (mins < 1) return 'Updated just now';
    return `Updated ${mins} min ago`;
  }, [conditionsLastFetched, conditions]);

  const hasLocation = !!effectiveLoc;

  // Display name in the search input
  const displayName = searchFocused
    ? searchText
    : conditionsLocation
      ? conditionsLocation.name
      : gpsName || '';

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.red} />}
    >
      {/* GPS fallback banner */}
      {gpsFallback && !conditionsLocation && (
        <View style={[s.fallbackBanner, { backgroundColor: theme.yellow + '22' }]}>
          <Feather name="info" size={12} color={theme.yellow} />
          <Text style={[s.fallbackText, { color: theme.yellow }]}>
            Using default location — enable location access in Settings.
          </Text>
        </View>
      )}

      {/* Last updated + refresh row */}
      {!!lastUpdatedText && (
        <View style={s.updatedRow}>
          <Text style={[s.lastUpdated, { color: theme.textMuted }]}>{lastUpdatedText}</Text>
          <Pressable
            onPress={onRefresh}
            style={[s.refreshBtn, { borderColor: theme.border }]}
            accessibilityLabel="Refresh conditions"
            accessibilityRole="button"
          >
            <Feather name="refresh-cw" size={12} color={theme.textSecondary} />
            <Text style={[s.refreshBtnText, { color: theme.textSecondary }]}>Refresh</Text>
          </Pressable>
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
          {(!!conditionsLocation || (searchFocused && searchText.length > 0)) && (
            <Pressable onPress={handleClearSearch} hitSlop={8}>
              <Feather name="x" size={16} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
        {usingGps && !searchFocused && gpsLoc && (
          <Text style={[s.helperText, { color: theme.textMuted }]}>Using your current location</Text>
        )}
        {locDenied && !conditionsLocation && !searchFocused && (
          <Text style={[s.helperText, { color: theme.textMuted }]}>Search a location to view conditions</Text>
        )}

        {/* Search results dropdown */}
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
          const active = activeConditionsFilter === pill.value;
          return (
            <Pressable
              key={pill.value}
              style={[
                s.pill,
                active
                  ? { backgroundColor: theme.red, borderColor: theme.red }
                  : { backgroundColor: theme.pillBg, borderColor: theme.pillBorder },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setConditionsFilter(pill.value);
              }}
              accessibilityLabel={`Filter by ${pill.label}`}
              accessibilityRole="button"
            >
              <Text style={[s.pillText, active ? s.pillTextActive : { color: theme.pillText }]}>{pill.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Count header */}
      {initialLoaded && hasLocation && conditions.length > 0 && (
        <View style={s.countRow}>
          <Text style={[s.countText, { color: theme.textSecondary }]}>
            {conditions.length} active near {effectiveLoc?.name ?? 'your location'}
          </Text>
        </View>
      )}

      {/* Conditions list */}
      <View style={s.content}>
        {conditionsLoading && !initialLoaded ? (
          <View style={s.loadingWrap}>
            <Text style={[s.loadingText, { color: theme.textSecondary }]}>Loading conditions…</Text>
          </View>
        ) : !hasLocation && !conditionsLocation && locDenied ? (
          <View style={s.empty}>
            <Feather name="map" size={36} color={theme.border} />
            <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>SEARCH A LOCATION</Text>
            <Text style={[s.emptyBody, { color: theme.textSecondary }]}>
              Enter a city or zip code above to view road conditions.
            </Text>
          </View>
        ) : initialLoaded && conditions.length === 0 ? (
          <View style={s.empty}>
            <Feather name="check-circle" size={36} color={theme.border} />
            <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>ALL CLEAR</Text>
            <Text style={[s.emptyBody, { color: theme.textSecondary }]}>
              No active conditions reported near {effectiveLoc?.name ?? 'this location'}.{'\n'}Data powered by HERE Traffic.
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptySmall}>
            <Text style={[s.emptyText, { color: theme.textSecondary }]}>
              No conditions match this filter.
            </Text>
          </View>
        ) : (
          filtered.map(({ condition, distanceMi }) => (
            <ConditionCard
              key={condition.id}
              condition={condition}
              distanceMi={distanceMi}
              hasLocation={hasLocation}
            />
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
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  lastUpdated: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  refreshBtnText: {
    fontSize: 10,
    fontWeight: '600',
  },

  searchSection: {
    paddingHorizontal: 16,
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

  countRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  content: { paddingHorizontal: 16, paddingBottom: 40 },

  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  severityBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  severityText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  cardRoad: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  cardTime: {
    fontSize: 11,
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
  emptySmall: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
