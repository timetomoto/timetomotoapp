import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../lib/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   Colors.TAB_ACTIVE,
        tabBarInactiveTintColor: Colors.TAB_INACTIVE,
        tabBarStyle: {
          backgroundColor: Colors.TTM_PANEL,
          borderTopColor:  Colors.TTM_BORDER,
          borderTopWidth:  1,
          height:          60,
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
          tabBarIcon: ({ color, size }) => (
            <Feather name="navigation" size={size} color={color} accessibilityLabel="Ride tab" />
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
        name="feed"
        options={{
          title: 'FEED',
          tabBarIcon: ({ color, size }) => (
            <Feather name="rss" size={size} color={color} accessibilityLabel="Feed tab" />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'EVENTS',
          tabBarIcon: ({ color, size }) => (
            <Feather name="flag" size={size} color={color} accessibilityLabel="Events tab" />
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
    </Tabs>
  );
}
