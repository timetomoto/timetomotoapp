import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore, useSafetyStore, type EmergencyContact } from '../../lib/store';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RideSettingsValues {
  crashOn: boolean;
  crashOverride: boolean;
  shareEnabled: boolean;
  shareOverride: boolean;
  checkInOn: boolean;
  checkInMins: number;
  notifyContactIds: string[];
}

// ---------------------------------------------------------------------------
// Check-in duration presets
// ---------------------------------------------------------------------------

const CHECK_IN_PRESETS = [
  { label: '30 MIN', value: 30 },
  { label: '1 HR',   value: 60 },
  { label: '2 HR',   value: 120 },
  { label: '4 HR',   value: 240 },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      style={[s.toggle, { backgroundColor: theme.toggleTrackOff }, value && { backgroundColor: theme.toggleTrackOn }]}
      onPress={() => onChange(!value)}
    >
      <View style={[s.toggleThumb, { backgroundColor: theme.toggleThumbOff }, value && { alignSelf: 'flex-end', backgroundColor: theme.toggleThumbOn }]} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// RideSettingsBlock
// ---------------------------------------------------------------------------

interface Props {
  onChange: (values: RideSettingsValues) => void;
  onCloseModal?: () => void;
}

export default function RideSettingsBlock({ onChange, onCloseModal }: Props) {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    isMonitoring, setMonitoring, shareActive,
    emergencyContacts, loadContacts,
  } = useSafetyStore();

  // Load contacts
  useEffect(() => {
    loadContacts(user?.id ?? 'local');
  }, []);

  const [gpsStatus, setGpsStatus] = useState<'loading' | 'ok' | 'warn'>('loading');
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      setGpsStatus(status === 'granted' ? 'ok' : 'warn');
    });
  }, []);

  const [crashOn,      setCrashOn]          = useState(isMonitoring);
  const [crashOverride, setCrashOverride]   = useState(false);
  const [shareEnabled, setShareEnabled]     = useState(shareActive);
  const [shareOverride, setShareOverride]   = useState(false);
  const [checkInOn,    setCheckInOn]        = useState(false);
  const [checkInMins,  setCheckInMins]      = useState<number>(60);
  const [notifyContactIds, setNotifyContactIds] = useState<string[]>([]);

  // Pre-select primary contact
  useEffect(() => {
    if (emergencyContacts.length > 0 && notifyContactIds.length === 0) {
      const primary = emergencyContacts.find((c) => c.is_primary);
      setNotifyContactIds(primary ? [primary.phone] : [emergencyContacts[0].phone]);
    }
  }, [emergencyContacts.length]);

  // Push changes to parent
  useEffect(() => {
    onChange({ crashOn, crashOverride, shareEnabled, shareOverride, checkInOn, checkInMins, notifyContactIds });
  }, [crashOn, crashOverride, shareEnabled, shareOverride, checkInOn, checkInMins, notifyContactIds]);

  function handleCrashToggle(newVal: boolean) {
    if (newVal && !isMonitoring) {
      Alert.alert(
        'Crash Detection is Disabled',
        'Crash Detection is turned off in your Settings. Would you like to enable it?',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Enable in Settings', onPress: () => { setMonitoring(true); setCrashOn(true); } },
          { text: 'Enable for This Ride', onPress: () => { setCrashOn(true); setCrashOverride(true); } },
        ],
      );
      return;
    }
    setCrashOn(newVal);
    setCrashOverride(false);
  }

  function handleShareToggle(newVal: boolean) {
    if (newVal && !shareActive) {
      Alert.alert(
        'Live Location Sharing is Disabled',
        'Live Location Sharing is turned off in your Settings. Would you like to enable it?',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Enable in Settings', onPress: () => { useSafetyStore.getState().setShareActive(true); setShareEnabled(true); } },
          { text: 'Enable for This Ride', onPress: () => { setShareEnabled(true); setShareOverride(true); } },
        ],
      );
      return;
    }
    setShareEnabled(newVal);
    setShareOverride(false);
  }

  const alertsActive = crashOn || shareEnabled || checkInOn;

  return (
    <>
      {/* ── RIDE SETTINGS — 2x2 grid ── */}
      <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>RIDE SETTINGS</Text>
      <View style={s.grid}>
        {/* GPS LOCK */}
        <View style={[s.tile, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          {gpsStatus === 'loading'
            ? <ActivityIndicator size="small" color={theme.textSecondary} />
            : <Feather name={gpsStatus === 'ok' ? 'check-circle' : 'alert-circle'} size={20} color={gpsStatus === 'ok' ? theme.green : '#FF9800'} />
          }
          <Text style={[s.tileTitle, { color: theme.textPrimary }]}>GPS LOCK</Text>
        </View>

        {/* CRASH DETECTION */}
        <Pressable style={[s.tile, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => handleCrashToggle(!crashOn)}>
          <Toggle value={crashOn} onChange={handleCrashToggle} />
          <Text style={[s.tileTitle, { color: theme.textPrimary }]}>CRASH</Text>
        </Pressable>

        {/* LIVE SHARE */}
        <Pressable style={[s.tile, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => handleShareToggle(!shareEnabled)}>
          <Toggle value={shareEnabled} onChange={handleShareToggle} />
          <Text style={[s.tileTitle, { color: theme.textPrimary }]}>SHARE</Text>
        </Pressable>

        {/* CHECK-IN TIMER */}
        <Pressable style={[s.tile, { backgroundColor: theme.bgCard, borderColor: theme.border }]} onPress={() => setCheckInOn(!checkInOn)}>
          <Toggle value={checkInOn} onChange={setCheckInOn} />
          <Text style={[s.tileTitle, { color: theme.textPrimary }]}>CHECK-IN</Text>
        </Pressable>
      </View>

      {/* Check-in duration presets — shown below grid when active */}
      {checkInOn && (
        <View style={[s.durationRow, { marginTop: 8 }]}>
          {CHECK_IN_PRESETS.map((p) => (
            <Pressable
              key={p.value}
              style={[s.durationChip, { backgroundColor: theme.bgPanel, borderColor: theme.border }, checkInMins === p.value && { backgroundColor: theme.red + '22', borderColor: theme.red }]}
              onPress={() => setCheckInMins(p.value)}
            >
              <Text style={[s.durationChipText, { color: theme.textSecondary }, checkInMins === p.value && { color: theme.red }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ── NOTIFY ON THIS RIDE ── */}
      <View style={{ opacity: alertsActive ? 1 : 0.25 }} pointerEvents={alertsActive ? 'auto' : 'none'}>
        <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>NOTIFY ON THIS RIDE</Text>
        <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border, marginBottom: 14, paddingTop: 10, paddingBottom: 2 }]}>
          {emergencyContacts.length > 0 ? (
            <View style={s.contactPills}>
              {emergencyContacts.map((contact) => {
                const selected = alertsActive && notifyContactIds.includes(contact.phone);
                return (
                  <Pressable
                    key={contact.phone}
                    style={[s.contactPill, { backgroundColor: selected ? theme.green : 'transparent', borderColor: selected ? theme.green : theme.border }]}
                    onPress={() => {
                      setNotifyContactIds((prev) =>
                        notifyContactIds.includes(contact.phone)
                          ? prev.filter((id) => id !== contact.phone)
                          : [...prev, contact.phone],
                      );
                    }}
                  >
                    <Feather name={selected ? 'check' : 'circle'} size={12} color={selected ? theme.white : theme.textMuted} />
                    <Text style={[s.contactPillText, { color: selected ? theme.white : theme.textMuted }]}>{contact.name}</Text>
                    {contact.is_primary && selected && (
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 8, color: theme.white, fontWeight: '700' }}>PRIMARY</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
              <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 10 }}>No emergency contacts added.</Text>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => { onCloseModal?.(); router.push('/emergency-contacts' as any); }}
              >
                <Feather name="plus" size={14} color={theme.red} />
                <Text style={{ color: theme.red, fontSize: 13, fontWeight: '600' }}>Add Contact</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 12, marginTop: 20 },

  // 2x2 grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tile: {
    width: '47%' as any,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  tileTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  // Toggle
  toggle: { width: 44, height: 24, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 2, marginTop: 2 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, alignSelf: 'flex-start' },

  // Check-in presets
  durationRow: { flexDirection: 'row', gap: 6 },
  durationChip: { flex: 1, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderRadius: 6 },
  durationChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // Notify contacts
  card: { borderWidth: 1, borderRadius: 8, marginBottom: 10, overflow: 'hidden' },
  contactPills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  contactPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  contactPillText: { fontSize: 11, fontWeight: '600' },
});
