import { Tabs } from 'expo-router';
import { useTheme } from '../../lib/useTheme';
import FloatingTabBar from '../../components/navigation/FloatingTabBar';

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      tabBar={() => <FloatingTabBar />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="ride" />
      <Tabs.Screen name="trip" />
      <Tabs.Screen name="garage" />
      <Tabs.Screen name="weather" options={{ href: null }} />
    </Tabs>
  );
}
