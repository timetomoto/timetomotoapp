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
import { useTheme } from '../../lib/useTheme';
import type { TrackPoint } from '../../lib/gpx';
import { calcDistance, calcElevationGain } from '../../lib/gpx';
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
  const { theme } = useTheme();
  const [name, setName]     = useState(defaultName);
  const [saving, setSaving] = useState(false);

  const distanceMiles   = calcDistance(points);
  const elevationGainFt = calcElevationGain(points);
  const avgSpeedMph     = durationSeconds > 0 ? (distanceMiles / durationSeconds) * 3600 : 0;

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
        <View style={[s.sheet, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <View style={[s.handle, { backgroundColor: theme.border }]} />

          <Text style={[s.title, { color: theme.textPrimary }]}>SAVE THIS RIDE?</Text>

          {/* Stats */}
          <View style={[s.statsRow, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: theme.textPrimary }]}>
                {distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)}
              </Text>
              <Text style={[s.statLabel, { color: theme.textSecondary }]}>MILES</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: theme.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: theme.textPrimary }]}>{fmtDuration(durationSeconds)}</Text>
              <Text style={[s.statLabel, { color: theme.textSecondary }]}>MOVING TIME</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: theme.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: theme.textPrimary }]}>{Math.round(avgSpeedMph)}</Text>
              <Text style={[s.statLabel, { color: theme.textSecondary }]}>AVG MPH</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: theme.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: theme.textPrimary }]}>{Math.round(elevationGainFt).toLocaleString()}</Text>
              <Text style={[s.statLabel, { color: theme.textSecondary }]}>FT GAIN</Text>
            </View>
          </View>

          {/* Name input */}
          <Text style={[s.inputLabel, { color: theme.textSecondary }]}>RIDE NAME</Text>
          <TextInput
            style={[s.input, { backgroundColor: theme.bgPanel, borderColor: theme.border, color: theme.textPrimary }]}
            value={name}
            onChangeText={setName}
            placeholder="Enter a name…"
            placeholderTextColor={theme.textSecondary}
            selectionColor={theme.red}
            returnKeyType="done"
            maxLength={80}
          />

          {/* Actions */}
          <Pressable
            style={[s.saveBtn, { backgroundColor: theme.red }, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Feather name="save" size={18} color="#fff" />
                  <Text style={s.saveBtnText}>SAVE TO ROUTES</Text>
                </>
            }
          </Pressable>

          <Pressable style={s.discardBtn} onPress={onDiscard} disabled={saving}>
            <Text style={[s.discardBtnText, { color: theme.textSecondary }]}>DISCARD RIDE</Text>
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
  },
  statItem:  { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  statDivider: { width: 1, marginVertical: 4 },

  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: -8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 10,
    paddingVertical: 16,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  discardBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  discardBtnText: {
    fontSize: 13,
    letterSpacing: 0.7,
  },
});
