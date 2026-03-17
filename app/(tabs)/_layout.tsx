import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../lib/useTheme';
import { useTabResetStore } from '../../lib/store';
import MotorcycleIcon from '../../components/icons/MotorcycleIcon';

export default function TabLayout() {
  const { theme } = useTheme();
  const resetTab = useTabResetStore((s) => s.resetTab);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor:  theme.tabBarBorder,
          borderTopWidth:  1,
          height:          77,
          paddingBottom:   28,
          paddingTop:      6,
          paddingHorizontal: 10,
        },
        tabBarLabelStyle: {
          fontSize:      10,
          fontWeight:    '600',
          letterSpacing: 0.3,
          marginTop:     4,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="ride"
        options={{
          title: 'RIDE',
          tabBarItemStyle: { marginLeft: 10 },
          tabBarIcon: ({ color, size }) => (
            <View style={{ marginTop: 3 }}><MotorcycleIcon size={Math.round((size + 4) * 1.4 * 1.15)} color={color} /></View>
          ),
        }}
        listeners={() => ({
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            resetTab('ride');
          },
        })}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'DISCOVER',
          tabBarIcon: ({ color, size }) => (
            <Feather name="compass" size={size} color={color} accessibilityLabel="Discover tab" />
          ),
        }}
        listeners={() => ({
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            resetTab('discover');
          },
        })}
      />
      <Tabs.Screen
        name="weather"
        options={{
          title: 'WEATHER',
          tabBarIcon: ({ color, size }) => (
            <Feather name="cloud" size={size} color={color} accessibilityLabel="Weather tab" />
          ),
        }}
        listeners={() => ({
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            resetTab('weather');
          },
        })}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'GARAGE',
          tabBarItemStyle: { marginRight: 10 },
          tabBarIcon: ({ color, size }) => (
            <Feather name="tool" size={size} color={color} accessibilityLabel="Garage tab" />
          ),
        }}
        listeners={() => ({
          tabPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            resetTab('garage');
          },
        })}
      />
    </Tabs>
  );
}
