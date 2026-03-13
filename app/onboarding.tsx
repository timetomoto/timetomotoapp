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
import { StyledInput, MakeAutocomplete } from '../components/garage/AddBikeModal';

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
    { icon: 'map' as const,    text: 'Navigate, record, and explore every ride' },
    { icon: 'cloud' as const,  text: 'Weather planning built for riders' },
    { icon: 'tool' as const,   text: 'Your garage, maintenance, and mods in one place' },
  ];

  return (
    <View style={s.screen}>
      <View style={s.logoBlock}>
        <TimetomotoLogo width={LOGO_W} height={LOGO_H} disableLink />
        <Text style={[s.logoSub, { color: theme.textSecondary }]}>
          RIDE. TRACK. EXPLORE.
        </Text>
      </View>

      <View style={s.featureList}>
        {features.map((f) => (
          <View key={f.icon} style={[s.featureRow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={[s.featureIcon, { backgroundColor: theme.red + '18' }]}>
              <Feather name={f.icon} size={16} color={theme.red} />
            </View>
            <Text style={[s.featureText, { color: theme.textPrimary }]}>{f.text}</Text>
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
  const [make, setMake]   = useState('');
  const [model, setModel] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!make.trim() || !model.trim()) return;
    setSaving(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const userId = user?.id;
    if (userId) {
      const { data } = await supabase
        .from('bikes')
        .insert({ user_id: userId, make: make.trim(), model: model.trim(), year: new Date().getFullYear() })
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
          placeholder="e.g. Tiger 900"
          autoCorrect={false}
        />
        <Pressable
          style={[s.formBtn, { backgroundColor: theme.red }, !canSave && s.formBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saved}
        >
          {saved ? (
            <View style={s.savedInlineRow}>
              <Feather name="check" size={16} color="#fff" />
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
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const userId = user?.id ?? 'local';
    await saveContacts(userId, [{ name: name.trim(), phone: phone.trim() }]);
    setSaved(true);
    setSaving(false);
  }

  const canSave = name.trim().length > 0 && phone.trim().length > 0 && !saving;

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
        Add a trusted contact who'll be notified instantly if crash detection triggers.
      </Text>

      <View style={s.form}>
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
          style={[s.formBtn, { backgroundColor: theme.red }, !canSave && s.formBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saved}
        >
          {saved ? (
            <View style={s.savedInlineRow}>
              <Feather name="check" size={16} color="#fff" />
              <Text style={s.formBtnText}>Contact Added</Text>
            </View>
          ) : (
            <Text style={s.formBtnText}>{saving ? 'SAVING...' : 'ADD CONTACT'}</Text>
          )}
        </Pressable>
      </View>
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
  stepLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  skipBtn: { paddingHorizontal: 4, paddingVertical: 8, minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontSize: 12, fontWeight: '600', letterSpacing: 1 },

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
    letterSpacing: 2,
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
  featureText: { fontSize: 14, flex: 1 },

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
    letterSpacing: 2,
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
  formBtn: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 50,
  },
  formBtnDisabled: { opacity: 0.45 },
  formBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
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
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 2 },
});
