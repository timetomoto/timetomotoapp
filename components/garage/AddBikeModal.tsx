import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
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
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore, useGarageStore, type Bike, type BikeType } from '../../lib/store';
import { pickAndUploadBikePhoto, saveBikePhotoUrl, clearWikiPhotoCache } from '../../lib/bikePhoto';
import MotorcycleIcon from '../icons/MotorcycleIcon';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Bike type constants
// ---------------------------------------------------------------------------

const BIKE_TYPES: { key: BikeType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'adventure', label: 'ADV', icon: 'compass' },
  { key: 'dual_sport', label: 'DUAL SPORT', icon: 'navigation-2' },
  { key: 'cruiser', label: 'CRUISER', icon: 'wind' },
  { key: 'chopper', label: 'CHOPPER', icon: 'scissors' },
  { key: 'sport', label: 'SPORT', icon: 'fast-forward' },
  { key: 'touring', label: 'TOURING', icon: 'map' },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Fallback makes if NHTSA fetch fails
const FALLBACK_MAKES = [
  'Aprilia', 'Benelli', 'Beta', 'BMW', 'Can-Am', 'CFMoto',
  'Ducati', 'Gas Gas', 'Harley-Davidson', 'Honda', 'Husqvarna',
  'Indian', 'Kawasaki', 'KTM', 'Moto Guzzi', 'Royal Enfield',
  'Sherco', 'Suzuki', 'Triumph', 'Yamaha', 'Zero Motorcycles',
];

// Major motorcycle brands to prioritize at top of list
const MAJOR_BRANDS = new Set(FALLBACK_MAKES.map((m) => m.toUpperCase()));

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from(
  { length: CURRENT_YEAR - 1979 },
  (_, i) => String(CURRENT_YEAR - i),
);

const SHEET_HEIGHT = 700;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

export function FieldLabel({ label }: { label: string }) {
  const { theme } = useTheme();
  return <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>;
}

export function StyledInput(props: React.ComponentProps<typeof TextInput>) {
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

export function MakeAutocomplete({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const { theme } = useTheme();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [nhtsaMakes, setNhtsaMakes] = useState<string[]>(FALLBACK_MAKES);

  // Fetch motorcycle makes from NHTSA VPIC on mount
  useEffect(() => {
    fetch('https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/motorcycle?format=json')
      .then((r) => r.json())
      .then((json) => {
        const all: string[] = (json.Results ?? []).map((r: any) => r.MakeName as string).filter(Boolean);
        // Sort: major brands first, then alphabetical
        const major = all.filter((m) => MAJOR_BRANDS.has(m.toUpperCase())).sort();
        const rest = all.filter((m) => !MAJOR_BRANDS.has(m.toUpperCase())).sort();
        setNhtsaMakes([...major, ...rest]);
      })
      .catch(() => {}); // keep fallback
  }, []);

  const filtered = value.length > 0
    ? nhtsaMakes.filter((m) => m.toLowerCase().includes(value.toLowerCase()))
    : nhtsaMakes.slice(0, 25); // show top 25 when empty

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
          <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filtered.slice(0, 30).map((make) => (
              <Pressable
                key={make}
                style={[styles.suggestionItem, { borderBottomColor: theme.border }]}
                onPress={() => { onChange(make); setShowSuggestions(false); }}
              >
                <Text style={[styles.suggestionText, { color: theme.textPrimary }]}>{make}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export function ModelAutocomplete({ value, onChange, make, year }: { value: string; onChange: (m: string) => void; make: string; year: string }) {
  const { theme } = useTheme();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch models when make + year are set
  useEffect(() => {
    if (!make.trim() || !year.trim()) { setModels([]); return; }
    setLoading(true);
    fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${encodeURIComponent(year)}/vehicletype/motorcycle?format=json`)
      .then((r) => r.json())
      .then((json) => {
        const list: string[] = (json.Results ?? []).map((r: any) => r.Model_Name as string).filter(Boolean);
        setModels([...new Set(list)].sort());
      })
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, [make, year]);

  const filtered = value.length > 0
    ? models.filter((m) => m.toLowerCase().includes(value.toLowerCase()))
    : models;

  return (
    <View>
      <StyledInput
        value={value}
        onChangeText={(t) => { onChange(t); setShowSuggestions(true); }}
        placeholder={loading ? 'Loading models…' : models.length > 0 ? `${models.length} models available — type to search` : 'e.g. Tiger 900 Rally Pro'}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        autoCorrect={false}
      />
      {showSuggestions && filtered.length > 0 && (
        <View style={[styles.suggestions, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filtered.slice(0, 30).map((m) => (
              <Pressable
                key={m}
                style={[styles.suggestionItem, { borderBottomColor: theme.border }]}
                onPress={() => { onChange(m); setShowSuggestions(false); }}
              >
                <Text style={[styles.suggestionText, { color: theme.textPrimary }]}>{m}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bike type selector
// ---------------------------------------------------------------------------

export function BikeTypeSelector({ value, onChange }: { value: BikeType | null; onChange: (t: BikeType | null) => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.typeGrid}>
      {BIKE_TYPES.map((type, idx) => {
        const selected = value === type.key;
        const isLast = idx === BIKE_TYPES.length - 1;
        const isOdd = BIKE_TYPES.length % 2 === 1 && isLast;
        return (
          <Pressable
            key={type.key}
            style={[
              styles.typeCard,
              { backgroundColor: theme.bgCard, borderColor: theme.border },
              selected && { borderColor: theme.red, borderWidth: 2 },
              isOdd && styles.typeCardCentered,
            ]}
            onPress={() => onChange(selected ? null : type.key)}
          >
            <Feather
              name={type.icon}
              size={18}
              color={selected ? theme.red : theme.textPrimary}
            />
            <Text style={[
              styles.typeLabel,
              { color: selected ? theme.red : theme.textPrimary },
            ]}>
              {type.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// AddBikeModal
// ---------------------------------------------------------------------------

interface Props {
  onClose: () => void;
  bike?: import('../../lib/store').Bike; // edit mode when provided
  defaultPhotoUrl?: string | null; // wiki/default photo (not user-uploaded)
}

export default function AddBikeModal({ onClose, bike: editBike, defaultPhotoUrl }: Props) {
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
  const [bikeType, setBikeType]       = useState<BikeType | null>(editBike?.bike_type ?? null);
  const [nickname, setNickname]       = useState(editBike?.nickname ?? '');
  const [odometer, setOdometer]       = useState(editBike?.odometer ? String(editBike.odometer) : '');
  const [fuelCapacity, setFuelCap]    = useState(editBike?.fuelCapacity ? String(editBike.fuelCapacity) : '');
  const [capacityUnit, setCapUnit]    = useState<'gallons' | 'liters'>(editBike?.fuelCapacityUnit ?? 'gallons');
  const [photoUrl, setPhotoUrl]        = useState<string | null>(editBike?.photo_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [fuelAutoFilled, setFuelAutoFilled] = useState(false);
  const fuelManuallySet = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('ttm_units_capacity').then((v) => {
      if (v === 'liters' || v === 'gallons') setCapUnit(v);
    });
  }, []);

  // Auto-lookup fuel capacity when make + model + year are set
  useEffect(() => {
    if (!make.trim() || !model.trim() || !year.trim() || fuelManuallySet.current || isEdit) return;
    const key = process.env.EXPO_PUBLIC_API_NINJAS_KEY;
    if (!key || key === 'your_key_here') return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    fetch(
      `https://api.api-ninjas.com/v1/motorcycles?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`,
      { headers: { 'X-Api-Key': key }, signal: controller.signal },
    )
      .then((r) => r.ok ? r.json() : null)
      .then((results) => {
        if (!Array.isArray(results) || results.length === 0) return;
        const cap = parseFloat(results[0].fuel_capacity);
        if (!isNaN(cap) && cap > 0 && !fuelManuallySet.current) {
          // API returns liters — convert if user prefers gallons
          const val = capacityUnit === 'gallons' ? Math.round(cap * 0.264172 * 10) / 10 : Math.round(cap * 10) / 10;
          setFuelCap(String(val));
          setFuelAutoFilled(true);
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));

    return () => { controller.abort(); clearTimeout(timer); };
  }, [make, model, year]);

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

  // The display photo: user upload takes priority, then wiki default
  const displayPhoto = photoUrl || defaultPhotoUrl || null;
  const hasUserPhoto = !!photoUrl;

  async function handleChangePhoto() {
    if (!user) {
      Alert.alert('Sign In Required', 'Sign in to add bike photos.');
      return;
    }
    const bikeId = editBike?.id ?? `pending_${Date.now()}`;
    setUploadingPhoto(true);
    try {
      const url = await pickAndUploadBikePhoto(user.id, bikeId);
      if (url) {
        setPhotoUrl(url);
        // If editing existing bike, save immediately
        if (editBike && !editBike.id.startsWith('local_')) {
          await saveBikePhotoUrl(editBike.id, url);
          updateBike({ ...editBike, photo_url: url });
        }
      }
    } catch (err) {
      console.error('Photo pick error:', err);
    }
    setUploadingPhoto(false);
  }

  async function handleRemovePhoto() {
    Alert.alert('Remove Photo', 'Remove your uploaded photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setPhotoUrl(null);
          if (editBike && !editBike.id.startsWith('local_')) {
            await saveBikePhotoUrl(editBike.id, '');
            await supabase.from('bikes').update({ photo_url: null }).eq('id', editBike.id);
            updateBike({ ...editBike, photo_url: null });
          }
        },
      },
    ]);
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
      bike_type: bikeType,
      nickname: nickname.trim() || null,
      odometer: odometer ? parseInt(odometer, 10) : null,
      fuelCapacity: fuelCapacity ? parseFloat(fuelCapacity) : null,
      fuelCapacityUnit: capacityUnit,
      photo_url: photoUrl,
    };

    if (isEdit && editBike) {
      // If make/model changed and no user-uploaded photo, clear stale wiki photo cache
      const makeModelChanged = fields.make !== editBike.make || fields.model !== editBike.model;
      if (makeModelChanged && !photoUrl) {
        clearWikiPhotoCache(editBike.id);
      }

      // Edit existing bike
      if (editBike.user_id === 'local') {
        try {
          const stored = await AsyncStorage.getItem('ttm_bikes_local');
          const bikes = stored ? JSON.parse(stored) : [];
          const updated = bikes.map((b: Bike) => b.id === editBike.id ? { ...b, ...fields } : b);
          await AsyncStorage.setItem('ttm_bikes_local', JSON.stringify(updated));
          setSaving(false);
          updateBike({ ...editBike, ...fields });
        } catch (e) { console.error('local bike edit failed:', e); setSaving(false); }
      } else {
        const { error: dbError } = await supabase
          .from('bikes')
          .update({
            year: fields.year,
            make: fields.make,
            model: fields.model,
            nickname: fields.nickname,
            odometer: fields.odometer,
            bike_type: fields.bike_type,
            "fuelCapacity": fields.fuelCapacity,
            "fuelCapacityUnit": fields.fuelCapacityUnit,
            photo_url: fields.photo_url,
          })
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
          nickname: fields.nickname,
          odometer: fields.odometer,
          bike_type: fields.bike_type,
          "fuelCapacity": fields.fuelCapacity,
          "fuelCapacityUnit": fields.fuelCapacityUnit,
          photo_url: fields.photo_url,
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
      try {
        const stored = await AsyncStorage.getItem('ttm_bikes_local');
        const existing = stored ? JSON.parse(stored) : [];
        await AsyncStorage.setItem('ttm_bikes_local', JSON.stringify([newBike, ...existing]));
        setSaving(false);
        addBike(newBike);
      } catch (e) { console.error('local bike save failed:', e); setSaving(false); }
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

            {/* Photo section — only show in edit mode */}
            {isEdit && (
              <View style={[styles.photoSection, { borderColor: theme.border }]}>
                {displayPhoto ? (
                  <Image source={{ uri: displayPhoto }} style={styles.photoPreview} resizeMode="cover" />
                ) : (
                  <View style={[styles.photoPlaceholder, { backgroundColor: theme.bgCard }]}>
                    <MotorcycleIcon size={40} color={theme.textMuted} />
                  </View>
                )}
                <View style={[styles.photoBtnRow, { borderTopWidth: 1, borderTopColor: theme.border }]}>
                  {uploadingPhoto ? (
                    <View style={styles.photoBtn}>
                      <ActivityIndicator size="small" color={theme.red} />
                    </View>
                  ) : (
                    <>
                      <Pressable style={styles.photoBtn} onPress={handleChangePhoto}>
                        <Feather name="camera" size={14} color={theme.red} />
                        <Text style={[styles.photoBtnText, { color: theme.red }]}>
                          {hasUserPhoto ? 'CHANGE PHOTO' : displayPhoto ? 'CHANGE PHOTO' : 'ADD PHOTO'}
                        </Text>
                      </Pressable>
                      {hasUserPhoto && (
                        <Pressable style={[styles.photoBtn, { borderLeftWidth: 1, borderLeftColor: theme.border }]} onPress={handleRemovePhoto}>
                          <Feather name="trash-2" size={14} color={theme.red} />
                          <Text style={[styles.photoBtnText, { color: theme.red }]}>REMOVE</Text>
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              </View>
            )}

            <FieldLabel label="YEAR" />
            <YearPicker value={year} onChange={setYear} />

            <FieldLabel label="MAKE" />
            <MakeAutocomplete value={make} onChange={setMake} />

            <FieldLabel label="MODEL" />
            <ModelAutocomplete value={model} onChange={setModel} make={make} year={year} />

            <FieldLabel label="NICKNAME — OPTIONAL" />
            <StyledInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="e.g. The Beast, Blue Thunder"
              autoCorrect={false}
              autoCapitalize="words"
            />
            <Text style={[styles.helperText, { color: theme.textMuted }]}>
              Your nickname appears on the ride screen, route previews, and the Riding selector.
            </Text>

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
              onChangeText={(t) => { setFuelCap(t); fuelManuallySet.current = true; setFuelAutoFilled(false); }}
              placeholder={capacityUnit === 'gallons' ? 'e.g. 4.5' : 'e.g. 17'}
              keyboardType="decimal-pad"
            />
            {fuelAutoFilled && (
              <Text style={{ fontSize: 10, color: theme.green, marginTop: 2 }}>Auto-filled from specs — edit to override</Text>
            )}

            <FieldLabel label="BIKE TYPE" />
            <BikeTypeSelector value={bikeType} onChange={setBikeType} />

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
                ? <ActivityIndicator color={theme.white} />
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
    letterSpacing: 1.2,
  },
  photoSection: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  photoPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtnRow: {
    flexDirection: 'row',
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  photoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.7,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
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
  helperText: {
    fontSize: 11,
    marginTop: 6,
    letterSpacing: 0.1,
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 7,
  },
  typeCard: {
    width: '31.5%',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  typeCardCentered: {
    marginHorizontal: '25.75%',
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 4,
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
    letterSpacing: 0.7,
  },
});
