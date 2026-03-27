import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
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
let Mapbox: any, Camera: any, CircleLayer: any, LineLayer: any, MapView: any, MarkerView: any, PointAnnotation: any, ShapeSource: any;
let _mapboxAvailable = false;
try {
  const MB = require('@rnmapbox/maps');
  Mapbox = MB.default ?? MB;
  Camera = MB.Camera; CircleLayer = MB.CircleLayer; LineLayer = MB.LineLayer;
  MapView = MB.MapView; MarkerView = MB.MarkerView; PointAnnotation = MB.PointAnnotation; ShapeSource = MB.ShapeSource;
  _mapboxAvailable = true;
} catch {}
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import { useAuthStore, useMapStyleStore, useRoutesStore, useSafetyStore, useTripPlannerStore, useTabResetStore } from '../../lib/store';
import { useNavigationStore } from '../../lib/navigationStore';
import { loadFavorites, type FavoriteLocation } from '../../lib/favorites';
import { fetchDirections } from '../../lib/directions';
import { reverseGeocodeAddress } from '../../lib/geocode';
import { createRoute, fetchUserRoutes, seedRoutes } from '../../lib/routes';
import { serializeGpx } from '../../lib/gpx';
import { fetchRouteWeather, hasRouteWeatherConcern, getRouteWarningMessage, haversineKm, sampleRouteCoordinates, type RouteWeatherPoint } from '../../lib/routeWeather';
import { codeMeta } from '../../lib/weather';
import { fetchHEREConditions, type RoadCondition } from '../../lib/discoverStore';
import { darkTheme } from '../../lib/theme';
import type { Route } from '../../lib/routes';
import { useScoutStore } from '../../lib/scoutStore';

import MarkerDetailModal, { type SelectedMarker } from './MarkerDetailModal';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const { height: SCREEN_H } = Dimensions.get('window');
const AUSTIN = [-97.7431, 30.2672] as [number, number];

interface Loc { name: string; lat: number; lng: number; }

type StorePref = 'scenic' | 'backroads' | 'no_highway' | 'fastest' | null;
const PREF_MAP: Record<string, string> = { scenic: 'scenic', backroads: 'offroad', no_highway: 'no_highway', fastest: 'fastest' };
function mapPref(p: StorePref): 'fastest' | 'scenic' | 'no_highway' | 'offroad' {
  return (p ? PREF_MAP[p] ?? 'fastest' : 'fastest') as any;
}

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
// Constants
// ---------------------------------------------------------------------------

const MAX_WAYPOINTS = 24;

function showWaypointLimitAlert() {
  Alert.alert(
    'Stop Limit Reached',
    'Time to Moto supports up to 24 stops per route. For longer multi-stop routes, plan online at kurviger.de — it\'s free and built specifically for motorcycle trips. Export your route as a GPX file and import it directly into My Routes.',
    [
      { text: 'Open Kurviger', onPress: () => Linking.openURL('https://kurviger.de') },
      { text: 'OK', style: 'cancel' },
    ],
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TripPlanner() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();

  // Fallback when Mapbox native module is not available (Expo Go)
  if (!_mapboxAvailable) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Feather name="map" size={48} color={theme.textMuted} />
        <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 16 }}>Map Unavailable</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Trip Planner requires a dev build for map features. Scout and Garage work in Expo Go.
        </Text>
      </View>
    );
  }
  const { routes: savedRoutes, addRoute, loading: routesStoreLoading, setRoutes, setLoading: setRoutesLoading } = useRoutesStore();
  const userId = user?.id ?? 'local';
  const cameraRef = useRef<any>(null);
  const panelScrollRef = useRef<ScrollView>(null);
  const isDark = theme.bg === darkTheme.bg;
  const mapStyle = useMapStyleStore((s) => s.mapStyle);

  const [mapStyleReady, setMapStyleReady] = useState(false);
  const routeGeojsonRef = useRef<any>(null);

  // Bottom sheet snap points
  const SNAP_COLLAPSED = SCREEN_H * 0.50 - 35;
  const SNAP_EXPANDED = SCREEN_H - 140;
  const panelY = useRef(new Animated.Value(SCREEN_H - SNAP_COLLAPSED)).current;
  const lastPanelY = useRef(SCREEN_H - SNAP_COLLAPSED);

  // Keep lastPanelY in sync with animated value (avoids _value cast)
  useEffect(() => {
    const id = panelY.addListener(({ value }) => { lastPanelY.current = value; });
    return () => panelY.removeListener(id);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 10,
      onPanResponderGrant: () => {
        // lastPanelY is kept in sync via panelY.addListener
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
          setPanelExpanded(true);
        } else {
          // Swipe down → collapse panel
          Animated.spring(panelY, { toValue: SCREEN_H - SNAP_COLLAPSED, useNativeDriver: false, tension: 80, friction: 14 }).start();
          setPanelExpanded(false);
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
    tripRoutePreference: routePreference, setTripRoutePreference: setRoutePreference,
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

  // Date & time picker UI
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [hasCustomTime, setHasCustomTime] = useState(() => {
    // If departure already has a non-midnight time, show it
    return departure.getHours() !== 0 || departure.getMinutes() !== 0;
  });

  /** Set a smart default time when date changes: today = next 15min, future = 9 AM */
  function applyDefaultTime(date: Date): Date {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const n = new Date(date);
    if (isToday) {
      // Round up to next 15-minute mark
      const mins = now.getMinutes();
      const next15 = Math.ceil((mins + 1) / 15) * 15;
      n.setHours(now.getHours(), 0, 0, 0);
      n.setMinutes(next15); // handles overflow (e.g. 60 → next hour)
    } else {
      n.setHours(9, 0, 0, 0);
    }
    return n;
  }

  // Scout — global store
  const isScoutOpen = useScoutStore((s) => s.isScoutOpen);
  const wasScoutOpenRef = useRef(false);

  // Register route-updated callback for Scout
  useEffect(() => {
    useScoutStore.getState().setOnRouteUpdated(() => {
      showToast('Route updated — close Scout to view map & details', 5000);
    });
    return () => useScoutStore.getState().setOnRouteUpdated(null);
  }, []);

  // Fit route when Scout closes
  useEffect(() => {
    if (wasScoutOpenRef.current && !isScoutOpen) {
      fitRouteWhenReady();
      // Reset panel scroll to top so it doesn't show mid-scroll from Scout waypoint adds
      setTimeout(() => panelScrollRef.current?.scrollTo({ y: 0, animated: false }), 100);
    }
    wasScoutOpenRef.current = isScoutOpen;
  }, [isScoutOpen]);

  // Full-screen map mode
  const [fullScreen, setFullScreen] = useState(false);

  // Scroll to Add Stop area when user manually adds a single stop (not bulk load)
  const prevWaypointCount = useRef(waypoints.length);
  const addStopRef = useRef<View>(null);
  useEffect(() => {
    const diff = waypoints.length - prevWaypointCount.current;
    // Only scroll when exactly 1 stop was added manually (not bulk import, not from Scout)
    if (diff === 1 && !useScoutStore.getState().isScoutOpen) {
      if (waypoints.length >= MAX_WAYPOINTS) {
        setTimeout(() => panelScrollRef.current?.scrollTo({ y: 0, animated: true }), 300);
      } else {
        setTimeout(() => {
          addStopRef.current?.measureLayout(
            panelScrollRef.current as any,
            (_x, y) => {
              panelScrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
            },
            () => {},
          );
        }, 300);
      }
    }
    prevWaypointCount.current = waypoints.length;
  }, [waypoints.length]);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<SelectedMarker>(null);
  // Construction layer
  const [constructionOn, setConstructionOn] = useState(false);
  const [constructionLoading, setConstructionLoading] = useState(false);
  const [constructionIncidents, setConstructionIncidents] = useState<Array<{ id: string; title: string; description: string; lat: number; lng: number; severity: string }>>([]);

  const constructionGeoJSON = useMemo(() => {
    const capped = constructionIncidents.slice(0, 50);
    return {
      type: 'FeatureCollection' as const,
      features: capped.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
        properties: { id: c.id, title: c.title, description: c.description, severity: c.severity },
      })),
    };
  }, [constructionIncidents]);

  // Reverse geocoded addresses for panel display (keyed by coordinates, survives reorder)
  const [addressCache, setAddressCache] = useState<Record<string, string>>({});
  useEffect(() => {
    const points: Array<{ lat: number; lng: number }> = [];
    if (origin) points.push(origin);
    for (const w of waypoints) points.push(w);
    if (destination) points.push(destination);

    const toFetch = points.filter((p) => !addressCache[`${p.lat.toFixed(4)}_${p.lng.toFixed(4)}`]);
    if (toFetch.length === 0) return;

    let cancelled = false;
    (async () => {
      const batch = toFetch.slice(0, 5);
      const results: Record<string, string> = {};
      for (const p of batch) {
        if (cancelled) break;
        results[`${p.lat.toFixed(4)}_${p.lng.toFixed(4)}`] = await reverseGeocodeAddress(p.lat, p.lng);
      }
      if (!cancelled) setAddressCache((prev) => ({ ...prev, ...results }));
    })();
    return () => { cancelled = true; };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, waypoints.length]);

  function getAddress(_type: string, idx?: number): string | null {
    const point = _type === 'origin' ? origin
      : _type === 'destination' ? destination
      : idx != null ? waypoints[idx] : null;
    if (!point) return null;
    return addressCache[`${point.lat.toFixed(4)}_${point.lng.toFixed(4)}`] ?? null;
  }

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

  function fitRoute(isFullScreenMode?: boolean) {
    const geojson = routeGeojsonRef.current;
    if (!geojson?.coordinates || geojson.coordinates.length < 2) return;
    const coords = geojson.coordinates;
    const lats = coords.map((c: number[]) => c[1]);
    const lngs = coords.map((c: number[]) => c[0]);
    // Two modes only:
    // - Full screen: tab bar + safe area at bottom (~100px), header at top (~60px)
    // - Panel visible: collapsed panel covers bottom half, only fit into top map portion
    const isFS = isFullScreenMode ?? fullScreen;
    const top = isFS ? 60 : 60;
    const bottom = isFS ? 100 : SNAP_COLLAPSED;
    cameraRef.current?.fitBounds(
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.min(...lats)],
      [top, 40, bottom, 40],
      600,
    );
  }

  /** Poll for route geometry then fit — used after Scout closes */
  function fitRouteWhenReady() {
    let attempts = 0;
    const check = () => {
      attempts++;
      if (routeGeojsonRef.current?.coordinates?.length >= 2) {
        fitRoute();
      } else if (attempts < 10) {
        setTimeout(check, 400);
      }
    };
    setTimeout(check, 500);
  }

  function enterFullScreen() {
    if (isScoutOpen) useScoutStore.getState().closeScout();
    setFullScreen(true);
    setPanelExpanded(false);
    Animated.spring(panelY, { toValue: SCREEN_H + 100, useNativeDriver: false, tension: 80, friction: 14 }).start();
    setTimeout(() => fitRoute(true), 400);
  }

  function exitFullScreen() {
    setFullScreen(false);
    setPanelExpanded(false);
    Animated.spring(panelY, { toValue: SCREEN_H - SNAP_COLLAPSED, useNativeDriver: false, tension: 80, friction: 14 }).start();
    setTimeout(() => fitRoute(false), 400);
  }

  async function handleToggleConstruction() {
    if (constructionOn) {
      setConstructionOn(false);
      setConstructionIncidents([]);
      return;
    }
    setConstructionLoading(true);
    setConstructionOn(true);
    try {
      // Get center from route midpoint or fallback to Austin
      const geojson = routeGeojsonRef.current;
      let lat = AUSTIN[1];
      let lng = AUSTIN[0];
      if (geojson?.coordinates?.length > 1) {
        const mid = geojson.coordinates[Math.floor(geojson.coordinates.length / 2)];
        lng = mid[0]; lat = mid[1];
      } else if (origin) {
        lat = origin.lat; lng = origin.lng;
      }
      const conds = await fetchHEREConditions(lat, lng);
      setConstructionIncidents(
        conds
          .filter((r) => r.type === 'construction')
          .map((r) => ({ id: r.id, title: r.title, description: r.description, lat: r.lat, lng: r.lng, severity: r.severity })),
      );
    } catch {
      setConstructionOn(false);
    } finally {
      setConstructionLoading(false);
    }
  }

  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [tooManyStopsDismissed, setTooManyStopsDismissed] = useState(false);

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

  // Auto-set origin + center camera on user location, or fit existing route
  useEffect(() => {
    // If a route exists or is being planned, fit to it
    if (origin || destination) {
      fitRouteWhenReady();
      return;
    }
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

  // When a saved route is loaded (tripRouteIsManual), collapse panel and exit fullscreen
  const tripRouteIsManual = useTripPlannerStore((s) => s.tripRouteIsManual);
  useEffect(() => {
    if (tripRouteIsManual) {
      if (fullScreen) {
        setFullScreen(false);
      }
      setPanelExpanded(false);
      Animated.spring(panelY, { toValue: SCREEN_H - SNAP_COLLAPSED, useNativeDriver: false, tension: 80, friction: 14 }).start();
      fitRouteWhenReady();
    }
  }, [tripRouteIsManual]);

  // Debounced route fetch + weather + conditions
  /** Fetch weather + road conditions for a set of route coordinates */
  function fetchWeatherAndConditions(coords: [number, number][], durationSec: number) {
    const dOut = daysBetween(new Date(), departure);
    if (dOut <= 16) {
      setWeatherLoading(true);
      fetchRouteWeather(coords, departure, durationSec)
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

    setConditionsLoading(true);
    const samples = sampleRouteCoordinates(coords, 30);
    const allConditions: RoadCondition[] = [];
    const seenIds = new Set<string>();
    (async () => {
      for (const sample of samples.slice(0, 5)) {
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
    })();
  }

  useEffect(() => {
    // Need at least origin + one other point (destination or waypoint)
    const effectiveDest = destination ?? (waypoints.length > 0 ? waypoints[waypoints.length - 1] : null);
    if (!origin || !effectiveDest) { setTripRoute(null, 0, 0); setTripConditions([]); return; }

    // For manual routes (loaded from saved), skip Mapbox but still fetch weather/conditions
    if (tripRouteIsManual) {
      const geojson = routeGeojsonRef.current;
      if (geojson?.coordinates?.length > 1) {
        fetchWeatherAndConditions(geojson.coordinates, routeDuration);
      }
      return;
    }

    // Build intermediate waypoints (exclude last waypoint if it's acting as destination)
    const intermediateWps = destination
      ? waypoints.map((w) => ({ lng: w.lng, lat: w.lat }))
      : waypoints.slice(0, -1).map((w) => ({ lng: w.lng, lat: w.lat }));

    if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current);
    setRouteLoading(true);
    routeDebounceRef.current = setTimeout(async () => {
      try {
        // Mapbox Directions API supports max 25 coordinates (origin + waypoints + destination)
        const maxMapboxWps = 23;
        const wps = intermediateWps.length > maxMapboxWps
          ? intermediateWps.filter((_, i) => {
              const step = intermediateWps.length / maxMapboxWps;
              return Math.floor(i / step) !== Math.floor((i - 1) / step) || i === 0;
            }).slice(0, maxMapboxWps)
          : intermediateWps;
        const routes = await fetchDirections(origin.lng, origin.lat, effectiveDest.lng, effectiveDest.lat, mapPref(routePreference), wps.length > 0 ? wps : undefined);
        if (routes.length > 0) {
          const r = routes[0];
          setTripRoute(r.geometry, r.distanceMiles, r.durationSeconds);
          setSaved(false);
          fetchWeatherAndConditions(r.geometry.coordinates, r.durationSeconds);
          // Auto-fit only on first route calculation (not when adding/editing waypoints)
          const hadPreviousRoute = routeGeojsonRef.current?.coordinates?.length > 1;
          routeGeojsonRef.current = r.geometry;
          if (!hadPreviousRoute) {
            fitRoute();
          }
        }
      } catch {}
      setRouteLoading(false);
    }, 800);
    return () => { if (routeDebounceRef.current) clearTimeout(routeDebounceRef.current); };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, waypoints.length, waypoints.map((w) => `${w.lat},${w.lng}`).join('|'), routePreference, departure.getTime()]);

  // Map long press — context menu to add points
  function handleMapLongPress(e: any) {
    const geom = e.geometry as any;
    if (!geom?.coordinates) return;
    const [lng, lat] = geom.coordinates;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const placePoint = async (type: 'origin' | 'destination' | 'waypoint') => {
      markUserPlacing();
      const name = await reverseGeocodeLoc(lat, lng);
      const loc: Loc = { name, lat, lng };
      if (type === 'origin') setOrigin(loc);
      else if (type === 'destination') setDestination(loc);
      else {
        // Read live waypoint count (closure may be stale)
        const currentWps = useTripPlannerStore.getState().tripWaypoints;
        if (currentWps.length >= MAX_WAYPOINTS) { showWaypointLimitAlert(); return; }
        const insertIdx = findInsertionIndex(lat, lng);
        const newWps = [...waypoints];
        newWps.splice(insertIdx, 0, loc);
        setWaypoints(newWps);
      }
    };

    // Build context menu options based on current state
    let options: string[];
    let handlers: Array<() => void>;

    if (!origin) {
      options = ['Set as Start', 'Set as Stop', 'Set as Destination', 'Cancel'];
      handlers = [
        () => placePoint('origin'),
        () => placePoint('waypoint'),
        () => placePoint('destination'),
        () => {},
      ];
    } else if (!destination) {
      options = ['Set as Stop', 'Set as Destination', 'Cancel'];
      handlers = [
        () => placePoint('waypoint'),
        () => placePoint('destination'),
        () => {},
      ];
    } else {
      options = ['Add as Stop', 'Cancel'];
      handlers = [
        () => placePoint('waypoint'),
        () => {},
      ];
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, title: 'Add to Route' },
        (idx) => { handlers[idx]?.(); },
      );
    } else {
      Alert.alert('Add to Route', undefined, [
        ...options.slice(0, -1).map((label, i) => ({ text: label, onPress: handlers[i] })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
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
        const routes = await fetchDirections(o.lng, o.lat, d.lng, d.lat, mapPref(routePreference), wps.length > 0 ? wps : undefined);
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
  /** Find the best insertion index for a new waypoint based on proximity to route segments */
  function findInsertionIndex(lat: number, lng: number): number {
    // Build ordered list of all route points: [origin, ...waypoints, destination?]
    const points: Array<{ lat: number; lng: number }> = [];
    if (origin) points.push(origin);
    points.push(...waypoints);
    if (destination) points.push(destination);

    if (points.length < 2) return waypoints.length; // append

    // Point-to-segment squared distance
    function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      const projX = ax + t * dx, projY = ay + t * dy;
      return (px - projX) ** 2 + (py - projY) ** 2;
    }

    // Find which segment is closest to the pressed location
    let bestSegIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const d = segDistSq(lng, lat, points[i].lng, points[i].lat, points[i + 1].lng, points[i + 1].lat);
      if (d < bestDist) { bestDist = d; bestSegIdx = i; }
    }

    // Segment 0 = origin→WP0 → insert at waypoint index 0
    // Segment 1 = WP0→WP1 → insert at waypoint index 1
    // Segment N (last, to destination) → insert at waypoints.length
    const insertIdx = origin ? bestSegIdx : bestSegIdx;
    return Math.min(insertIdx, waypoints.length);
  }

  function handleRouteLinePress(e: any) {
    const geom = e.geometry as any;
    if (!geom?.coordinates) return;
    const [lng, lat] = geom.coordinates;
    const currentWps = useTripPlannerStore.getState().tripWaypoints;
    if (currentWps.length >= MAX_WAYPOINTS) { showWaypointLimitAlert(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markUserPlacing();
    const insertIdx = findInsertionIndex(lat, lng);
    (async () => {
      const name = await reverseGeocodeLoc(lat, lng);
      const newWps = [...waypoints];
      newWps.splice(insertIdx, 0, { name, lat, lng });
      setWaypoints(newWps);
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
    setTooManyStopsDismissed(false);
    if (route.points.length < 2) return;
    const pts = route.points;
    const first = pts[0];
    const last = pts[pts.length - 1];

    // Clear existing trip first
    clearTrip();

    // Set origin + destination
    setOrigin({ name: route.name.split('→')[0]?.trim() || 'Start', lat: first.lat, lng: first.lng });
    setDestination({ name: route.name.split('→')[1]?.trim() || route.name, lat: last.lat, lng: last.lng });

    // Sample up to 20 intermediate waypoints
    const maxWaypoints = 20;
    const intermediateCount = Math.min(pts.length - 2, maxWaypoints);
    const wps: Array<{ name: string; lat: number; lng: number }> = [];
    if (pts.length > 2 && intermediateCount > 0) {
      const step = (pts.length - 1) / (intermediateCount + 1);
      for (let i = 1; i <= intermediateCount; i++) {
        const idx = Math.round(step * i);
        if (idx > 0 && idx < pts.length - 1) {
          wps.push({ name: `Waypoint ${i}`, lat: pts[idx].lat, lng: pts[idx].lng });
        }
      }
    }
    setWaypoints(wps);

    // Set geometry directly from saved points
    const geometry = {
      type: 'LineString' as const,
      coordinates: pts.map((p) => [p.lng, p.lat] as [number, number]),
    };
    setTripRoute(geometry, route.distance_miles, route.duration_seconds ?? 0, true);
    setSaved(false);

    setTimeout(() => fitRoute(), 500);
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

    // For manual routes (imported/loaded), pass geometry directly to ride screen
    const isManual = useTripPlannerStore.getState().tripRouteIsManual;
    if (isManual && routeGeojson?.coordinates?.length > 1) {
      const routeObj: Route = {
        id: `trip_${Date.now()}`,
        user_id: user?.id ?? 'local',
        name: `${origin?.name?.split(',')[0] || 'Start'} → ${destination.name?.split(',')[0] || 'End'}`,
        points: routeGeojson.coordinates.map((c: [number, number]) => ({ lat: c[1], lng: c[0] })),
        distance_miles: routeDistance,
        elevation_gain_ft: 0,
        duration_seconds: routeDuration || null,
        created_at: new Date().toISOString(),
      };
      useRoutesStore.getState().setPendingNavigateRoute(routeObj);
    } else {
      navStore.setPendingSearchDest(destination);
    }

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

  function showToast(msg: string, duration = 2500) {
    // Clear first to re-trigger even if same message
    setToastMsg('');
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    requestAnimationFrame(() => {
      setToastMsg(msg);
      toastTimerRef.current = setTimeout(() => setToastMsg(''), duration);
    });
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
        <MapView style={StyleSheet.absoluteFillObject} styleURL={mapStyle} scrollEnabled zoomEnabled rotateEnabled={false} attributionEnabled={false} logoEnabled={false} scaleBarEnabled={false} onLongPress={handleMapLongPress} onDidFinishLoadingStyle={() => setMapStyleReady(true)} onWillStartLoadingMap={() => setMapStyleReady(false)}>
          <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: AUSTIN, zoomLevel: 9 }} />
          {/* Origin — green pin with "A" */}
          {origin && (
            <MarkerView id="tp-origin-label" coordinate={[origin.lng, origin.lat]}>
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMarker({ type: 'origin', name: origin.name, coordinate: [origin.lng, origin.lat] }); }}>
                <View style={[st.numberedPin, { backgroundColor: theme.green }]}>
                  <Text style={st.pinText}>A</Text>
                </View>
              </Pressable>
            </MarkerView>
          )}
          {origin && (
            <PointAnnotation id="tp-origin" coordinate={[origin.lng, origin.lat]} draggable onDragStart={() => handleMarkerDragStart('origin')} onDrag={(e: any) => handleMarkerDrag('origin', e)} onDragEnd={(e: any) => handleMarkerDragEnd('origin', e)}>
              <View style={{ width: 26, height: 26, opacity: 0 }} />
            </PointAnnotation>
          )}
          {/* Destination — red pin with "B" */}
          {destination && (
            <MarkerView id="tp-dest-label" coordinate={[destination.lng, destination.lat]}>
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMarker({ type: 'destination', name: destination.name, coordinate: [destination.lng, destination.lat] }); }}>
                <View style={[st.numberedPin, { backgroundColor: theme.red }]}>
                  <Text style={st.pinText}>B</Text>
                </View>
              </Pressable>
            </MarkerView>
          )}
          {destination && (
            <PointAnnotation id="tp-dest" coordinate={[destination.lng, destination.lat]} draggable onDragStart={() => handleMarkerDragStart('destination')} onDrag={(e: any) => handleMarkerDrag('destination', e)} onDragEnd={(e: any) => handleMarkerDragEnd('destination', e)}>
              <View style={{ width: 26, height: 26, opacity: 0 }} />
            </PointAnnotation>
          )}
          {/* Waypoints — numbered pins (Calimoto style) */}
          {waypoints.map((wp, i) => {
            const isFuel = /gas|fuel|station|petrol|7-eleven|7eleven|shell|exxon|chevron|bp\b|circle k|qt\b|quiktrip|love'?s|pilot|flying j|casey|wawa|sheetz|racetrac|murphy|speedway|valero|sunoco|marathon|conoco|phillips|sinclair|citgo|hess|arco|mobil|texaco|costco gas|sam'?s gas|buc-ee/i.test(wp.name);
            const isFood = /restaurant|cafe|diner|grill|burger|pizza|taco|bbq|barbecue|steakhouse|mcdonald|wendy|subway|chick-fil|whataburger|waffle|ihop|denny|cracker barrel|sonic|arby|jack in the box|panda express|chipotle|five guys/i.test(wp.name);
            const pinColor = isFuel ? '#FFD600' : isFood ? '#FF9800' : theme.red;
            const textColor = isFuel || isFood ? '#000' : '#fff';
            return (
              <View key={`tp-wp-group-${i}`}>
                <MarkerView id={`tp-wp-label-${i}`} coordinate={[wp.lng, wp.lat]}>
                  <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedMarker({ type: 'waypoint', index: i, name: wp.name, coordinate: [wp.lng, wp.lat] }); }}>
                    <View style={[st.numberedPin, { backgroundColor: pinColor }]}>
                      <Text style={[st.pinText, { color: textColor }]}>{i + 1}</Text>
                    </View>
                  </Pressable>
                </MarkerView>
                <PointAnnotation id={`tp-wp-${i}`} coordinate={[wp.lng, wp.lat]} draggable onDragStart={() => handleMarkerDragStart(i)} onDrag={(e: any) => handleMarkerDrag(i, e)} onDragEnd={(e: any) => handleMarkerDragEnd(i, e)}>
                  <View style={{ width: 26, height: 26, opacity: 0 }} />
                </PointAnnotation>
              </View>
            );
          })}
          {mapStyleReady && routeGeojson && <ShapeSource id="tp-route" shape={routeGeojson} onPress={handleRouteLinePress}><LineLayer id="tp-route-line" style={{ lineColor: theme.red, lineWidth: 4, lineOpacity: 0.8 }} /></ShapeSource>}
          {/* Construction layer */}
          {mapStyleReady && constructionOn && constructionGeoJSON.features.length > 0 && (
            <ShapeSource
              id="tp-construction-src"
              shape={constructionGeoJSON}
              onPress={(e: any) => {
                const props = e.features?.[0]?.properties;
                if (!props) return;
                Alert.alert(props.title ?? 'Construction', `${props.description ?? ''}${props.severity ? `\nSeverity: ${props.severity}` : ''}`);
              }}
            >
              <CircleLayer
                id="tp-construction-dots"
                style={{ circleColor: '#FF9800', circleRadius: 7, circleStrokeColor: '#000', circleStrokeWidth: 1.5 }}
              />
            </ShapeSource>
          )}
        </MapView>
        {routeLoading && <View style={st.mapOverlay}><ActivityIndicator size="small" color="#FFFFFF" /></View>}
        {/* Fit route button */}
        {routeGeojson && (
          <Pressable style={[st.fitRouteBtn, { backgroundColor: theme.bgPanel, borderColor: theme.border }]} onPress={() => fitRoute()}>
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
        {/* Full-screen toggle — green when active, muted when not */}
        <Pressable
          style={[st.fullScreenBtn, {
            backgroundColor: fullScreen ? (theme.green ?? '#2E7D32') + 'CC' : theme.bgPanel,
            borderColor: fullScreen ? (theme.green ?? '#2E7D32') : theme.border,
          }]}
          onPress={fullScreen ? exitFullScreen : enterFullScreen}
        >
          <Feather name={fullScreen ? 'minimize-2' : 'maximize-2'} size={18} color={fullScreen ? '#fff' : theme.textSecondary} />
        </Pressable>
        {/* Construction layer toggle */}
        <Pressable
          style={[st.constructionBtn, { backgroundColor: constructionOn ? 'rgba(255,152,0,0.15)' : theme.bgPanel, borderColor: constructionOn ? '#FF9800' : theme.border }]}
          onPress={handleToggleConstruction}
          disabled={constructionLoading}
        >
          {constructionLoading
            ? <ActivityIndicator size="small" color="#FF9800" />
            : <Feather name="alert-triangle" size={16} color={constructionOn ? '#FF9800' : theme.textMuted} />
          }
        </Pressable>
        {/* Scout FAB removed — now in FloatingTabBar */}
      </View>

      {/* Bottom sheet panel */}
      <Animated.View style={[st.bottomSheet, { top: panelY, backgroundColor: theme.bgPanel }]}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={st.dragHandleWrap}>
          <View style={[st.dragHandle, { backgroundColor: theme.border }]} />
        </View>

        <ScrollView ref={panelScrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: panelExpanded ? 140 : 300 }} keyboardShouldPersistTaps="handled" scrollIndicatorInsets={{ top: 20 }}>
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
              {/* Clear trip — always show when data exists */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 }}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  onPress={() => setImportModalOpen(true)}
                  hitSlop={8}
                >
                  <Feather name="bookmark" size={11} color={theme.textMuted} />
                  <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '600' }}>IMPORT ROUTE</Text>
                </Pressable>
                {(origin || destination || waypoints.length > 0) && (
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    onPress={() => clearTrip()}
                    hitSlop={8}
                  >
                    <Feather name="rotate-ccw" size={11} color={theme.textMuted} />
                    <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '600' }}>CLEAR TRIP</Text>
                  </Pressable>
                )}
              </View>

              {/* Too many points notice — routes with 26+ waypoints can't be edited */}
              {tripRouteIsManual && waypoints.length > 23 && !tooManyStopsDismissed && (
                <View style={{ backgroundColor: theme.bgCard, borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                    This route has too many stops to edit in the app. You can navigate it as is, edit it or save a copy. Clear it to plan a new route.
                    {'\n\n'}Need to build a complex multi-stop route? Plan it free at{' '}
                    <Text style={{ color: theme.red, textDecorationLine: 'underline' }} onPress={() => Linking.openURL('https://kurviger.de')}>kurviger.de</Text>
                    {' '}— it's built for motorcycle trips. Export as GPX and import it into My Routes.
                  </Text>
                  <Pressable
                    style={{ alignSelf: 'flex-end', marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: theme.red, borderRadius: 6 }}
                    onPress={() => setTooManyStopsDismissed(true)}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Got It</Text>
                  </Pressable>
                </View>
              )}

              {(
                /* Editable fields for planned routes */
                <>
                  {/* Origin */}
                  <Pressable style={[st.field, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => setActiveField('origin')}>
                    <View style={[st.fieldBadge, { backgroundColor: theme.green }]}>
                      <Text style={st.fieldBadgeText}>A</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.fieldText, { color: origin ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>{origin?.name ?? 'Starting point'}</Text>
                      {origin && <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 1 }} numberOfLines={1}>{getAddress('origin') ?? `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`}</Text>}
                    </View>
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
                          const isAtLimit = waypoints.length >= MAX_WAYPOINTS && idx === waypoints.length - 1;
                          const wpIsFuel = /gas|fuel|station|petrol|7-eleven|7eleven|shell|exxon|chevron|bp\b|circle k|qt\b|quiktrip|love'?s|pilot|flying j|casey|wawa|sheetz|racetrac|murphy|speedway|valero|sunoco|marathon|conoco|phillips|sinclair|citgo|hess|arco|mobil|texaco|costco gas|sam'?s gas|buc-ee/i.test(wp.name);
                          const wpIsFood = /restaurant|cafe|diner|grill|burger|pizza|taco|bbq|barbecue|steakhouse|mcdonald|wendy|subway|chick-fil|whataburger|waffle|ihop|denny|cracker barrel|sonic|arby|jack in the box|panda express|chipotle|five guys/i.test(wp.name);
                          const badgeColor = isAtLimit ? '#FF9800' : wpIsFuel ? '#FFD600' : wpIsFood ? '#FF9800' : theme.red;
                          const badgeTextColor = wpIsFuel || wpIsFood ? '#000' : '#fff';
                          return (
                            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, opacity: isActive ? 0.8 : 1, transform: [{ scale: isActive ? 1.03 : 1 }] }]}>
                              <Pressable style={[st.field, { backgroundColor: isActive ? theme.bgPanel : theme.bgCard, borderColor: theme.border, flex: 1 }]} onPress={() => setActiveField(idx)}>
                                <View style={[st.fieldBadge, { backgroundColor: badgeColor }]}>
                                  <Text style={[st.fieldBadgeText, { color: badgeTextColor }]}>{idx + 1}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={[st.fieldText, { color: theme.textPrimary }]} numberOfLines={1}>{wp.name}</Text>
                                  <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 1 }} numberOfLines={1}>
                                    {getAddress('waypoint', idx) ?? `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`}
                                  </Text>
                                </View>
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

                  {/* Add Stop + limit warning */}
                  <View ref={addStopRef} collapsable={false}>
                  {waypoints.length < MAX_WAYPOINTS && (
                    <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: -2, marginBottom: 2 }} onPress={() => { setActiveField(waypoints.length); }}>
                      <Feather name="plus" size={13} color={theme.textSecondary} />
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>Add Stop</Text>
                    </Pressable>
                  )}
                  {waypoints.length >= MAX_WAYPOINTS && (
                    <Pressable onPress={showWaypointLimitAlert} style={{ alignItems: 'center', marginTop: -2, marginBottom: 2 }}>
                      <Text style={{ fontSize: 11, color: '#FF9800', fontWeight: '600' }}>Stop limit reached</Text>
                      <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>Tap for options</Text>
                    </Pressable>
                  )}
                  {waypoints.length >= 20 && waypoints.length < MAX_WAYPOINTS && (
                    <Text style={{ fontSize: 10, color: theme.textMuted, textAlign: 'center', marginBottom: 2 }}>{MAX_WAYPOINTS - waypoints.length} stop{MAX_WAYPOINTS - waypoints.length === 1 ? '' : 's'} remaining</Text>
                  )}
                  </View>

                  {/* Destination */}
                  <Pressable style={[st.field, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => setActiveField('destination')}>
                    <View style={[st.fieldBadge, { backgroundColor: theme.red }]}>
                      <Text style={st.fieldBadgeText}>B</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.fieldText, { color: destination ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>{destination?.name ?? 'Destination'}</Text>
                      {destination && <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 1 }} numberOfLines={1}>{getAddress('destination') ?? `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}`}</Text>}
                    </View>
                    {destination && <Pressable onPress={() => setDestination(null)} hitSlop={8}><Feather name="x" size={14} color={theme.textMuted} /></Pressable>}
                  </Pressable>

                  {/* Reverse Route */}
                  {origin && destination && (
                    <View style={{ alignItems: 'center', marginVertical: 12 }}>
                      <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={handleReverse}>
                        <Feather name="refresh-cw" size={13} color={theme.textSecondary} />
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>Reverse Route</Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}

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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                    {/* Date field */}
                    <Pressable
                      style={[st.dateChip, { flex: 1, backgroundColor: theme.bgPanel, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }]}
                      onPress={() => { setShowDatePicker(!showDatePicker); setShowTimePicker(false); }}
                    >
                      <Feather name="calendar" size={12} color={theme.textSecondary} />
                      <Text style={[st.dateChipText, { color: theme.textPrimary }]}>
                        {departure.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                    </Pressable>
                    {/* Time field */}
                    <Pressable
                      style={[st.dateChip, { flex: 1, backgroundColor: theme.bgPanel, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }]}
                      onPress={() => { setShowTimePicker(!showTimePicker); setShowDatePicker(false); }}
                    >
                      <Feather name="clock" size={12} color={theme.textSecondary} />
                      <Text style={[st.dateChipText, { color: hasCustomTime ? theme.textPrimary : theme.textMuted }]}>
                        {hasCustomTime
                          ? departure.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                          : 'Set time'}
                      </Text>
                    </Pressable>
                    {/* Clear time */}
                    {hasCustomTime && (
                      <Pressable hitSlop={8} onPress={() => { setHasCustomTime(false); const n = new Date(departure); n.setHours(0, 0, 0, 0); setDeparture(n); }}>
                        <Feather name="x" size={14} color={theme.textMuted} />
                      </Pressable>
                    )}
                  </View>
                  {/* Inline date picker */}
                  {showDatePicker && Platform.OS === 'ios' && (
                    <View style={[st.inlinePicker, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 4 }}>
                        <Pressable onPress={() => setShowDatePicker(false)}>
                          <Text style={{ color: theme.red, fontSize: 14, fontWeight: '600' }}>Done</Text>
                        </Pressable>
                      </View>
                      <DateTimePicker
                        value={departure}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        themeVariant={isDark ? 'dark' : 'light'}
                        onChange={(_e: DateTimePickerEvent, selected?: Date) => {
                          if (selected) {
                            setCustomDate(selected);
                            const withTime = applyDefaultTime(selected);
                            setDeparture(withTime);
                            setHasCustomTime(true);
                          }
                        }}
                      />
                    </View>
                  )}
                  {showDatePicker && Platform.OS === 'android' && (
                    <DateTimePicker
                      value={departure}
                      mode="date"
                      display="default"
                      minimumDate={new Date()}
                      onChange={(_e: DateTimePickerEvent, selected?: Date) => {
                        setShowDatePicker(false);
                        if (selected) {
                          setCustomDate(selected);
                          const withTime = applyDefaultTime(selected);
                          setDeparture(withTime);
                          setHasCustomTime(true);
                        }
                      }}
                    />
                  )}
                  {/* Inline time picker */}
                  {showTimePicker && Platform.OS === 'ios' && (
                    <View style={[st.inlinePicker, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 4 }}>
                        <Pressable onPress={() => setShowTimePicker(false)}>
                          <Text style={{ color: theme.red, fontSize: 14, fontWeight: '600' }}>Done</Text>
                        </Pressable>
                      </View>
                      <DateTimePicker
                        value={departure}
                        mode="time"
                        display="spinner"
                        minuteInterval={15}
                        themeVariant={isDark ? 'dark' : 'light'}
                        onChange={(_e: DateTimePickerEvent, selected?: Date) => {
                          if (selected) {
                            const n = new Date(departure);
                            n.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                            setDeparture(n);
                            setHasCustomTime(true);
                          }
                        }}
                      />
                    </View>
                  )}
                  {showTimePicker && Platform.OS === 'android' && (
                    <DateTimePicker
                      value={departure}
                      mode="time"
                      display="default"
                      minuteInterval={15}
                      onChange={(_e: DateTimePickerEvent, selected?: Date) => {
                        setShowTimePicker(false);
                        if (selected) {
                          const n = new Date(departure);
                          n.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                          setDeparture(n);
                          setHasCustomTime(true);
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
                        <Pressable onPress={() => { setWeatherLoading(true); const coords = routeGeojsonRef.current?.coordinates; if (coords) fetchRouteWeather(coords, departure, routeDuration).then(({ points, useCelsius, useMiles }) => { setWeatherUseCelsius(useCelsius); setWeatherUseMiles(useMiles); let msg: string | null; let concern: boolean; if (points.length === 0 || points.every((p) => p.temp === 0)) { msg = 'Unable to check route weather.'; concern = false; } else if (!hasRouteWeatherConcern(points, useCelsius)) { msg = 'Clear conditions along this route.'; concern = false; } else { msg = getRouteWarningMessage(points, useCelsius) ?? 'Check conditions before riding.'; concern = true; } setTripWeather(points, msg, concern, points.length); }).catch(() => setTripWeather([], 'Unable to check route weather.', false, 0)).finally(() => setWeatherLoading(false)); }} style={{ padding: 4 }}>
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
                <View style={{ marginTop: 8, marginBottom: panelExpanded ? 140 : 300, gap: 8, marginHorizontal: 16 }}>
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
            <View style={{ width: 22 }} />
            <Text style={[st.importTitle, { color: theme.textPrimary }]}>Import from My Routes</Text>
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

      {/* Scout panel now global in _layout.tsx */}

      {/* Toast */}
      {!!toastMsg && (
        <View style={[st.toast, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Feather name="check-circle" size={14} color={theme.green} />
          <Text style={[st.toastText, { color: theme.textPrimary }]}>{toastMsg}</Text>
        </View>
      )}

      {/* Marker detail modal */}
      <MarkerDetailModal
        marker={selectedMarker}
        onClose={() => setSelectedMarker(null)}
        onRemove={(type, index) => {
          if (type === 'origin') setOrigin(null);
          else if (type === 'destination') setDestination(null);
          else if (type === 'waypoint' && index != null) setWaypoints(waypoints.filter((_, i) => i !== index));
        }}
        totalWaypoints={waypoints.length}
        routeDistance={routeDistance}
        routeDuration={routeDuration}
      />
    </View>
  );
}

const st = StyleSheet.create({
  marker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  markerDragging: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, opacity: 0.85 },
  numberedPin: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 5,
  },
  pinText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  fieldBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  fieldBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  mapOverlay: { position: 'absolute', top: 20, left: '50%', transform: [{ translateX: -20 }], zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
  fitRouteBtn: { position: 'absolute', top: 112, left: 12, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  layersBtn: { position: 'absolute', top: 50, right: 12, width: 44, height: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fullScreenBtn: { position: 'absolute', top: 102, right: 12, width: 44, height: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  constructionBtn: { position: 'absolute', top: 154, right: 12, width: 44, height: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
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
  fieldsWrap: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 16, gap: 10 },
  searchPad: { padding: 16 },
  actionsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 },
  secBtnRow: { flexDirection: 'row', gap: 8 },
  checkpointDistWrap: { width: 48 },
  condMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  condTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveModalPad: { padding: 20, gap: 16 },
});
