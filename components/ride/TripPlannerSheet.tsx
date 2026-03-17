import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import { useAuthStore } from '../../lib/store';
import { loadFavorites, type FavoriteLocation } from '../../lib/favorites';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Location {
  name: string;
  lat: number;
  lng: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onPlanRoute: (origin: Location, destination: Location, waypoints: Location[]) => void;
  userLocation?: { lat: number; lng: number } | null;
}

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TripPlannerSheet({ visible, onClose, onPlanRoute, userLocation }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const userId = user?.id ?? 'local';
  const translateY = useRef(new Animated.Value(800)).current;
  const [panelMounted, setPanelMounted] = useState(visible);

  // Field state
  const [origin, setOrigin] = useState<Location | null>(
    userLocation ? { name: 'My Location', lat: userLocation.lat, lng: userLocation.lng } : null,
  );
  const [destination, setDestination] = useState<Location | null>(null);
  const [waypoints, setWaypoints] = useState<(Location | null)[]>([]);
  const [activeField, setActiveField] = useState<'origin' | 'destination' | number | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animation
  const [mounted, setMounted] = useState(false);

  if (visible && !mounted) {
    setMounted(true);
    setPanelMounted(true);
    // Reset state for fresh open
    setOrigin(userLocation ? { name: 'My Location', lat: userLocation.lat, lng: userLocation.lng } : null);
    setDestination(null);
    setWaypoints([]);
    setActiveField(null);
    setQuery('');
    setResults([]);
    loadFavorites(userId).then(setFavorites);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 200,
      mass: 0.8,
    }).start();
  }

  if (!visible && mounted) {
    setMounted(false);
    Animated.timing(translateY, {
      toValue: 800,
      duration: 250,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setPanelMounted(false);
    });
  }

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const proxLng = userLocation?.lng ?? -97.7431;
        const proxLat = userLocation?.lat ?? 30.2672;
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text.trim())}.json?access_token=${TOKEN}&types=address,poi,place,postcode&limit=5&proximity=${proxLng},${proxLat}&country=us`;
        const res = await fetch(url);
        const json = await res.json();
        setResults((json.features ?? []).map((f: any) => ({
          name: f.place_name,
          lat: f.center[1],
          lng: f.center[0],
        })));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [userLocation]);

  function selectResult(loc: Location) {
    if (activeField === 'origin') setOrigin(loc);
    else if (activeField === 'destination') setDestination(loc);
    else if (typeof activeField === 'number') {
      setWaypoints((prev) => prev.map((w, i) => i === activeField ? loc : w));
    }
    setActiveField(null);
    setQuery('');
    setResults([]);
    Keyboard.dismiss();
  }

  function selectFavorite(fav: FavoriteLocation) {
    selectResult({ name: fav.nickname || fav.name, lat: fav.lat, lng: fav.lng });
  }

  function useMyLocation() {
    if (!userLocation) return;
    selectResult({ name: 'My Location', lat: userLocation.lat, lng: userLocation.lng });
  }

  function swapOriginDest() {
    const tmp = origin;
    setOrigin(destination);
    setDestination(tmp);
  }

  function addWaypoint() {
    setWaypoints((prev) => [...prev, null]);
  }

  function removeWaypoint(idx: number) {
    setWaypoints((prev) => prev.filter((_, i) => i !== idx));
  }

  function handlePlan() {
    if (!origin || !destination) return;
    const validWaypoints = waypoints.filter((w): w is Location => w !== null);
    Keyboard.dismiss();
    onPlanRoute(origin, destination, validWaypoints);
  }

  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  const canPlan = !!origin && !!destination;
  const fieldLabel = (loc: Location | null, placeholder: string) => loc?.name ?? placeholder;

  if (!panelMounted) return null;

  return (
    <Animated.View
      style={[
        s.sheet,
        { backgroundColor: theme.bgPanel, transform: [{ translateY }] },
      ]}
    >
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.border, paddingTop: insets.top + 12 }]}>
        <Text style={[s.title, { color: theme.textPrimary }]}>PLAN A TRIP</Text>
        <Pressable onPress={handleClose} hitSlop={8}>
          <Feather name="x" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={s.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Search field (shown when a field is active) */}
        {activeField !== null && (
          <View style={[s.searchWrap, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Feather name="search" size={16} color={theme.textMuted} />
            <TextInput
              style={[s.searchInput, { color: theme.textPrimary }]}
              placeholder="Search address or place..."
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={handleSearch}
              autoFocus
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color={theme.textMuted} />}
            <Pressable onPress={() => { setActiveField(null); setQuery(''); setResults([]); }} hitSlop={8}>
              <Feather name="x" size={16} color={theme.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Search results */}
        {activeField !== null && (results.length > 0 || favorites.length > 0) && (
          <View style={[s.resultsCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            {/* My Location option */}
            {userLocation && activeField === 'origin' && (
              <Pressable style={[s.resultRow, { borderBottomColor: theme.border }]} onPress={useMyLocation}>
                <Feather name="navigation" size={14} color={theme.green} />
                <Text style={[s.resultText, { color: theme.green }]}>My Location</Text>
              </Pressable>
            )}
            {results.map((r, i) => (
              <Pressable
                key={`${r.lat}-${r.lng}-${i}`}
                style={[s.resultRow, { borderBottomColor: theme.border }]}
                onPress={() => selectResult(r)}
              >
                <Feather name="map-pin" size={14} color={theme.textSecondary} />
                <Text style={[s.resultText, { color: theme.textPrimary }]} numberOfLines={1}>{r.name}</Text>
              </Pressable>
            ))}
            {/* Favorites */}
            {!query.trim() && favorites.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: theme.textMuted }]}>FAVORITES</Text>
                {favorites.map((fav, i) => (
                  <Pressable
                    key={`fav-${i}`}
                    style={[s.resultRow, { borderBottomColor: theme.border }]}
                    onPress={() => selectFavorite(fav)}
                  >
                    <Feather name="heart" size={14} color={theme.red} />
                    <Text style={[s.resultText, { color: theme.textPrimary }]} numberOfLines={1}>
                      {fav.nickname || fav.name}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}

        {/* Route fields (shown when no field is active) */}
        {activeField === null && (
          <View style={s.fieldsWrap}>
            {/* Origin */}
            <Pressable
              style={[s.field, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={() => setActiveField('origin')}
            >
              <View style={[s.fieldDot, { backgroundColor: theme.green }]} />
              <Text
                style={[s.fieldText, { color: origin ? theme.textPrimary : theme.textMuted }]}
                numberOfLines={1}
              >
                {fieldLabel(origin, 'Choose starting point')}
              </Text>
            </Pressable>

            {/* Swap button */}
            <Pressable style={[s.swapBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={swapOriginDest}>
              <Feather name="repeat" size={16} color={theme.textSecondary} />
            </Pressable>

            {/* Waypoints */}
            {waypoints.map((wp, idx) => (
              <View key={idx} style={s.waypointRow}>
                <Pressable
                  style={[s.field, { backgroundColor: theme.bgCard, borderColor: theme.border, flex: 1 }]}
                  onPress={() => setActiveField(idx)}
                >
                  <View style={[s.fieldDot, { backgroundColor: theme.orange }]} />
                  <Text
                    style={[s.fieldText, { color: wp ? theme.textPrimary : theme.textMuted }]}
                    numberOfLines={1}
                  >
                    {wp?.name ?? `Stop ${idx + 1}`}
                  </Text>
                </Pressable>
                <Pressable onPress={() => removeWaypoint(idx)} hitSlop={8} style={s.removeWp}>
                  <Feather name="x-circle" size={18} color={theme.textMuted} />
                </Pressable>
              </View>
            ))}

            {/* Add stop */}
            <Pressable style={s.addStopBtn} onPress={addWaypoint}>
              <Feather name="plus" size={14} color={theme.textSecondary} />
              <Text style={[s.addStopText, { color: theme.textSecondary }]}>Add Stop</Text>
            </Pressable>

            {/* Destination */}
            <Pressable
              style={[s.field, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={() => setActiveField('destination')}
            >
              <View style={[s.fieldDot, { backgroundColor: theme.red }]} />
              <Text
                style={[s.fieldText, { color: destination ? theme.textPrimary : theme.textMuted }]}
                numberOfLines={1}
              >
                {fieldLabel(destination, 'Choose destination')}
              </Text>
            </Pressable>

            {/* Plan route button */}
            <Pressable
              style={[s.planBtn, { backgroundColor: canPlan ? theme.red : theme.border }]}
              onPress={handlePlan}
              disabled={!canPlan}
            >
              <Feather name="navigation" size={16} color="#fff" />
              <Text style={s.planBtnText}>PLAN ROUTE</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    elevation: 19,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    padding: 16,
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },

  // Results
  resultsCard: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultText: {
    flex: 1,
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },

  // Fields
  fieldsWrap: {
    gap: 10,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  fieldDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  fieldText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  swapBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -4,
    zIndex: 1,
  },
  waypointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeWp: {
    padding: 4,
  },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addStopText: {
    fontSize: 13,
    fontWeight: '600',
  },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 8,
  },
  planBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
