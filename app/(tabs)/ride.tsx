import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Mapbox, {
  Camera,
  CircleLayer,
  LineLayer,
  LocationPuck,
  MapView,
  RasterLayer,
  RasterSource,
  ShapeSource,
  StyleURL,
} from '@rnmapbox/maps';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useAuthStore, useGarageStore, useRoutesStore, useSafetyStore, bikeLabel } from '../../lib/store';
import { startShare, endShare, shareUrl } from '../../lib/liveShare';
import { startBackgroundLocation, stopBackgroundLocation } from '../../lib/backgroundTasks';
import { routeGeoJson, calcDistance } from '../../lib/gpx';
import { createRoute } from '../../lib/routes';
import {
  fuelStationsGeoJson,
  fetchFuelStations,
  foodPlacesGeoJson,
  fetchFoodPlaces,
  type FuelStation,
  type FoodPlace,
} from '../../lib/mapOverlays';
import type { Route } from '../../lib/routes';
import type { TrackPoint } from '../../lib/gpx';
import PreRideChecklist, { type RideConfig } from '../../components/safety/PreRideChecklist';
import SaveRideSheet from '../../components/ride/SaveRideSheet';
import PlaceDetailPanel, { type PlaceDetail } from '../../components/ride/PlaceDetailPanel';
import HamburgerButton from '../../components/navigation/HamburgerButton';
import HamburgerMenu from '../../components/navigation/HamburgerMenu';
import TimetomotoLogo from '../../components/common/TimetomotoLogo';
import { HEADER_HEIGHT, LOGO_WIDTH, LOGO_HEIGHT, END_BUTTON_BOTTOM, END_BUTTON_RIGHT } from '../../lib/headerLayout';
import { darkTheme } from '../../lib/theme';
import { useTheme } from '../../lib/useTheme';
import { useNavigationStore } from '../../lib/navigationStore';
import { fetchDirections, distanceToRouteMeters, findNextStepIndex, haversineMeters } from '../../lib/directions';
import MapControlDrawer from '../../components/ride/MapControlDrawer';
import SearchSheet from '../../components/ride/SearchSheet';
import RoutePreviewScreen from '../../components/ride/RoutePreviewScreen';
import TurnCard from '../../components/ride/TurnCard';
import NavigationStatsBar from '../../components/ride/NavigationStatsBar';
import CompletionScreen from '../../components/ride/CompletionScreen';

// ---------------------------------------------------------------------------
// Mapbox init — runs once
// ---------------------------------------------------------------------------
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');
Mapbox.setTelemetryEnabled(false);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MapStyle = 'standard' | 'terrain' | 'satellite' | 'hybrid';

const MAP_STYLES: Record<MapStyle, string> = {
  standard:  'mapbox://styles/mapbox/dark-v11',
  terrain:   StyleURL.Outdoors,
  satellite: StyleURL.Satellite,
  hybrid:    StyleURL.SatelliteStreet,
};

const AUSTIN = [-97.7431, 30.2672] as [number, number];

const TOMORROW_KEY = process.env.EXPO_PUBLIC_TOMORROW_API_KEY ?? '';

// ---------------------------------------------------------------------------
// Weather legend overlay
// ---------------------------------------------------------------------------

const WeatherLegend = memo(function WeatherLegend() {
  const { theme } = useTheme();
  return (
    <View style={[wl.panel, { backgroundColor: theme.mapOverlayBg, borderColor: theme.border }]}>
      <Text style={[wl.title, { color: '#fff' }]}>PRECIPITATION</Text>
      <View style={wl.row}>
        <View style={[wl.swatch, { backgroundColor: '#1a1aff' }]} />
        <Text style={[wl.label, { color: '#fff' }]}>Heavy</Text>
        <View style={[wl.swatch, { backgroundColor: '#00aaff', marginLeft: 8 }]} />
        <Text style={[wl.label, { color: '#fff' }]}>Moderate</Text>
      </View>
      <View style={wl.row}>
        <View style={[wl.swatch, { backgroundColor: '#aaffaa' }]} />
        <Text style={[wl.label, { color: '#fff' }]}>Light</Text>
        <View style={[wl.swatch, { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', marginLeft: 8 }]} />
        <Text style={[wl.label, { color: '#fff' }]}>None</Text>
      </View>
    </View>
  );
});

const wl = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 168,
    left: 16,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 4,
    minWidth: 160,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  swatch: {
    width: 14,
    height: 10,
    borderRadius: 2,
  },
  label: {
    fontSize: 10,
  },
});

// ---------------------------------------------------------------------------
// Sub-screens
// ---------------------------------------------------------------------------

function RecordScreen({
  onStopRequested,
  elapsedSeconds,
  onBikeSelected,
}: {
  onStopRequested: () => void;
  elapsedSeconds: number;
  onBikeSelected?: (bikeId: string | null) => void;
}) {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const {
    isRecording, setRecording, isMonitoring, lastKnownLocation,
    shareToken, shareActive, setShareToken, setShareActive,
    checkInActive, checkInDeadline, checkInNotifId, clearCheckIn,
    setCheckIn, emergencyContacts,
  } = useSafetyStore();

  // Check-in countdown
  const [checkInSecsLeft, setCheckInSecsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!checkInActive || !checkInDeadline) { setCheckInSecsLeft(null); return; }
    const tick = () => {
      const left = Math.max(0, Math.round((checkInDeadline - Date.now()) / 1000));
      setCheckInSecsLeft(left);
      if (left === 0) clearInterval(tickRef.current!);
    };
    tick();
    const tickRef = { current: setInterval(tick, 1000) };
    return () => clearInterval(tickRef.current!);
  }, [checkInActive, checkInDeadline]);

  function formatHMS(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  function formatCountdown(secs: number) {
    if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
    if (secs >= 60)   return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${secs}s`;
  }

  // ── START ride ──
  async function handleStart(cfg: RideConfig) {
    onBikeSelected?.(cfg.bikeId ?? null);
    setRecording(true);

    // Live share
    if (cfg.shareEnabled && user) {
      try {
        const loc = lastKnownLocation ?? { lat: 0, lng: 0 };
        const token = await startShare(user.id, loc.lat, loc.lng);
        setShareToken(token);
        setShareActive(true);
        await Clipboard.setStringAsync(shareUrl(token));
        await startBackgroundLocation();
      } catch {
        // Non-fatal — ride continues without share
      }
    }

    // Check-in timer
    if (cfg.checkInMinutes) {
      const deadline = Date.now() + cfg.checkInMinutes * 60_000;
      let notifId: string | null = null;
      try {
        await Notifications.requestPermissionsAsync();
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: '⏰ timetomoto check-in due',
            body: `Check in by ${new Date(deadline).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} or your contacts will be alerted.`,
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(deadline) },
        });
        notifId = id;
      } catch {}
      setCheckIn(deadline, notifId);
    }
  }

  // ── STOP ride — delegate to parent which handles save sheet ──
  async function handleStop() {
    // End share & check-in before showing save sheet
    if (shareToken) {
      endShare(shareToken).catch(() => {});
      setShareToken(null);
      setShareActive(false);
      stopBackgroundLocation().catch(() => {});
    }
    if (checkInNotifId) {
      Notifications.cancelScheduledNotificationAsync(checkInNotifId).catch(() => {});
    }
    clearCheckIn();

    onStopRequested();
  }

  // ── CHECK IN ──
  async function handleCheckIn() {
    if (checkInNotifId) {
      Notifications.cancelScheduledNotificationAsync(checkInNotifId).catch(() => {});
    }
    clearCheckIn();
  }

  // ── PRE-RIDE view ──
  if (!isRecording) {
    return <PreRideChecklist onStart={handleStart} />;
  }

  // ── ACTIVE RIDE view — transparent overlay on top of the map ──
  return (
    <View style={{ flex: 1 }} pointerEvents="box-none">
      {/* Status badges — share / check-in only (crash badge is already on the map header) */}
      <View style={styles.recordActiveCenter} pointerEvents="box-none">
        {/* Live share status */}
        {shareActive && (
          <View style={[styles.statusRow, { backgroundColor: 'rgba(0,0,0,0.65)', borderColor: '#4CAF5044' }]}>
            <View style={styles.statusDot} />
            <Text style={[styles.statusText, { color: '#ccc' }]}>LIVE — location link copied to clipboard</Text>
            <Pressable onPress={async () => {
              if (shareToken) await Clipboard.setStringAsync(shareUrl(shareToken));
            }}>
              <Feather name="copy" size={14} color="#ccc" />
            </Pressable>
          </View>
        )}

        {/* Check-in countdown */}
        {checkInActive && checkInSecsLeft !== null && (
          <View style={[styles.statusRow, { backgroundColor: 'rgba(0,0,0,0.65)', borderColor: checkInSecsLeft < 300 ? theme.red + '66' : 'rgba(255,255,255,0.15)' }]}>
            <Feather
              name="clock"
              size={14}
              color={checkInSecsLeft < 300 ? theme.red : '#ccc'}
            />
            <Text style={[styles.statusText, { color: '#ccc' }, checkInSecsLeft < 300 && { color: theme.red }]}>
              Check in: {formatCountdown(checkInSecsLeft)} remaining
            </Text>
            <Pressable style={styles.checkInBtn} onPress={handleCheckIn}>
              <Text style={styles.checkInBtnText}>CHECK IN</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stats overlay (shown on MAP tab while recording)
// ---------------------------------------------------------------------------

function StatsOverlay({ isRecording, elapsedSeconds, speedMph }: { isRecording: boolean; elapsedSeconds: number; speedMph: number }) {
  const { theme } = useTheme();
  const { recordedPoints } = useSafetyStore();

  function formatHMS(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  const miles = isRecording ? calcDistance(recordedPoints) : 0;

  return (
    <View style={[styles.statsBar, { backgroundColor: theme.mapOverlayBg, borderColor: theme.border }]}>
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: theme.textPrimary }]}>{Math.round(speedMph)}</Text>
        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>MPH</Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: theme.textPrimary }]}>{miles < 10 ? miles.toFixed(1) : Math.round(miles)}</Text>
        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>MILES</Text>
      </View>
      <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
      <View style={styles.statItem}>
        <Text style={[styles.statValue, { color: theme.textPrimary }]}>{formatHMS(elapsedSeconds)}</Text>
        <Text style={[styles.statLabel, { color: theme.textSecondary }]}>TIME</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main RideScreen
// ---------------------------------------------------------------------------

export default function RideScreen() {
  const { theme } = useTheme();
  const [mapStyle, setMapStyle] = useState<MapStyle>('standard');
  const { user }                = useAuthStore();
  const { addRoute, pendingNavigateRoute, setPendingNavigateRoute } = useRoutesStore();
  const { bikes, selectedBikeId, fetchBikes } = useGarageStore();

  useEffect(() => {
    fetchBikes(user?.id ?? 'local');
  }, [user?.id]);
  const {
    isRecording, setRecording,
    recordedPoints, clearRecordedPoints,
    lastKnownLocation,
  } = useSafetyStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const { isMonitoring, setMonitoring } = useSafetyStore();

  const selectedBike = useMemo(
    () => bikes.find((b) => b.id === selectedBikeId) ?? null,
    [bikes, selectedBikeId],
  );

  // ── Navigation store ──
  const {
    mode: navMode, destination, activeRoute, alternateRoutes,
    currentStepIndex, remainingDistanceMiles, eta,
    routePreference, speedMph, headingDeg,
    setMode: setNavMode, setDestination, setActiveRoute, setAlternateRoutes,
    setCurrentStepIndex, setRemainingDistance, setEta,
    setRoutePreference, setSpeed, setHeading, setIsOffRoute,
    resetNavigation,
  } = useNavigationStore();

  // ── Drawer / sheet state ──
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [isSavedRoutePreview, setIsSavedRoutePreview] = useState(false);
  const savedRouteStartRef = useRef<{ lat: number; lng: number } | null>(null);
  const [navRouteGeojson, setNavRouteGeojson] = useState<any>(null);

  // ── Overlay toggles ──
  const [fuelStationsOn, setFuelStationsOn] = useState(false);
  const [fuelStations,   setFuelStations]   = useState<FuelStation[]>([]);
  const [fuelStationsLoading, setFuelStationsLoading] = useState(false);
  const [foodOn,         setFoodOn]         = useState(false);
  const [foodPlaces,     setFoodPlaces]     = useState<FoodPlace[]>([]);
  const [foodLoading,    setFoodLoading]    = useState(false);
  const [weatherOn,      setWeatherOn]      = useState(false);
  const [selectedPlace,  setSelectedPlace]  = useState<PlaceDetail | null>(null);

  // Fuel stations GeoJSON
  const fuelStationsGeoJsonData = useMemo(
    () => (fuelStations.length > 0 ? fuelStationsGeoJson(fuelStations) : null),
    [fuelStations],
  );

  // Food places GeoJSON
  const foodPlacesGeoJsonData = useMemo(
    () => (foodPlaces.length > 0 ? foodPlacesGeoJson(foodPlaces) : null),
    [foodPlaces],
  );

  async function handleToggleFuelStations() {
    if (fuelStationsOn) {
      setFuelStationsOn(false);
      setFuelStations([]);
      return;
    }
    setFuelStationsLoading(true);
    setFuelStationsOn(true);
    try {
      // Use visible map center, fall back to user location or default
      let c = lastKnownLocation ?? { lat: AUSTIN[1], lng: AUSTIN[0] };
      try {
        const bounds = await (mapRef.current as any)?.getVisibleBounds();
        if (bounds && bounds[0] && bounds[1]) {
          c = { lat: (bounds[0][1] + bounds[1][1]) / 2, lng: (bounds[0][0] + bounds[1][0]) / 2 };
        }
      } catch {}
      const stations = await fetchFuelStations(c.lat, c.lng);
      setFuelStations(stations);
    } catch (err) {
      console.error('Fuel fetch error:', err);
      Alert.alert('Failed', 'Could not fetch fuel stations. Check your connection.');
      setFuelStationsOn(false);
    } finally {
      setFuelStationsLoading(false);
    }
  }

  async function handleToggleFood() {
    if (foodOn) {
      setFoodOn(false);
      setFoodPlaces([]);
      return;
    }
    setFoodLoading(true);
    setFoodOn(true);
    try {
      // Use visible map center, fall back to user location or default
      let c = lastKnownLocation ?? { lat: AUSTIN[1], lng: AUSTIN[0] };
      try {
        const bounds = await (mapRef.current as any)?.getVisibleBounds();
        if (bounds && bounds[0] && bounds[1]) {
          c = { lat: (bounds[0][1] + bounds[1][1]) / 2, lng: (bounds[0][0] + bounds[1][0]) / 2 };
        }
      } catch {}
      const places = await fetchFoodPlaces(c.lat, c.lng);
      setFoodPlaces(places);
    } catch {
      Alert.alert('Failed', 'Could not fetch food places. Check your connection.');
      setFoodOn(false);
    } finally {
      setFoodLoading(false);
    }
  }

  // Map overlays: imported/navigating route + live track
  const [overlayPoints, setOverlayPoints] = useState<TrackPoint[] | null>(null);
  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [rideElapsed, setRideElapsed]     = useState(0);

  // Toast state
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2500);
  }

  const mapRef       = useRef<Mapbox.MapView>(null);
  const cameraRef    = useRef<Mapbox.Camera>(null);
  const recordingBikeIdRef = useRef<string | null>(null);
  const elapsedRef   = useRef(0);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Single source-of-truth elapsed timer — drives both RecordScreen overlay and StatsOverlay
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (isRecording) {
      elapsedRef.current = 0;
      setElapsedSeconds(0);
      elapsedTimer.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSeconds(elapsedRef.current);
      }, 1000);
    } else {
      clearInterval(elapsedTimer.current!);
      setElapsedSeconds(0);
      elapsedRef.current = 0;
    }
    return () => clearInterval(elapsedTimer.current!);
  }, [isRecording]);

  // ── GPS speed/heading tracking + 1s recorded-track updates ──
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5 },
        (loc) => {
          const speedMs = loc.coords.speed ?? 0;
          setSpeed(Math.max(0, speedMs * 2.237)); // m/s to mph
          if (loc.coords.heading != null && loc.coords.heading >= 0) {
            setHeading(loc.coords.heading);
          }
        },
      ).then((s) => { sub = s; });
    });
    return () => { sub?.remove(); };
  }, []);

  // ── Navigation engine ──
  useEffect(() => {
    if (navMode !== 'navigating' && navMode !== 'off_route') return;
    const interval = setInterval(async () => {
      const pos = lastKnownLocation;
      if (!pos || !activeRoute) return;

      // Check if we've reached the destination
      if (destination) {
        const distToDest = haversineMeters(pos.lat, pos.lng, destination.lat, destination.lng);
        if (distToDest < 30) {
          setNavMode('completed');
          clearInterval(interval);
          return;
        }
      }

      // Advance step
      const nextStep = findNextStepIndex(pos.lat, pos.lng, activeRoute.steps, currentStepIndex);
      if (nextStep !== currentStepIndex) {
        setCurrentStepIndex(nextStep);
      }

      // Off-route check
      if (navMode === 'navigating') {
        const offDist = distanceToRouteMeters(pos.lat, pos.lng, activeRoute.geometry.coordinates);
        if (offDist > 50) {
          setNavMode('off_route');
          setIsOffRoute(true);
          // Auto-recalculate after 3 seconds
          setTimeout(async () => {
            if (!destination) return;
            setNavMode('recalculating');
            try {
              const newRoutes = await fetchDirections(
                pos.lng, pos.lat, destination.lng, destination.lat, routePreference,
              );
              if (newRoutes.length > 0) {
                setActiveRoute(newRoutes[0]);
                setNavRouteGeojson(newRoutes[0].geometry);
                setCurrentStepIndex(0);
                setIsOffRoute(false);
                setNavMode('navigating');
              }
            } catch {
              setNavMode('navigating'); // Resume even if recalc fails
            }
          }, 3000);
        }
      }

      // Update remaining distance
      if (destination) {
        const remaining = haversineMeters(pos.lat, pos.lng, destination.lat, destination.lng) / 1609.344;
        setRemainingDistance(remaining);
        if (activeRoute) {
          const etaMs = Date.now() + (remaining / Math.max(speedMph, 10)) * 3600 * 1000;
          setEta(new Date(etaMs));
        }
      }

      // Update camera for heading-up navigation
      const zoom = speedMph > 50 ? 13 : speedMph > 20 ? 15 : 17;
      cameraRef.current?.setCamera({
        centerCoordinate: [pos.lng, pos.lat],
        zoomLevel: zoom,
        heading: headingDeg,
        animationDuration: 800,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [navMode, activeRoute, destination, currentStepIndex, routePreference, lastKnownLocation, speedMph, headingDeg]);

  // ── Camera: center on user when recording starts ──
  useEffect(() => {
    if (isRecording && lastKnownLocation) {
      cameraRef.current?.setCamera({
        centerCoordinate: [lastKnownLocation.lng, lastKnownLocation.lat],
        zoomLevel: 16,
        heading: headingDeg,
        animationDuration: 600,
      });
    }
  }, [isRecording]);

  // ── fetchAndPreviewRoute ──
  async function fetchAndPreviewRoute(dest: { name: string; lat: number; lng: number }, prefOverride?: import('../../lib/navigationStore').RoutePreference) {
    setDestination(dest);
    setNavMode('preview');
    setIsSavedRoutePreview(false);
    setRouteLoading(true);
    setRouteError(null);
    try {
      const origin = lastKnownLocation
        ? { lat: lastKnownLocation.lat, lng: lastKnownLocation.lng }
        : { lat: AUSTIN[1], lng: AUSTIN[0] };
      const routes = await fetchDirections(
        origin.lng, origin.lat, dest.lng, dest.lat, prefOverride ?? routePreference,
      );
      if (routes.length > 0) {
        setActiveRoute(routes[0]);
        setAlternateRoutes(routes.slice(1));
        setNavRouteGeojson(routes[0].geometry);

        // Fit camera to route bounds
        const coords = routes[0].geometry.coordinates;
        if (coords.length >= 2) {
          const lats = coords.map((c) => c[1]);
          const lngs = coords.map((c) => c[0]);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          cameraRef.current?.fitBounds(
            [maxLng, maxLat],
            [minLng, minLat],
            [80, 80, 220, 80],
            800,
          );
        }
      }
    } catch (e: any) {
      setRouteError(e?.message ?? 'Could not fetch route');
      setActiveRoute(null);
      setAlternateRoutes([]);
    } finally {
      setRouteLoading(false);
    }
  }

  // ── handleStartNavigation ──
  function handleStartNavigation(route: typeof activeRoute) {
    if (!route) return;
    setOverlayPoints(null); // Clear any previously viewed route
    setNavMode('navigating');
    setActiveRoute(route);
    setNavRouteGeojson(route.geometry);
    setCurrentStepIndex(0);
    setRemainingDistance(route.distanceMiles);

    const etaMs = Date.now() + route.durationSeconds * 1000;
    setEta(new Date(etaMs));

    const pos = lastKnownLocation;
    const startCoord = pos
      ? [pos.lng, pos.lat]
      : (route.geometry.coordinates[0] ?? AUSTIN);

    cameraRef.current?.setCamera({
      centerCoordinate: startCoord as [number, number],
      zoomLevel: 16,
      heading: headingDeg,
      animationDuration: 800,
    });
  }

  // Navigate to a saved route: use GPX geometry directly, no Directions API
  function handleNavigate(route: Route) {
    const pts = route.points ?? [];

    if (pts.length >= 2) {
      // Has GPS points — use saved geometry directly
      setOverlayPoints(pts);

      const geometry: { type: 'LineString'; coordinates: [number, number][] } = {
        type: 'LineString',
        coordinates: pts.map((p) => [p.lng, p.lat]),
      };

      const distMi = route.distance_miles ?? 0;
      const durSec = route.duration_seconds ?? (distMi > 0 ? Math.round((distMi / 30) * 3600) : 0);
      const navRoute: import('../../lib/navigationStore').NavRoute = {
        geometry,
        steps: [],
        distanceMiles: distMi,
        durationSeconds: durSec,
      };

      const dest = {
        name: route.name,
        lat: pts[pts.length - 1].lat,
        lng: pts[pts.length - 1].lng,
      };

      setDestination(dest);
      setActiveRoute(navRoute);
      setAlternateRoutes([]);
      setNavRouteGeojson(geometry);
      savedRouteStartRef.current = { lat: pts[0].lat, lng: pts[0].lng };
      setIsSavedRoutePreview(true);
      setNavMode('preview');

      // Fit camera to route bounds
      const coords = geometry.coordinates;
      const lats = coords.map((c) => c[1]);
      const lngs = coords.map((c) => c[0]);
      cameraRef.current?.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [80, 80, 220, 80],
        800,
      );
    } else {
      // No GPS points — fall back to Directions API using route name as destination
      // Try to use distance_miles to guess an end point, but really we just need
      // a destination. Use the route name and let fetchAndPreviewRoute handle it.
      showToast(`Loading directions for ${route.name}…`);
      const dest = { name: route.name, lat: 0, lng: 0 };
      // If the route somehow has a single point, use it
      if (pts.length === 1) {
        dest.lat = pts[0].lat;
        dest.lng = pts[0].lng;
        fetchAndPreviewRoute(dest);
      } else {
        // No coords at all — can't navigate without a destination
        showToast('This route has no GPS data to navigate.');
      }
    }
  }

  // Consume pending navigate route from Discover ROUTES
  useEffect(() => {
    if (pendingNavigateRoute) {
      handleNavigate(pendingNavigateRoute);
      setPendingNavigateRoute(null);
    }
  }, [pendingNavigateRoute]);

  // Dismiss checklist when recording starts
  useEffect(() => {
    if (isRecording) setShowChecklist(false);
  }, [isRecording]);

  // Stop requested: clean up share/check-in, show save sheet
  function handleStopRequested() {
    // End share & check-in
    const { shareToken, shareActive, checkInNotifId, clearCheckIn, setShareToken, setShareActive } = useSafetyStore.getState();
    if (shareToken) {
      endShare(shareToken).catch(() => {});
      setShareToken(null);
      setShareActive(false);
      stopBackgroundLocation().catch(() => {});
    }
    if (checkInNotifId) {
      Notifications.cancelScheduledNotificationAsync(checkInNotifId).catch(() => {});
    }
    clearCheckIn();

    setRideElapsed(elapsedRef.current);
    setShowSaveSheet(true);
  }

  // Save recorded ride
  async function handleSaveRide(name: string) {
    if (user) {
      const miles   = recordedPoints.length >= 2 ? calcDistance(recordedPoints) : 0;
      const gainFt  = 0;
      const saved = await createRoute(user.id, name, recordedPoints, miles, gainFt, elapsedRef.current, undefined, 'recorded', recordingBikeIdRef.current);
      if (saved) {
        addRoute(saved);
        showToast('Ride saved!');
      }
    }
    clearRecordedPoints();
    setRecording(false);
    setShowSaveSheet(false);
  }

  // Discard recorded ride
  function handleDiscardRide() {
    clearRecordedPoints();
    setRecording(false);
    setShowSaveSheet(false);
  }

  // Locate me: animate camera to user's current location
  async function handleLocateMe() {
    // Try last known location first (instant)
    if (lastKnownLocation) {
      cameraRef.current?.setCamera({
        centerCoordinate: [lastKnownLocation.lng, lastKnownLocation.lat],
        zoomLevel: 14,
        animationDuration: 600,
      });
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        cameraRef.current?.setCamera({ centerCoordinate: AUSTIN, zoomLevel: 9, animationDuration: 600 });
        return;
      }
      // Use getLastKnownPositionAsync first (instant), fall back to getCurrentPositionAsync
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        cameraRef.current?.setCamera({
          centerCoordinate: [last.coords.longitude, last.coords.latitude],
          zoomLevel: 14,
          animationDuration: 600,
        });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      cameraRef.current?.setCamera({
        centerCoordinate: [loc.coords.longitude, loc.coords.latitude],
        zoomLevel: 14,
        animationDuration: 600,
      });
    } catch {
      cameraRef.current?.setCamera({ centerCoordinate: AUSTIN, zoomLevel: 9, animationDuration: 600 });
    }
  }

  function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Live track GeoJSON
  const liveTrackGeoJson =
    isRecording && recordedPoints.length >= 2
      ? routeGeoJson(recordedPoints)
      : null;

  // Overlay GeoJSON (imported/navigating route)
  const overlayGeoJson = overlayPoints && overlayPoints.length >= 2
    ? routeGeoJson(overlayPoints)
    : null;

  // Map style — respect theme for standard, always use correct style for others
  const activeMapStyle = (() => {
    if (mapStyle === 'satellite') return StyleURL.Satellite;
    if (mapStyle === 'hybrid') return StyleURL.SatelliteStreet;
    if (mapStyle === 'terrain') return StyleURL.Outdoors;
    // standard — respect theme
    return theme.bg === darkTheme.bg
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/light-v11';
  })();

  // Weather tile URL template
  const weatherTileUrl = `https://api.tomorrow.io/v4/map/tile/{z}/{x}/{y}/precipitationIntensity/now.png?apikey=${TOMORROW_KEY}`;

  const isNavigatingActive = navMode === 'navigating' || navMode === 'off_route' || navMode === 'recalculating';

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      {/* ── Full-screen map ── */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          styleURL={activeMapStyle}
          compassEnabled
          compassPosition={{ top: Platform.OS === 'ios' ? 101 : 61, right: 12 }}
          // @ts-expect-error compassViewStyle exists at runtime but missing from types
          compassViewStyle={{ opacity: 0.7 }}
          scaleBarEnabled={false}
          attributionEnabled
          attributionPosition={{ bottom: 8, right: 8 }}
          logoEnabled={false}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{ centerCoordinate: AUSTIN, zoomLevel: 9 }}
          />

          {/* User location puck */}
          <LocationPuck puckBearingEnabled puckBearing="heading" pulsing={{ isEnabled: true }} />

          {/* ── Weather tile overlay ── */}
          {weatherOn && !!TOMORROW_KEY && (
            <RasterSource
              id="weather-tiles"
              tileUrlTemplates={[weatherTileUrl]}
              tileSize={256}
            >
              <RasterLayer
                id="weather-layer"
                style={{ rasterOpacity: 0.6 }}
              />
            </RasterSource>
          )}

          {/* ── Fuel stations ── */}
          {fuelStationsGeoJsonData && fuelStationsOn && (
            <ShapeSource
              id="fuel-stations-src"
              shape={fuelStationsGeoJsonData}
              onPress={(e) => {
                const props = e.features?.[0]?.properties;
                if (!props) return;
                const dist = lastKnownLocation
                  ? haversineMiles(lastKnownLocation.lat, lastKnownLocation.lng, props.lat, props.lng)
                  : undefined;
                setSelectedPlace({ name: props.name, address: props.address ?? '', lat: props.lat, lng: props.lng, kind: 'fuel', fuelTypes: props.fuelTypes || '', distanceMiles: dist });
              }}
            >
              <CircleLayer
                id="fuel-stations-dots"
                style={{
                  circleColor: '#FFD600',
                  circleRadius: 6,
                  circleStrokeColor: '#000',
                  circleStrokeWidth: 1.5,
                }}
              />
            </ShapeSource>
          )}

          {/* ── Food places ── */}
          {foodPlacesGeoJsonData && foodOn && (
            <ShapeSource
              id="food-places-src"
              shape={foodPlacesGeoJsonData}
              onPress={(e) => {
                const props = e.features?.[0]?.properties;
                if (!props) return;
                const dist = lastKnownLocation
                  ? haversineMiles(lastKnownLocation.lat, lastKnownLocation.lng, props.lat, props.lng)
                  : undefined;
                setSelectedPlace({ name: props.name, address: props.address ?? '', lat: props.lat, lng: props.lng, kind: 'food', subtype: props.type, distanceMiles: dist });
              }}
            >
              <CircleLayer
                id="food-places-dots"
                style={{
                  circleColor: '#E53935',
                  circleRadius: 6,
                  circleStrokeColor: '#000',
                  circleStrokeWidth: 1.5,
                }}
              />
            </ShapeSource>
          )}

          {/* ── Saved / imported route overlay ── */}
          {overlayGeoJson && (
            <ShapeSource id="overlay-route" shape={overlayGeoJson}>
              <LineLayer
                id="overlay-route-line"
                style={{
                  lineColor: theme.red,
                  lineWidth: 3,
                  lineDasharray: [2, 1.5],
                  lineOpacity: 0.9,
                }}
              />
            </ShapeSource>
          )}

          {/* ── Navigation route layer (rendered above overlay) ── */}
          {navRouteGeojson && (
            <ShapeSource id="nav-route-src" shape={navRouteGeojson}>
              <LineLayer
                id="nav-route-line"
                style={{ lineColor: theme.red, lineWidth: 5, lineOpacity: 0.95 }}
              />
            </ShapeSource>
          )}

          {/* ── Live GPS track ── */}
          {liveTrackGeoJson && (
            <ShapeSource id="live-track" shape={liveTrackGeoJson}>
              <LineLayer
                id="live-track-line"
                style={{ lineColor: '#E53935', lineWidth: 3, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
              />
            </ShapeSource>
          )}
        </MapView>

        {/* ── Recenter / locate me button (below compass) ── */}
        {!drawerOpen && !searchSheetOpen && !showChecklist && <View style={styles.locateBtnWrap} pointerEvents="box-none">
          <Pressable
            style={[styles.locateBtn, { backgroundColor: theme.mapOverlayBg, borderColor: theme.border }]}
            hitSlop={8}
            onPress={() => {
              handleLocateMe();
            }}
          >
            <Feather name="crosshair" size={23} color={theme.textSecondary} />
          </Pressable>
        </View>}

        {/* ── Floating turn card (left side, during navigation) ── */}
        {isNavigatingActive && (
          <TurnCard
            step={activeRoute?.steps[currentStepIndex] ?? null}
            isOffRoute={navMode === 'off_route'}
            isRecalculating={navMode === 'recalculating'}
          />
        )}

        {/* ── Top header bar ── */}
        <View style={styles.mapHeader}>
          <HamburgerButton onPress={() => setMenuOpen(true)} />
          <>
            <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <TimetomotoLogo width={LOGO_WIDTH} height={LOGO_HEIGHT} />
              </View>
            </View>
            <View style={{ flex: 1 }} />
          </>
          <Pressable
            style={[styles.headerIconBtn, { backgroundColor: theme.mapOverlayBg, borderColor: theme.border }]}
            onPress={() => setSearchSheetOpen(true)}
          >
            <Feather name="search" size={20} color={theme.textPrimary} />
          </Pressable>
        </View>

        {/* ── Crash detection toggle ── */}
        <Pressable
          style={[
            styles.crashToggle,
            { backgroundColor: isMonitoring ? 'rgba(76,175,80,0.15)' : theme.mapOverlayBg, borderColor: isMonitoring ? '#4CAF50' : theme.border },
          ]}
          onPress={() => setMonitoring(!isMonitoring)}
        >
          <Feather name="shield" size={16} color={isMonitoring ? '#4CAF50' : theme.textSecondary} />
          <Text style={[styles.crashToggleText, { color: isMonitoring ? '#4CAF50' : theme.textSecondary }]}>
            {isMonitoring ? 'CRASH ON' : 'CRASH OFF'}
          </Text>
        </Pressable>

        {/* ── Map control icon (replaces MapOverlayControls) ── */}
        <Pressable
          style={[styles.mapControlIcon, { backgroundColor: theme.mapOverlayBg, borderColor: theme.border }]}
          onPress={() => setDrawerOpen(true)}
        >
          <Feather name="layers" size={20} color={theme.textPrimary} />
        </Pressable>

        {/* Weather legend — bottom-left when weather is on */}
        {weatherOn && <WeatherLegend />}

        {/* ── Stats bar: navigation stats or recording stats (hidden in free ride) ── */}
        {isNavigatingActive ? (
          <NavigationStatsBar
            speedMph={speedMph}
            eta={eta}
            remainingMiles={remainingDistanceMiles}
          />
        ) : isRecording ? (
          <StatsOverlay isRecording={isRecording} elapsedSeconds={elapsedSeconds} speedMph={speedMph} />
        ) : null}

        {/* ── RIDE & RECORD button (idle, no nav, no recording) ── */}
        {!isNavigatingActive && !isRecording && (
          <Pressable
            style={[styles.endNavBtn, { backgroundColor: '#4CAF50' }]}
            onPress={() => setShowChecklist(true)}
          >
            <Feather name="play-circle" size={16} color="#fff" />
            <Text style={styles.endNavBtnText}>RIDE & RECORD</Text>
          </Pressable>
        )}

        {/* ── END RIDE button (navigating and/or recording) ── */}
        {(isNavigatingActive || isRecording) && (
          <Pressable
            style={[styles.endNavBtn, { backgroundColor: theme.red, bottom: isNavigatingActive ? END_BUTTON_BOTTOM : END_BUTTON_BOTTOM }]}
            onPress={() => {
              if (isNavigatingActive) {
                setNavRouteGeojson(null);
                resetNavigation();
              }
              if (isRecording) {
                handleStopRequested();
              } else {
                handleLocateMe();
              }
            }}
          >
            <Feather name="x" size={16} color="#fff" />
            <Text style={styles.endNavBtnText}>END RIDE</Text>
          </Pressable>
        )}

        {/* Place detail panel (fuel / food) */}
        <PlaceDetailPanel
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
          onNavigateInApp={(dest) => fetchAndPreviewRoute(dest)}
        />

        {/* Toast notification */}
        {!!toastMsg && (
          <View style={[styles.toast, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Feather name="check-circle" size={14} color="#4CAF50" />
            <Text style={[styles.toastText, { color: theme.textPrimary }]}>{toastMsg}</Text>
          </View>
        )}

        {/* ── Route Preview Screen (overlay) ── */}
        {navMode === 'preview' && destination && (
          <RoutePreviewScreen
            destination={destination}
            routes={
              alternateRoutes.length > 0
                ? [activeRoute!, ...alternateRoutes]
                : activeRoute
                ? [activeRoute]
                : []
            }
            loading={routeLoading}
            error={routeError}
            routePreference={routePreference}
            onChangePreference={(p) => {
              setRoutePreference(p);
              if (destination) {
                fetchAndPreviewRoute(destination, p);
              }
            }}
            onStartNavigation={(route, bikeId, recordRide) => {
              recordingBikeIdRef.current = bikeId ?? null;
              if (recordRide) {
                setRecording(true);
              }
              handleStartNavigation(route);
            }}
            onCancel={() => { setIsSavedRoutePreview(false); savedRouteStartRef.current = null; setNavRouteGeojson(null); resetNavigation(); }}
            isSavedRoute={isSavedRoutePreview}
            savedRouteStart={savedRouteStartRef.current}
            onGeometryChange={(geo) => setNavRouteGeojson(geo)}
          />
        )}

        {/* ── Completion Screen ── */}
        {navMode === 'completed' && (
          <CompletionScreen
            distanceMiles={activeRoute?.distanceMiles ?? 0}
            durationSeconds={activeRoute?.durationSeconds ?? 0}
            onSaveRide={() => {
              if (user && activeRoute) {
                const pts = activeRoute.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
                createRoute(
                  user.id,
                  destination?.name ?? 'Navigation Route',
                  pts,
                  activeRoute.distanceMiles,
                  0,
                  activeRoute.durationSeconds,
                ).then((saved) => {
                  if (saved) { addRoute(saved); showToast('Ride saved!'); }
                });
              }
              setNavRouteGeojson(null);
              resetNavigation();
              handleLocateMe();
            }}
            onDismiss={() => { setNavRouteGeojson(null); resetNavigation(); handleLocateMe(); }}
          />
        )}
      </View>

      {/* ── Pre-ride checklist (triggered from RECORD button on map) ── */}
      {showChecklist && !isRecording && (
        <SafeAreaView edges={['top']} style={[styles.subScreen, { backgroundColor: theme.bg }]}>
          <View style={[styles.recordHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setShowChecklist(false)} style={{ padding: 4 }}>
              <Feather name="x" size={22} color={theme.textSecondary} />
            </Pressable>
            <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <TimetomotoLogo width={LOGO_WIDTH} height={LOGO_HEIGHT} />
              </View>
            </View>
            <View style={{ width: 40 }} />
          </View>
          <RecordScreen onStopRequested={handleStopRequested} elapsedSeconds={elapsedSeconds} onBikeSelected={(id) => { recordingBikeIdRef.current = id; }} />
        </SafeAreaView>
      )}
      {/* ── Active recording overlay on map ── */}
      {isRecording && (
        <SafeAreaView edges={['top', 'bottom']} style={styles.recordMapOverlay} pointerEvents="box-none">
          <RecordScreen onStopRequested={handleStopRequested} elapsedSeconds={elapsedSeconds} onBikeSelected={(id) => { recordingBikeIdRef.current = id; }} />
        </SafeAreaView>
      )}

      {/* ── Save ride sheet ── */}
      <SaveRideSheet
        visible={showSaveSheet}
        points={recordedPoints}
        durationSeconds={rideElapsed}
        onSave={handleSaveRide}
        onDiscard={handleDiscardRide}
      />

      {/* ── Hamburger menu ── */}
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* ── Map Control Drawer ── */}
      <MapControlDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mapStyle={mapStyle}
        onChangeMapStyle={setMapStyle}
        weatherOn={weatherOn}
        fuelOn={fuelStationsOn}
        fuelLoading={fuelStationsLoading}
        foodOn={foodOn}
        foodLoading={foodLoading}
        onToggleWeather={() => setWeatherOn((v) => !v)}
        onToggleFuel={handleToggleFuelStations}
        onToggleFood={handleToggleFood}

      />

      {/* ── Search Sheet ── */}
      <SearchSheet
        visible={searchSheetOpen}
        onClose={() => setSearchSheetOpen(false)}
        onSelectDestination={(dest) => {
          setSearchSheetOpen(false);
          fetchAndPreviewRoute(dest);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },

  mapContainer: { ...StyleSheet.absoluteFillObject },

  // Recenter button wrapper + button (aligned below compass)
  locateBtnWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 60,
    zIndex: 9999,
    elevation: 20,
  },
  locateBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 209 : 169,
    right: 14,
    width: 37,
    height: 37,
    borderRadius: 18.5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Top header bar over map
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: (HEADER_HEIGHT - 40) / 2,
    borderBottomWidth: 1,
  },
  mapHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 46 : 6,
    left: 12,
    right: 12,
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Crash detection toggle
  crashToggle: {
    position: 'absolute',
    bottom: END_BUTTON_BOTTOM,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 17,
    paddingVertical: 12,
  },
  crashToggleText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Map control icon (layers button)
  mapControlIcon: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 70,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // End navigation button
  endNavBtn: {
    position: 'absolute',
    bottom: END_BUTTON_BOTTOM,
    right: END_BUTTON_RIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 26,
    paddingHorizontal: 17,
    paddingVertical: 12,
  },
  endNavBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Stats bar
  statsBar: {
    position: 'absolute',
    bottom: 29,
    left: 16,
    right: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
  },
  statItem:  { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', letterSpacing: 0.3 },
  statLabel: { fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
  statDivider: { width: 1, marginVertical: 4 },

  // Checklist overlay
  subScreen: { flex: 1 },

  // Record screen — transparent map overlay (when recording)
  recordMapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  recordTimerCard: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  recordTimerText: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.7,
    color: '#fff',
  },
  recordActiveCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  // Record screen
  recordElapsed: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  recordCircleActive: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 32,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  recordHint: { fontSize: 13, letterSpacing: 0.3 },
  monitoringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  monitoringDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  monitoringText: { fontSize: 12 },

  // Status rows (share / check-in)
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
    alignSelf: 'stretch',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  statusText: {
    flex: 1,
    fontSize: 12,
  },
  checkInBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  checkInBtnText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Toast
  toast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
