import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useAuthStore, useSafetyStore } from '@/lib/store';
import { useTheme } from '@/lib/useTheme';

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>{label}</Text>
  );
}

// ---------------------------------------------------------------------------
// Toggle row
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={value ? theme.red : theme.textMuted}
        trackColor={{ false: theme.border, true: theme.red + '66' }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Segmented control row
// ---------------------------------------------------------------------------

function SegmentedRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.segRow, { borderBottomColor: theme.border }]}>
      <Text style={[styles.segRowLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={[styles.segControl, { borderColor: theme.border }]}>
        {options.map((opt, i) => {
          const isActive = value === opt.key;
          const isLast = i === options.length - 1;
          return (
            <Pressable
              key={opt.key}
              style={[
                styles.segment,
                { backgroundColor: isActive ? theme.red : theme.bgCard },
                !isLast && { borderRightWidth: 1, borderRightColor: theme.border },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(opt.key);
              }}
            >
              <Text style={[styles.segmentText, { color: isActive ? '#FFFFFF' : theme.textMuted }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Plain row (non-interactive / coming soon)
// ---------------------------------------------------------------------------

function PlainRow({ label, subtitle, muted }: { label: string; subtitle?: string; muted?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: muted ? theme.textMuted : theme.textPrimary }]}>{label}</Text>
        {!!subtitle && (
          <Text style={[styles.rowSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const { theme, mode, setMode } = useTheme();
  const isDark = theme.bg === '#0D0D0D';
  const router = useRouter();
  const { isMonitoring, setMonitoring, shareActive, setShareActive, emergencyContacts, loadContacts } = useSafetyStore();
  const { user } = useAuthStore();

  // Load emergency contacts so the crash-detection check is accurate
  useEffect(() => {
    loadContacts(user?.id ?? 'local');
  }, [user?.id]);

  // ── Notifications ──
  const [notifRideStart, setNotifRideStart] = useState(true);
  const [notifWeather, setNotifWeather] = useState(true);
  const [notifEmergency, setNotifEmergency] = useState(true);

  // ── Units ──
  const [distanceUnit, setDistanceUnit] = useState<'miles' | 'kilometers'>('miles');
  const [tempUnit, setTempUnit] = useState<'fahrenheit' | 'celsius'>('fahrenheit');
  const [capacityUnit, setCapacityUnit] = useState<'gallons' | 'liters'>('gallons');

  // ── Weather ──
  const [weatherDefaultFav, setWeatherDefaultFav] = useState(false);

  // Load persisted prefs
  useEffect(() => {
    (async () => {
      const [rideStart, weather, emergency, dist, temp, capacity, wdfav] = await Promise.all([
        AsyncStorage.getItem('ttm_notif_ride_start'),
        AsyncStorage.getItem('ttm_notif_weather'),
        AsyncStorage.getItem('ttm_notif_emergency'),
        AsyncStorage.getItem('ttm_units_distance'),
        AsyncStorage.getItem('ttm_units_temp'),
        AsyncStorage.getItem('ttm_units_capacity'),
        AsyncStorage.getItem('ttm_weather_default_fav'),
      ]);
      if (rideStart !== null) setNotifRideStart(rideStart === 'true');
      if (weather !== null) setNotifWeather(weather === 'true');
      if (emergency !== null) setNotifEmergency(emergency === 'true');
      if (dist === 'miles' || dist === 'kilometers') setDistanceUnit(dist);
      if (temp === 'fahrenheit' || temp === 'celsius') setTempUnit(temp);
      if (capacity === 'gallons' || capacity === 'liters') setCapacityUnit(capacity);
      if (wdfav !== null) setWeatherDefaultFav(wdfav === 'true');
    })();
  }, []);

  // Persist helpers
  async function toggleNotif(key: string, value: boolean) {
    await AsyncStorage.setItem(key, String(value));
  }

  async function setDist(v: 'miles' | 'kilometers') {
    setDistanceUnit(v);
    await AsyncStorage.setItem('ttm_units_distance', v);
  }

  async function setTemp(v: 'fahrenheit' | 'celsius') {
    setTempUnit(v);
    await AsyncStorage.setItem('ttm_units_temp', v);
  }

  async function setCapacity(v: 'gallons' | 'liters') {
    setCapacityUnit(v);
    await AsyncStorage.setItem('ttm_units_capacity', v);
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.heading, { color: theme.textPrimary }]}>SETTINGS</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* APPEARANCE */}
        <SectionHeader label="APPEARANCE" />
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <View style={styles.appearanceInner}>
            <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>THEME</Text>
            <View style={[styles.segControl, { borderColor: theme.border, marginTop: 10 }]}>
              {(['dark', 'light', 'system'] as const).map((m, i, arr) => {
                const isActive = mode === m;
                const isLast = i === arr.length - 1;
                return (
                  <Pressable
                    key={m}
                    style={[
                      styles.segment,
                      { backgroundColor: isActive ? theme.red : theme.bgPanel },
                      !isLast && { borderRightWidth: 1, borderRightColor: theme.border },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setMode(m);
                    }}
                  >
                    <Text style={[styles.segmentText, { color: isActive ? '#FFFFFF' : theme.textMuted }]}>
                      {m.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Dark: SAFETY then NOTIFICATIONS — Light: NOTIFICATIONS then SAFETY */}
        {isDark ? (
          <>
            <SectionHeader label="SAFETY" />
            <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <View>
                <ToggleRow
                  label="Crash Detection"
                  value={isMonitoring}
                  onValueChange={(v) => {
                    if (v && emergencyContacts.length === 0) {
                      Alert.alert(
                        'No Emergency Contacts',
                        'Add at least one emergency contact so someone can be notified if a crash is detected. Without a contact, crash alerts cannot be sent.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Add Contact', onPress: () => router.push('/emergency-contacts' as any) },
                          { text: 'Enable Anyway', onPress: () => setMonitoring(true) },
                        ],
                      );
                    } else {
                      setMonitoring(v);
                    }
                  }}
                />
                {isMonitoring && emergencyContacts.length === 0 && (
                  <Text style={[styles.toggleWarning, { color: theme.red }]}>
                    No emergency contacts added
                  </Text>
                )}
              </View>
              <ToggleRow
                label="Live Location Sharing"
                value={shareActive}
                onValueChange={setShareActive}
              />
            </View>

            <SectionHeader label="NOTIFICATIONS" />
            <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <ToggleRow
                label="Ride start alerts"
                value={notifRideStart}
                onValueChange={(v) => { setNotifRideStart(v); toggleNotif('ttm_notif_ride_start', v); }}
              />
              <ToggleRow
                label="Weather alerts"
                value={notifWeather}
                onValueChange={(v) => { setNotifWeather(v); toggleNotif('ttm_notif_weather', v); }}
              />
              <ToggleRow
                label="Emergency alerts"
                value={notifEmergency}
                onValueChange={(v) => { setNotifEmergency(v); toggleNotif('ttm_notif_emergency', v); }}
              />
            </View>
          </>
        ) : (
          <>
            <SectionHeader label="NOTIFICATIONS" />
            <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <ToggleRow
                label="Ride start alerts"
                value={notifRideStart}
                onValueChange={(v) => { setNotifRideStart(v); toggleNotif('ttm_notif_ride_start', v); }}
              />
              <ToggleRow
                label="Weather alerts"
                value={notifWeather}
                onValueChange={(v) => { setNotifWeather(v); toggleNotif('ttm_notif_weather', v); }}
              />
              <ToggleRow
                label="Emergency alerts"
                value={notifEmergency}
                onValueChange={(v) => { setNotifEmergency(v); toggleNotif('ttm_notif_emergency', v); }}
              />
            </View>

            <SectionHeader label="SAFETY" />
            <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <View>
                <ToggleRow
                  label="Crash Detection"
                  value={isMonitoring}
                  onValueChange={(v) => {
                    if (v && emergencyContacts.length === 0) {
                      Alert.alert(
                        'No Emergency Contacts',
                        'Add at least one emergency contact so someone can be notified if a crash is detected. Without a contact, crash alerts cannot be sent.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Add Contact', onPress: () => router.push('/emergency-contacts' as any) },
                          { text: 'Enable Anyway', onPress: () => setMonitoring(true) },
                        ],
                      );
                    } else {
                      setMonitoring(v);
                    }
                  }}
                />
                {isMonitoring && emergencyContacts.length === 0 && (
                  <Text style={[styles.toggleWarning, { color: theme.red }]}>
                    No emergency contacts added
                  </Text>
                )}
              </View>
              <ToggleRow
                label="Live Location Sharing"
                value={shareActive}
                onValueChange={setShareActive}
              />
            </View>
          </>
        )}

        {/* UNITS */}
        <SectionHeader label="UNITS" />
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <SegmentedRow
            label="DISTANCE"
            options={[
              { key: 'miles', label: 'MILES' },
              { key: 'kilometers', label: 'KM' },
            ]}
            value={distanceUnit}
            onChange={setDist}
          />
          <SegmentedRow
            label="TEMPERATURE"
            options={[
              { key: 'fahrenheit', label: '°F' },
              { key: 'celsius', label: '°C' },
            ]}
            value={tempUnit}
            onChange={setTemp}
          />
          <SegmentedRow
            label="CAPACITY"
            options={[
              { key: 'gallons', label: 'GALLONS' },
              { key: 'liters', label: 'LITERS' },
            ]}
            value={capacityUnit}
            onChange={setCapacity}
          />
        </View>

        {/* WEATHER */}
        <SectionHeader label="WEATHER" />
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Pressable
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={() => router.push('/favorite-locations')}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Favorite Locations</Text>
              <Text style={[styles.rowSubtitle, { color: theme.textMuted }]}>Save cities for quick access</Text>
            </View>
            <Feather name="chevron-right" size={16} color={theme.textMuted} />
          </Pressable>
          <ToggleRow
            label="Use First Favorite as Default"
            value={weatherDefaultFav}
            onValueChange={(v) => {
              setWeatherDefaultFav(v);
              AsyncStorage.setItem('ttm_weather_default_fav', String(v));
            }}
          />
        </View>

        {/* OFFLINE MAPS */}
        <SectionHeader label="OFFLINE MAPS" />
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <PlainRow
            label="Manage Offline Maps"
            subtitle="Coming Soon"
            muted
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },

  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontFamily: 'BarlowCondensed',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },

  card: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  toggleWarning: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 10,
    marginTop: -6,
    opacity: 0.85,
  },
  rowSubtitle: {
    fontSize: 11,
    letterSpacing: 0.2,
    marginTop: 2,
  },

  segRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  segRowLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  segControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  appearanceInner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
