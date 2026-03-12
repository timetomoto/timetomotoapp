import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useAuthStore, useGarageStore, type Bike } from '../../lib/store';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAKES = [
  'Aprilia', 'Benelli', 'Beta', 'BMW', 'Can-Am', 'CFMoto',
  'Ducati', 'Gas Gas', 'Harley-Davidson', 'Honda', 'Husqvarna',
  'Indian', 'Kawasaki', 'KTM', 'Moto Guzzi', 'Royal Enfield',
  'Sherco', 'Suzuki', 'Triumph', 'Yamaha', 'Zero Motorcycles',
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
  const { theme } = useTheme();
  return <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>;
}

function StyledInput(props: React.ComponentProps<typeof TextInput>) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary },
        focused && { borderColor: theme.red },
        props.style,
      ]}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

function YearPicker({ value, onChange }: { value: string; onChange: (y: string) => void }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.yearPickerWrapper, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        snapToInterval={44}
        decelerationRate="fast"
        style={styles.yearList}
        nestedScrollEnabled
      >
        {YEARS.map((item) => (
          <Pressable
            key={item}
            style={[
              styles.yearItem,
              { borderBottomColor: theme.border },
              item === value && { backgroundColor: 'rgba(211,47,47,0.12)' },
            ]}
            onPress={() => onChange(item)}
          >
            <Text style={[
              styles.yearItemText,
              { color: theme.textSecondary },
              item === value && { color: theme.red, fontWeight: '700' },
            ]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function MakeAutocomplete({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const { theme } = useTheme();
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
        <View style={[styles.suggestions, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          {filtered.map((make) => (
            <Pressable
              key={make}
              style={[styles.suggestionItem, { borderBottomColor: theme.border }]}
              onPress={() => { onChange(make); setShowSuggestions(false); }}
            >
              <Text style={[styles.suggestionText, { color: theme.textPrimary }]}>{make}</Text>
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
  bike?: import('../../lib/store').Bike; // edit mode when provided
}

export default function AddBikeModal({ onClose, bike: editBike }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { user } = useAuthStore();
  const { addBike, updateBike } = useGarageStore();

  const isEdit = !!editBike;

  const [year, setYear]               = useState(editBike?.year ? String(editBike.year) : String(CURRENT_YEAR));
  const [make, setMake]               = useState(editBike?.make ?? '');
  const [model, setModel]             = useState(editBike?.model ?? '');
  const [nickname, setNickname]       = useState(editBike?.nickname ?? '');
  const [odometer, setOdometer]       = useState(editBike?.odometer ? String(editBike.odometer) : '');
  const [fuelCapacity, setFuelCap]    = useState(editBike?.fuelCapacity ? String(editBike.fuelCapacity) : '');
  const [capacityUnit, setCapUnit]    = useState<'gallons' | 'liters'>(editBike?.fuelCapacityUnit ?? 'gallons');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('ttm_units_capacity').then((v) => {
      if (v === 'liters' || v === 'gallons') setCapUnit(v);
    });
  }, []);

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
    if (!make.trim()) { setError('Make is required.'); return; }
    if (!model.trim()) { setError('Model is required.'); return; }

    setError(null);
    setSaving(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const fields = {
      year: parseInt(year, 10),
      make: make.trim(),
      model: model.trim(),
      nickname: nickname.trim() || null,
      odometer: odometer ? parseInt(odometer, 10) : null,
      fuelCapacity: fuelCapacity ? parseFloat(fuelCapacity) : null,
      fuelCapacityUnit: capacityUnit,
    };

    if (isEdit && editBike) {
      // Edit existing bike
      if (editBike.user_id === 'local') {
        const stored = await AsyncStorage.getItem('ttm_bikes_local');
        const bikes = stored ? JSON.parse(stored) : [];
        const updated = bikes.map((b: Bike) => b.id === editBike.id ? { ...b, ...fields } : b);
        await AsyncStorage.setItem('ttm_bikes_local', JSON.stringify(updated));
        setSaving(false);
        updateBike({ ...editBike, ...fields });
      } else {
        const { error: dbError } = await supabase
          .from('bikes')
          .update({ year: fields.year, make: fields.make, model: fields.model, odometer: fields.odometer })
          .eq('id', editBike.id);
        setSaving(false);
        if (dbError) { setError(dbError.message); return; }
        updateBike({ ...editBike, ...fields });
      }
    } else if (user) {
      // Add new bike — Supabase
      const { data, error: dbError } = await supabase
        .from('bikes')
        .insert({
          user_id: user.id,
          year: fields.year,
          make: fields.make,
          model: fields.model,
          odometer: fields.odometer,
        })
        .select()
        .single();

      setSaving(false);
      if (dbError) { setError(dbError.message); return; }
      addBike(data);
    } else {
      // Add new bike — local fallback
      const newBike: Bike = {
        id: `local_${Date.now()}`,
        user_id: 'local',
        ...fields,
        tank_gallons: null,
        avg_mpg: null,
        created_at: new Date().toISOString(),
      };
      const stored = await AsyncStorage.getItem('ttm_bikes_local');
      const existing = stored ? JSON.parse(stored) : [];
      await AsyncStorage.setItem('ttm_bikes_local', JSON.stringify([newBike, ...existing]));
      setSaving(false);
      addBike(newBike);
    }

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
          {
            backgroundColor: theme.bgPanel,
            borderColor: theme.border,
            paddingBottom: insets.bottom + 16,
          },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handleBar, { backgroundColor: theme.border }]} />

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
              <Text style={[styles.heading, { color: theme.textPrimary }]}>{isEdit ? 'EDIT BIKE' : 'ADD BIKE'}</Text>
              <Pressable onPress={handleClose} style={styles.cancelBtn}>
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>CANCEL</Text>
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

            <FieldLabel label="NICKNAME — OPTIONAL" />
            <StyledInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="e.g. The Beast, Blue Thunder"
              autoCorrect={false}
              autoCapitalize="words"
            />

            <FieldLabel label="CURRENT ODOMETER (MI) — OPTIONAL" />
            <StyledInput
              value={odometer}
              onChangeText={setOdometer}
              placeholder="e.g. 12000"
              keyboardType="decimal-pad"
            />

            <FieldLabel label={`FUEL CAPACITY (${capacityUnit.toUpperCase()}) — OPTIONAL`} />
            <StyledInput
              value={fuelCapacity}
              onChangeText={setFuelCap}
              placeholder={capacityUnit === 'gallons' ? 'e.g. 4.5' : 'e.g. 17'}
              keyboardType="decimal-pad"
            />

            {error && <Text style={[styles.errorText, { color: theme.red }]}>{error}</Text>}

            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: theme.red },
                pressed && styles.saveBtnPressed,
                saving && styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>{isEdit ? 'SAVE CHANGES' : 'SAVE BIKE'}</Text>
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    maxHeight: '90%',
  },
  handleBar: {
    width: 40,
    height: 4,
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
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
  },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  yearPickerWrapper: {
    borderWidth: 1,
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
  },
  yearItemText: {
    fontSize: 17,
    fontWeight: '500',
  },
  suggestions: {
    borderWidth: 1,
    borderRadius: 6,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  suggestionText: {
    fontSize: 15,
  },
  errorText: {
    fontSize: 13,
    marginTop: 12,
  },
  saveBtn: {
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
