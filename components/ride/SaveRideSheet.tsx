import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../../lib/theme';
import type { TrackPoint } from '../../lib/gpx';
import { calcDistance, calcElevationGain } from '../../lib/gpx';
import type { Route } from '../../lib/routes';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  points: TrackPoint[];
  durationSeconds: number;
  onSave: (name: string) => Promise<void>;
  onDiscard: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${secs % 60}s`;
}

function defaultName() {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }) + ' Ride';
}

// ---------------------------------------------------------------------------
// SaveRideSheet
// ---------------------------------------------------------------------------

export default function SaveRideSheet({ visible, points, durationSeconds, onSave, onDiscard }: Props) {
  const [name, setName]     = useState(defaultName);
  const [saving, setSaving] = useState(false);

  const distanceMiles  = calcDistance(points);
  const elevationGainFt = calcElevationGain(points);
  const avgSpeedMph    = durationSeconds > 0 ? (distanceMiles / durationSeconds) * 3600 : 0;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(name.trim() || defaultName());
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.sheet}>
          <View style={s.handle} />

          <Text style={s.title}>SAVE THIS RIDE?</Text>

          {/* Stats */}
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statValue}>
                {distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)}
              </Text>
              <Text style={s.statLabel}>MILES</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{fmtDuration(durationSeconds)}</Text>
              <Text style={s.statLabel}>MOVING TIME</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{Math.round(avgSpeedMph)}</Text>
              <Text style={s.statLabel}>AVG MPH</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{Math.round(elevationGainFt).toLocaleString()}</Text>
              <Text style={s.statLabel}>FT GAIN</Text>
            </View>
          </View>

          {/* Name input */}
          <Text style={s.inputLabel}>RIDE NAME</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter a name…"
            placeholderTextColor={Colors.TEXT_SECONDARY}
            selectionColor={Colors.TTM_RED}
            returnKeyType="done"
            maxLength={80}
          />

          {/* Actions */}
          <Pressable
            style={[s.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Feather name="save" size={18} color="#fff" />
                  <Text style={s.saveBtnText}>SAVE TO LIBRARY</Text>
                </>
            }
          </Pressable>

          <Pressable style={s.discardBtn} onPress={onDiscard} disabled={saving}>
            <Text style={s.discardBtnText}>DISCARD RIDE</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: Colors.TTM_CARD,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: Colors.TTM_BORDER,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.TTM_BORDER,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.TTM_PANEL,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 10,
    paddingVertical: 14,
  },
  statItem:  { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: Colors.TEXT_PRIMARY, fontSize: 18, fontWeight: '700' },
  statLabel: { color: Colors.TEXT_SECONDARY, fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  statDivider: { width: 1, backgroundColor: Colors.TTM_BORDER, marginVertical: 4 },

  // Input
  inputLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: -8,
  },
  input: {
    backgroundColor: Colors.TTM_PANEL,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  // Buttons
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.TTM_RED,
    borderRadius: 10,
    paddingVertical: 16,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
  },
  discardBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  discardBtnText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    letterSpacing: 1,
  },
});
