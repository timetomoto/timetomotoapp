import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import SlideUpWrapper from '../ui/SlideUpWrapper';
import { Feather } from '@expo/vector-icons';
import { useSafetyStore, useGarageStore, useTripPlannerStore, bikeLabel } from '../../lib/store';
import { useTheme } from '../../lib/useTheme';
import { fetchRouteWeather, hasRouteWeatherConcern, getRouteWarningMessage } from '../../lib/routeWeather';
import { codeMeta } from '../../lib/weather';
import RideSettingsBlock, { type RideSettingsValues } from '../ride/RideSettingsBlock';
import { useScoutStore } from '../../lib/scoutStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RideConfig {
  shareEnabled: boolean;
  checkInMinutes: number | null;
  bikeId?: string;
  notifyContactIds?: string[];
}

// ---------------------------------------------------------------------------
// PreRideChecklist
// ---------------------------------------------------------------------------

export default function PreRideChecklist({ visible, onClose, onStart }: { visible: boolean; onClose: () => void; onStart: (cfg: RideConfig) => void }) {
  const { theme } = useTheme();
  const {
    isMonitoring, setMonitoring,
    setCrashDetectionOverride, setLocationSharingOverride,
    shareActive,
  } = useSafetyStore();
  const { bikes, selectedBikeId, selectBike } = useGarageStore();

  const [selectedBike, setSelectedBike] = useState<string | null>(selectedBikeId ?? bikes[0]?.id ?? null);

  // Update selection if store loads bikes after mount
  useEffect(() => {
    if (!selectedBike && (selectedBikeId || bikes.length > 0)) {
      setSelectedBike(selectedBikeId ?? bikes[0]?.id ?? null);
    }
  }, [selectedBikeId, bikes.length]);
  const { lastKnownLocation } = useSafetyStore();

  // Weather alert — fetch on modal open
  const [weatherMsg, setWeatherMsg] = useState<string | null>(null);
  const [weatherSeverity, setWeatherSeverity] = useState<'clear' | 'concern'>('clear');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const weatherFetched = useRef(false);

  useEffect(() => {
    if (!visible || weatherFetched.current || !lastKnownLocation) return;
    weatherFetched.current = true;
    setWeatherLoading(true);

    // Generate 8 points in a ~100-mile radius around user + center point
    const R = 1.45; // ~100 miles in degrees latitude
    const lat = lastKnownLocation.lat;
    const lng = lastKnownLocation.lng;
    const points: [number, number][] = [[lng, lat]];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * 2 * Math.PI;
      points.push([lng + R * Math.cos(angle), lat + R * 0.7 * Math.sin(angle)]);
    }

    fetchRouteWeather(points)
      .then(({ points: wp, useCelsius }) => {
        if (hasRouteWeatherConcern(wp, useCelsius)) {
          const msg = getRouteWarningMessage(wp, useCelsius);
          setWeatherMsg(msg ?? 'Weather concerns in your area.');
          setWeatherSeverity('concern');
        } else {
          setWeatherMsg('Weather looks good. Ride on.');
          setWeatherSeverity('clear');
        }
      })
      .catch(() => setWeatherMsg(null))
      .finally(() => setWeatherLoading(false));
  }, [visible, lastKnownLocation]);

  // Scout route weather badge
  const tripRouteGeojson = useTripPlannerStore((s) => s.tripRouteGeojson);
  const tripOrigin = useTripPlannerStore((s) => s.tripOrigin);
  const tripDest = useTripPlannerStore((s) => s.tripDestination);
  const tripWeatherFetchedAt = useTripPlannerStore((s) => s.tripWeatherFetchedAt);
  const tripWeatherHasConcern = useTripPlannerStore((s) => s.tripWeatherHasConcern);
  const tripWeatherMsg = useTripPlannerStore((s) => s.tripWeatherMsg);
  const tripWeatherPoints = useTripPlannerStore((s) => s.tripWeatherPoints);
  const hasRoute = !!tripRouteGeojson?.coordinates && tripRouteGeojson.coordinates.length > 1;
  const [scoutWeatherMsg, setScoutWeatherMsg] = useState<string | null>(null);
  const [scoutWeatherSeverity, setScoutWeatherSeverity] = useState<'green' | 'yellow' | 'red'>('green');
  const [scoutWeatherLoading, setScoutWeatherLoading] = useState(false);
  const openScout = useScoutStore((s) => s.openScout);
  const scoutWeatherFetched = useRef(false);

  // Shimmer animation for loading
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (scoutWeatherLoading) {
      Animated.loop(
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }),
      ).start();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [scoutWeatherLoading]);

  useEffect(() => {
    if (!visible || !hasRoute || scoutWeatherFetched.current) return;
    scoutWeatherFetched.current = true;

    // Check if trip planner already has fresh weather data (< 5 min)
    const FIVE_MINUTES = 5 * 60 * 1000;
    const isFresh = tripWeatherFetchedAt && (Date.now() - tripWeatherFetchedAt < FIVE_MINUTES) && tripWeatherPoints.length > 0;

    if (isFresh) {
      // Derive severity from existing store data — skip fetch
      if (!tripWeatherHasConcern) {
        setScoutWeatherMsg("Weather looks good for today's ride.");
        setScoutWeatherSeverity('green');
      } else if (tripWeatherMsg?.toLowerCase().includes('severe') || tripWeatherMsg?.toLowerCase().includes('thunderstorm')) {
        setScoutWeatherMsg('Severe weather on this route — review before riding.');
        setScoutWeatherSeverity('red');
      } else {
        const concernPt = tripWeatherPoints.find((p) => p.rainChance > 30 || p.weatherCode >= 51);
        const mileMark = concernPt ? Math.round(concernPt.distanceKm * 0.621371) : null;
        setScoutWeatherMsg(
          mileMark != null
            ? `Rain possible around mile ${mileMark} — check details.`
            : 'Rain possible along the route — check details.',
        );
        setScoutWeatherSeverity('yellow');
      }
      return;
    }

    // Stale or no data — fetch fresh
    setScoutWeatherLoading(true);
    const timer = setTimeout(() => {
      setScoutWeatherLoading(false);
      scoutWeatherFetched.current = false;
    }, 5000);

    fetchRouteWeather(tripRouteGeojson.coordinates)
      .then(({ points: wp, useCelsius }) => {
        clearTimeout(timer);
        if (wp.length === 0) { setScoutWeatherLoading(false); return; }
        const concern = hasRouteWeatherConcern(wp, useCelsius);
        const warning = getRouteWarningMessage(wp, useCelsius);
        if (!concern) {
          setScoutWeatherMsg("Weather looks good for today's ride.");
          setScoutWeatherSeverity('green');
        } else if (warning?.toLowerCase().includes('severe') || warning?.toLowerCase().includes('thunderstorm')) {
          setScoutWeatherMsg('Severe weather on this route — review before riding.');
          setScoutWeatherSeverity('red');
        } else {
          const concernPt = wp.find((p) => p.rainChance > 30 || p.weatherCode >= 51);
          const mileMark = concernPt ? Math.round(concernPt.distanceKm * 0.621371) : null;
          setScoutWeatherMsg(
            mileMark != null
              ? `Rain possible around mile ${mileMark} — check details.`
              : 'Rain possible along the route — check details.',
          );
          setScoutWeatherSeverity('yellow');
        }
      })
      .catch(() => setScoutWeatherMsg(null))
      .finally(() => setScoutWeatherLoading(false));

    return () => clearTimeout(timer);
  }, [visible, hasRoute]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      scoutWeatherFetched.current = false;
      setScoutWeatherMsg(null);
    }
  }, [visible]);

  const settingsRef = useRef<RideSettingsValues>({
    crashOn: false, crashOverride: false,
    shareEnabled: false, shareOverride: false,
    checkInOn: false, checkInMins: 60,
    notifyContactIds: [],
  });

  function handleStart() {
    const s = settingsRef.current;
    if (selectedBike) selectBike(selectedBike);
    if (s.crashOn && !isMonitoring) {
      setCrashDetectionOverride(true);
      setMonitoring(true);
    }
    if (s.shareEnabled && !shareActive) {
      setLocationSharingOverride(true);
    }
    onStart({
      shareEnabled: s.shareEnabled,
      checkInMinutes: s.checkInOn ? s.checkInMins : null,
      bikeId: selectedBike ?? undefined,
      notifyContactIds: s.notifyContactIds,
    });
  }

  return (
    <SlideUpWrapper visible={visible} onClose={onClose}>
      <View style={styles.rootOuter}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        {/* Drag handle */}
        <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={{ width: 40 }} />
          <View style={styles.headerCenter}>
            <Feather name="shield" size={16} color={theme.red} />
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>BEFORE YOU RIDE</Text>
          </View>
          <Pressable onPress={onClose} style={{ width: 40, alignItems: 'flex-end' }} hitSlop={8}>
            <Feather name="x" size={20} color={theme.textMuted} />
          </Pressable>
        </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

      {/* ── Bike selector ── */}
      <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 0 }]}>SELECT BIKE</Text>
      {bikes.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No bikes in garage — add one in the Garage tab.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bikeChipRow}
          contentContainerStyle={styles.bikeChipContent}
          nestedScrollEnabled
        >
          {[...bikes].sort((a, b) => a.id === selectedBike ? -1 : b.id === selectedBike ? 1 : 0).map((bike) => (
            <Pressable
              key={bike.id}
              style={[
                styles.bikeChip,
                { borderColor: theme.border, backgroundColor: theme.bgCard },
                bike.id === selectedBike && { borderColor: theme.red, backgroundColor: 'rgba(211,47,47,0.12)' },
              ]}
              onPress={() => setSelectedBike(bike.id)}
            >
              <Text style={[
                styles.bikeChipText,
                { color: theme.textSecondary },
                bike.id === selectedBike && { color: theme.red },
              ]}>
                {bikeLabel(bike)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Weather alert ── */}
      {weatherLoading && (
        <View style={[styles.weatherBanner, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Feather name="cloud" size={14} color={theme.textMuted} />
          <Text style={{ fontSize: 12, color: theme.textMuted }}>Checking weather nearby…</Text>
        </View>
      )}
      {!weatherLoading && weatherMsg && (
        <View style={[
          styles.weatherBanner,
          weatherSeverity === 'concern'
            ? { backgroundColor: 'rgba(198,40,40,0.12)', borderColor: 'rgba(198,40,40,0.3)' }
            : { backgroundColor: 'rgba(46,125,50,0.12)', borderColor: 'rgba(46,125,50,0.3)' },
        ]}>
          <Feather
            name={weatherSeverity === 'concern' ? 'alert-triangle' : 'check-circle'}
            size={14}
            color={weatherSeverity === 'concern' ? theme.red : theme.green}
          />
          <Text style={{ fontSize: 12, color: weatherSeverity === 'concern' ? theme.red : theme.green, flex: 1 }}>
            {weatherMsg}
          </Text>
        </View>
      )}

      {/* ── Scout route weather badge ── */}
      {hasRoute && scoutWeatherLoading && (
        <Animated.View style={[
          styles.scoutBadge,
          { backgroundColor: theme.bgCard, borderColor: theme.border },
          { opacity: shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] }) },
        ]}>
          <View style={{ width: 14, height: 14 }}>
            <View style={{ position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 1.2, borderColor: theme.textMuted }} />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: theme.textMuted }}>SCOUT</Text>
          <Text style={{ fontSize: 12, color: theme.textMuted, flex: 1 }}>Checking route weather…</Text>
        </Animated.View>
      )}
      {hasRoute && !scoutWeatherLoading && scoutWeatherMsg && (
        <Pressable
          style={[
            styles.scoutBadge,
            scoutWeatherSeverity === 'green'
              ? { backgroundColor: 'rgba(46,125,50,0.10)', borderColor: 'rgba(46,125,50,0.3)' }
              : scoutWeatherSeverity === 'yellow'
                ? { backgroundColor: 'rgba(255,152,0,0.10)', borderColor: 'rgba(255,152,0,0.3)' }
                : { backgroundColor: 'rgba(198,40,40,0.10)', borderColor: 'rgba(198,40,40,0.3)' },
          ]}
          onPress={() => openScout({ initialMessage: 'Give me a detailed weather briefing for my route.' })}
        >
          <View style={{ width: 14, height: 14 }}>
            <View style={{
              position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 1.2,
              borderColor: scoutWeatherSeverity === 'green' ? theme.green : scoutWeatherSeverity === 'yellow' ? theme.orange : theme.red,
            }} />
            <View style={{
              position: 'absolute', left: 6, top: 2, width: 1.5, height: 4.5, borderRadius: 1,
              backgroundColor: scoutWeatherSeverity === 'green' ? theme.green : scoutWeatherSeverity === 'yellow' ? theme.orange : theme.red,
            }} />
          </View>
          <Text style={{
            fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
            color: scoutWeatherSeverity === 'green' ? theme.green : scoutWeatherSeverity === 'yellow' ? theme.orange : theme.red,
          }}>SCOUT</Text>
          <Text style={{
            fontSize: 12, flex: 1,
            color: scoutWeatherSeverity === 'green' ? theme.green : scoutWeatherSeverity === 'yellow' ? theme.orange : theme.red,
          }}>{scoutWeatherMsg}</Text>
          <Feather name="chevron-right" size={14} color={theme.textMuted} />
        </Pressable>
      )}

      {/* Scout Panel */}
      {/* Scout panel now global in _layout.tsx */}

      {/* ── Shared ride settings + contacts ── */}
      <RideSettingsBlock
        onChange={(v) => { settingsRef.current = v; }}
        onCloseModal={onClose}
      />

      {/* ── Start button ── */}
      <Pressable
        style={({ pressed }) => [styles.startBtn, { backgroundColor: theme.green }, theme.btnBorderTop && { borderTopColor: theme.btnBorderTop, borderBottomColor: theme.btnBorderBottom, borderTopWidth: 1, borderBottomWidth: 1 }, pressed && styles.startBtnPressed]}
        onPress={handleStart}
      >
        <Feather name="play-circle" size={22} color={theme.white} />
        <Text style={styles.startBtnText}>START & RECORD RIDE</Text>
      </Pressable>
    </ScrollView>
      </View>
      </View>
    </SlideUpWrapper>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SCREEN_H = Dimensions.get('window').height;

const styles = StyleSheet.create({
  rootOuter: { flex: 1, justifyContent: 'flex-end' },
  root: { height: SCREEN_H * 0.95, marginTop: 35, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  dragHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 5, borderBottomWidth: 1 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 1.2 },
  content: { padding: 14, paddingBottom: 160 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 12, marginTop: 20 },
  bikeChipRow: { marginBottom: 10 },
  bikeChipContent: { gap: 8, paddingHorizontal: 2 },
  bikeChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 10 },
  bikeChipText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  emptyCard: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  emptyText: { fontSize: 11, lineHeight: 16 },
  weatherBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  scoutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 8, paddingVertical: 18, marginTop: 2 },
  startBtnPressed: { opacity: 0.8 },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.7 },
});
