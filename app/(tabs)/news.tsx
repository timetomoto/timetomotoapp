import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import DiscoverNews from '../../components/discover/DiscoverNews';
import WeatherContent from '../../components/weather/WeatherContent';
import HamburgerButton from '../../components/navigation/HamburgerButton';
import HamburgerMenu from '../../components/navigation/HamburgerMenu';
import { useTheme } from '../../lib/useTheme';

type NewsSubTab = 'NEWS' | 'WEATHER';

export default function NewsScreen() {
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [subTab, setSubTab] = useState<NewsSubTab>('NEWS');

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <HamburgerButton onPress={() => setMenuOpen(true)} />
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[s.heading, { color: theme.textPrimary }]}>NEWS & WEATHER</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Sub-tabs */}
      <View style={[s.subNav, { backgroundColor: theme.subNavBg, borderBottomColor: theme.subNavBorder }]}>
        {(['NEWS', 'WEATHER'] as NewsSubTab[]).map((tab) => (
          <Pressable
            key={tab}
            style={s.subNavItem}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSubTab(tab); }}
          >
            <Text style={[s.subNavText, { color: theme.pillText }, subTab === tab && { color: theme.red }]}>{tab}</Text>
            {subTab === tab && <View style={[s.subNavUnderline, { backgroundColor: theme.red }]} />}
          </Pressable>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {subTab === 'NEWS' && <DiscoverNews />}
        {subTab === 'WEATHER' && <WeatherContent />}
      </View>

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  subNav: { flexDirection: 'row', borderBottomWidth: 1, height: 44 },
  subNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  subNavText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  subNavUnderline: { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: 1 },
});
