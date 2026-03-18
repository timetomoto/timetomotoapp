import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import DiscoverRoutes from '../../components/trip/DiscoverRoutes';
import TripPlanner from '../../components/trip/TripPlanner';
import HamburgerButton from '../../components/navigation/HamburgerButton';
import HamburgerMenu from '../../components/navigation/HamburgerMenu';
import { useTheme } from '../../lib/useTheme';
import { useTabResetStore } from '../../lib/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SubTab = 'MY ROUTES' | 'TRIP PLANNER';

// ---------------------------------------------------------------------------
// Sub-nav
// ---------------------------------------------------------------------------

function SubNav({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  const { theme } = useTheme();
  const tabs: SubTab[] = ['TRIP PLANNER', 'MY ROUTES'];
  return (
    <View style={[s.subNav, { backgroundColor: theme.subNavBg, borderBottomColor: theme.subNavBorder }]}>
      {tabs.map((tab) => (
        <Pressable
          key={tab}
          style={s.subNavItem}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(tab);
          }}
          accessibilityLabel={`${tab} sub-tab`}
          accessibilityRole="tab"
        >
          <Text style={[s.subNavText, { color: theme.pillText }, active === tab && { color: theme.red }]}>
            {tab}
          </Text>
          {active === tab && <View style={[s.subNavUnderline, { backgroundColor: theme.red }]} />}
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// DiscoverScreen
// ---------------------------------------------------------------------------

export default function DiscoverScreen() {
  const { theme } = useTheme();
  const [subTab, setSubTab] = useState<SubTab>('TRIP PLANNER');
  const [menuOpen, setMenuOpen] = useState(false);
  const tripReset = useTabResetStore((s) => s.tripReset);
  const pendingTripSubTab = useTabResetStore((s) => s.pendingTripSubTab);
  const setPendingTripSubTab = useTabResetStore((s) => s.setPendingTripSubTab);

  useEffect(() => {
    if (tripReset > 0) setSubTab('TRIP PLANNER');
  }, [tripReset]);

  useEffect(() => {
    if (pendingTripSubTab === 'trip-planner') {
      setSubTab('TRIP PLANNER');
      setPendingTripSubTab(null);
    }
  }, [pendingTripSubTab]);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header row with hamburger */}
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <HamburgerButton onPress={() => setMenuOpen(true)} />
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[s.heading, { color: theme.textPrimary }]}>TRIP</Text>
          </View>
        </View>
        <View style={s.headerSpacer} />
      </View>
      <SubNav active={subTab} onChange={setSubTab} />
      <View style={s.content}>
        {subTab === 'MY ROUTES' && <DiscoverRoutes />}
        {subTab === 'TRIP PLANNER' && <TripPlanner />}
      </View>

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerSpacer: { width: 40 },
  subNav: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    height: 44,
  },
  subNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subNavText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subNavUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
  },
  content: { flex: 1 },
});
