import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuthStore, useGarageStore, useSafetyStore } from '../lib/store';
import { useTheme } from '../lib/useTheme';
import TimetomotoLogo from '../components/common/TimetomotoLogo';
import { StyledInput, MakeAutocomplete, BikeTypeSelector } from '../components/garage/AddBikeModal';
import ContactPickerSheet from '../components/contacts/ContactPickerSheet';
import type { BikeType, EmergencyContact } from '../lib/store';

export const ONBOARDING_KEY = '@ttm/onboarding_v1';

const { width: SCREEN_W } = Dimensions.get('window');
const LOGO_W = Math.round(SCREEN_W * 0.65);
const LOGO_H = Math.round(LOGO_W * (31 / 162)); // preserve aspect ratio

// ---------------------------------------------------------------------------
// Screen 1 — Welcome
// ---------------------------------------------------------------------------

function Screen1() {
  const { theme } = useTheme();
  const features = [
    { icon: 'map' as const, title: 'Plan & Ride', body: 'Trip planning, route weather, and turn-by-turn navigation.' },
    { icon: 'tool' as const, title: 'Know Your Bike', body: 'Specs, service intervals, and maintenance tracking — all in one place.' },
    { icon: 'shield' as const, title: 'Ride Protected', body: 'Crash detection with instant alerts to your emergency contacts.' },
  ];

  return (
    <View style={s.screen}>
      <View style={s.logoBlock}>
        <TimetomotoLogo width={LOGO_W} height={LOGO_H} disableLink />
      </View>

      <View style={s.featureList}>
        {features.map((f) => (
          <View key={f.icon} style={[s.featureRow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={[s.featureIcon, { backgroundColor: theme.red + '18' }]}>
              <Feather name={f.icon} size={16} color={theme.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.featureTitle, { color: theme.textPrimary }]}>{f.title}</Text>
              <Text style={[s.featureText, { color: theme.textSecondary }]}>{f.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 2 — Add your bike
// ---------------------------------------------------------------------------

function Screen2() {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const { addBike } = useGarageStore();
  const [make, setMake]             = useState('');
  const [model, setModel]           = useState('');
  const [year, setYear]             = useState(String(new Date().getFullYear()));
  const [nickname, setNickname]     = useState('');
  const [bikeType, setBikeType]     = useState<BikeType | null>(null);
  const [tankSize, setTankSize]     = useState('');
  const [saved, setSaved]           = useState(false);
  const [saving, setSaving]         = useState(false);

  async function handleSave() {
    if (!make.trim() || !model.trim()) return;
    setSaving(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const userId = user?.id;
    if (userId) {
      const { data } = await supabase
        .from('bikes')
        .insert({
          user_id: userId,
          make: make.trim(),
          model: model.trim(),
          year: parseInt(year, 10) || new Date().getFullYear(),
          nickname: nickname.trim() || null,
          bike_type: bikeType,
          tank_gallons: tankSize ? parseFloat(tankSize) : null,
        })
        .select()
        .single();
      if (data) addBike(data);
    }
    setSaved(true);
    setSaving(false);
  }

  const canSave = make.trim().length > 0 && model.trim().length > 0 && !saving;

  return (
    <ScrollView
      style={{ width: SCREEN_W }}
      contentContainerStyle={s.scrollScreen}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.screenIconWrap, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Feather name="tool" size={36} color={theme.red} />
      </View>
      <Text style={[s.screenTitle, { color: theme.textPrimary }]}>ADD YOUR BIKE</Text>
      <Text style={[s.screenBody, { color: theme.textSecondary }]}>
        Get personalized fuel range, maintenance tracking, and ride stats.
      </Text>

      <View style={s.form}>
        <MakeAutocomplete value={make} onChange={setMake} />
        <StyledInput
          value={model}
          onChangeText={setModel}
          placeholder="Model (e.g. Tiger 900)"
          autoCorrect={false}
        />
        <StyledInput
          value={year}
          onChangeText={setYear}
          placeholder="Year"
          keyboardType="number-pad"
          maxLength={4}
        />
        <StyledInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="Nickname (optional)"
          autoCorrect={false}
          autoCapitalize="words"
        />

        <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>BIKE TYPE</Text>
        <BikeTypeSelector value={bikeType} onChange={setBikeType} />

        <Text style={[s.fieldLabel, { color: theme.textSecondary, marginTop: 16 }]}>TANK SIZE</Text>
        <StyledInput
          value={tankSize}
          onChangeText={setTankSize}
          placeholder="Gallons (optional)"
          keyboardType="decimal-pad"
        />

        <Pressable
          style={[s.formBtn, { backgroundColor: theme.red }, !canSave && s.formBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saved}
        >
          {saved ? (
            <View style={s.savedInlineRow}>
              <Feather name="check" size={16} color={theme.white} />
              <Text style={s.formBtnText}>Bike Saved</Text>
            </View>
          ) : (
            <Text style={s.formBtnText}>{saving ? 'SAVING...' : 'SAVE BIKE'}</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Screen 3 — Emergency contact
// ---------------------------------------------------------------------------

function Screen3() {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const { saveContacts } = useSafetyStore();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  async function handleAdd() {
    if (!name.trim() || !phone.trim() || contacts.length >= 3) return;
    setSaving(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const updated = [...contacts, { name: name.trim(), phone: phone.trim() }];
    const userId = user?.id ?? 'local';
    await saveContacts(userId, updated);
    setContacts(updated);
    setName('');
    setPhone('');
    setSaving(false);
  }

  function handlePickerSelect(pickedName: string, pickedPhone: string) {
    setName(pickedName);
    setPhone(pickedPhone);
    setShowPicker(false);
  }

  function handleRemove(idx: number) {
    const updated = contacts.filter((_, i) => i !== idx);
    setContacts(updated);
    const userId = user?.id ?? 'local';
    saveContacts(userId, updated);
  }

  const canAdd = name.trim().length > 0 && phone.trim().length > 0 && !saving && contacts.length < 3;

  return (
    <ScrollView
      style={{ width: SCREEN_W }}
      contentContainerStyle={s.scrollScreen}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.screenIconWrap, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Feather name="shield" size={36} color={theme.red} />
      </View>
      <Text style={[s.screenTitle, { color: theme.textPrimary }]}>STAY SAFE OUT THERE</Text>
      <Text style={[s.screenBody, { color: theme.textSecondary }]}>
        Add trusted contacts who'll be notified instantly if crash detection triggers.
      </Text>

      <View style={s.form}>
        {/* Added contacts */}
        {contacts.map((c, i) => (
          <View key={i} style={[s.contactPill, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.contactPillName, { color: theme.textPrimary }]}>{c.name}</Text>
              <Text style={[s.contactPillPhone, { color: theme.textMuted }]}>{c.phone}</Text>
            </View>
            <Pressable onPress={() => handleRemove(i)} hitSlop={8}>
              <Feather name="x" size={16} color={theme.textMuted} />
            </Pressable>
          </View>
        ))}

        {contacts.length < 3 && (
          <>
            {/* Load from contacts button */}
            <Pressable
              style={[s.outlineBtn, { borderColor: theme.border }]}
              onPress={() => setShowPicker(true)}
            >
              <Feather name="users" size={14} color={theme.textSecondary} />
              <Text style={[s.outlineBtnText, { color: theme.textSecondary }]}>LOAD FROM CONTACTS</Text>
            </Pressable>

            {/* Manual entry */}
            <StyledInput
              value={name}
              onChangeText={setName}
              placeholder="Contact name"
              autoCorrect={false}
            />
            <StyledInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              keyboardType="phone-pad"
            />
            <Pressable
              style={[s.formBtn, { backgroundColor: theme.red }, !canAdd && s.formBtnDisabled]}
              onPress={handleAdd}
              disabled={!canAdd}
            >
              <Text style={s.formBtnText}>{saving ? 'SAVING...' : 'ADD CONTACT'}</Text>
            </Pressable>
          </>
        )}

        {contacts.length >= 3 && (
          <View style={s.savedInlineRow}>
            <Feather name="check-circle" size={16} color={theme.green} />
            <Text style={[s.formBtnText, { color: theme.green }]}>All contacts added</Text>
          </View>
        )}

        <Text style={[s.privacyNote, { color: theme.textMuted }]}>
          Only used to notify your contacts in an emergency. Nothing else.
        </Text>
      </View>

      {showPicker && (
        <ContactPickerSheet
          onClose={() => setShowPicker(false)}
          onSelect={handlePickerSelect}
        />
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Onboarding container
// ---------------------------------------------------------------------------

const SCREENS = [Screen1, Screen2, Screen3];
const TITLES  = ['01 / 03', '02 / 03', '03 / 03'];

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { setOnboardingDone } = useAuthStore();
  const router   = useRouter();
  const listRef  = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]) setIndex(viewableItems[0].index ?? 0);
  }).current;

  async function finish() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'done');
    setOnboardingDone(true);
    router.replace('/(tabs)/ride');
  }

  function next() {
    if (index < SCREENS.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      finish();
    }
  }

  const isLast = index === SCREENS.length - 1;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      {/* Skip */}
      <View style={s.topBar}>
        <Text style={[s.stepLabel, { color: theme.textSecondary }]}>{TITLES[index]}</Text>
        <Pressable
          onPress={finish}
          style={s.skipBtn}
          accessibilityLabel="Skip onboarding"
          accessibilityRole="button"
        >
          <Text style={[s.skipText, { color: theme.textSecondary }]}>SKIP</Text>
        </Pressable>
      </View>

      {/* Screens */}
      <FlatList
        ref={listRef}
        data={SCREENS}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: Screen }) => <Screen />}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
      />

      {/* Dots */}
      <View style={s.dots}>
        {SCREENS.map((_, i) => (
          <View key={i} style={[s.dot, { backgroundColor: theme.border }, i === index && { width: 20, backgroundColor: theme.red }]} />
        ))}
      </View>

      {/* CTA */}
      <View style={s.footer}>
        <Pressable
          style={[s.nextBtn, { backgroundColor: theme.red }]}
          onPress={next}
          accessibilityLabel={isLast ? 'Start riding' : 'Next'}
          accessibilityRole="button"
        >
          <Text style={s.nextBtnText}>
            {isLast ? "LET'S RIDE" : 'NEXT'}
          </Text>
          <Feather name={isLast ? 'check' : 'arrow-right'} size={18} color={theme.white} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  stepLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  skipBtn: { paddingHorizontal: 4, paddingVertical: 8, minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

  screen: {
    flex: 1,
    width: SCREEN_W,
    paddingHorizontal: 32,
    paddingTop: 20,
    alignItems: 'center',
  },
  scrollScreen: {
    paddingHorizontal: 32,
    paddingTop: 20,
    alignItems: 'center',
    flexGrow: 1,
  },

  // Screen 1
  logoBlock: { alignItems: 'center', marginBottom: 48 },
  logoSub: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.7,
    textAlign: 'center',
    marginTop: 16,
  },
  featureList: { width: '100%', gap: 14 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  featureText: { fontSize: 13, lineHeight: 18 },

  // Screens 2 & 3
  screenIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 12,
    textAlign: 'center',
  },
  screenBody: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: { width: '100%', gap: 12 },
  helperText: { fontSize: 11, marginTop: -4, letterSpacing: 0.1 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  contactPillName: { fontSize: 14, fontWeight: '600' },
  contactPillPhone: { fontSize: 12, marginTop: 1 },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    marginBottom: 12,
  },
  outlineBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  privacyNote: { fontSize: 11, textAlign: 'center', marginTop: 12 },
  formBtn: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 50,
  },
  formBtnDisabled: { opacity: 0.45 },
  formBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.7 },
  savedInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Dots
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Footer
  footer: { paddingHorizontal: 24, paddingBottom: 8 },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 10,
    paddingVertical: 18,
    minHeight: 56,
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.7 },
});
