import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { useSafetyStore, useGarageStore, bikeLabel } from '../../lib/store';
import { useTheme } from '../../lib/useTheme';
import EmergencyContactsSheet from '../garage/EmergencyContactsSheet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RideConfig {
  shareEnabled: boolean;
  checkInMinutes: number | null;
  bikeId?: string;
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
  const { theme } = useTheme();
  const statusColor = status === 'ok' ? '#4CAF50' : status === 'warn' ? '#FF9800' : theme.textSecondary;
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

// ---------------------------------------------------------------------------
// Toggle pill
// ---------------------------------------------------------------------------

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      style={[s.toggle, { backgroundColor: theme.border }, value && { backgroundColor: theme.red }]}
      onPress={() => onChange(!value)}
    >
      <View style={[s.toggleThumb, { backgroundColor: theme.textSecondary }, value && { alignSelf: 'flex-end', backgroundColor: '#fff' }]} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// PreRideChecklist
// ---------------------------------------------------------------------------

const PRE_RIDE_COL1 = [
  'Check tire pressure',
  'Check brakes and controls',
  'Check chain condition',
];

const PRE_RIDE_COL2 = [
  'Check lights and signals',
  'Check gear and helmet',
  'Check fuel level',
];

export default function PreRideChecklist({ onStart }: { onStart: (cfg: RideConfig) => void }) {
  const { theme } = useTheme();
  const {
    isMonitoring, setMonitoring, shareActive,
    setCrashDetectionOverride, setLocationSharingOverride,
    emergencyContacts,
  } = useSafetyStore();
  const { bikes, selectedBikeId, selectBike } = useGarageStore();

  const [gpsStatus, setGpsStatus] = useState<'loading' | 'ok' | 'warn'>('loading');
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      setGpsStatus(status === 'granted' ? 'ok' : 'warn');
    });
  }, []);

  const [selectedBike, setSelectedBike]     = useState<string | null>(selectedBikeId);
  const [crashOn,      setCrashOn]          = useState(isMonitoring);
  const [crashOverride, setCrashOverride]   = useState(false);
  const [shareEnabled, setShareEnabled]     = useState(shareActive);
  const [shareOverride, setShareOverride]   = useState(false);
  const [checkInOn,    setCheckInOn]        = useState(false);
  const [checkInMins,  setCheckInMins]      = useState<number>(60);
  const [showContacts, setShowContacts]     = useState(false);

  function handleCrashToggle(newVal: boolean) {
    if (newVal && !isMonitoring) {
      // Global setting is off — prompt
      Alert.alert(
        'Crash Detection is Disabled',
        'Crash Detection is turned off in your Settings. Would you like to enable it?',
        [
          { text: 'Not Now', style: 'cancel' },
          {
            text: 'Enable in Settings',
            onPress: () => {
              setMonitoring(true);
              setCrashOn(true);
            },
          },
          {
            text: 'Enable for This Ride',
            onPress: () => {
              setCrashOn(true);
              setCrashOverride(true);
            },
          },
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
          {
            text: 'Enable in Settings',
            onPress: () => {
              useSafetyStore.getState().setShareActive(true);
              setShareEnabled(true);
            },
          },
          {
            text: 'Enable for This Ride',
            onPress: () => {
              setShareEnabled(true);
              setShareOverride(true);
            },
          },
        ],
      );
      return;
    }
    setShareEnabled(newVal);
    setShareOverride(false);
  }

  function handleStart() {
    if (selectedBike) selectBike(selectedBike);
    // Apply session overrides
    if (crashOn && !isMonitoring) {
      setCrashDetectionOverride(true);
      setMonitoring(true);
    }
    if (shareEnabled && !shareActive) {
      setLocationSharingOverride(true);
    }
    onStart({
      shareEnabled,
      checkInMinutes: checkInOn ? checkInMins : null,
      bikeId: selectedBike ?? undefined,
    });
  }

  const contactsOk = emergencyContacts.length > 0;

  return (
    <ScrollView
      style={[s.root, { backgroundColor: theme.bg }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.heading, { color: theme.textSecondary }]}>PRE-RIDE CHECK</Text>

      {/* ── Bike selector ── */}
      <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>SELECT BIKE</Text>
      {bikes.length === 0 ? (
        <View style={[s.emptyCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[s.emptyText, { color: theme.textSecondary }]}>
            No bikes in garage — add one in the Garage tab.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.bikeChipRow}
          contentContainerStyle={s.bikeChipContent}
          nestedScrollEnabled
        >
          {bikes.map((bike) => (
            <Pressable
              key={bike.id}
              style={[
                s.bikeChip,
                { borderColor: theme.border, backgroundColor: theme.bgCard },
                bike.id === selectedBike && { borderColor: theme.red, backgroundColor: 'rgba(211,47,47,0.12)' },
              ]}
              onPress={() => setSelectedBike(bike.id)}
            >
              <Text style={[
                s.bikeChipText,
                { color: theme.textSecondary },
                bike.id === selectedBike && { color: theme.red },
              ]}>
                {bikeLabel(bike)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Static pre-ride reminders ── */}
      <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>REMINDERS</Text>
      <View style={[s.remindersCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <View style={s.remindersColumns}>
          <View style={s.remindersCol}>
            {PRE_RIDE_COL1.map((reminder, i) => (
              <View key={i} style={s.reminderRow}>
                <Feather name="check" size={9} color={theme.textSecondary} />
                <Text style={[s.reminderText, { color: theme.textSecondary }]}>{reminder}</Text>
              </View>
            ))}
          </View>
          <View style={s.remindersCol}>
            {PRE_RIDE_COL2.map((reminder, i) => (
              <View key={i} style={s.reminderRow}>
                <Feather name="check" size={9} color={theme.textSecondary} />
                <Text style={[s.reminderText, { color: theme.textSecondary }]}>{reminder}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── Required checks ── */}
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <CheckRow
          icon="map-pin"
          title="GPS LOCK"
          detail={gpsStatus === 'loading' ? 'Checking…' : gpsStatus === 'ok' ? 'Location permission granted' : 'Location permission denied — enable in Settings'}
          status={gpsStatus === 'loading' ? 'loading' : gpsStatus}
        />

        <View style={[s.divider, { backgroundColor: theme.border }]} />

        <CheckRow
          icon="shield"
          title="CRASH DETECTION"
          detail={
            crashOn
              ? crashOverride
                ? 'Armed — this ride only'
                : 'Armed — accelerometer monitoring at 10 Hz'
              : 'Off — tap to enable'
          }
          status={crashOn ? 'ok' : 'off'}
        >
          {crashOverride && (
            <Text style={[s.overrideLabel, { color: theme.textMuted }]}>this ride only</Text>
          )}
          <Toggle value={crashOn} onChange={handleCrashToggle} />
        </CheckRow>

        <View style={[s.divider, { backgroundColor: theme.border }]} />

        <CheckRow
          icon="users"
          title="EMERGENCY CONTACTS"
          detail={
            contactsOk
              ? `${emergencyContacts.length} contact${emergencyContacts.length > 1 ? 's' : ''} saved — tap to edit`
              : 'No contacts added — tap to add'
          }
          status={contactsOk ? 'ok' : 'warn'}
        >
          <Pressable
            style={[s.contactsBtn, { backgroundColor: contactsOk ? theme.bgPanel : theme.red, borderColor: contactsOk ? theme.border : 'transparent' }]}
            onPress={() => setShowContacts(true)}
          >
            <Feather name={contactsOk ? 'edit-2' : 'plus'} size={13} color={contactsOk ? theme.textSecondary : '#fff'} />
            <Text style={[s.contactsBtnText, { color: contactsOk ? theme.textSecondary : '#fff' }]}>
              {contactsOk ? 'EDIT' : 'ADD'}
            </Text>
          </Pressable>
        </CheckRow>
      </View>

      {showContacts && <EmergencyContactsSheet onClose={() => setShowContacts(false)} />}

      {/* ── Optional: Live share ── */}
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <CheckRow
          icon="share-2"
          title="LIVE SHARE"
          detail={
            shareEnabled
              ? shareOverride
                ? 'Sharing enabled — this ride only'
                : 'Share link copied to clipboard when you start'
              : 'Off — contacts can follow your ride in real-time'
          }
          status={shareEnabled ? 'ok' : 'off'}
        >
          {shareOverride && (
            <Text style={[s.overrideLabel, { color: theme.textMuted }]}>this ride only</Text>
          )}
          <Toggle value={shareEnabled} onChange={handleShareToggle} />
        </CheckRow>
      </View>

      {/* ── Optional: Check-in timer ── */}
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
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
                style={[
                  s.durationChip,
                  { backgroundColor: theme.bgPanel, borderColor: theme.border },
                  checkInMins === p.value && { backgroundColor: theme.red + '22', borderColor: theme.red },
                ]}
                onPress={() => setCheckInMins(p.value)}
              >
                <Text style={[
                  s.durationChipText,
                  { color: theme.textSecondary },
                  checkInMins === p.value && { color: theme.red },
                ]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ── Start button ── */}
      <Pressable
        style={({ pressed }) => [s.startBtn, { backgroundColor: '#4CAF50' }, pressed && s.startBtnPressed]}
        onPress={handleStart}
      >
        <Feather name="play-circle" size={22} color="#fff" />
        <Text style={s.startBtnText}>START & RECORD RIDE</Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 14, paddingBottom: 60 },

  heading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 5,
    marginTop: 2,
  },

  // Bike selector
  bikeChipRow: { marginBottom: 8 },
  bikeChipContent: { gap: 6, paddingHorizontal: 2 },
  bikeChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  bikeChipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  emptyText: { fontSize: 11, lineHeight: 16 },

  // Static reminders
  remindersCard: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  remindersColumns: {
    flexDirection: 'row',
    gap: 6,
  },
  remindersCol: {
    flex: 1,
    gap: 4,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reminderText: {
    fontSize: 10,
    lineHeight: 14,
    flex: 1,
  },

  card: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  divider: { height: 1, marginHorizontal: 12 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 53,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 9 },
  rowIconWrap: { width: 33, height: 33, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  rowDetail: { fontSize: 10, lineHeight: 14 },
  rowRight: { marginLeft: 10 },

  toggle: {
    width: 40,
    height: 29,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleThumb: {
    width: 23,
    height: 23,
    borderRadius: 11,
    alignSelf: 'flex-start',
  },

  durationRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  durationChip: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
  },
  durationChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 8,
    paddingVertical: 18,
    marginTop: 2,
  },
  startBtnPressed: { opacity: 0.8 },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.7 },

  contactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  contactsBtnText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  overrideLabel: {
    fontSize: 9,
    fontWeight: '500',
    marginRight: 6,
  },
});
