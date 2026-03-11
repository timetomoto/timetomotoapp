import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { useSafetyStore } from '../../lib/store';
import SafetyDot from './SafetyDot';
import { Colors } from '../../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RideConfig {
  shareEnabled: boolean;
  checkInMinutes: number | null;  // null = no check-in timer
}

// ---------------------------------------------------------------------------
// Check-in duration presets (minutes)
// ---------------------------------------------------------------------------

const CHECK_IN_PRESETS = [
  { label: '30 MIN', value: 30 },
  { label: '1 HR',   value: 60 },
  { label: '2 HR',   value: 120 },
  { label: '4 HR',   value: 240 },
];

// ---------------------------------------------------------------------------
// Checklist row
// ---------------------------------------------------------------------------

type RowStatus = 'ok' | 'warn' | 'off' | 'loading';

function CheckRow({
  icon,
  title,
  detail,
  status,
  children,
}: {
  icon: string;
  title: string;
  detail: string;
  status: RowStatus;
  children?: React.ReactNode;
}) {
  const statusColor = status === 'ok' ? '#4CAF50' : status === 'warn' ? '#FF9800' : Colors.TEXT_SECONDARY;
  const statusIcon  = status === 'ok' ? 'check-circle' : status === 'warn' ? 'alert-circle' : status === 'loading' ? null : 'circle';

  return (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <View style={[s.rowIconWrap, { backgroundColor: statusColor + '18' }]}>
          <Feather name={icon as any} size={16} color={statusColor} />
        </View>
        <View style={s.rowText}>
          <Text style={s.rowTitle}>{title}</Text>
          <Text style={s.rowDetail}>{detail}</Text>
        </View>
      </View>
      <View style={s.rowRight}>
        {children ?? (
          status === 'loading'
            ? <ActivityIndicator size="small" color={Colors.TEXT_SECONDARY} />
            : statusIcon
              ? <Feather name={statusIcon as any} size={18} color={statusColor} />
              : null
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Toggle pill
// ---------------------------------------------------------------------------

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      style={[s.toggle, value && s.toggleOn]}
      onPress={() => onChange(!value)}
    >
      <View style={[s.toggleThumb, value && s.toggleThumbOn]} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// PreRideChecklist
// ---------------------------------------------------------------------------

export default function PreRideChecklist({ onStart }: { onStart: (cfg: RideConfig) => void }) {
  const { isMonitoring, emergencyContacts } = useSafetyStore();

  // GPS status
  const [gpsStatus, setGpsStatus] = useState<'loading' | 'ok' | 'warn'>('loading');
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      setGpsStatus(status === 'granted' ? 'ok' : 'warn');
    });
  }, []);

  // Optional features
  const [shareEnabled, setShareEnabled]   = useState(false);
  const [checkInOn,    setCheckInOn]      = useState(false);
  const [checkInMins,  setCheckInMins]    = useState<number>(60);

  function handleStart() {
    onStart({
      shareEnabled,
      checkInMinutes: checkInOn ? checkInMins : null,
    });
  }

  const contactsOk = emergencyContacts.length > 0;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.heading}>PRE-RIDE CHECK</Text>

      {/* ── Required checks ── */}
      <View style={s.card}>
        {/* GPS */}
        <CheckRow
          icon="map-pin"
          title="GPS LOCK"
          detail={gpsStatus === 'loading' ? 'Checking…' : gpsStatus === 'ok' ? 'Location permission granted' : 'Location permission denied — enable in Settings'}
          status={gpsStatus === 'loading' ? 'loading' : gpsStatus}
        />

        <View style={s.divider} />

        {/* Crash detection */}
        <CheckRow
          icon="shield"
          title="CRASH DETECTION"
          detail={isMonitoring ? 'Armed — accelerometer monitoring at 10 Hz' : 'Off — tap to enable'}
          status={isMonitoring ? 'ok' : 'off'}
        >
          <SafetyDot />
        </CheckRow>

        <View style={s.divider} />

        {/* Emergency contacts */}
        <CheckRow
          icon="users"
          title="EMERGENCY CONTACTS"
          detail={
            contactsOk
              ? `${emergencyContacts.length} contact${emergencyContacts.length > 1 ? 's' : ''} saved`
              : 'No contacts — add in Garage → Safety'
          }
          status={contactsOk ? 'ok' : 'warn'}
        />
      </View>

      {/* ── Optional: Live share ── */}
      <View style={s.card}>
        <CheckRow
          icon="share-2"
          title="LIVE SHARE"
          detail={
            shareEnabled
              ? 'Share link copied to clipboard when you start'
              : 'Off — contacts can follow your ride in real-time'
          }
          status={shareEnabled ? 'ok' : 'off'}
        >
          <Toggle value={shareEnabled} onChange={setShareEnabled} />
        </CheckRow>
      </View>

      {/* ── Optional: Check-in timer ── */}
      <View style={s.card}>
        <CheckRow
          icon="clock"
          title="CHECK-IN TIMER"
          detail={
            checkInOn
              ? `Alert contacts if you don't check in within ${checkInMins >= 60 ? `${checkInMins / 60} hr` : `${checkInMins} min`}`
              : 'Off — set a deadline for checking in'
          }
          status={checkInOn ? 'ok' : 'off'}
        >
          <Toggle value={checkInOn} onChange={setCheckInOn} />
        </CheckRow>

        {checkInOn && (
          <View style={s.durationRow}>
            {CHECK_IN_PRESETS.map((p) => (
              <Pressable
                key={p.value}
                style={[s.durationChip, checkInMins === p.value && s.durationChipActive]}
                onPress={() => setCheckInMins(p.value)}
              >
                <Text style={[s.durationChipText, checkInMins === p.value && s.durationChipTextActive]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ── Start button ── */}
      <Pressable
        style={({ pressed }) => [s.startBtn, pressed && s.startBtnPressed]}
        onPress={handleStart}
      >
        <Feather name="play-circle" size={20} color="#fff" />
        <Text style={s.startBtnText}>START RIDE</Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.TTM_DARK },
  content: { padding: 20, paddingBottom: 80 },

  heading: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 14,
  },

  card: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: Colors.TTM_BORDER, marginHorizontal: 16 },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  rowIconWrap: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: Colors.TEXT_PRIMARY, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  rowDetail: { color: Colors.TEXT_SECONDARY, fontSize: 11, lineHeight: 16 },
  rowRight: { marginLeft: 12 },

  // Toggle
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.TTM_BORDER,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn:    { backgroundColor: Colors.TTM_RED },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.TEXT_SECONDARY,
    alignSelf: 'flex-start',
  },
  toggleThumbOn: { alignSelf: 'flex-end', backgroundColor: '#fff' },

  // Duration chips
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  durationChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: Colors.TTM_PANEL,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 6,
  },
  durationChipActive:     { backgroundColor: Colors.TTM_RED + '22', borderColor: Colors.TTM_RED },
  durationChipText:       { color: Colors.TEXT_SECONDARY, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  durationChipTextActive: { color: Colors.TTM_RED },

  // Start button
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.TTM_RED,
    borderRadius: 10,
    paddingVertical: 18,
    marginTop: 4,
  },
  startBtnPressed: { opacity: 0.8 },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 3 },
});
