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

// Per-user onboarding key — prevents re-showing on shared devices
export function onboardingKey(userId?: string | null) {
  return `@ttm/onboarding_v1_${userId ?? 'local'}`;
}
// Legacy key for migration
export const ONBOARDING_KEY = '@ttm/onboarding_v1';

function CompassIcon({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  const half = size / 2;
  const arm = size * 0.35;
  const thick = 2;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: half, borderWidth: 1.5, borderColor: color }} />
      <View style={{ position: 'absolute', left: half - thick / 2, top: half - arm, width: thick, height: arm, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ position: 'absolute', left: half - thick / 2, top: half, width: thick, height: arm, backgroundColor: color, opacity: 0.4, borderRadius: 1 }} />
      <View style={{ position: 'absolute', top: half - thick / 2, left: half, width: arm, height: thick, backgroundColor: color, opacity: 0.4, borderRadius: 1 }} />
      <View style={{ position: 'absolute', top: half - thick / 2, left: half - arm, width: arm, height: thick, backgroundColor: color, opacity: 0.4, borderRadius: 1 }} />
    </View>
  );
}

const { width: SCREEN_W } = Dimensions.get('window');
const LOGO_W = Math.round(SCREEN_W * 0.65);
const LOGO_H = Math.round(LOGO_W * (31 / 162));

// ---------------------------------------------------------------------------
// Screen 1 — Meet Scout
// ---------------------------------------------------------------------------

function Screen1() {
  const { theme } = useTheme();
  return (
    <View style={s.screen}>
      <Text style={[s.screenTitle, { color: theme.textPrimary }]}>Meet Scout</Text>
      <View style={[s.scoutIconLarge, { backgroundColor: theme.red }]}>
        {/* Scout crosshair icon */}
        <View style={{ width: 176, height: 176 }}>
          <View style={{ position: 'absolute', width: 176, height: 176, borderRadius: 88, borderWidth: 10, borderColor: '#fff' }} />
          <View style={{ position: 'absolute', left: 84, top: 24, width: 10, height: 56, backgroundColor: '#fff', borderRadius: 5 }} />
          <View style={{ position: 'absolute', left: 84, top: 96, width: 10, height: 56, backgroundColor: '#fff', opacity: 0.4, borderRadius: 5 }} />
          <View style={{ position: 'absolute', top: 84, left: 96, width: 56, height: 10, backgroundColor: '#fff', opacity: 0.4, borderRadius: 5 }} />
          <View style={{ position: 'absolute', top: 84, left: 24, width: 56, height: 10, backgroundColor: '#fff', opacity: 0.4, borderRadius: 5 }} />
        </View>
      </View>
      <Text style={[s.screenSubBold, { color: theme.textPrimary }]}>Your Riding Assistant</Text>
      <Text style={[s.screenBody, { color: theme.textSecondary }]}>
        Plan routes, check weather, manage bikes.
      </Text>

      {/* Mock Scout conversation */}
      <View style={s.mockChat}>
        <View style={[s.mockBubbleUser, { backgroundColor: theme.red }]}>
          <Text style={s.mockBubbleUserText}>Plan a ride from Austin to Fredericksburg</Text>
        </View>
        <View style={[s.mockBubbleBot, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <View style={[s.mockAvatar, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
            <CompassIcon size={12} color={theme.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.mockBubbleBotText, { color: theme.textPrimary }]}>
              Route set. 97 miles, about 2 hours.{'\n'}Want to check weather for Saturday?
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 2 — What You Get (two bold lines)
// ---------------------------------------------------------------------------

function Screen2() {
  const { theme } = useTheme();
  return (
    <View style={s.screen}>
      <View style={s.twoLineBlock}>
        <View style={[s.twoLineIcon, { backgroundColor: theme.red + '18' }]}>
          <Feather name="map" size={28} color={theme.red} />
        </View>
        <Text style={[s.twoLineHeadline, { color: theme.textPrimary }]}>
          Plan routes. Check weather.{'\n'}Just ride.
        </Text>
        <Text style={[s.twoLineBody, { color: theme.textSecondary }]}>
          Trip planning, turn-by-turn navigation, and route weather — all with Scout or on the map.
        </Text>
      </View>

      <View style={[s.divider, { backgroundColor: theme.border }]} />

      <View style={s.twoLineBlock}>
        <View style={[s.twoLineIcon, { backgroundColor: theme.red + '18' }]}>
          <Feather name="shield" size={28} color={theme.red} />
        </View>
        <Text style={[s.twoLineHeadline, { color: theme.textPrimary }]}>
          Crash detection. Check-in timers.{'\n'}Your people know you're safe.
        </Text>
        <Text style={[s.twoLineBody, { color: theme.textSecondary }]}>
          Automatic SMS alerts to your emergency contacts if something goes wrong.
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen 3 — Add your first bike + emergency contact
// ---------------------------------------------------------------------------

function Screen3() {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const { addBike } = useGarageStore();
  const { saveContacts } = useSafetyStore();

  // Bike form
  const [make, setMake]             = useState('');
  const [model, setModel]           = useState('');
  const [year, setYear]             = useState(String(new Date().getFullYear()));
  const [nickname, setNickname]     = useState('');
  const [bikeType, setBikeType]     = useState<BikeType | null>(null);
  const [tankSize, setTankSize]     = useState('');
  const [bikeSaved, setBikeSaved]   = useState(false);
  const [bikeSaving, setBikeSaving] = useState(false);

  // Contact form
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactName, setContactName]   = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactSaving, setContactSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  async function handleSaveBike() {
    if (!make.trim() || !model.trim()) return;
    setBikeSaving(true);
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
    setBikeSaved(true);
    setBikeSaving(false);
  }

  async function handleAddContact() {
    if (!contactName.trim() || !contactPhone.trim() || contacts.length >= 3) return;
    setContactSaving(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const updated = [...contacts, { name: contactName.trim(), phone: contactPhone.trim() }];
    const userId = user?.id ?? 'local';
    await saveContacts(userId, updated);
    setContacts(updated);
    setContactName('');
    setContactPhone('');
    setContactSaving(false);
  }

  function handlePickerSelect(pickedName: string, pickedPhone: string) {
    setContactName(pickedName);
    setContactPhone(pickedPhone);
    setShowPicker(false);
  }

  function handleRemoveContact(idx: number) {
    const updated = contacts.filter((_, i) => i !== idx);
    setContacts(updated);
    saveContacts(user?.id ?? 'local', updated);
  }

  const canSaveBike = make.trim().length > 0 && model.trim().length > 0 && !bikeSaving;
  const canAddContact = contactName.trim().length > 0 && contactPhone.trim().length > 0 && !contactSaving && contacts.length < 3;

  return (
    <ScrollView
      style={{ width: SCREEN_W }}
      contentContainerStyle={s.scrollScreen}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Bike section */}
      <Text style={[s.screenTitle, { color: theme.textPrimary }]}>Add your first bike</Text>
      <Text style={[s.screenBody, { color: theme.textSecondary }]}>
        Specs, maintenance, and service intervals — unlocked when your bike is added.
      </Text>

      <View style={s.form}>
        <MakeAutocomplete value={make} onChange={setMake} />
        <StyledInput value={model} onChangeText={setModel} placeholder="Model (e.g. Tiger 900)" autoCorrect={false} />
        <StyledInput value={year} onChangeText={setYear} placeholder="Year" keyboardType="number-pad" maxLength={4} />
        <StyledInput value={nickname} onChangeText={setNickname} placeholder="Nickname (optional)" autoCorrect={false} autoCapitalize="words" />

        <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>BIKE TYPE</Text>
        <BikeTypeSelector value={bikeType} onChange={setBikeType} />

        <Text style={[s.fieldLabel, { color: theme.textSecondary, marginTop: 16 }]}>TANK SIZE</Text>
        <StyledInput value={tankSize} onChangeText={setTankSize} placeholder="Gallons (optional)" keyboardType="decimal-pad" />

        <Pressable
          style={[s.formBtn, { backgroundColor: theme.red }, !canSaveBike && s.formBtnDisabled]}
          onPress={handleSaveBike}
          disabled={!canSaveBike || bikeSaved}
        >
          {bikeSaved ? (
            <View style={s.savedRow}>
              <Feather name="check" size={16} color="#fff" />
              <Text style={s.formBtnText}>Bike Saved</Text>
            </View>
          ) : (
            <Text style={s.formBtnText}>{bikeSaving ? 'SAVING...' : 'SAVE BIKE'}</Text>
          )}
        </Pressable>
      </View>

      {/* Divider */}
      <View style={[s.sectionDivider, { backgroundColor: theme.border }]} />

      {/* Emergency contact section */}
      <Text style={[s.screenTitle, { color: theme.textPrimary }]}>Emergency contact</Text>
      <Text style={[s.screenBody, { color: theme.textSecondary }]}>
        Who should we notify if crash detection triggers?
      </Text>

      <View style={s.form}>
        {contacts.map((c, i) => (
          <View key={i} style={[s.contactPill, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.contactPillName, { color: theme.textPrimary }]}>{c.name}</Text>
              <Text style={[s.contactPillPhone, { color: theme.textMuted }]}>{c.phone}</Text>
            </View>
            <Pressable onPress={() => handleRemoveContact(i)} hitSlop={8}>
              <Feather name="x" size={16} color={theme.textMuted} />
            </Pressable>
          </View>
        ))}

        {contacts.length < 3 && (
          <>
            <Pressable style={[s.outlineBtn, { borderColor: theme.border }]} onPress={() => setShowPicker(true)}>
              <Feather name="users" size={14} color={theme.textSecondary} />
              <Text style={[s.outlineBtnText, { color: theme.textSecondary }]}>LOAD FROM CONTACTS</Text>
            </Pressable>
            <StyledInput value={contactName} onChangeText={setContactName} placeholder="Contact name" autoCorrect={false} />
            <StyledInput value={contactPhone} onChangeText={setContactPhone} placeholder="Phone number" keyboardType="phone-pad" />
            <Pressable
              style={[s.formBtn, { backgroundColor: theme.red }, !canAddContact && s.formBtnDisabled]}
              onPress={handleAddContact}
              disabled={!canAddContact}
            >
              <Text style={s.formBtnText}>{contactSaving ? 'SAVING...' : 'ADD CONTACT'}</Text>
            </Pressable>
          </>
        )}

        <Text style={[s.privacyNote, { color: theme.textMuted }]}>
          Only used to notify your contacts in an emergency. Nothing else.
        </Text>
      </View>

      {showPicker && (
        <ContactPickerSheet onClose={() => setShowPicker(false)} onSelect={handlePickerSelect} />
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Onboarding container
// ---------------------------------------------------------------------------

const SCREENS = [Screen1, Screen2, Screen3];

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { user, setOnboardingDone } = useAuthStore();
  const router   = useRouter();
  const listRef  = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]) setIndex(viewableItems[0].index ?? 0);
  }).current;

  async function finish() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Per-user key + legacy key for migration
    const key = onboardingKey(user?.id);
    await AsyncStorage.setItem(key, 'done');
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
      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.dots}>
          {SCREENS.map((_, i) => (
            <View key={i} style={[s.dot, { backgroundColor: theme.border }, i === index && { width: 20, backgroundColor: theme.red }]} />
          ))}
        </View>
        <Pressable onPress={finish} style={s.skipBtn} accessibilityLabel="Skip onboarding">
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

      {/* CTA */}
      <View style={s.footer}>
        <Pressable style={[s.nextBtn, { backgroundColor: theme.red }]} onPress={next}>
          <Text style={s.nextBtnText}>{isLast ? "LET'S RIDE" : 'NEXT'}</Text>
          <Feather name={isLast ? 'check' : 'arrow-right'} size={18} color="#fff" />
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
  skipBtn: { paddingHorizontal: 4, paddingVertical: 8, minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },

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
    paddingBottom: 40,
  },

  // Screen 1
  logoBlock: { alignItems: 'center', marginBottom: 40 },
  scoutIconLarge: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  screenSubBold: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  screenBody: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },

  // Mock chat
  mockChat: { width: '100%', gap: 12, marginTop: 8 },
  mockBubbleUser: {
    alignSelf: 'flex-end',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '80%',
  },
  mockBubbleUserText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  mockBubbleBot: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: '90%',
  },
  mockAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  mockBubbleBotText: { fontSize: 14, lineHeight: 20 },

  // Screen 2
  twoLineBlock: { alignItems: 'center', paddingVertical: 24 },
  twoLineIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  twoLineHeadline: { fontSize: 20, fontWeight: '700', textAlign: 'center', lineHeight: 28, marginBottom: 8 },
  twoLineBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  divider: { width: 60, height: 1, marginVertical: 8 },

  // Screen 3
  sectionDivider: { width: '100%', height: 1, marginVertical: 28 },
  form: { width: '100%', gap: 12 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  formBtn: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 50,
  },
  formBtnDisabled: { opacity: 0.45 },
  formBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.7 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
