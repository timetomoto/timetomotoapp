import { Tabs } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../lib/useTheme';

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor:  theme.tabBarBorder,
          borderTopWidth:  1,
          height:          65,
          paddingBottom:   8,
          paddingTop:      6,
        },
        tabBarLabelStyle: {
          fontSize:      10,
          fontWeight:    '600',
          letterSpacing: 1,
        },
        headerShown: false,
      }}
      screenListeners={{
        tabPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      }}
    >
      <Tabs.Screen
        name="ride"
        options={{
          title: 'RIDE',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="motorbike" size={22} color={color} accessibilityLabel="Ride tab" />
          ),
        }}
      />
      <Tabs.Screen
        name="weather"
        options={{
          title: 'WEATHER',
          tabBarIcon: ({ color, size }) => (
            <Feather name="cloud" size={size} color={color} accessibilityLabel="Weather tab" />
          ),
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'GARAGE',
          tabBarIcon: ({ color, size }) => (
            <Feather name="tool" size={size} color={color} accessibilityLabel="Garage tab" />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'DISCOVER',
          tabBarIcon: ({ color, size }) => (
            <Feather name="compass" size={size} color={color} accessibilityLabel="Discover tab" />
          ),
        }}
      />
    </Tabs>
  );
}
