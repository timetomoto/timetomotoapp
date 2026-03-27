import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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

type RowStatus = 'ok' | 'warn' | 'off' | 'loading';

function CheckRow({ icon, title, detail, status, children }: {
  icon: string; title: string; detail: string; status: RowStatus; children?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const statusColor = status === 'ok' ? theme.green : status === 'warn' ? '#FF9800' : theme.textSecondary;
  const statusIcon  = status === 'ok' ? 'check-circle' : status === 'warn' ? 'alert-circle' : status === 'loading' ? null : 'circle';
  return (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <View style={[s.rowIconWrap, { backgroundColor: statusColor + '18' }]}>
          <Feather name={icon as any} size={14} color={statusColor} />
        </View>
        <View style={s.rowText}>
          <Text style={[s.rowTitle, { color: theme.textPrimary }]}>{title}</Text>
          <Text style={[s.rowDetail, { color: theme.textSecondary }]}>{detail}</Text>
        </View>
      </View>
      <View style={s.rowRight}>
        {children ?? (
          status === 'loading'
            ? <ActivityIndicator size="small" color={theme.textSecondary} />
            : statusIcon
              ? <Feather name={statusIcon as any} size={16} color={statusColor} />
              : null
        )}
      </View>
    </View>
  );
}

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

  function handleGpsTap() {
    if (gpsStatus === 'warn') {
      Alert.alert(
        'Location Access Required',
        'Open Settings to enable location access for Time to Moto',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  }

  const alertsActive = crashOn || shareEnabled || checkInOn;

  return (
    <>
      {/* ── RIDE SETTINGS ── */}
      <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>RIDE SETTINGS</Text>
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Pressable onPress={handleGpsTap} disabled={gpsStatus !== 'warn'}>
          <CheckRow
            icon="map-pin" title="GPS LOCK"
            detail={gpsStatus === 'loading' ? 'Checking…' : gpsStatus === 'ok' ? 'Location permission granted' : 'Location permission denied — tap to open Settings'}
            status={gpsStatus === 'loading' ? 'loading' : gpsStatus}
          />
        </Pressable>
        <View style={[s.divider, { backgroundColor: theme.border }]} />
        <CheckRow
          icon="shield" title="CRASH DETECTION"
          detail={crashOn ? (crashOverride ? 'Armed — this ride only' : 'Armed — accelerometer monitoring at 10 Hz') : 'Off — tap to enable'}
          status={crashOn ? 'ok' : 'off'}
        >
          <Toggle value={crashOn} onChange={handleCrashToggle} />
        </CheckRow>
        <View style={[s.divider, { backgroundColor: theme.border }]} />
        <CheckRow
          icon="share-2" title="LIVE SHARE"
          detail={shareEnabled ? (shareOverride ? 'Sharing enabled — this ride only' : 'Share link copied to clipboard when you start') : 'Off — contacts can follow your ride in real-time'}
          status={shareEnabled ? 'ok' : 'off'}
        >
          <Toggle value={shareEnabled} onChange={handleShareToggle} />
        </CheckRow>
        <View style={[s.divider, { backgroundColor: theme.border }]} />
        <CheckRow
          icon="clock" title="CHECK-IN TIMER"
          detail={checkInOn ? `Alert contacts if you don't check in within ${checkInMins >= 60 ? `${checkInMins / 60} hr` : `${checkInMins} min`}` : 'Off — set a deadline for checking in'}
          status={checkInOn ? 'ok' : 'off'}
        >
          <Toggle value={checkInOn} onChange={setCheckInOn} />
        </CheckRow>
        {checkInOn && (
          <View style={s.durationRow}>
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
      </View>

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
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 12, marginTop: 12 },
  card: { borderWidth: 1, borderRadius: 8, marginBottom: 10, overflow: 'hidden' },
  divider: { height: 1, marginHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14, minHeight: 53 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 9 },
  rowIconWrap: { width: 33, height: 33, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  rowDetail: { fontSize: 10, lineHeight: 14 },
  rowRight: { marginLeft: 10 },
  toggle: { width: 44, height: 24, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 2 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, alignSelf: 'flex-start' },
  durationRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  durationChip: { flex: 1, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderRadius: 6 },
  durationChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  contactPills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  contactPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  contactPillText: { fontSize: 11, fontWeight: '600' },
});
