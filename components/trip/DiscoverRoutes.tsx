import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRoutesStore, useAuthStore, useSafetyStore, useTripPlannerStore } from '../../lib/store';
import { fetchUserRoutes, seedRoutes, createRoute, type Route } from '../../lib/routes';
import { parseGpx, calcDistance, calcElevationGain } from '../../lib/gpx';
import { useNavigationStore } from '../../lib/navigationStore';
import RouteList from '../routes/RouteList';

export default function DiscoverRoutes({ onDismiss }: { onDismiss?: () => void } = {}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const { setRoutes, setLoading, setPendingNavigateRoute } = useRoutesStore();
  const [importing, setImporting] = useState(false);
  const [newRouteId, setNewRouteId] = useState<string | null>(null);

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
    onDismiss?.();
    setTimeout(() => {
      setPendingNavigateRoute(route);
      router.navigate('/(tabs)/ride');
    }, 100);
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
      const saved = await createRoute(userId, parsed.name, parsed.points, distMiles, elevFt, null, null, 'imported');
      const fetched = await fetchUserRoutes(userId);
      setRoutes(fetched);
      if (saved) setNewRouteId(saved.id);
    } catch {
      Alert.alert('Import failed', 'Could not read this GPX file.');
    } finally {
      setImporting(false);
    }
  }

  function handleViewInPlanner(route: Route) {
    if (route.points.length < 2) return;
    onDismiss?.();
    const tripStore = useTripPlannerStore.getState();
    // Clear previous trip before loading new one
    tripStore.clearTrip();
    const pts = route.points;
    const first = pts[0];
    const last = pts[pts.length - 1];

    // Set origin + destination
    tripStore.setTripOrigin({ name: route.name.split('→')[0]?.trim() || 'Start', lat: first.lat, lng: first.lng });
    tripStore.setTripDestination({ name: route.name.split('→')[1]?.trim() || 'End', lat: last.lat, lng: last.lng });

    // Sample up to 23 intermediate waypoints (25 total with origin+destination = Mapbox limit)
    const maxWaypoints = 20;
    const intermediateCount = Math.min(pts.length - 2, maxWaypoints);
    const waypoints: Array<{ name: string; lat: number; lng: number }> = [];
    if (pts.length > 2 && intermediateCount > 0) {
      const step = (pts.length - 1) / (intermediateCount + 1);
      for (let i = 1; i <= intermediateCount; i++) {
        const idx = Math.round(step * i);
        if (idx > 0 && idx < pts.length - 1) {
          const p = pts[idx];
          waypoints.push({ name: `Waypoint ${i}`, lat: p.lat, lng: p.lng });
        }
      }
    }
    tripStore.setTripWaypoints(waypoints);

    // Set route geometry directly from saved points
    const geometry = {
      type: 'LineString' as const,
      coordinates: pts.map((p) => [p.lng, p.lat] as [number, number]),
    };
    tripStore.setTripRoute(geometry, route.distance_miles, route.duration_seconds ?? 0, true);

    // Notify user if route was sampled (delay to let navigation settle)
    if (pts.length - 2 > maxWaypoints) {
      const totalPoints = pts.length - 2;
      setTimeout(() => {
        Alert.alert(
          'Route Simplified',
          `This route has ${totalPoints.toLocaleString()} points but Trip Planner supports up to ${maxWaypoints} waypoints. We placed ${maxWaypoints} evenly-spaced markers along the route.\n\nNeed to build a complex multi-stop route? Plan it free at kurviger.de — it's built for motorcycle trips. Export as GPX and import it here.`,
          [
            { text: 'Open Kurviger', onPress: () => Linking.openURL('https://kurviger.de') },
            { text: 'Got It', style: 'cancel' },
          ],
        );
      }, 1500);
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
      onViewInPlanner={handleViewInPlanner}
      onImport={handleImport}
      onNewCategory={handleNewCategory}
      importing={importing}
      highlightRouteId={newRouteId}
    />
  );
}
