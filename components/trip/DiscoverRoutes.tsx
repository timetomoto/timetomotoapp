import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRoutesStore, useAuthStore, useSafetyStore } from '../../lib/store';
import { fetchUserRoutes, seedRoutes, createRoute, type Route } from '../../lib/routes';
import { parseGpx, calcDistance, calcElevationGain } from '../../lib/gpx';
import { useNavigationStore } from '../../lib/navigationStore';
import RouteList from '../routes/RouteList';

export default function DiscoverRoutes() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const { setRoutes, setLoading, setPendingNavigateRoute } = useRoutesStore();
  const [importing, setImporting] = useState(false);

  // Load routes — wait for auth, then seed + fetch
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const userId = user?.id ?? 'local';
      setLoading(true);
      await seedRoutes(userId).catch(() => {});
      const fetched = await fetchUserRoutes(userId);
      if (!cancelled) {
        setRoutes(fetched);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user?.id]);

  function handleNavigate(route: Route) {
    const { isRecording } = useSafetyStore.getState();
    const navStore = useNavigationStore.getState();
    const isNav = navStore.mode === 'navigating' || navStore.mode === 'off_route' || navStore.mode === 'recalculating';
    if (isRecording || isNav) {
      Alert.alert(
        'Ride In Progress',
        isNav
          ? 'Go back to the RIDE screen to STOP navigation before starting a new one.'
          : 'Go back to the RIDE screen to STOP your recording before starting navigation.',
        [{ text: 'OK', style: 'cancel' }],
      );
      return;
    }
    setPendingNavigateRoute(route);
    router.navigate('/(tabs)/ride');
  }

  async function handleImport() {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/gpx+xml', 'text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = new File(result.assets[0].uri);
      const xml = await file.text();
      const parsed = parseGpx(xml);
      if (parsed.points.length < 2) {
        Alert.alert('Invalid GPX', 'No track points found in this file.');
        return;
      }
      const userId = user?.id ?? 'local';
      const distMiles = calcDistance(parsed.points);
      const elevFt = calcElevationGain(parsed.points);
      await createRoute(userId, parsed.name, parsed.points, distMiles, elevFt, null, null, 'imported');
      const fetched = await fetchUserRoutes(userId);
      setRoutes(fetched);
    } catch {
      Alert.alert('Import failed', 'Could not read this GPX file.');
    } finally {
      setImporting(false);
    }
  }

  function handleNewCategory() {
    Alert.prompt('New Category', 'Enter a name for the new category', (name) => {
      if (!name?.trim()) return;
      Alert.alert('Category Created', `"${name.trim()}" will appear when you move a route into it. Use the folder icon on any route card to assign it.`);
    });
  }

  return (
    <RouteList
      showSavedRides={false}
      onNavigate={handleNavigate}
      onImport={handleImport}
      onNewCategory={handleNewCategory}
      importing={importing}
    />
  );
}
