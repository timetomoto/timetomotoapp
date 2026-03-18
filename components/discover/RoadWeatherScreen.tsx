import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../lib/useTheme';
import { useTabResetStore } from '../../lib/store';
import DiscoverConditions from './DiscoverConditions';
import RideWindowPlanner from '../weather/RideWindowPlanner';

type RWSubTab = 'CURRENT' | 'RIDE WINDOW' | 'ROAD CONDITIONS';

interface Props {
  /** The full weather screen component, passed from discover.tsx to avoid circular imports */
  weatherContent?: React.ReactNode;
  onNavigateFromRideWindow?: (from: any, to: any) => void;
  onNavigateRouteFromRideWindow?: (route: any) => void;
}

export default function RoadWeatherScreen({ weatherContent, onNavigateFromRideWindow, onNavigateRouteFromRideWindow }: Props) {
  const { theme } = useTheme();
  const [subTab, setSubTab] = useState<RWSubTab>('CURRENT');
  const pendingSubTab = useTabResetStore((s) => s.pendingWeatherSubTab);
  const setPendingWeatherSubTab = useTabResetStore((s) => s.setPendingWeatherSubTab);

  useEffect(() => {
    if (pendingSubTab === 'ride-window') {
      setSubTab('RIDE WINDOW');
      setPendingWeatherSubTab(null);
    } else if (pendingSubTab === 'current') {
      setSubTab('CURRENT');
      setPendingWeatherSubTab(null);
    }
  }, [pendingSubTab]);

  const tabs: RWSubTab[] = ['CURRENT', 'RIDE WINDOW', 'ROAD CONDITIONS'];

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-tab bar */}
      <View style={[s.subNav, { backgroundColor: theme.subNavBg, borderBottomColor: theme.subNavBorder }]}>
        {tabs.map((tab) => (
          <Pressable
            key={tab}
            style={s.subNavItem}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSubTab(tab);
            }}
          >
            <Text style={[s.subNavText, { color: theme.pillText }, subTab === tab && { color: theme.red }]}>
              {tab}
            </Text>
            {subTab === tab && <View style={[s.subNavUnderline, { backgroundColor: theme.red }]} />}
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {subTab === 'CURRENT' && weatherContent}
        {subTab === 'RIDE WINDOW' && (
          <RideWindowPlanner
            onNavigate={onNavigateFromRideWindow}
            onNavigateRoute={onNavigateRouteFromRideWindow}
          />
        )}
        {subTab === 'ROAD CONDITIONS' && <DiscoverConditions />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  subNav: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  subNavItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  subNavText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  subNavUnderline: {
    height: 2,
    borderRadius: 1,
    width: '60%',
    marginTop: 6,
  },
});
