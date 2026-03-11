import { useEffect, useMemo, useRef, useState } from 'react';
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
  FillLayer,
  LineLayer,
  LocationPuck,
  MapView,
  ShapeSource,
  StyleURL,
} from '@rnmapbox/maps';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import { useAuthStore, useGarageStore, useRoutesStore, useSafetyStore } from '../../lib/store';
import { startShare, endShare, shareUrl } from '../../lib/liveShare';
import { startBackgroundLocation, stopBackgroundLocation } from '../../lib/backgroundTasks';
import { routeGeoJson, routeBounds, calcDistance } from '../../lib/gpx';
import { createRoute } from '../../lib/routes';
import {
  circleGeoJson,
  fuelStationsGeoJson,
  fetchFuelStations,
  type FuelStation,
} from '../../lib/mapOverlays';
import type { Route } from '../../lib/routes';
import type { TrackPoint } from '../../lib/gpx';
import SafetyDot from '../../components/safety/SafetyDot';
import PreRideChecklist, { type RideConfig } from '../../components/safety/PreRideChecklist';
import RoutesScreen from '../../components/ride/RoutesScreen';
import SaveRideSheet from '../../components/ride/SaveRideSheet';
import MapOverlayControls from '../../components/ride/MapOverlayControls';
import { Colors } from '../../lib/theme';

// ---------------------------------------------------------------------------
// Mapbox init — runs once
// ---------------------------------------------------------------------------
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SubTab   = 'MAP' | 'ROUTES' | 'RECORD';
type MapStyle = 'dark' | 'satellite' | 'outdoors';

const MAP_STYLES: Record<MapStyle, string> = {
  dark:      'mapbox://styles/mapbox/dark-v11',
  satellite: StyleURL.SatelliteStreet,
  outdoors:  StyleURL.Outdoors,
};

const STYLE_LABELS: Record<MapStyle, string> = {
  dark:      'DARK',
  satellite: 'SAT',
  outdoors:  'TOPO',
};

const AUSTIN = [-97.7431, 30.2672] as [number, number];

// ---------------------------------------------------------------------------
// Sub-screens
// ---------------------------------------------------------------------------

function RecordScreen({
  onStopRequested,
}: {
  onStopRequested: () => void;
}) {
  const { user } = useAuthStore();
  const {
    isRecording, setRecording, isMonitoring, lastKnownLocation,
    shareToken, shareActive, setShareToken, setShareActive,
    checkInActive, checkInDeadline, checkInNotifId, clearCheckIn,
    setCheckIn, emergencyContacts,
  } = useSafetyStore();

  // Elapsed recording timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current!);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current!);
  }, [isRecording]);

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

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  }

  function formatCountdown(secs: number) {
    if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
    if (secs >= 60)   return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${secs}s`;
  }

  // ── START ride ──
  async function handleStart(cfg: RideConfig) {
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

  // ── ACTIVE RIDE view ──
  return (
    <View style={[{ flex: 1 }, styles.subScreenCentered, { padding: 20 }]}>
      {/* Elapsed time */}
      <Text style={styles.recordElapsed}>{formatTime(elapsed)}</Text>

      {/* Stop button */}
      <Pressable style={styles.recordCircleActive} onPress={handleStop}>
        <Feather name="square" size={36} color="#fff" />
      </Pressable>
      <Text style={styles.recordHint}>Recording · tap to stop</Text>

      {/* Crash detection status */}
      <View style={styles.monitoringBadge}>
        <SafetyDot />
        <Text style={styles.monitoringText}>
          {isMonitoring ? 'Crash detection on' : 'Crash detection off'}
        </Text>
      </View>

      {/* Live share status */}
      {shareActive && (
        <View style={[styles.statusRow, { borderColor: '#4CAF5044' }]}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>LIVE — location link copied to clipboard</Text>
          <Pressable onPress={async () => {
            if (shareToken) await Clipboard.setStringAsync(shareUrl(shareToken));
          }}>
            <Feather name="copy" size={14} color={Colors.TEXT_SECONDARY} />
          </Pressable>
        </View>
      )}

      {/* Check-in countdown */}
      {checkInActive && checkInSecsLeft !== null && (
        <View style={[styles.statusRow, { borderColor: checkInSecsLeft < 300 ? Colors.TTM_RED + '66' : Colors.TTM_BORDER }]}>
          <Feather
            name="clock"
            size={14}
            color={checkInSecsLeft < 300 ? Colors.TTM_RED : Colors.TEXT_SECONDARY}
          />
          <Text style={[styles.statusText, checkInSecsLeft < 300 && { color: Colors.TTM_RED }]}>
            Check in: {formatCountdown(checkInSecsLeft)} remaining
          </Text>
          <Pressable style={styles.checkInBtn} onPress={handleCheckIn}>
            <Text style={styles.checkInBtnText}>CHECK IN</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stats overlay (shown on MAP tab while recording)
// ---------------------------------------------------------------------------

function StatsOverlay({ isRecording }: { isRecording: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { recordedPoints } = useSafetyStore();

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current!);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current!);
  }, [isRecording]);

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  }

  const miles = isRecording ? calcDistance(recordedPoints) : 0;

  return (
    <View style={styles.statsBar}>
      <View style={styles.statItem}>
        <Text style={styles.statValue}>0</Text>
        <Text style={styles.statLabel}>MPH</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{miles < 10 ? miles.toFixed(1) : Math.round(miles)}</Text>
        <Text style={styles.statLabel}>MILES</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={styles.statValue}>{formatTime(elapsed)}</Text>
        <Text style={styles.statLabel}>TIME</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Layer toggle
// ---------------------------------------------------------------------------

function LayerToggle({ current, onCycle }: { current: MapStyle; onCycle: () => void }) {
  return (
    <Pressable style={styles.layerBtn} onPress={onCycle}>
      <Text style={styles.layerBtnText}>{STYLE_LABELS[current]}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Sub-nav
// ---------------------------------------------------------------------------

function SubNav({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  const tabs: SubTab[] = ['MAP', 'ROUTES', 'RECORD'];
  return (
    <View style={styles.subNav}>
      {tabs.map((tab) => (
        <Pressable key={tab} style={styles.subNavItem} onPress={() => onChange(tab)}>
          <Text style={[styles.subNavText, active === tab && styles.subNavTextActive]}>
            {tab}
          </Text>
          {active === tab && <View style={styles.subNavUnderline} />}
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main RideScreen
// ---------------------------------------------------------------------------

export default function RideScreen() {
  const [subTab, setSubTab]     = useState<SubTab>('MAP');
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
  const { user }                = useAuthStore();
  const { addRoute }            = useRoutesStore();
  const { bikes, selectedBikeId } = useGarageStore();
  const {
    isRecording, setRecording,
    recordedPoints, clearRecordedPoints,
    lastKnownLocation,
  } = useSafetyStore();

  const selectedBike = useMemo(
    () => bikes.find((b) => b.id === selectedBikeId) ?? null,
    [bikes, selectedBikeId],
  );

  // ── Overlay toggles ──
  const [fuelRangeOn,    setFuelRangeOn]    = useState(false);
  const [offRoadOn,      setOffRoadOn]      = useState(false);
  const [publicLandsOn,  setPublicLandsOn]  = useState(false);
  const [fuelStationsOn, setFuelStationsOn] = useState(false);
  const [fuelStations,   setFuelStations]   = useState<FuelStation[]>([]);
  const [fuelStationsLoading, setFuelStationsLoading] = useState(false);

  // Fuel range miles (reactive to bike specs)
  const fuelRangeMiles = useMemo(() => {
    if (!selectedBike?.tank_gallons || !selectedBike?.avg_mpg) return null;
    return Math.round(selectedBike.tank_gallons * selectedBike.avg_mpg * 0.8);
  }, [selectedBike]);

  // Fuel range circle GeoJSON (reactive to location + range)
  const fuelCircleGeoJson = useMemo(() => {
    if (!fuelRangeOn || fuelRangeMiles === null) return null;
    const c = lastKnownLocation ?? { lat: AUSTIN[1], lng: AUSTIN[0] };
    return circleGeoJson(c.lng, c.lat, fuelRangeMiles);
  }, [fuelRangeOn, fuelRangeMiles, lastKnownLocation]);

  // Fuel stations GeoJSON
  const fuelStationsGeoJsonData = useMemo(
    () => (fuelStations.length > 0 ? fuelStationsGeoJson(fuelStations) : null),
    [fuelStations],
  );

  function handleToggleFuelRange() {
    if (!fuelRangeOn && (!selectedBike?.tank_gallons || !selectedBike?.avg_mpg)) {
      Alert.alert(
        'No bike specs',
        'Add tank size and average MPG in Garage to use the fuel range overlay.',
      );
      return;
    }
    setFuelRangeOn((v) => !v);
  }

  async function handleToggleFuelStations() {
    if (fuelStationsOn) {
      setFuelStationsOn(false);
      setFuelStations([]);
      return;
    }
    setFuelStationsLoading(true);
    setFuelStationsOn(true);
    try {
      const c = lastKnownLocation ?? { lat: AUSTIN[1], lng: AUSTIN[0] };
      const stations = await fetchFuelStations(c.lat, c.lng);
      setFuelStations(stations);
    } catch {
      Alert.alert('Failed', 'Could not fetch fuel stations. Check your connection.');
      setFuelStationsOn(false);
    } finally {
      setFuelStationsLoading(false);
    }
  }

  // Map overlays: imported/navigating route + live track
  const [overlayPoints, setOverlayPoints] = useState<TrackPoint[] | null>(null);
  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [rideElapsed, setRideElapsed]     = useState(0);

  const cameraRef    = useRef<Mapbox.Camera>(null);
  const styleKeys    = Object.keys(MAP_STYLES) as MapStyle[];
  const elapsedRef   = useRef(0);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track elapsed separately for save sheet (RecordScreen has its own timer)
  useEffect(() => {
    if (isRecording) {
      elapsedRef.current = 0;
      elapsedTimer.current = setInterval(() => { elapsedRef.current += 1; }, 1000);
    } else {
      clearInterval(elapsedTimer.current!);
    }
    return () => clearInterval(elapsedTimer.current!);
  }, [isRecording]);

  function cycleStyle() {
    setMapStyle((s) => {
      const idx = styleKeys.indexOf(s);
      return styleKeys[(idx + 1) % styleKeys.length];
    });
  }

  // Navigate to a saved route: show on map + fit camera
  function handleNavigate(route: Route) {
    setOverlayPoints(route.points);
    setSubTab('MAP');
    const [ne, sw] = routeBounds(route.points);
    cameraRef.current?.fitBounds(ne, sw, [60, 60, 100, 60], 800);
  }

  // GPX import: preview route on map + switch to MAP
  function handleImportRoute(points: TrackPoint[], name: string) {
    setOverlayPoints(points);
    setSubTab('MAP');
    const [ne, sw] = routeBounds(points);
    cameraRef.current?.fitBounds(ne, sw, [60, 60, 100, 60], 800);
  }

  // Stop requested from RecordScreen: show save sheet
  function handleStopRequested() {
    setRideElapsed(elapsedRef.current);
    setShowSaveSheet(true);
  }

  // Save recorded ride
  async function handleSaveRide(name: string) {
    if (user && recordedPoints.length >= 2) {
      const miles   = calcDistance(recordedPoints);
      const gainFt  = 0; // elevation from device GPS — skipped without barometer
      const saved = await createRoute(user.id, name, recordedPoints, miles, gainFt, elapsedRef.current);
      if (saved) addRoute(saved);
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

  // Live track GeoJSON
  const liveTrackGeoJson =
    isRecording && recordedPoints.length >= 2
      ? routeGeoJson(recordedPoints)
      : null;

  // Overlay GeoJSON (imported/navigating route)
  const overlayGeoJson = overlayPoints && overlayPoints.length >= 2
    ? routeGeoJson(overlayPoints)
    : null;

  return (
    <View style={styles.root}>
      {/* ── Full-screen map (always mounted) ── */}
      <View style={[styles.mapContainer, subTab !== 'MAP' && styles.hidden]}>
        <MapView
          style={StyleSheet.absoluteFillObject}
          styleURL={MAP_STYLES[mapStyle]}
          compassEnabled
          compassPosition={{ bottom: 120, right: 16 }}
          attributionEnabled
          attributionPosition={{ bottom: 8, right: 8 }}
          logoEnabled={false}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{ centerCoordinate: AUSTIN, zoomLevel: 9 }}
          />
          <LocationPuck puckBearingEnabled puckBearing="heading" pulsing={{ isEnabled: true }} />

          {/* ── ADV: Off-road trails ── */}
          {offRoadOn && (
            <LineLayer
              id="offroad-trails"
              sourceID="composite"
              sourceLayerID="road"
              filter={['match', ['get', 'class'], ['track', 'path'], true, false]}
              style={{ lineColor: '#4ECDC4', lineWidth: 2, lineOpacity: 0.85 }}
            />
          )}

          {/* ── ADV: Public / protected lands ── */}
          {publicLandsOn && (
            <>
              <FillLayer
                id="public-lands-fill"
                sourceID="composite"
                sourceLayerID="landuse"
                filter={['match', ['get', 'class'], ['national_park', 'park', 'wood'], true, false]}
                style={{ fillColor: '#4CAF50', fillOpacity: 0.18 }}
              />
              <LineLayer
                id="public-lands-border"
                sourceID="composite"
                sourceLayerID="landuse"
                filter={['match', ['get', 'class'], ['national_park', 'park', 'wood'], true, false]}
                style={{ lineColor: '#4CAF50', lineWidth: 1, lineOpacity: 0.6 }}
              />
            </>
          )}

          {/* ── Fuel range circle ── */}
          {fuelCircleGeoJson && (
            <ShapeSource id="fuel-range-src" shape={fuelCircleGeoJson}>
              <FillLayer
                id="fuel-range-fill"
                style={{ fillColor: '#FFD600', fillOpacity: 0.1 }}
              />
              <LineLayer
                id="fuel-range-border"
                style={{ lineColor: '#FFD600', lineWidth: 2, lineDasharray: [3, 2.5] }}
              />
            </ShapeSource>
          )}

          {/* ── Fuel stations ── */}
          {fuelStationsGeoJsonData && fuelStationsOn && (
            <ShapeSource id="fuel-stations-src" shape={fuelStationsGeoJsonData}>
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

          {/* ── Saved / imported route overlay ── */}
          {overlayGeoJson && (
            <ShapeSource id="overlay-route" shape={overlayGeoJson}>
              <LineLayer
                id="overlay-route-line"
                style={{
                  lineColor: Colors.TTM_RED,
                  lineWidth: 3,
                  lineDasharray: [2, 1.5],
                  lineOpacity: 0.9,
                }}
              />
            </ShapeSource>
          )}

          {/* ── Live GPS track ── */}
          {liveTrackGeoJson && (
            <ShapeSource id="live-track" shape={liveTrackGeoJson}>
              <LineLayer
                id="live-track-line"
                style={{ lineColor: '#4CAF50', lineWidth: 3, lineOpacity: 0.9 }}
              />
            </ShapeSource>
          )}
        </MapView>

        <LayerToggle current={mapStyle} onCycle={cycleStyle} />

        {/* Overlay toggle controls */}
        <MapOverlayControls
          fuelRangeOn={fuelRangeOn}
          offRoadOn={offRoadOn}
          publicLandsOn={publicLandsOn}
          fuelStationsOn={fuelStationsOn}
          fuelStationsLoading={fuelStationsLoading}
          onToggleFuelRange={handleToggleFuelRange}
          onToggleOffRoad={() => setOffRoadOn((v) => !v)}
          onTogglePublicLands={() => setPublicLandsOn((v) => !v)}
          onToggleFuelStations={handleToggleFuelStations}
        />

        {/* Safety dot — top-left corner of map */}
        <View style={styles.safetyDotOverlay}>
          <SafetyDot />
        </View>

        {/* Fuel range label */}
        {fuelRangeOn && fuelRangeMiles !== null && (
          <View style={styles.fuelRangeLabel}>
            <Feather name="crosshair" size={13} color="#FFD600" />
            <Text style={styles.fuelRangeLabelText}>
              {fuelRangeMiles} mi range
              {selectedBike?.model ? ` · ${selectedBike.model}` : ''}
            </Text>
          </View>
        )}

        <StatsOverlay isRecording={isRecording} />
      </View>

      {/* ── Sub-screens ── */}
      {subTab === 'ROUTES' && (
        <SafeAreaView edges={['top']} style={styles.subScreen}>
          <RoutesScreen
            onImportRoute={handleImportRoute}
            onNavigate={handleNavigate}
          />
        </SafeAreaView>
      )}
      {subTab === 'RECORD' && (
        <SafeAreaView edges={['top']} style={styles.subScreen}>
          <RecordScreen onStopRequested={handleStopRequested} />
        </SafeAreaView>
      )}

      {/* ── Sub-nav ── */}
      <SafeAreaView edges={['bottom']} style={styles.subNavWrapper}>
        <SubNav active={subTab} onChange={setSubTab} />
      </SafeAreaView>

      {/* ── Save ride sheet ── */}
      <SaveRideSheet
        visible={showSaveSheet}
        points={recordedPoints}
        durationSeconds={rideElapsed}
        onSave={handleSaveRide}
        onDiscard={handleDiscardRide}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.TTM_DARK },

  mapContainer: { ...StyleSheet.absoluteFillObject },
  hidden:        { opacity: 0, pointerEvents: 'none' },

  // Safety dot overlay — top-left of map
  safetyDotOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    left: 16,
    backgroundColor: 'rgba(20,20,20,0.75)',
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // Layer toggle
  layerBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    right: 16,
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  layerBtnText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // Fuel range label
  fuelRangeLabel: {
    position: 'absolute',
    bottom: 160,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1,
    borderColor: '#FFD60055',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  fuelRangeLabelText: {
    color: '#FFD600',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Stats bar
  statsBar: {
    position: 'absolute',
    bottom: 106,
    left: 16,
    right: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(20,20,20,0.88)',
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    paddingVertical: 10,
  },
  statItem:  { flex: 1, alignItems: 'center' },
  statValue: { color: Colors.TEXT_PRIMARY, fontSize: 22, fontWeight: '700', letterSpacing: 1 },
  statLabel: { color: Colors.TEXT_SECONDARY, fontSize: 10, letterSpacing: 1.5, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.TTM_BORDER, marginVertical: 4 },

  // Sub-nav
  subNavWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  subNav: {
    flexDirection: 'row',
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderTopWidth: 1,
    borderTopColor: Colors.TTM_BORDER,
    height: 48,
  },
  subNavItem:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  subNavText:       { color: Colors.TAB_INACTIVE, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  subNavTextActive: { color: Colors.TTM_RED },
  subNavUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: Colors.TTM_RED,
    borderRadius: 1,
  },

  // Sub-screens
  subScreen:         { flex: 1, backgroundColor: Colors.TTM_DARK },
  subScreenContent:  { padding: 20, paddingBottom: 80 },
  subScreenCentered: { alignItems: 'center', justifyContent: 'center' },
  subHeading: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 16,
  },

  // Record screen
  recordElapsed: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  recordCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.TTM_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 32,
    shadowColor: Colors.TTM_RED,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  recordCircleActive: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 32,
    shadowColor: '#333',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  recordBtnText:  { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 3 },
  recordHint:     { color: Colors.TEXT_SECONDARY, fontSize: 13, letterSpacing: 1 },
  monitoringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  monitoringText: { color: Colors.TEXT_SECONDARY, fontSize: 12 },

  // Status rows (share / check-in)
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.TTM_CARD,
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
    color: Colors.TEXT_SECONDARY,
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
    letterSpacing: 1.5,
  },
});
