import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  notifyContactIds?: string[];
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

// ---------------------------------------------------------------------------
// Toggle pill
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
// PreRideChecklist
// ---------------------------------------------------------------------------

export default function PreRideChecklist({ visible, onClose, onStart }: { visible: boolean; onClose: () => void; onStart: (cfg: RideConfig) => void }) {
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
  const [notifyContactIds, setNotifyContactIds] = useState<string[]>(
    emergencyContacts.map((c) => c.phone),
  );

  // Keep notifyContactIds in sync when contacts change (e.g. after editing)
  useEffect(() => {
    setNotifyContactIds(emergencyContacts.map((c) => c.phone));
  }, [emergencyContacts.length]);

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
      notifyContactIds,
    });
  }

  const contactsOk = emergencyContacts.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[s.root, { backgroundColor: theme.bg }]}>
        {/* Drag handle */}
        <View style={[s.dragHandle, { backgroundColor: theme.border }]} />
        {/* Header row */}
        <View style={s.header}>
          <Text style={[s.headerTitle, { color: theme.textPrimary }]}>BEFORE YOU RIDE</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={theme.textPrimary} />
          </Pressable>
        </View>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >

      {/* ── Bike selector ── */}
      <Text style={[s.sectionLabel, { color: theme.textSecondary, marginTop: 0 }]}>SELECT BIKE</Text>
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

      {/* ── RIDE SETTINGS ── */}
      <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>RIDE SETTINGS</Text>
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
          <Toggle value={crashOn} onChange={handleCrashToggle} />
        </CheckRow>

        <View style={[s.divider, { backgroundColor: theme.border }]} />

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
          <Toggle value={shareEnabled} onChange={handleShareToggle} />
        </CheckRow>

        <View style={[s.divider, { backgroundColor: theme.border }]} />

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

      {/* ── EMERGENCY CONTACTS ── */}
      <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>EMERGENCY CONTACTS</Text>
      {(() => {
        const alertsActive = crashOn || shareEnabled || checkInOn;
        return (
          <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border, marginBottom: 24 }, !alertsActive && { opacity: 0.4 }]}>
            <CheckRow
              icon="users"
              title="WHO TO NOTIFY"
              detail={
                !alertsActive
                  ? 'Enable an alert setting above to notify contacts'
                  : contactsOk
                    ? (() => {
                        const selected = emergencyContacts.filter((c) => notifyContactIds.includes(c.phone));
                        if (selected.length === 0) return 'No contacts selected for this ride';
                        const names = selected.map((c) => c.name.split(' ')[0]);
                        if (names.length <= 2) return `Notifying: ${names.join(', ')}`;
                        return `Notifying: ${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
                      })()
                    : 'No emergency contacts added. Add contacts in Settings.'
              }
              status={!alertsActive ? 'off' : contactsOk ? 'ok' : 'warn'}
            >
              <Pressable
                style={[s.contactsBtn, { backgroundColor: contactsOk ? theme.bgPanel : theme.red, borderColor: contactsOk ? theme.border : 'transparent' }]}
                onPress={() => alertsActive && setShowContacts(true)}
                disabled={!alertsActive}
              >
                <Feather name={contactsOk ? 'edit-2' : 'plus'} size={13} color={contactsOk ? theme.textSecondary : theme.white} />
                <Text style={[s.contactsBtnText, { color: contactsOk ? theme.textSecondary : theme.white }]}>
                  {contactsOk ? 'EDIT' : 'ADD'}
                </Text>
              </Pressable>
            </CheckRow>

            {/* Contact selector pills */}
            {contactsOk && alertsActive && (
              <View style={s.contactPills}>
                <Text style={[s.contactPillsLabel, { color: theme.textMuted }]}>Notifying:</Text>
                {emergencyContacts.map((contact) => {
                  const selected = notifyContactIds.includes(contact.phone);
                  return (
                    <Pressable
                      key={contact.phone}
                      style={[
                        s.contactPill,
                        {
                          backgroundColor: selected ? theme.green : 'transparent',
                          borderColor: selected ? theme.green : theme.border,
                        },
                      ]}
                      onPress={() => {
                        setNotifyContactIds((prev) =>
                          selected
                            ? prev.filter((id) => id !== contact.phone)
                            : [...prev, contact.phone],
                        );
                      }}
                    >
                      <Feather
                        name={selected ? 'check' : 'circle'}
                        size={11}
                        color={selected ? theme.white : theme.textMuted}
                      />
                      <Text style={[s.contactPillText, { color: selected ? theme.white : theme.textMuted }]}>
                        {contact.name.split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })()}

      {showContacts && <EmergencyContactsSheet onClose={() => setShowContacts(false)} />}

      {/* ── Start button ── */}
      <Pressable
        style={({ pressed }) => [s.startBtn, { backgroundColor: theme.green }, theme.btnBorderTop && { borderTopColor: theme.btnBorderTop, borderBottomColor: theme.btnBorderBottom, borderTopWidth: 1, borderBottomWidth: 1 }, pressed && s.startBtnPressed]}
        onPress={handleStart}
      >
        <Feather name="play-circle" size={22} color={theme.white} />
        <Text style={s.startBtnText}>START & RECORD RIDE</Text>
      </Pressable>
    </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { flex: 1 },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  content: { padding: 14, paddingBottom: 60 },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 12,
    marginTop: 20,
  },

  // Bike selector
  bikeChipRow: { marginBottom: 10 },
  bikeChipContent: { gap: 8, paddingHorizontal: 2 },
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
    marginBottom: 10,
  },
  emptyText: { fontSize: 11, lineHeight: 16 },

  card: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
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
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
  contactPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 12,
    marginTop: -4,
  },
  contactPillsLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 2,
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  contactPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
