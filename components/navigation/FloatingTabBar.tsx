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
      {/* Scout FAB — pill bleeds off left edge, icon stacked above text */}
      {!isScoutOpen && (
        <Pressable
          style={[s.scoutPill, { backgroundColor: theme.red }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            openScout();
          }}
          hitSlop={{ top: 8, bottom: 8, right: 12 }}
        >
          <View style={{ width: 28, height: 28 }}>
            <View style={{ position: 'absolute', width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#fff' }} />
            <View style={{ position: 'absolute', left: 13, top: 4, width: 2, height: 9, backgroundColor: '#fff', borderRadius: 1 }} />
            <View style={{ position: 'absolute', left: 13, top: 15, width: 2, height: 9, backgroundColor: '#fff', opacity: 0.4, borderRadius: 1 }} />
            <View style={{ position: 'absolute', top: 13, left: 15, width: 9, height: 2, backgroundColor: '#fff', opacity: 0.4, borderRadius: 1 }} />
            <View style={{ position: 'absolute', top: 13, left: 4, width: 9, height: 2, backgroundColor: '#fff', opacity: 0.4, borderRadius: 1 }} />
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

  // Scout FAB — pill that bleeds off left edge, icon stacked above text
  scoutPill: {
    position: 'absolute',
    left: -38,
    bottom: 30,
    alignItems: 'center',
    gap: 4,
    paddingLeft: 43,
    paddingRight: 21,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#EF5350',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  scoutPillLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    color: '#fff',
  },
});
