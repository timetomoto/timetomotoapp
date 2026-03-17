import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';

/** Format "2026-03-13" → "Mar 13, 2026" */
export function formatDisplayDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  value: string;          // "YYYY-MM-DD"
  onChange: (v: string) => void;
  label?: string;
}

export default function DatePickerField({ value, onChange, label }: Props) {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);

  const dateObj = value ? new Date(value + 'T00:00:00') : new Date();

  function handleChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShow(false);
    if (selected) {
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, '0');
      const d = String(selected.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${d}`);
    }
  }

  return (
    <View>
      <Pressable
        style={[s.field, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
        onPress={() => setShow(true)}
      >
        <Text style={[s.fieldText, { color: value ? theme.textPrimary : theme.textMuted }]}>
          {value ? formatDisplayDate(value) : 'Select date'}
        </Text>
        <Feather name="calendar" size={16} color={theme.textSecondary} />
      </Pressable>

      {show && (
        Platform.OS === 'ios' ? (
          <View style={[s.iosPicker, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={s.iosHeader}>
              <Pressable onPress={() => setShow(false)}>
                <Text style={[s.iosDone, { color: theme.red }]}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={dateObj}
              mode="date"
              display="spinner"
              onChange={handleChange}
              themeVariant={theme.bg === '#0D0D0D' ? 'dark' : 'light'}
            />
          </View>
        ) : (
          <DateTimePicker
            value={dateObj}
            mode="date"
            display="default"
            onChange={handleChange}
          />
        )
      )}
    </View>
  );
}

const s = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldText: { fontSize: 15 },
  iosPicker: {
    borderWidth: 1,
    borderRadius: 6,
    marginTop: 4,
    overflow: 'hidden',
  },
  iosHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  iosDone: { fontSize: 15, fontWeight: '600' },
});
