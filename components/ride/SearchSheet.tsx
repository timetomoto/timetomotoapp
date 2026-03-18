import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../lib/useTheme';
import { useAuthStore } from '../../lib/store';
import { loadFavorites, type FavoriteLocation } from '../../lib/favorites';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Destination {
  name: string;
  lat: number;
  lng: number;
}

interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number];
  text: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectDestination: (dest: Destination) => void;
  initialQuery?: string;
  userLocation?: { lat: number; lng: number } | null;
}

const RECENTS_KEY = 'ttm_nav_recents';
const MAX_RECENTS = 5;
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadRecents(): Promise<Destination[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as Destination[]) : [];
  } catch {
    return [];
  }
}

async function saveRecent(dest: Destination): Promise<void> {
  try {
    const existing = await loadRecents();
    const filtered = existing.filter(
      (r) => !(r.lat === dest.lat && r.lng === dest.lng),
    );
    const updated = [dest, ...filtered].slice(0, MAX_RECENTS);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchSheet({ visible, onClose, onSelectDestination, initialQuery, userLocation }: Props) {
  const { theme } = useTheme();
  const translateY = useRef(new Animated.Value(800)).current;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<Destination[]>([]);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const { user } = useAuthStore();
  const userId = user?.id ?? 'local';
  const [panelMounted, setPanelMounted] = useState(visible);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setPanelMounted(true);
      if (initialQuery) setQuery(initialQuery);
      loadRecents().then(setRecents);
      loadFavorites(userId).then(setFavorites);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 200,
        mass: 0.8,
      }).start(() => {
        inputRef.current?.focus();
      });
    } else {
      Animated.timing(translateY, {
        toValue: 800,
        duration: 250,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setPanelMounted(false);
      });
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(query.trim());
        const proxLng = userLocation?.lng ?? -97.7431;
        const proxLat = userLocation?.lat ?? 30.2672;
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${TOKEN}&types=address,poi,place,postcode&limit=5&proximity=${proxLng},${proxLat}&country=us`;
        const res = await fetch(url);
        const json = await res.json();
        setResults(json.features ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  function handleSelect(dest: Destination) {
    saveRecent(dest);
    onSelectDestination(dest);
    onClose();
  }


  if (!panelMounted) return null;

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          backgroundColor: theme.bgPanel,
          transform: [{ translateY }],
        },
      ]}
    >
      {/* Header row */}
      <View style={[styles.headerRow, { borderBottomColor: theme.border }]}>
        <Feather name="search" size={18} color={theme.textMuted} style={styles.searchIcon} />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.textPrimary }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search destination..."
          placeholderTextColor={theme.textMuted}
          autoFocus={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {loading && <ActivityIndicator size="small" color={theme.textMuted} style={styles.spinner} />}
        <Pressable onPress={() => { Keyboard.dismiss(); onClose(); }} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: theme.red }]}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {/* Search results */}
        {results.length > 0 &&
          results.map((feature) => {
            const [lng, lat] = feature.center;
            return (
              <Pressable
                key={feature.id}
                style={[styles.resultRow, { borderBottomColor: theme.border }]}
                onPress={() =>
                  handleSelect({ name: feature.place_name, lat, lng })
                }
              >
                <View style={[styles.resultIcon, { backgroundColor: theme.bgCard }]}>
                  <Feather name="map-pin" size={14} color={theme.red} />
                </View>
                <View style={styles.resultText}>
                  <Text style={[styles.resultName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {feature.place_name}
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={theme.textMuted} />
              </Pressable>
            );
          })}

        {/* Favorite destinations — show at top when query is empty */}
        {!query.trim() && favorites.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              FAVORITES
            </Text>
            {[...favorites].sort((a, b) => (b.is_home ? 1 : 0) - (a.is_home ? 1 : 0)).map((fav, idx) => (
              <Pressable
                key={`fav-${fav.lat}-${fav.lng}-${idx}`}
                style={[styles.resultRow, { borderBottomColor: theme.border }]}
                onPress={() => handleSelect({ name: fav.nickname || fav.name, lat: fav.lat, lng: fav.lng })}
              >
                <View style={[styles.resultIcon, { backgroundColor: theme.bgCard }]}>
                  <Ionicons name="heart" size={14} color={theme.red} />
                </View>
                <View style={styles.resultText}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.resultName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {fav.nickname || fav.name}
                    </Text>
                    {fav.is_home && <Feather name="home" size={12} color={theme.green} style={{ marginLeft: 4 }} />}
                  </View>
                  {fav.nickname ? (
                    <Text style={[styles.resultAddress, { color: theme.textMuted }]} numberOfLines={1}>
                      {fav.name}
                    </Text>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={14} color={theme.textMuted} />
              </Pressable>
            ))}
          </>
        )}

        {/* Recent destinations — show when query is empty */}
        {!query.trim() && recents.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              RECENT DESTINATIONS
            </Text>
            {recents.map((dest, idx) => {
              const isFav = favorites.some((f) => f.name === dest.name && f.lat === dest.lat && f.lng === dest.lng);
              return (
                <Pressable
                  key={`${dest.lat}-${dest.lng}-${idx}`}
                  style={[styles.resultRow, { borderBottomColor: theme.border }]}
                  onPress={() => handleSelect(dest)}
                >
                  <View style={[styles.resultIcon, { backgroundColor: theme.bgCard }]}>
                    {isFav ? (
                      <Ionicons name="heart" size={14} color={theme.red} />
                    ) : (
                      <Feather name="clock" size={14} color={theme.textSecondary} />
                    )}
                  </View>
                  <View style={styles.resultText}>
                    <Text style={[styles.resultName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {dest.name}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={14} color={theme.textMuted} />
                </Pressable>
              );
            })}
          </>
        )}

        {/* Empty state */}
        {!query.trim() && recents.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="search" size={32} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              Search for a destination
            </Text>
          </View>
        )}

        {/* No results */}
        {query.trim().length > 0 && !loading && results.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="map-pin" size={32} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>No results found</Text>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9997,
    elevation: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchIcon: {
    marginRight: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: 40,
  },
  spinner: {
    marginRight: 4,
  },
  cancelBtn: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
  },
  list: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
  },
  resultAddress: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
});
