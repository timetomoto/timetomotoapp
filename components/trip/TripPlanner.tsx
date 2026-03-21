import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import Mapbox, { Camera, LineLayer, MapView, PointAnnotation, ShapeSource } from '@rnmapbox/maps';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import { useAuthStore, useMapStyleStore, useRoutesStore, useSafetyStore, useTripPlannerStore } from '../../lib/store';
import { useNavigationStore } from '../../lib/navigationStore';
import { loadFavorites, type FavoriteLocation } from '../../lib/favorites';
import { fetchDirections } from '../../lib/directions';
import { createRoute, fetchUserRoutes, seedRoutes } from '../../lib/routes';
import { serializeGpx } from '../../lib/gpx';
import { fetchRouteWeather, hasRouteWeatherConcern, getRouteWarningMessage, haversineKm, sampleRouteCoordinates, type RouteWeatherPoint } from '../../lib/routeWeather';
import { codeMeta } from '../../lib/weather';
import { fetchHEREConditions, type RoadCondition } from '../../lib/discoverStore';
import { darkTheme } from '../../lib/theme';
import type { Route } from '../../lib/routes';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const { height: SCREEN_H } = Dimensions.get('window');
const AUSTIN = [-97.7431, 30.2672] as [number, number];

interface Loc { name: string; lat: number; lng: number; }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function reverseGeocodeLoc(lat: number, lng: number): Promise<string> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!place) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const parts = [place.name, place.street, place.city].filter(Boolean);
    return parts.slice(0, 2).join(', ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
}

function addDays(d: Date, n: number): Date { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function daysBetween(a: Date, b: Date): number { return Math.floor((b.getTime() - a.getTime()) / 86_400_000); }

/**
 * Find the cumulative distance along a route to the nearest point to the given coordinate.
 * Returns { distanceKm, offsetKm } where offsetKm is the perpendicular distance from the route.
 */
function getRouteMileMarker(routeCoords: [number, number][], lat: number, lng: number): { distanceKm: number; offsetKm: number } {
  let bestDist = Infinity;
  let bestCumDist = 0;
  let cumDist = 0;
  for (let i = 0; i < routeCoords.length; i++) {
    const [rLng, rLat] = routeCoords[i];
    if (i > 0) {
      const [pLng, pLat] = routeCoords[i - 1];
      cumDist += haversineKm(pLat, pLng, rLat, rLng);
    }
    const d = haversineKm(lat, lng, rLat, rLng);
    if (d < bestDist) {
      bestDist = d;
      bestCumDist = cumDist;
    }
  }
  return { distanceKm: bestCumDist, offsetKm: bestDist };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TripPlanner() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { routes: savedRoutes, addRoute, loading: routesStoreLoading, setRoutes, setLoading: setRoutesLoading } = useRoutesStore();
  const userId = user?.id ?? 'local';
  const cameraRef = useRef<Camera>(null);
  const isDark = theme.bg === darkTheme.bg;
  const mapStyle = useMapStyleStore((s) => s.mapStyle);

  const [mapStyleReady, setMapStyleReady] = useState(false);
  const routeGeojsonRef = useRef<any>(null);

  // Bottom sheet snap points
  const SNAP_COLLAPSED = SCREEN_H * 0.50 + 45;
  const SNAP_EXPANDED = SCREEN_H - 65;
  const panelY = useRef(new Animated.Value(SCREEN_H - SNAP_COLLAPSED)).current;
  const lastPanelY = useRef(SCREEN_H - SNAP_COLLAPSED);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 10,
      onPanResponderGrant: () => {
        lastPanelY.current = (panelY as any)._value;
      },
      onPanResponderMove: (_, g) => {
        const newY = Math.max(SCREEN_H - SNAP_EXPANDED, Math.min(SCREEN_H - SNAP_COLLAPSED, lastPanelY.current + g.dy));
        panelY.setValue(newY);
      },
      onPanResponderRelease: (_, g) => {
        const threshold = SCREEN_H * 0.1;
        if (g.dy < -threshold) {
          // Swipe up → expand panel
          Animated.spring(panelY, { toValue: SCREEN_H - SNAP_EXPANDED, useNativeDriver: false, tension: 80, friction: 14 }).start();
        } else {
          // Swipe down → collapse panel
          Animated.spring(panelY, { toValue: SCREEN_H - SNAP_COLLAPSED, useNativeDriver: false, tension: 80, friction: 14 }).start();
        }
      },
    })
  ).current;

  // ── Persisted state (survives tab switches) ──
  const {
    tripOrigin: origin, setTripOrigin: setOrigin,
    tripDestination: destination, setTripDestination: setDestination,
    tripWaypoints: waypoints, setTripWaypoints: setWaypoints,
    tripDeparture: departure, setTripDeparture: setDeparture,
    tripCustomDate: customDate, setTripCustomDate: setCustomDate,
    tripRouteGeojson: routeGeojson, tripRouteDistance: routeDistance, tripRouteDuration: routeDuration,
    setTripRoute,
    tripWeatherPoints: weatherPoints, tripWeatherMsg: weatherMsg,
    tripWeatherHasConcern: weatherHasConcern, tripWeatherCheckpoints: weatherCheckpoints,
    tripWeatherFetchedAt: weatherFetchedAt,
    setTripWeather,
    tripConditions: conditions, tripConditionsFetchedAt: conditionsFetchedAt,
    setTripConditions,
    tripSaved: saved, setTripSaved: setSaved,
    clearTrip,
  } = useTripPlannerStore();

  // ── Ephemeral UI state (OK to reset on remount) ──
  const [activeField, setActiveField] = useState<'origin' | 'destination' | number | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Loc[]>([]);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Route loading
  const [routeLoading, setRouteLoading] = useState(false);
  const routeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Weather UI
  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherUseCelsius, setWeatherUseCelsius] = useState(false);
  const [weatherUseMiles, setWeatherUseMiles] = useState(true);

  // Road conditions UI
  const [conditionsExpanded, setConditionsExpanded] = useState(false);
  const [conditionsLoading, setConditionsLoading] = useState(false);
  const [conditionFilter, setConditionFilter] = useState<'all' | 'construction' | 'hazard' | 'closure'>('all');

  // Date picker UI
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Stale TTLs
  const WEATHER_TTL = 30 * 60 * 1000;
  const ROAD_TTL = 15 * 60 * 1000;
  const isWeatherStale = weatherFetchedAt ? Date.now() - weatherFetchedAt > WEATHER_TTL : false;
  const isConditionsStale = conditionsFetchedAt ? Date.now() - conditionsFetchedAt > ROAD_TTL : false;

  // Marker dragging
  const [draggingMarker, setDraggingMarker] = useState<'origin' | 'destination' | number | null>(null);
  const dragRouteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Camera control — prevent auto-fit while user is placing points
  const userIsPlacingPoints = useRef(false);
  const placingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function markUserPlacing() {
    userIsPlacingPoints.current = true;
    if (placingTimeoutRef.current) clearTimeout(placingTimeoutRef.current);
    placingTimeoutRef.current = setTimeout(() => { userIsPlacingPoints.current = false; }, 2000);
  }

  function fitRoute() {
    const geojson = routeGeojsonRef.current;
    if (!geojson?.coordinates || geojson.coordinates.length < 2) return;
    const coords = geojson.coordinates;
    const lats = coords.map((c: number[]) => c[1]);
    const lngs = coords.map((c: number[]) => c[0]);
    // Bottom padding accounts for the collapsed panel covering the lower portion
    cameraRef.current?.fitBounds([Math.max(...lngs), Math.max(...lats)], [Math.min(...lngs), Math.min(...lats)], [40, 40, SNAP_COLLAPSED * 0.7, 40], 600);
  }

  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Save modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('Planned Rides');
  const [saving, setSaving] = useState(false);

  // Keep routeGeojson ref in sync for toggleMap closure
  useEffect(() => { routeGeojsonRef.current = routeGeojson; }, [routeGeojson]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (dragRouteDebounceRef.current) clearTimeout(dragRouteDebounceRef.current);
    if (placingTimeoutRef.current) clearTimeout(placingTimeoutRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => { loadFavorites(userId).then(setFavorites); }, [userId]);

  // Load routes if not already in store (skip if no auth — 'local' is not a valid UUID)
  useEffect(() => {
    if (savedRoutes.length > 0 || !user?.id) return;
    let cancelled = false;
    (async () => {
      setRoutesLoading(true);
      await seedRoutes(user.id).catch(() => {});
      const fetched = await fetchUserRoutes(user.id);
      if (!cancelled) { setRoutes(fetched); setRoutesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Auto-set origin + center camera on user location
  useEffect(() => {
    // If stops already exist (returning with existing route), fit to them instead
    if (origin || destination) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        // Try instant cached position first
        let coords: { latitude: number; longitude: number } | null = null;
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          coords = lastKnown.coords;
        } else {
          // Fallback to fresh position with timeout
          const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coords = fresh.coords;
        }
        if (coords) {
          cameraRef.current?.setCamera({ centerCoordinate: [coords.longitude, coords.latitude], zoomLevel: 11, animationDuration: 500 });
          const name = await reverseGeocodeLoc(coords.latitude, coords.longitude);
          setOrigin({ name, lat: coords.latitude, lng: coords.longitude });
        }
      } catch {
        // Fall back to default (Austin) — already set in Camera defaultSettings
      }
    })();
  }, []);

  // Debounced route fetch + weather + conditions
  useEffect(() => {
    if (!origin || !destination) { setTripRoute(null, 0, 0); setTripConditions([]); return; }
    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    setRouteLoading(true);
    routeDebounceRef.current = setTimeout(async () => {
      try {
        const wps = waypoints.map((w) => ({ lng: w.lng, lat: w.lat }));
        const routes = await fetchDirections(origin.lng, origin.lat, destination.lng, destination.lat, 'fastest', wps.length > 0 ? wps : undefined);
        if (routes.length > 0) {
          const r = routes[0];
          setTripRoute(r.geometry, r.distanceMiles, r.durationSeconds);
          setSaved(false);
          const coords = r.geometry.coordinates;

          // Fetch weather
          const dOut = daysBetween(new Date(), departure);
          if (dOut <= 16) {
            setWeatherLoading(true);
            fetchRouteWeather(coords)
              .then(({ points, useCelsius, useMiles }) => {
                setWeatherUseCelsius(useCelsius);
                setWeatherUseMiles(useMiles);
                let msg: string | null; let concern: boolean;
                if (points.length === 0 || points.every((p) => p.temp === 0)) { msg = 'Unable to check route weather.'; concern = false; }
                else if (!hasRouteWeatherConcern(points, useCelsius)) { msg = 'Clear conditions along this route.'; concern = false; }
                else { msg = getRouteWarningMessage(points, useCelsius) ?? 'Check conditions before riding.'; concern = true; }
                setTripWeather(points, msg, concern, points.length);
              })
              .catch(() => { setTripWeather([], 'Unable to check route weather.', false, 0); })
              .finally(() => setWeatherLoading(false));
          } else { setTripWeather([], null, false, 0); }

          // Fetch road conditions along route
          setConditionsLoading(true);
          const samples = sampleRouteCoordinates(coords, 30);
          const allConditions: RoadCondition[] = [];
          const seenIds = new Set<string>();
          for (const sample of samples.slice(0, 5)) { // Limit to 5 sample points
            try {
              const conds = await fetchHEREConditions(sample.lat, sample.lng);
              for (const c of conds) {
                if (!seenIds.has(c.id)) { seenIds.add(c.id); allConditions.push(c); }
              }
            } catch {}
            if (samples.indexOf(sample) < samples.length - 1) await new Promise((r) => setTimeout(r, 300));
          }
          allConditions.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
          setTripConditions(allConditions);
          setConditionsLoading(false);
        }
      } catch {}
      setRouteLoading(false);
    }, 800);
    return () => { if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current); };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, waypoints.length, waypoints.map((w) => `${w.lat},${w.lng}`).join('|')]);

  // Map tap
  function handleMapPress(e: any) {
    const geom = e.geometry as any;
    if (!geom?.coordinates) return;
    const [lng, lat] = geom.coordinates;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markUserPlacing();
    (async () => {
      const name = await reverseGeocodeLoc(lat, lng);
      const loc: Loc = { name, lat, lng };
      if (!origin) { setOrigin(loc); return; }
      if (!destination) { setDestination(loc); return; }
      setWaypoints([...waypoints, loc]);
    })();
  }

  // Long press marker
  function handleMarkerLongPress(type: 'origin' | 'destination' | number) {
    const current = type === 'origin' ? origin : type === 'destination' ? destination : waypoints[type as number];
    const options = ['Edit Name', 'Remove', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, destructiveButtonIndex: 1, title: current?.name },
        (idx) => {
          if (idx === 0) {
            Alert.prompt('Waypoint Name', 'Enter a custom name', (text) => {
              if (!text?.trim()) return;
              if (type === 'origin' && origin) setOrigin({ ...origin, name: text.trim() });
              else if (type === 'destination' && destination) setDestination({ ...destination, name: text.trim() });
              else if (typeof type === 'number') setWaypoints(waypoints.map((w, i) => i === type ? { ...w, name: text.trim() } : w));
            }, 'plain-text', current?.name);
          } else if (idx === 1) {
            if (type === 'origin') setOrigin(null);
            else if (type === 'destination') setDestination(null);
            else setWaypoints(waypoints.filter((_, i) => i !== type));
          }
        },
      );
    } else {
      Alert.alert(current?.name ?? 'Waypoint', undefined, [
        { text: 'Edit Name', onPress: () => {
          Alert.prompt('Waypoint Name', 'Enter a custom name', (text) => {
            if (!text?.trim()) return;
            if (type === 'origin' && origin) setOrigin({ ...origin, name: text.trim() });
            else if (type === 'destination' && destination) setDestination({ ...destination, name: text.trim() });
            else if (typeof type === 'number') setWaypoints(waypoints.map((w, i) => i === type ? { ...w, name: text.trim() } : w));
          }, 'plain-text', current?.name);
        }},
        { text: 'Remove', style: 'destructive', onPress: () => {
          if (type === 'origin') setOrigin(null);
          else if (type === 'destination') setDestination(null);
          else setWaypoints(waypoints.filter((_, i) => i !== type));
        }},
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  // Marker drag handlers
  function handleMarkerDragStart(type: 'origin' | 'destination' | number) {
    setDraggingMarker(type);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function handleMarkerDrag(type: 'origin' | 'destination' | number, e: any) {
    const geom = e.geometry as any;
    if (!geom?.coordinates) return;
    const [lng, lat] = geom.coordinates;
    // Update coordinate immediately for visual feedback — read store directly to avoid re-render loop
    const store = useTripPlannerStore.getState();
    if (type === 'origin') { if (store.tripOrigin) setOrigin({ ...store.tripOrigin, lat, lng }); }
    else if (type === 'destination') { if (store.tripDestination) setDestination({ ...store.tripDestination, lat, lng }); }
    else if (typeof type === 'number') setWaypoints(store.tripWaypoints.map((w, i) => i === type ? { ...w, lat, lng } : w));
    // Debounced route fetch while dragging
    if (dragRouteDebounceRef.current) clearTimeout(dragRouteDebounceRef.current);
    dragRouteDebounceRef.current = setTimeout(async () => {
      const o = type === 'origin' ? { lng, lat } : origin;
      const d = type === 'destination' ? { lng, lat } : destination;
      if (!o || !d) return;
      const wps = (typeof type === 'number'
        ? waypoints.map((w, i) => i === type ? { lng, lat } : { lng: w.lng, lat: w.lat })
        : waypoints.map((w) => ({ lng: w.lng, lat: w.lat }))
      );
      try {
        const routes = await fetchDirections(o.lng, o.lat, d.lng, d.lat, 'fastest', wps.length > 0 ? wps : undefined);
        if (routes.length > 0) {
          setTripRoute(routes[0].geometry, routes[0].distanceMiles, routes[0].durationSeconds);
        }
      } catch {}
    }, 300);
  }

  async function handleMarkerDragEnd(type: 'origin' | 'destination' | number, e: any) {
    setDraggingMarker(null);
    const geom = e.geometry as any;
    if (!geom?.coordinates) return;
    const [lng, lat] = geom.coordinates;
    const name = await reverseGeocodeLoc(lat, lng);
    if (type === 'origin') setOrigin({ name, lat, lng });
    else if (type === 'destination') setDestination({ name, lat, lng });
    else if (typeof type === 'number') setWaypoints(waypoints.map((w, i) => i === type ? { name, lat, lng } : w));
    setSaved(false);
  }

  // Route line press → insert waypoint
  function handleRouteLinePress(e: any) {
    const geom = e.geometry as any;
    if (!geom?.coordinates) return;
    const [lng, lat] = geom.coordinates;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markUserPlacing();
    (async () => {
      const name = await reverseGeocodeLoc(lat, lng);
      setWaypoints([...waypoints, { name, lat, lng }]);
    })();
  }

  function handleReverse() {
    const tmp = origin;
    setOrigin(destination);
    setDestination(tmp);
    setWaypoints([...waypoints].reverse());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleImportRoute(route: Route) {
    setImportModalOpen(false);
    if (route.points.length < 2) return;
    const first = route.points[0];
    const last = route.points[route.points.length - 1];
    setOrigin({ name: route.name.split('→')[0]?.trim() || 'Start', lat: first.lat, lng: first.lng });
    setDestination({ name: route.name.split('→')[1]?.trim() || route.name, lat: last.lat, lng: last.lng });
    setWaypoints([]);
    setSaved(false);
    // Fit camera after route loads for imported routes
    setTimeout(() => fitRoute(), 1500);
  }

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const proxLng = origin?.lng ?? -97.7431;
        const proxLat = origin?.lat ?? 30.2672;
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text.trim())}.json?access_token=${TOKEN}&types=address,poi,place,postcode&limit=5&proximity=${proxLng},${proxLat}&country=us`;
        const res = await fetch(url);
        const json = await res.json();
        setResults((json.features ?? []).map((f: any) => ({ name: f.place_name, lat: f.center[1], lng: f.center[0] })));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  }, [origin]);

  function selectResult(loc: Loc) {
    if (activeField === 'origin') setOrigin(loc);
    else if (activeField === 'destination') setDestination(loc);
    else if (typeof activeField === 'number') {
      if (activeField >= waypoints.length) setWaypoints([...waypoints, loc]);
      else setWaypoints(waypoints.map((w, i) => i === activeField ? loc : w));
    }
    setActiveField(null);
    setQuery('');
    setResults([]);
    Keyboard.dismiss();
  }

  function handleNavigate() {
    if (!destination) return;
    const { isRecording } = useSafetyStore.getState();
    const navStore = useNavigationStore.getState();
    const isNav = navStore.mode === 'navigating' || navStore.mode === 'off_route' || navStore.mode === 'recalculating';
    if (isRecording || isNav) {
      Alert.alert(
        'Ride In Progress',
        isNav
          ? 'Go back to the RIDE screen to STOP navigation before starting a new one.'
          : 'Go back to the RIDE screen to STOP your recording before starting navigation.',
        [{ text: 'OK', style: 'cancel' }],
      );
      return;
    }
    navStore.setPendingSearchDest(destination);
    clearTrip();
    router.navigate('/(tabs)/ride' as any);
  }

  function openSaveModal() {
    if (!origin || !destination || !routeGeojson || !user) return;
    const defaultName = `${origin.name.split(',')[0] || 'Start'} → ${destination.name.split(',')[0] || 'End'}`;
    setSaveName(defaultName);
    setSaveCategory('Planned Rides');
    setSaveModalOpen(true);
  }

  function handlePickCategory() {
    // Collect distinct categories from saved routes
    const cats = new Set<string>();
    cats.add('Planned Rides');
    for (const r of savedRoutes) { if (r.category) cats.add(r.category); }
    const catList = Array.from(cats);
    const options = [...catList, '+ New Category', 'Cancel'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, title: 'Select Category' },
        (idx) => {
          if (idx === options.length - 1) return; // Cancel
          if (idx === options.length - 2) {
            // + New Category
            Alert.prompt('New Category', 'Enter a category name', (text) => {
              if (text?.trim()) setSaveCategory(text.trim());
            }, 'plain-text');
          } else {
            setSaveCategory(catList[idx]);
          }
        },
      );
    } else {
      const buttons = catList.map((cat) => ({ text: cat, onPress: () => setSaveCategory(cat) }));
      buttons.push({
        text: '+ New Category',
        onPress: () => {
          Alert.prompt('New Category', 'Enter a category name', (text) => {
            if (text?.trim()) setSaveCategory(text.trim());
          }, 'plain-text');
        },
      });
      buttons.push({ text: 'Cancel', onPress: () => {} });
      Alert.alert('Select Category', undefined, buttons);
    }
  }

  async function handleConfirmSave() {
    if (!origin || !destination || !routeGeojson || !user || !saveName.trim()) return;
    setSaving(true);
    const points = routeGeojson.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng, time: new Date().toISOString() }));
    try {
      const s = await createRoute(user.id, saveName.trim(), points, routeDistance, 0, routeDuration, saveCategory, 'planned', null, departure.toISOString());
      if (s) { addRoute(s); showToast(`Route saved to ${saveCategory}`); setSaved(true); }
    } catch {}
    setSaving(false);
    setSaveModalOpen(false);
  }

  async function handleShare() {
    if (!routeGeojson || !origin || !destination) return;
    const name = `${origin.name.split(',')[0]} → ${destination.name.split(',')[0]}`;
    const points = routeGeojson.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
    try { await Share.share({ title: name, message: serializeGpx(name, points) }); } catch {}
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 2500);
  }

  const canNavigate = !!origin && !!destination && !!routeGeojson;
  const daysOut = daysBetween(new Date(), departure);
  // Compute weather severity badge
  function getWeatherBadge(): { label: string; color: string } | null {
    if (weatherLoading) return { label: 'CHECKING', color: theme.textMuted };
    if (weatherPoints.length === 0) return null;
    const hasSevere = weatherPoints.some((p) => p.weatherCode >= 95 || (p.weatherCode >= 56 && p.weatherCode <= 57) || (p.weatherCode >= 66 && p.weatherCode <= 67) || (p.weatherCode >= 71 && p.weatherCode <= 86));
    if (hasSevere) return { label: 'ALERT', color: '#C62828' };
    const hasModerate = weatherPoints.some((p) => p.rainChance > 50);
    if (hasModerate) return { label: 'WATCH', color: '#FF9800' };
    const hasMinor = weatherPoints.some((p) => p.weatherCode >= 51 || p.rainChance > 0 || p.wind > (weatherUseCelsius ? 56 : 35));
    if (hasMinor) return { label: 'MINOR', color: '#FF9800' };
    return { label: 'CLEAR', color: '#2E7D32' };
  }
  const weatherBadge = getWeatherBadge();

  let weatherDisclaimer: string | null = null;
  if (daysOut > 16) weatherDisclaimer = "That ride's still on the horizon. Weather this far out is more vibe than forecast — update your departure date closer to the ride for conditions you can count on.";
  else if (daysOut > 7) weatherDisclaimer = "Heads up — forecasts this far out are early estimates. Check back closer to your departure date for conditions you can count on.";

  return (
    <View style={{ flex: 1 }}>
      {/* Map — always full screen behind panel */}
      <View style={StyleSheet.absoluteFillObject}>
        <MapView style={StyleSheet.absoluteFillObject} styleURL={mapStyle} scrollEnabled zoomEnabled rotateEnabled={false} attributionEnabled={false} logoEnabled={false} scaleBarEnabled={false} onPress={handleMapPress} onDidFinishLoadingStyle={() => setMapStyleReady(true)} onWillStartLoadingMap={() => setMapStyleReady(false)}>
          <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: AUSTIN, zoomLevel: 9 }} />
          {origin && (
            <PointAnnotation id="tp-origin" coordinate={[origin.lng, origin.lat]} draggable onDragStart={() => handleMarkerDragStart('origin')} onDrag={(e: any) => handleMarkerDrag('origin', e)} onDragEnd={(e: any) => handleMarkerDragEnd('origin', e)}>
              <Pressable onLongPress={() => handleMarkerLongPress('origin')}>
                <View style={[st.marker, { backgroundColor: theme.green }, draggingMarker === 'origin' && st.markerDragging]} />
              </Pressable>
            </PointAnnotation>
          )}
          {destination && (
            <PointAnnotation id="tp-dest" coordinate={[destination.lng, destination.lat]} draggable onDragStart={() => handleMarkerDragStart('destination')} onDrag={(e: any) => handleMarkerDrag('destination', e)} onDragEnd={(e: any) => handleMarkerDragEnd('destination', e)}>
              <Pressable onLongPress={() => handleMarkerLongPress('destination')}>
                <View style={[st.marker, { backgroundColor: theme.red }, draggingMarker === 'destination' && st.markerDragging]} />
              </Pressable>
            </PointAnnotation>
          )}
          {waypoints.map((wp, i) => (
            <PointAnnotation key={`tp-wp-${i}`} id={`tp-wp-${i}`} coordinate={[wp.lng, wp.lat]} draggable onDragStart={() => handleMarkerDragStart(i)} onDrag={(e: any) => handleMarkerDrag(i, e)} onDragEnd={(e: any) => handleMarkerDragEnd(i, e)}>
              <Pressable onLongPress={() => handleMarkerLongPress(i)}>
                <View style={[st.marker, { backgroundColor: theme.orange }, draggingMarker === i && st.markerDragging]} />
              </Pressable>
            </PointAnnotation>
          ))}
          {mapStyleReady && routeGeojson && <ShapeSource id="tp-route" shape={routeGeojson} onPress={handleRouteLinePress}><LineLayer id="tp-route-line" style={{ lineColor: theme.red, lineWidth: 4, lineOpacity: 0.8 }} /></ShapeSource>}
        </MapView>
        {routeLoading && <View style={st.mapOverlay}><ActivityIndicator size="small" color="#FFFFFF" /></View>}
        {/* Fit route button */}
        {routeGeojson && (
          <Pressable style={[st.fitRouteBtn, { backgroundColor: theme.bgPanel, borderColor: theme.border }]} onPress={fitRoute}>
            <Text style={[st.fitRouteBtnText, { color: theme.textMuted }]}>FIT ROUTE</Text>
          </Pressable>
        )}
        {/* ── Layers button ── */}
        <Pressable
          style={[st.layersBtn, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}
          onPress={() => {
            const options = [
              { label: 'Hybrid', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
              { label: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
              { label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
              { label: 'Dark', url: 'mapbox://styles/mapbox/dark-v11' },
            ];
            if (Platform.OS === 'ios') {
              ActionSheetIOS.showActionSheetWithOptions(
                { options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length },
                (idx) => { if (idx < options.length) useMapStyleStore.getState().setMapStyle(options[idx].url); },
              );
            } else {
              Alert.alert('Map Style', undefined, [
                ...options.map((o) => ({ text: o.label, onPress: () => useMapStyleStore.getState().setMapStyle(o.url) })),
                { text: 'Cancel', style: 'cancel' as const },
              ]);
            }
          }}
        >
          <Feather name="layers" size={18} color={theme.textPrimary} />
        </Pressable>
      </View>

      {/* Bottom sheet panel */}
      <Animated.View style={[st.bottomSheet, { top: panelY, backgroundColor: theme.bgPanel }]}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={st.dragHandleWrap}>
          <View style={[st.dragHandle, { backgroundColor: theme.border }]} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {activeField !== null ? (
            /* Search mode */
            <View style={st.searchPad}>
              <View style={[st.searchWrap, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <Feather name="search" size={16} color={theme.textMuted} />
                <TextInput style={[st.searchInput, { color: theme.textPrimary }]} placeholder="Search..." placeholderTextColor={theme.textMuted} value={query} onChangeText={handleSearch} autoFocus />
                {searching && <ActivityIndicator size="small" color={theme.textMuted} />}
                <Pressable onPress={() => { setActiveField(null); setQuery(''); setResults([]); }}><Feather name="x" size={16} color={theme.textMuted} /></Pressable>
              </View>
              {results.map((r, i) => (
                <Pressable key={`${r.lat}-${r.lng}-${i}`} style={[st.resultRow, { borderBottomColor: theme.border }]} onPress={() => selectResult(r)}>
                  <Feather name="map-pin" size={14} color={theme.textSecondary} />
                  <Text style={[st.resultText, { color: theme.textPrimary }]} numberOfLines={1}>{r.name}</Text>
                </Pressable>
              ))}
              {!query.trim() && favorites.length > 0 && (
                <>
                  <Text style={[st.sectionLabel, { color: theme.textMuted }]}>FAVORITES</Text>
                  {favorites.slice(0, 5).map((fav, i) => (
                    <Pressable key={`fav-${i}`} style={[st.resultRow, { borderBottomColor: theme.border }]} onPress={() => selectResult({ name: fav.nickname || fav.name, lat: fav.lat, lng: fav.lng })}>
                      <Feather name="heart" size={14} color={theme.red} />
                      <Text style={[st.resultText, { color: theme.textPrimary }]} numberOfLines={1}>{fav.nickname || fav.name}</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          ) : (
            /* Fields mode */
            <View style={st.fieldsWrap}>
              {/* Origin */}
              <Pressable style={[st.field, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => setActiveField('origin')}>
                <View style={[st.dot, { backgroundColor: theme.green }]} />
                <Text style={[st.fieldText, { color: origin ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>{origin?.name ?? 'Starting point'}</Text>
                {origin && <Pressable onPress={() => setOrigin(null)} hitSlop={8}><Feather name="x" size={14} color={theme.textMuted} /></Pressable>}
              </Pressable>

              {/* Waypoints — draggable */}
              {waypoints.length > 0 && (
                <GestureHandlerRootView>
                  <DraggableFlatList
                    data={waypoints}
                    keyExtractor={(_item, index) => `wp-${index}`}
                    scrollEnabled={false}
                    onDragEnd={({ data }) => setWaypoints(data)}
                    renderItem={({ item: wp, drag, isActive, getIndex }: RenderItemParams<Loc>) => {
                      const idx = getIndex() ?? 0;
                      return (
                        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, opacity: isActive ? 0.8 : 1, transform: [{ scale: isActive ? 1.03 : 1 }] }]}>
                          <Pressable style={[st.field, { backgroundColor: isActive ? theme.bgPanel : theme.bgCard, borderColor: theme.border, flex: 1 }]} onPress={() => setActiveField(idx)}>
                            <View style={[st.dot, { backgroundColor: theme.orange }]} />
                            <Text style={[st.fieldText, { color: theme.textPrimary }]} numberOfLines={1}>{wp.name}</Text>
                          </Pressable>
                          <Pressable onPress={() => setWaypoints(waypoints.filter((_, i) => i !== idx))} hitSlop={6}><Feather name="x-circle" size={16} color={theme.textMuted} /></Pressable>
                          <Pressable onLongPress={drag} delayLongPress={150} hitSlop={6} style={{ paddingVertical: 8, paddingHorizontal: 4 }}>
                            <Feather name="menu" size={16} color={theme.textMuted} />
                          </Pressable>
                        </View>
                      );
                    }}
                  />
                </GestureHandlerRootView>
              )}

              {/* Destination */}
              <Pressable style={[st.field, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => setActiveField('destination')}>
                <View style={[st.dot, { backgroundColor: theme.red }]} />
                <Text style={[st.fieldText, { color: destination ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>{destination?.name ?? 'Destination'}</Text>
                {destination && <Pressable onPress={() => setDestination(null)} hitSlop={8}><Feather name="x" size={14} color={theme.textMuted} /></Pressable>}
              </Pressable>

              {/* Add Stop | Reverse | Import */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingHorizontal: 16, marginVertical: 12 }}>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => { setActiveField(waypoints.length); }}>
                  <Feather name="plus" size={13} color={theme.textSecondary} />
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>Add Stop</Text>
                </Pressable>
                {origin && destination && (
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={handleReverse}>
                    <Feather name="refresh-cw" size={13} color={theme.textSecondary} />
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>Reverse</Text>
                  </Pressable>
                )}
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setImportModalOpen(true)}>
                  <Feather name="bookmark" size={13} color={theme.textSecondary} />
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>Import from My Routes</Text>
                </Pressable>
              </View>

              {/* Route summary */}
              {routeGeojson && (
                <View style={{ marginTop: -2, borderRadius: 10, backgroundColor: 'rgba(76,175,80,0.12)', borderWidth: 1, borderColor: 'rgba(76,175,80,0.3)', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textPrimary, letterSpacing: 0.8, marginBottom: 6, opacity: 0.7 }}>ROUTE DETAILS</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textPrimary, textAlign: 'center' }}>
                    {routeDistance.toFixed(1)} mi · {Math.floor(routeDuration / 3600)}h {Math.floor((routeDuration % 3600) / 60)}m
                  </Text>
                </View>
              )}

              {/* Departure — hidden in compact map mode */}
              {routeGeojson && (
                <View style={[st.departureCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                  <Text style={[st.sectionLabel, { color: theme.textSecondary }]}>DEPARTURE</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
                    {[0, 1, 2].map((offset) => {
                      const d = addDays(new Date(), offset); d.setHours(0, 0, 0, 0);
                      const isQuickChip = !customDate && departure.toDateString() === d.toDateString();
                      const label = offset === 0 ? 'TODAY' : offset === 1 ? 'TOMORROW' : d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
                      return (
                        <Pressable key={offset} style={[st.dateChip, { backgroundColor: isQuickChip ? theme.red + '22' : theme.bgPanel, borderColor: isQuickChip ? theme.red : theme.border }]} onPress={() => { setCustomDate(null); const n = new Date(departure); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setDeparture(n); }}>
                          <Text style={[st.dateChipText, { color: isQuickChip ? theme.red : theme.textSecondary }]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                    {/* Custom date chip */}
                    {customDate ? (
                      <View style={[st.dateChip, { backgroundColor: theme.red + '22', borderColor: theme.red, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                        <Text style={[st.dateChipText, { color: theme.red }]}>{customDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</Text>
                        <Pressable hitSlop={8} onPress={() => { setCustomDate(null); const today = new Date(); today.setMinutes(0, 0, 0); today.setHours(today.getHours() + 1); setDeparture(today); }}>
                          <Feather name="x" size={12} color={theme.red} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable style={[st.dateChip, { backgroundColor: theme.bgPanel, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 4 }]} onPress={() => setShowDatePicker(true)}>
                        <Feather name="calendar" size={11} color={theme.textSecondary} />
                        <Text style={[st.dateChipText, { color: theme.textSecondary }]}>PICK DATE</Text>
                      </Pressable>
                    )}
                  </ScrollView>
                  {/* Inline date picker */}
                  {showDatePicker && Platform.OS === 'ios' && (
                    <View style={[st.inlinePicker, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 4 }}>
                        <Pressable onPress={() => setShowDatePicker(false)}>
                          <Text style={{ color: theme.red, fontSize: 14, fontWeight: '600' }}>Done</Text>
                        </Pressable>
                      </View>
                      <DateTimePicker
                        value={customDate ?? addDays(new Date(), 3)}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        themeVariant={isDark ? 'dark' : 'light'}
                        onChange={(_e: DateTimePickerEvent, selected?: Date) => {
                          if (selected) {
                            setCustomDate(selected);
                            const n = new Date(departure);
                            n.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                            setDeparture(n);
                          }
                        }}
                      />
                    </View>
                  )}
                  {showDatePicker && Platform.OS === 'android' && (
                    <DateTimePicker
                      value={customDate ?? addDays(new Date(), 3)}
                      mode="date"
                      display="default"
                      minimumDate={new Date()}
                      onChange={(_e: DateTimePickerEvent, selected?: Date) => {
                        setShowDatePicker(false);
                        if (selected) {
                          setCustomDate(selected);
                          const n = new Date(departure);
                          n.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
                          setDeparture(n);
                        }
                      }}
                    />
                  )}
                </View>
              )}

              {/* Weather along route — hidden in compact map mode */}
              {routeGeojson && daysOut <= 16 && (
                <>
                  <Pressable style={[st.collapsible, { borderColor: theme.border, alignItems: 'flex-start' }]} onPress={() => setWeatherExpanded((v) => !v)}>
                    <Feather name={weatherExpanded ? 'chevron-down' : 'chevron-right'} size={14} color={theme.textPrimary} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={[st.collapsibleTitle, { color: theme.textPrimary }]}>WEATHER ALONG ROUTE</Text>
                      {isWeatherStale ? (
                        <Pressable onPress={() => { setWeatherLoading(true); const coords = routeGeojsonRef.current?.coordinates; if (coords) fetchRouteWeather(coords).then(({ points, useCelsius, useMiles }) => { setWeatherUseCelsius(useCelsius); setWeatherUseMiles(useMiles); let msg: string | null; let concern: boolean; if (points.length === 0 || points.every((p) => p.temp === 0)) { msg = 'Unable to check route weather.'; concern = false; } else if (!hasRouteWeatherConcern(points, useCelsius)) { msg = 'Clear conditions along this route.'; concern = false; } else { msg = getRouteWarningMessage(points, useCelsius) ?? 'Check conditions before riding.'; concern = true; } setTripWeather(points, msg, concern, points.length); }).catch(() => setTripWeather([], 'Unable to check route weather.', false, 0)).finally(() => setWeatherLoading(false)); }} style={{ padding: 4 }}>
                          <Feather name="refresh-cw" size={14} color={theme.textMuted} />
                        </Pressable>
                      ) : weatherBadge && <View style={[st.statusBadge, { backgroundColor: weatherBadge.color }]}><Text style={st.statusBadgeText}>{weatherBadge.label}</Text></View>}
                    </View>
                  </Pressable>
                  {weatherExpanded && (
                    <View style={{ paddingVertical: 8, gap: 6 }}>
                      {weatherDisclaimer && <Text style={[st.disclaimer, { color: theme.textMuted, marginTop: 0, marginBottom: 4 }]}>{weatherDisclaimer}</Text>}
                      {weatherPoints.length > 0 && weatherPoints.map((pt, idx) => {
                        const meta = codeMeta(pt.weatherCode);
                        const distVal = weatherUseMiles ? Math.round(pt.distanceKm * 0.621371) : Math.round(pt.distanceKm);
                        const unit = weatherUseMiles ? 'mi' : 'km';
                        const distLabel = idx === 0 ? 'Start' : idx === weatherPoints.length - 1 ? 'End' : `Mile ${distVal}`;
                        const distSub = idx === 0 || idx === weatherPoints.length - 1 ? '' : `${distVal} ${unit}`;
                        const tempStr = weatherUseCelsius ? `${Math.round(pt.temp)}°C` : `${Math.round(pt.temp)}°F`;
                        const hasConcern = pt.weatherCode >= 51 || pt.temp < (weatherUseCelsius ? 2 : 35) || pt.wind > (weatherUseCelsius ? 56 : 35);
                        return (
                          <View key={idx} style={[st.checkpointCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                            <View style={st.checkpointDistWrap}>
                              <Text style={[st.checkpointDist, { color: theme.textPrimary }]}>{distLabel}</Text>
                              {!!distSub && <Text style={{ fontSize: 9, color: theme.textMuted }}>{distSub}</Text>}
                            </View>
                            <Feather name={meta.icon as any} size={14} color={hasConcern ? theme.yellow : theme.green} />
                            <Text style={[st.checkpointTemp, { color: theme.textPrimary }]}>{tempStr}</Text>
                            <Text style={[st.checkpointLabel, { color: hasConcern ? theme.yellow : theme.textMuted }]}>{meta.label}</Text>
                            {pt.rainChance > 0 && <Text style={[st.checkpointRain, { color: '#3B82F6' }]}>{pt.rainChance}%</Text>}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              )}
              {routeGeojson && daysOut > 16 && (
                <>
                  <View style={[st.collapsible, { borderColor: theme.border, alignItems: 'flex-start' }]}>
                    <Feather name="cloud" size={14} color={theme.textMuted} style={{ marginTop: 2 }} />
                    <Text style={[st.collapsibleTitle, { color: theme.textMuted, flex: 1, flexWrap: 'wrap' }]}>
                      WEATHER — Too far out for forecasts
                    </Text>
                  </View>
                  <Text style={[st.disclaimer, { color: theme.textMuted }]}>{weatherDisclaimer}</Text>
                </>
              )}

              {/* Road conditions — hidden in compact map mode */}
              {routeGeojson && (() => {
                const SIXTY_DAYS = 60 * 86_400_000;
                // Filter to last 60 days
                const recentConditions = conditions.filter((c) => Date.now() - new Date(c.reportedAt).getTime() < SIXTY_DAYS);
                // Pre-compute mile markers
                const conditionsWithMiles = recentConditions.map((c) => {
                  const { distanceKm, offsetKm } = getRouteMileMarker(routeGeojson.coordinates, c.lat, c.lng);
                  const distVal = weatherUseMiles ? distanceKm * 0.621371 : distanceKm;
                  const isNear = offsetKm > 2;
                  return { ...c, mileMarker: distVal, isNear };
                });
                conditionsWithMiles.sort((a, b) => {
                  const dateDiff = new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
                  return dateDiff !== 0 ? dateDiff : a.mileMarker - b.mileMarker;
                });
                // Apply type filter
                const filtered = conditionFilter === 'all' ? conditionsWithMiles : conditionsWithMiles.filter((c) => c.type === conditionFilter);
                // Count by type for pill badges
                const countByType = { construction: 0, hazard: 0, closure: 0 };
                conditionsWithMiles.forEach((c) => { if (c.type in countByType) countByType[c.type as keyof typeof countByType]++; });

                return (
                  <>
                    <Pressable style={[st.collapsible, { borderColor: theme.border }]} onPress={() => setConditionsExpanded((v) => !v)}>
                      <Feather name={conditionsExpanded ? 'chevron-down' : 'chevron-right'} size={14} color={theme.textPrimary} />
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[st.collapsibleTitle, { color: theme.textPrimary }]}>ROAD CONDITIONS</Text>
                        {isConditionsStale ? (
                          <Pressable onPress={() => { setTripConditions([]); setConditionsLoading(true); const coords = routeGeojsonRef.current?.coordinates; if (coords) { (async () => { const samples = sampleRouteCoordinates(coords, 30).slice(0, 5); const all: RoadCondition[] = []; for (const s of samples) { try { const c = await fetchHEREConditions(s.lat, s.lng); c.forEach((r) => { if (!all.some((e) => e.id === r.id)) all.push(r); }); } catch {} await new Promise((r) => setTimeout(r, 300)); } setTripConditions(all); setConditionsLoading(false); })(); } }} style={{ padding: 4 }}>
                            <Feather name="refresh-cw" size={14} color={theme.textMuted} />
                          </Pressable>
                        ) : conditionsLoading
                          ? <View style={[st.statusBadge, { backgroundColor: theme.textMuted }]}><Text style={st.statusBadgeText}>CHECKING</Text></View>
                          : recentConditions.length === 0
                            ? <View style={[st.statusBadge, { backgroundColor: '#2E7D32' }]}><Text style={st.statusBadgeText}>CLEAR</Text></View>
                            : recentConditions.length <= 5
                              ? <View style={[st.statusBadge, { backgroundColor: '#FF9800' }]}><Text style={st.statusBadgeText}>{recentConditions.length} ACTIVE</Text></View>
                              : <View style={[st.statusBadge, { backgroundColor: '#C62828' }]}><Text style={st.statusBadgeText}>{recentConditions.length} REPORTS</Text></View>
                        }
                      </View>
                    </Pressable>
                    {/* Category filter pills */}
                    {conditionsExpanded && conditionsWithMiles.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
                        {([
                          { key: 'all' as const, label: 'ALL', icon: 'list', count: conditionsWithMiles.length },
                          { key: 'construction' as const, label: 'CONSTRUCTION', icon: 'tool', count: countByType.construction },
                          { key: 'hazard' as const, label: 'HAZARD', icon: 'alert-circle', count: countByType.hazard },
                          { key: 'closure' as const, label: 'CLOSURE', icon: 'alert-triangle', count: countByType.closure },
                        ]).filter((f) => f.key === 'all' || f.count > 0).map((f) => {
                          const active = conditionFilter === f.key;
                          return (
                            <Pressable
                              key={f.key}
                              style={[st.condFilterPill, { backgroundColor: active ? theme.red + '22' : theme.bgPanel, borderColor: active ? theme.red : theme.border }]}
                              onPress={() => setConditionFilter(f.key)}
                            >
                              <Feather name={f.icon as any} size={11} color={active ? theme.red : theme.textMuted} />
                              <Text style={{ fontSize: 10, fontWeight: '700', color: active ? theme.red : theme.textMuted, letterSpacing: 0.3 }}>
                                {f.label}{f.count > 0 ? ` (${f.count})` : ''}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}
                    {conditionsExpanded && filtered.length > 0 && filtered.map((c) => {
                      const ageMs = Date.now() - new Date(c.reportedAt).getTime();
                      const ageDays = Math.floor(ageMs / 86_400_000);
                      const ageLabel = ageDays === 0 ? 'Today' : ageDays === 1 ? '1 day ago' : `${ageDays} days ago`;
                      const ageColor = ageDays <= 7 ? theme.green : ageDays <= 30 ? theme.orange : theme.red;
                      const mileLabel = c.isNear ? `Near Mile ${c.mileMarker.toFixed(1)}` : `Mile ${c.mileMarker.toFixed(1)}`;
                      return (
                        <View key={c.id} style={[st.condCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Feather name={c.type === 'closure' ? 'alert-triangle' : c.type === 'construction' ? 'tool' : 'alert-circle'} size={14} color={c.severity === 'severe' ? theme.red : theme.yellow} />
                            <Text style={[st.condTitle, { color: theme.textPrimary }]} numberOfLines={1}>{c.title}</Text>
                          </View>
                          {c.description ? <Text style={[st.condDesc, { color: theme.textMuted }]} numberOfLines={2}>{c.description}</Text> : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '700' }}>{mileLabel}</Text>
                            <Text style={{ fontSize: 10, color: ageColor, fontWeight: '600' }}>Reported {ageLabel}</Text>
                          </View>
                        </View>
                      );
                    })}
                    {conditionsExpanded && filtered.length === 0 && conditionsWithMiles.length > 0 && (
                      <Text style={{ fontSize: 12, color: theme.textMuted, paddingVertical: 12 }}>No {conditionFilter} reports on this route.</Text>
                    )}
                  </>
                );
              })()}
            </View>
          )}

              {/* Bottom action buttons */}
              {canNavigate && activeField === null && (
                <View style={{ marginTop: 8, marginBottom: 220, gap: 8, marginHorizontal: 16 }}>
                  <Pressable
                    onPress={handleNavigate}
                    style={{ backgroundColor: theme.red, borderRadius: 8, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Feather name="navigation" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 }}>NAVIGATE</Text>
                  </Pressable>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={openSaveModal}
                      disabled={saved}
                      style={{ flex: 1, height: 40, borderRadius: 8, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <Feather name={saved ? 'check' : 'bookmark'} size={14} color={saved ? theme.green : theme.textPrimary} />
                      <Text style={{ fontWeight: '600', fontSize: 13, color: saved ? theme.green : theme.textPrimary }}>{saved ? 'SAVED' : 'SAVE'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleShare}
                      style={{ flex: 1, height: 40, borderRadius: 8, borderWidth: 1, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <Feather name="share-2" size={14} color={theme.textPrimary} />
                      <Text style={{ fontWeight: '600', fontSize: 13, color: theme.textPrimary }}>SHARE</Text>
                    </Pressable>
                  </View>
                </View>
              )}
        </ScrollView>
      </Animated.View>

      {/* Import modal */}
      <Modal visible={importModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setImportModalOpen(false)}>
        <View style={[st.importModal, { backgroundColor: theme.bgPanel }]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginTop: 8, marginBottom: 4 }} />
          <View style={[st.importHeader, { borderBottomColor: theme.border }]}>
            <Text style={[st.importTitle, { color: theme.textPrimary }]}>Import from Routes</Text>
            <Pressable onPress={() => setImportModalOpen(false)}><Feather name="x" size={22} color={theme.textSecondary} /></Pressable>
          </View>
          {routesStoreLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="small" color={theme.textMuted} />
              <Text style={[st.emptyText, { color: theme.textMuted, paddingVertical: 12 }]}>Loading your routes...</Text>
            </View>
          ) : (
            <FlatList data={savedRoutes} keyExtractor={(item) => item.id} renderItem={({ item }) => (
              <Pressable style={[st.importRow, { borderBottomColor: theme.border }]} onPress={() => handleImportRoute(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.importName, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[st.importMeta, { color: theme.textMuted }]}>{item.distance_miles.toFixed(1)} mi{item.category ? ` · ${item.category}` : ''}</Text>
                </View>
                <Feather name="chevron-right" size={14} color={theme.textMuted} />
              </Pressable>
            )} ListEmptyComponent={<Text style={[st.emptyText, { color: theme.textMuted }]}>No saved routes yet.</Text>} />
          )}
        </View>
      </Modal>

      {/* Save Route modal */}
      <Modal visible={saveModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSaveModalOpen(false)}>
        <View style={[st.importModal, { backgroundColor: theme.bgPanel }]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginTop: 8, marginBottom: 4 }} />
          <View style={[st.importHeader, { borderBottomColor: theme.border }]}>
            <Text style={[st.importTitle, { color: theme.textPrimary }]}>Save Route</Text>
            <Pressable onPress={() => setSaveModalOpen(false)}><Feather name="x" size={22} color={theme.textSecondary} /></Pressable>
          </View>
          <View style={st.saveModalPad}>
            {/* Route name */}
            <View style={{ gap: 6 }}>
              <Text style={[st.sectionLabel, { color: theme.textSecondary }]}>ROUTE NAME</Text>
              <TextInput
                style={[st.field, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary, paddingVertical: 12 }]}
                value={saveName}
                onChangeText={setSaveName}
                placeholder="Enter route name"
                placeholderTextColor={theme.textMuted}
                autoFocus
              />
            </View>
            {/* Category */}
            <View style={{ gap: 6 }}>
              <Text style={[st.sectionLabel, { color: theme.textSecondary }]}>CATEGORY</Text>
              <Pressable style={[st.field, { backgroundColor: theme.bgCard, borderColor: theme.border, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between' }]} onPress={handlePickCategory}>
                <Text style={{ fontSize: 14, color: theme.textPrimary }}>{saveCategory}</Text>
                <Feather name="chevron-down" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
            {/* Route summary */}
            {routeGeojson && (
              <Text style={{ fontSize: 12, color: theme.textMuted }}>
                {routeDistance.toFixed(1)} mi · {Math.floor(routeDuration / 3600)}h {Math.floor((routeDuration % 3600) / 60)}m
              </Text>
            )}
            {/* Save button */}
            <Pressable
              style={[st.navBtn, { backgroundColor: theme.red, opacity: saving || !saveName.trim() ? 0.5 : 1 }]}
              onPress={handleConfirmSave}
              disabled={saving || !saveName.trim()}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="bookmark" size={16} color="#fff" />}
              <Text style={st.navBtnText}>{saving ? 'SAVING...' : 'SAVE ROUTE'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Toast */}
      {!!toastMsg && (
        <View style={[st.toast, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Feather name="check-circle" size={14} color={theme.green} />
          <Text style={[st.toastText, { color: theme.textPrimary }]}>{toastMsg}</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  marker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  markerDragging: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, opacity: 0.85 },
  mapOverlay: { position: 'absolute', top: 20, left: '50%', transform: [{ translateX: -20 }], zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
  fitRouteBtn: { position: 'absolute', top: 12, left: 12, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  layersBtn: { position: 'absolute', top: 10, right: 12, width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fitRouteBtnText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_H,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  dragHandleWrap: { alignItems: 'center', paddingVertical: 12 },
  dragHandle: { width: 36, height: 4, borderRadius: 2 },
  inlinePicker: { borderWidth: 1, borderRadius: 8, marginTop: 8, overflow: 'hidden' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  resultText: { flex: 1, fontSize: 13 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 4, marginBottom: 4 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fieldText: { flex: 1, fontSize: 14, fontWeight: '500' },
  addStop: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4 },
  addStopText: { fontSize: 12, fontWeight: '600' },
  summaryCard: { borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  summaryText: { fontSize: 15, fontWeight: '700' },
  departureCard: { borderWidth: 1, borderRadius: 10, padding: 12 },
  dateChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  dateChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  collapsible: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  collapsibleTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  infoText: { fontSize: 13, lineHeight: 18 },
  disclaimer: { fontSize: 12, fontStyle: 'italic', marginTop: 6, lineHeight: 18 },
  checkpointCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  checkpointDist: { fontSize: 10, fontWeight: '700' },
  checkpointTemp: { fontSize: 13, fontWeight: '600' },
  checkpointLabel: { fontSize: 11, flex: 1 },
  checkpointRain: { fontSize: 10, fontWeight: '700' },
  condFilterPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  condCard: { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 6, gap: 4 },
  condTitle: { fontSize: 13, fontWeight: '600', flex: 1 },
  condDesc: { fontSize: 11, lineHeight: 16 },
  footer: { paddingTop: 10, paddingHorizontal: 12, borderTopWidth: 1, gap: 6 },
  navBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, height: 42 },
  navBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  secBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 6, borderWidth: 1, height: 32, paddingVertical: 0 },
  secBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  importModal: { flex: 1 },
  importHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1 },
  importTitle: { fontSize: 17, fontWeight: '700' },
  importRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  importName: { fontSize: 14, fontWeight: '600' },
  importMeta: { fontSize: 11, marginTop: 1 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 40 },
  toast: { position: 'absolute', bottom: 140, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 14 },
  toastText: { fontSize: 13, fontWeight: '600' },
  flexOne: { flex: 1 },
  fieldsWrap: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 10, gap: 10 },
  searchPad: { padding: 16 },
  actionsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 },
  secBtnRow: { flexDirection: 'row', gap: 8 },
  checkpointDistWrap: { width: 48 },
  condMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  condTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveModalPad: { padding: 20, gap: 16 },
});
