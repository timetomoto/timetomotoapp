import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import { darkTheme } from '../../lib/theme';
import { useScoutStore } from '../../lib/scoutStore';
import MotorcycleIcon from '../../components/icons/MotorcycleIcon';

const TABS = [
  { name: 'ride', label: 'RIDE' },
  { name: 'trip', label: 'PLAN', icon: 'map' },
  { name: 'garage', label: 'GARAGE', icon: 'tool' },
] as const;

export default function FloatingTabBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const isScoutOpen = useScoutStore((s) => s.isScoutOpen);
  const openScout = useScoutStore((s) => s.openScout);

  return (
    <View style={[s.wrapper, { bottom: insets.bottom - 7 }]} pointerEvents="box-none">
      {/* Scout FAB — pill bleeds off left edge */}
      {!isScoutOpen && (
        <Pressable
          style={[s.scoutPill, { backgroundColor: theme.red }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            openScout();
          }}
        >
          <View style={{ width: 20, height: 20 }}>
            <View style={{ position: 'absolute', width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#fff' }} />
            <View style={{ position: 'absolute', left: 9, top: 2, width: 2, height: 7, backgroundColor: '#fff', borderRadius: 1 }} />
            <View style={{ position: 'absolute', left: 9, top: 11, width: 2, height: 7, backgroundColor: '#fff', opacity: 0.4, borderRadius: 1 }} />
            <View style={{ position: 'absolute', top: 9, left: 11, width: 7, height: 2, backgroundColor: '#fff', opacity: 0.4, borderRadius: 1 }} />
            <View style={{ position: 'absolute', top: 9, left: 2, width: 7, height: 2, backgroundColor: '#fff', opacity: 0.4, borderRadius: 1 }} />
          </View>
          <Text style={s.scoutPillLabel}>SCOUT</Text>
        </Pressable>
      )}

      {/* Tab pill — centered */}
      <View style={[s.pill, { backgroundColor: theme.bgCard }, theme.bg === darkTheme.bg && { borderWidth: 1, borderColor: '#000000' }]}>
          {TABS.map((tab) => {
            const isActive = pathname.includes(tab.name);
            const color = isActive ? theme.red : theme.textMuted;
            return (
              <Pressable
                key={tab.name}
                style={s.tab}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.navigate(`/(tabs)/${tab.name}` as any);
                }}
              >
                {tab.name === 'ride' ? (
                  <View style={{ width: 35, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <MotorcycleIcon size={35} color={color} />
                  </View>
                ) : (
                  <Feather name={tab.icon as any} size={20} color={color} />
                )}
                <Text style={[s.label, { color }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    borderRadius: 32,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    gap: 4,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Scout FAB — pill that bleeds off left edge
  scoutPill: {
    position: 'absolute',
    left: -12,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 22,
    paddingRight: 14,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  scoutPillLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#fff',
  },
});
