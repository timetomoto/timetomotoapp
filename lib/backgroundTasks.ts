// ---------------------------------------------------------------------------
// Background task definitions
// IMPORTANT: This file must be imported at the app root (_layout.tsx) so
// TaskManager.defineTask() runs when the JS bundle is first loaded.
// ---------------------------------------------------------------------------

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { updateShareLocation } from './liveShare';

export const LOCATION_TASK = 'ttm-background-location';

TaskManager.defineTask(LOCATION_TASK, ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  const loc: Location.LocationObject = data.locations[0];
  const lat = loc.coords.latitude;
  const lng = loc.coords.longitude;

  // Lazy-require store to avoid circular deps at module init time
  const { useSafetyStore } = require('./store') as typeof import('./store');
  const state = useSafetyStore.getState();

  state.updateLocation(lat, lng);

  if (state.shareToken && state.shareActive) {
    updateShareLocation(state.shareToken, lat, lng).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Start / stop helpers
// ---------------------------------------------------------------------------

export async function startBackgroundLocation(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted') return false;

  const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  if (running) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30_000,
    distanceInterval: 100,
    showsBackgroundLocationIndicator: true, // iOS — blue status bar
    pausesUpdatesAutomatically: false,
  });
  return true;
}

export async function stopBackgroundLocation(): Promise<void> {
  const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
