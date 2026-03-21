import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafetyStore, useGarageStore, bikeLabel } from '../../lib/store';
import { useTheme } from '../../lib/useTheme';
import RideSettingsBlock, { type RideSettingsValues } from '../ride/RideSettingsBlock';

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

  const [selectedBike, setSelectedBike] = useState<string | null>(selectedBikeId);
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        {/* Drag handle */}
        <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
        {/* Header row */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>BEFORE YOU RIDE</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={theme.textPrimary} />
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
          {bikes.map((bike) => (
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
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  content: { padding: 14, paddingBottom: 60 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 12, marginTop: 20 },
  bikeChipRow: { marginBottom: 10 },
  bikeChipContent: { gap: 8, paddingHorizontal: 2 },
  bikeChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 10 },
  bikeChipText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  emptyCard: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  emptyText: { fontSize: 11, lineHeight: 16 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 8, paddingVertical: 18, marginTop: 2 },
  startBtnPressed: { opacity: 0.8 },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.7 },
});
