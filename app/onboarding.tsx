import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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

export const ONBOARDING_KEY = '@ttm/onboarding_v1';

const { width: SCREEN_W } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Screen 1 — Value prop
// ---------------------------------------------------------------------------

function Screen1() {
  const { theme } = useTheme();
  const features = [
    { icon: 'shield',     text: 'Crash detection & emergency alerts' },
    { icon: 'navigation', text: 'Live location sharing with contacts' },
    { icon: 'cloud',      text: 'Ride window weather planning' },
    { icon: 'map',        text: 'GPX routes & fuel range overlay' },
  ];

  return (
    <View style={s.screen}>
      <View style={s.logoBlock}>
        <View style={[s.logoCircle, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Feather name="navigation" size={40} color={theme.red} />
        </View>
        <Text style={[s.logoTitle, { color: theme.textPrimary }]}>TIME to MOTO</Text>
        <Text style={[s.logoSub, { color: theme.textSecondary }]}>YOUR ADVENTURE HEADQUARTERS</Text>
      </View>

      <View style={s.featureList}>
        {features.map((f) => (
          <View key={f.icon} style={[s.featureRow, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <View style={[s.featureIcon, { backgroundColor: theme.red + '18' }]}>
              <Feather name={f.icon as any} size={16} color={theme.red} />
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
    if (!user || !make.trim() || !model.trim()) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { data } = await supabase
      .from('bikes')
      .insert({ user_id: user.id, make: make.trim(), model: model.trim(), year: new Date().getFullYear() })
      .select()
      .single();
    if (data) { addBike(data); setSaved(true); }
    setSaving(false);
  }

  return (
    <View style={s.screen}>
      <View style={[s.screenIconWrap, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Feather name="tool" size={36} color={theme.red} />
      </View>
      <Text style={[s.screenTitle, { color: theme.textPrimary }]}>ADD YOUR BIKE</Text>
      <Text style={[s.screenBody, { color: theme.textSecondary }]}>
        Get personalized fuel range, maintenance tracking, and ride stats.
      </Text>

      {saved ? (
        <View style={s.savedBadge}>
          <Feather name="check-circle" size={20} color="#4CAF50" />
          <Text style={s.savedText}>{make} {model} added!</Text>
        </View>
      ) : (
        <View style={s.form}>
          <TextInput
            style={[s.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="Make (e.g. Triumph)"
            placeholderTextColor={theme.textSecondary}
            value={make}
            onChangeText={setMake}
            autoCorrect={false}
          />
          <TextInput
            style={[s.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="Model (e.g. Tiger 900)"
            placeholderTextColor={theme.textSecondary}
            value={model}
            onChangeText={setModel}
            autoCorrect={false}
          />
          <Pressable
            style={[s.formBtn, { backgroundColor: theme.red }, (!make.trim() || !model.trim() || saving) && s.formBtnDisabled]}
            onPress={handleSave}
            disabled={!make.trim() || !model.trim() || saving}
            accessibilityLabel="Save bike"
            accessibilityRole="button"
          >
            <Text style={s.formBtnText}>{saving ? 'SAVING…' : 'SAVE BIKE'}</Text>
          </Pressable>
        </View>
      )}
    </View>
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
    if (!user || !name.trim() || !phone.trim()) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await saveContacts(user.id, [{ name: name.trim(), phone: phone.trim() }]);
    setSaved(true);
    setSaving(false);
  }

  return (
    <View style={s.screen}>
      <View style={[s.screenIconWrap, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Feather name="shield" size={36} color={theme.red} />
      </View>
      <Text style={[s.screenTitle, { color: theme.textPrimary }]}>STAY SAFE OUT THERE</Text>
      <Text style={[s.screenBody, { color: theme.textSecondary }]}>
        Add a trusted contact who'll be notified instantly if crash detection triggers.
      </Text>

      {saved ? (
        <View style={s.savedBadge}>
          <Feather name="check-circle" size={20} color="#4CAF50" />
          <Text style={s.savedText}>{name} added as your safety contact</Text>
        </View>
      ) : (
        <View style={s.form}>
          <TextInput
            style={[s.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="Contact name"
            placeholderTextColor={theme.textSecondary}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />
          <TextInput
            style={[s.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="Phone number"
            placeholderTextColor={theme.textSecondary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Pressable
            style={[s.formBtn, { backgroundColor: theme.red }, (!name.trim() || !phone.trim() || saving) && s.formBtnDisabled]}
            onPress={handleSave}
            disabled={!name.trim() || !phone.trim() || saving}
            accessibilityLabel="Save emergency contact"
            accessibilityRole="button"
          >
            <Text style={s.formBtnText}>{saving ? 'SAVING…' : 'ADD CONTACT'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Onboarding container
// ---------------------------------------------------------------------------

const SCREENS = [Screen1, Screen2, Screen3];
const TITLES  = ['01 / 03', '02 / 03', '03 / 03'];

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const router   = useRouter();
  const listRef  = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]) setIndex(viewableItems[0].index ?? 0);
  }).current;

  async function finish() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'done');
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
        renderItem={({ item: Screen }) => (
          <View style={{ width: SCREEN_W }}>
            <Screen />
          </View>
        )}
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
    paddingHorizontal: 32,
    paddingTop: 20,
    alignItems: 'center',
  },

  // Screen 1
  logoBlock: { alignItems: 'center', marginBottom: 48 },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 6,
  },
  logoSub: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
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
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 50,
  },
  formBtn: {
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 50,
  },
  formBtnDisabled: { opacity: 0.45 },
  formBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#4CAF5018',
    borderWidth: 1,
    borderColor: '#4CAF5044',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: '100%',
    marginTop: 8,
  },
  savedText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },

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
