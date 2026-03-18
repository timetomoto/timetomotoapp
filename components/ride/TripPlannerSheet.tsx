import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
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
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '../../lib/useTheme';
import { useAuthStore } from '../../lib/store';
import { loadFavorites, type FavoriteLocation } from '../../lib/favorites';
import { fetchDirections } from '../../lib/directions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Location {
  name: string;
  lat: number;
  lng: number;
}

export interface TripPreviewState {
  origin: Location | null;
  destination: Location | null;
  waypoints: Location[];
  routeGeojson: any | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onPlanRoute: (origin: Location, destination: Location, waypoints: Location[]) => void;
  onPreviewUpdate?: (preview: TripPreviewState) => void;
  userLocation?: { lat: number; lng: number } | null;
}

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const { height: SCREEN_H } = Dimensions.get('window');
const EXPANDED_H = SCREEN_H * 0.55;
const COLLAPSED_H = SCREEN_H * 0.25;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TripPlannerSheet({ visible, onClose, onPlanRoute, onPreviewUpdate, userLocation }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const userId = user?.id ?? 'local';

  // Sheet animation
  const sheetHeight = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
  const routeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewRoute, setPreviewRoute] = useState<any>(null);

  // Mount/unmount animation
  useEffect(() => {
    if (visible && !mounted) {
      setMounted(true);
      setCollapsed(false);
      setOrigin(userLocation ? { name: 'My Location', lat: userLocation.lat, lng: userLocation.lng } : null);
      setDestination(null);
      setWaypoints([]);
      setActiveField(null);
      setQuery('');
      setResults([]);
      setPreviewRoute(null);
      loadFavorites(userId).then(setFavorites);
      Animated.spring(sheetHeight, { toValue: EXPANDED_H, useNativeDriver: false, damping: 20, stiffness: 180 }).start();
    }
    if (!visible && mounted) {
      setMounted(false);
      Animated.timing(sheetHeight, { toValue: 0, duration: 250, useNativeDriver: false }).start();
      // Clear preview
      onPreviewUpdate?.({ origin: null, destination: null, waypoints: [], routeGeojson: null });
    }
  }, [visible]);

  // Send preview updates to parent map
  useEffect(() => {
    if (!mounted) return;
    const validWps = waypoints.filter((w): w is Location => w !== null);
    onPreviewUpdate?.({ origin, destination, waypoints: validWps, routeGeojson: previewRoute });
  }, [origin, destination, waypoints, previewRoute, mounted]);

  // Debounced route preview fetch
  useEffect(() => {
    if (!origin || !destination || !mounted) {
      setPreviewRoute(null);
      return;
    }
    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    routeDebounceRef.current = setTimeout(async () => {
      try {
        const validWps = waypoints.filter((w): w is Location => w !== null).map((w) => ({ lng: w.lng, lat: w.lat }));
        const routes = await fetchDirections(origin.lng, origin.lat, destination.lng, destination.lat, 'fastest', validWps.length > 0 ? validWps : undefined);
        if (routes.length > 0) {
          setPreviewRoute(routes[0].geometry);
          // Collapse sheet to show map
          if (!collapsed) {
            setCollapsed(true);
            Animated.spring(sheetHeight, { toValue: COLLAPSED_H, useNativeDriver: false, damping: 20, stiffness: 180 }).start();
          }
        }
      } catch { /* silent — preview is best-effort */ }
    }, 800);
    return () => { if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current); };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, waypoints]);

  function expandSheet() {
    setCollapsed(false);
    Animated.spring(sheetHeight, { toValue: EXPANDED_H, useNativeDriver: false, damping: 20, stiffness: 180 }).start();
  }

  function collapseSheet() {
    setCollapsed(true);
    Keyboard.dismiss();
    Animated.spring(sheetHeight, { toValue: COLLAPSED_H, useNativeDriver: false, damping: 20, stiffness: 180 }).start();
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 60) collapseSheet();
        else if (g.dy < -40) expandSheet();
      },
    }),
  ).current;

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
    expandSheet();
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

  if (!mounted && !visible) return null;

  return (
    <Animated.View style={[s.sheet, { backgroundColor: theme.bgPanel, height: sheetHeight, paddingBottom: insets.bottom }]}>
      {/* Handle */}
      <View {...panResponder.panHandlers} style={s.handleZone}>
        <View style={[s.handle, { backgroundColor: theme.border }]} />
      </View>

      {/* Collapsed summary */}
      {collapsed && !activeField ? (
        <Pressable style={s.collapsedContent} onPress={expandSheet}>
          <View style={s.collapsedRow}>
            <View style={[s.fieldDot, { backgroundColor: theme.green }]} />
            <Text style={[s.collapsedText, { color: theme.textPrimary }]} numberOfLines={1}>{origin?.name ?? 'Start'}</Text>
          </View>
          <Feather name="arrow-right" size={14} color={theme.textMuted} />
          <View style={s.collapsedRow}>
            <View style={[s.fieldDot, { backgroundColor: theme.red }]} />
            <Text style={[s.collapsedText, { color: theme.textPrimary }]} numberOfLines={1}>{destination?.name ?? 'End'}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable style={[s.planBtnSmall, { backgroundColor: theme.red }]} onPress={handlePlan} disabled={!canPlan}>
            <Text style={s.planBtnSmallText}>GO</Text>
          </Pressable>
          <Pressable onPress={handleClose} hitSlop={8} style={{ padding: 4 }}>
            <Feather name="x" size={18} color={theme.textMuted} />
          </Pressable>
        </Pressable>
      ) : (
        /* Expanded content */
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={s.headerRow}>
              <Text style={[s.title, { color: theme.textPrimary }]}>PLAN A TRIP</Text>
              <Pressable onPress={handleClose} hitSlop={8}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

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
                {userLocation && activeField === 'origin' && (
                  <Pressable style={[s.resultRow, { borderBottomColor: theme.border }]} onPress={useMyLocation}>
                    <Feather name="navigation" size={14} color={theme.green} />
                    <Text style={[s.resultText, { color: theme.green }]}>My Location</Text>
                  </Pressable>
                )}
                {results.map((r, i) => (
                  <Pressable key={`${r.lat}-${r.lng}-${i}`} style={[s.resultRow, { borderBottomColor: theme.border }]} onPress={() => selectResult(r)}>
                    <Feather name="map-pin" size={14} color={theme.textSecondary} />
                    <Text style={[s.resultText, { color: theme.textPrimary }]} numberOfLines={1}>{r.name}</Text>
                  </Pressable>
                ))}
                {!query.trim() && favorites.length > 0 && (
                  <>
                    <Text style={[s.sectionLabel, { color: theme.textMuted }]}>FAVORITES</Text>
                    {favorites.map((fav, i) => (
                      <Pressable key={`fav-${i}`} style={[s.resultRow, { borderBottomColor: theme.border }]} onPress={() => selectFavorite(fav)}>
                        <Feather name="heart" size={14} color={theme.red} />
                        <Text style={[s.resultText, { color: theme.textPrimary }]} numberOfLines={1}>{fav.nickname || fav.name}</Text>
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
                <Pressable style={[s.field, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => setActiveField('origin')}>
                  <View style={[s.fieldDot, { backgroundColor: theme.green }]} />
                  <Text style={[s.fieldText, { color: origin ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>
                    {fieldLabel(origin, 'Choose starting point')}
                  </Text>
                </Pressable>

                {/* Swap button */}
                <Pressable style={s.swapWrap} onPress={swapOriginDest}>
                  <View style={[s.swapBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                    <Feather name="repeat" size={16} color={theme.textSecondary} />
                  </View>
                  <Text style={[s.swapLabel, { color: theme.textMuted }]}>Swap starting point & destination</Text>
                </Pressable>

                {/* Waypoints */}
                {waypoints.length > 0 && (
                  <GestureHandlerRootView>
                    <DraggableFlatList
                      data={waypoints.map((wp, i) => ({ wp, idx: i }))}
                      keyExtractor={(item) => String(item.idx)}
                      scrollEnabled={false}
                      onDragEnd={({ data }) => setWaypoints(data.map((d) => d.wp))}
                      renderItem={({ item, drag, isActive }: RenderItemParams<{ wp: Location | null; idx: number }>) => (
                        <View style={[s.waypointRow, isActive && { opacity: 0.85 }]}>
                          <Pressable style={[s.field, { backgroundColor: theme.bgCard, borderColor: theme.border, flex: 1 }]} onPress={() => setActiveField(item.idx)}>
                            <View style={[s.fieldDot, { backgroundColor: theme.orange }]} />
                            <Text style={[s.fieldText, { color: item.wp ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>
                              {item.wp?.name ?? `Stop ${item.idx + 1}`}
                            </Text>
                          </Pressable>
                          <Pressable onPress={() => removeWaypoint(item.idx)} hitSlop={6} style={s.removeWp}>
                            <Feather name="x-circle" size={16} color={theme.textMuted} />
                          </Pressable>
                          <Pressable onLongPress={drag} delayLongPress={150} hitSlop={6} style={s.dragHandle}>
                            <Feather name="menu" size={16} color={theme.textMuted} />
                          </Pressable>
                        </View>
                      )}
                    />
                  </GestureHandlerRootView>
                )}

                {/* Add stop */}
                <Pressable style={s.addStopBtn} onPress={addWaypoint}>
                  <Feather name="plus" size={14} color={theme.textSecondary} />
                  <Text style={[s.addStopText, { color: theme.textSecondary }]}>Add Stop</Text>
                </Pressable>

                {/* Destination */}
                <Pressable style={[s.field, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => setActiveField('destination')}>
                  <View style={[s.fieldDot, { backgroundColor: theme.red }]} />
                  <Text style={[s.fieldText, { color: destination ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>
                    {fieldLabel(destination, 'Choose destination')}
                  </Text>
                </Pressable>

                {/* Plan route button */}
                <Pressable style={[s.planBtn, { backgroundColor: canPlan ? theme.red : theme.border }]} onPress={handlePlan} disabled={!canPlan}>
                  <Feather name="navigation" size={16} color="#fff" />
                  <Text style={s.planBtnText}>PLAN ROUTE</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 9998,
    elevation: 19,
    overflow: 'hidden',
  },
  handleZone: {
    paddingTop: 8,
    paddingBottom: 6,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },

  // Collapsed
  collapsedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    flex: 1,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '30%',
  },
  collapsedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  planBtnSmall: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  planBtnSmallText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
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
  resultText: { flex: 1, fontSize: 13 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },

  // Fields
  fieldsWrap: { gap: 10 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  fieldDot: { width: 10, height: 10, borderRadius: 5 },
  fieldText: { flex: 1, fontSize: 14, fontWeight: '500' },
  swapWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    marginVertical: -4,
    zIndex: 1,
  },
  swapLabel: { fontSize: 11 },
  swapBtn: {
    borderWidth: 1,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeWp: { padding: 4 },
  dragHandle: { padding: 4 },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addStopText: { fontSize: 13, fontWeight: '600' },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 8,
  },
  planBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
});
