import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuthStore, useGarageStore } from '../../lib/store';
import { Colors } from '../../lib/theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAKES = [
  'Triumph', 'BMW', 'KTM', 'Yamaha', 'Honda',
  'Suzuki', 'Husqvarna', 'Aprilia', 'Royal Enfield', 'Ducati',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from(
  { length: CURRENT_YEAR - 1979 },
  (_, i) => String(CURRENT_YEAR - i),
);

const SHEET_HEIGHT = 700;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.label}>{label}</Text>;
}

function StyledInput(props: React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={Colors.TEXT_SECONDARY}
      {...props}
      style={[styles.input, focused && styles.inputFocused, props.style]}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

function YearPicker({ value, onChange }: { value: string; onChange: (y: string) => void }) {
  return (
    <View style={styles.yearPickerWrapper}>
      <FlatList
        data={YEARS}
        keyExtractor={(y) => y}
        showsVerticalScrollIndicator={false}
        snapToInterval={44}
        decelerationRate="fast"
        style={styles.yearList}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.yearItem, item === value && styles.yearItemActive]}
            onPress={() => onChange(item)}
          >
            <Text style={[styles.yearItemText, item === value && styles.yearItemTextActive]}>
              {item}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function MakeAutocomplete({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filtered = value.length > 0
    ? MAKES.filter((m) => m.toLowerCase().startsWith(value.toLowerCase()))
    : MAKES;

  return (
    <View>
      <StyledInput
        value={value}
        onChangeText={(t) => { onChange(t); setShowSuggestions(true); }}
        placeholder="e.g. Triumph"
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        autoCorrect={false}
      />
      {showSuggestions && filtered.length > 0 && (
        <View style={styles.suggestions}>
          {filtered.map((make) => (
            <Pressable
              key={make}
              style={styles.suggestionItem}
              onPress={() => { onChange(make); setShowSuggestions(false); }}
            >
              <Text style={styles.suggestionText}>{make}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// AddBikeModal
// ---------------------------------------------------------------------------

interface Props {
  onClose: () => void;
}

export default function AddBikeModal({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { user } = useAuthStore();
  const { addBike } = useGarageStore();

  const [year, setYear]         = useState(String(CURRENT_YEAR));
  const [make, setMake]         = useState('');
  const [model, setModel]       = useState('');
  const [odometer, setOdometer] = useState('');
  const [tankGal, setTankGal]   = useState('');
  const [avgMpg, setAvgMpg]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Slide in on mount
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function handleClose() {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }

  async function handleSave() {
    if (!user) return;
    if (!make.trim()) { setError('Make is required.'); return; }
    if (!model.trim()) { setError('Model is required.'); return; }

    setError(null);
    setSaving(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { data, error: dbError } = await supabase
      .from('bikes')
      .insert({
        user_id: user.id,
        year: parseInt(year, 10),
        make: make.trim(),
        model: model.trim(),
        odometer:     odometer ? parseInt(odometer, 10)    : null,
        tank_gallons: tankGal  ? parseFloat(tankGal)       : null,
        avg_mpg:      avgMpg   ? parseFloat(avgMpg)        : null,
      })
      .select()
      .single();

    setSaving(false);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    addBike(data);
    handleClose();
  }

  return (
    <Modal transparent animationType="none" onRequestClose={handleClose}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16 },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleBar} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.heading}>ADD BIKE</Text>
              <Pressable onPress={handleClose} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>CANCEL</Text>
              </Pressable>
            </View>

            <FieldLabel label="YEAR" />
            <YearPicker value={year} onChange={setYear} />

            <FieldLabel label="MAKE" />
            <MakeAutocomplete value={make} onChange={setMake} />

            <FieldLabel label="MODEL" />
            <StyledInput
              value={model}
              onChangeText={setModel}
              placeholder="e.g. Tiger 900"
              autoCorrect={false}
            />

            <FieldLabel label="CURRENT ODOMETER (MI)" />
            <StyledInput
              value={odometer}
              onChangeText={setOdometer}
              placeholder="e.g. 12000"
              keyboardType="decimal-pad"
            />

            {/* ── Specs (for fuel range) ── */}
            <View style={styles.specsHeader}>
              <Text style={styles.specsHeading}>SPECS</Text>
              <Text style={styles.specsSubtitle}>Used for fuel range overlay</Text>
            </View>

            <View style={styles.specsRow}>
              <View style={{ flex: 1 }}>
                <FieldLabel label="TANK SIZE (GAL)" />
                <StyledInput
                  value={tankGal}
                  onChangeText={setTankGal}
                  placeholder="e.g. 4.5"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <FieldLabel label="AVG MPG" />
                <StyledInput
                  value={avgMpg}
                  onChangeText={setAvgMpg}
                  placeholder="e.g. 48"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                pressed && styles.saveBtnPressed,
                saving && styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>SAVE BIKE</Text>
              }
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.TTM_PANEL,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: Colors.TTM_BORDER,
    maxHeight: '90%',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.TTM_BORDER,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    marginBottom: 4,
  },
  heading: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
  },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
  },
  label: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
  },
  inputFocused: {
    borderColor: Colors.TTM_RED,
  },
  yearPickerWrapper: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 6,
    overflow: 'hidden',
    height: 176,
  },
  yearList: { flex: 1 },
  yearItem: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  yearItemActive: { backgroundColor: 'rgba(211,47,47,0.12)' },
  yearItemText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 17,
    fontWeight: '500',
  },
  yearItemTextActive: {
    color: Colors.TTM_RED,
    fontWeight: '700',
  },
  suggestions: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 6,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.TTM_BORDER,
  },
  suggestionText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
  },
  specsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 24,
    marginBottom: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.TTM_BORDER,
    paddingTop: 20,
  },
  specsHeading: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  specsSubtitle: {
    color: Colors.TTM_BORDER,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  specsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  errorText: {
    color: Colors.TTM_RED,
    fontSize: 13,
    marginTop: 12,
  },
  saveBtn: {
    backgroundColor: Colors.TTM_RED,
    borderRadius: 6,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  saveBtnPressed: { opacity: 0.8 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
