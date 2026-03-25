// Must import background task definitions before any other local imports
// so TaskManager.defineTask() runs at bundle-load time.
import '../lib/backgroundTasks';

import { useEffect, useRef, useState } from 'react';
import { LogBox } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';

LogBox.ignoreLogs(['InteractionManager has been deprecated']);
LogBox.ignoreLogs(['Sending `onAnimatedValueUpdate` with no listeners registered']);
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_KEY } from './onboarding';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { useAuthStore, useSafetyStore, useThemeStore, useMapStyleStore } from '../lib/store';
import type { TrackPoint } from '../lib/gpx';
import { CrashDetector } from '../lib/safety';
import { endShare } from '../lib/liveShare';
import { stopBackgroundLocation } from '../lib/backgroundTasks';
import CrashAlertModal from '../components/safety/CrashAlertModal';
import ScoutPanel from '../components/scout/ScoutPanel';
import { useTheme } from '../lib/useTheme';
import { SAFETY_CRASH_DETECTION_KEY, SAFETY_LIVE_SHARE_KEY } from '../lib/storageKeys';

// Configure how notifications are presented when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

function AuthGuard() {
  const { session, setSession, onboardingDone, setOnboardingDone } = useAuthStore();
  const segments = useSegments();
  const router   = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.refreshSession().then(({ data: { session } }) => {
      if (mounted) { setSession(session); setSessionChecked(true); }
    }).catch(async () => {
      // Stale token — sign out cleanly
      try { await supabase.auth.signOut(); } catch {}
      if (mounted) { setSession(null); setSessionChecked(true); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
          setSession(null);
          setSessionChecked(true);
        } else {
          setSession(session);
          setSessionChecked(true);
        }
      },
    );
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => {
      if (mounted) setOnboardingDone(v === 'done');
    }).catch((e) => console.error('onboarding key read failed:', e));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!sessionChecked || onboardingDone === null) return;
    const inAuthGroup   = segments[0] === 'auth';
    const inOnboarding  = segments[0] === 'onboarding';

    if (!session && !inAuthGroup) {
      router.replace('/auth');
    } else if (session && !onboardingDone && !inOnboarding) {
      router.replace('/onboarding');
    } else if (session && onboardingDone && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)/ride');
    }
  }, [session, sessionChecked, segments, onboardingDone]);

  return null;
}

// ---------------------------------------------------------------------------
// Safety service — crash detector + location tracking + share updates
//                + check-in timer monitoring
// ---------------------------------------------------------------------------

function SafetyService() {
  const {
    isMonitoring, setCrashDetected, updateLocation,
    shareToken, shareActive,
    checkInActive, checkInDeadline, checkInNotifId, clearCheckIn,
    emergencyContacts, lastKnownLocation,
    setShareToken, setShareActive, setRecording,
    isRecording, isRidePaused, addRecordedPoint,
  } = useSafetyStore();
  const { user } = useAuthStore();

  const detectorRef    = useRef<CrashDetector | null>(null);
  const locationSub    = useRef<Location.LocationSubscription | null>(null);
  const trackSub       = useRef<Location.LocationSubscription | null>(null);
  const checkInRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lazy-init detector singleton
  if (!detectorRef.current) {
    detectorRef.current = new CrashDetector(() => setCrashDetected(true));
    // Register voice hook so CrashAlertModal can call it when SMS fires
    useSafetyStore.getState().setOnCrashAlertsSent(
      () => detectorRef.current?.onAlertsSent()
    );
  }

  // ── Restore persisted safety defaults on mount ──
  useEffect(() => {
    (async () => {
      const [crashVal, shareVal] = await Promise.all([
        AsyncStorage.getItem(SAFETY_CRASH_DETECTION_KEY),
        AsyncStorage.getItem(SAFETY_LIVE_SHARE_KEY),
      ]);
      if (crashVal === 'true') useSafetyStore.getState().setMonitoring(true);
      if (shareVal === 'true') useSafetyStore.getState().setShareActive(true);
    })();
  }, []);

  // ── Crash detector lifecycle ──
  useEffect(() => {
    if (isMonitoring) {
      detectorRef.current!.start();
      Location.requestForegroundPermissionsAsync().then(({ status }) => {
        if (status !== 'granted') return;
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 50 },
          (loc) => updateLocation(loc.coords.latitude, loc.coords.longitude),
        ).then((sub) => { locationSub.current = sub; });
      });
    } else {
      detectorRef.current!.stop();
      locationSub.current?.remove();
      locationSub.current = null;
    }
    return () => {
      detectorRef.current!.stop();
      locationSub.current?.remove();
    };
  }, [isMonitoring]);

  // ── Check-in timer expiry monitor ──
  useEffect(() => {
    clearInterval(checkInRef.current!);
    if (!checkInActive || !checkInDeadline) return;

    checkInRef.current = setInterval(async () => {
      if (Date.now() < checkInDeadline) return;
      clearInterval(checkInRef.current!);

      // Cancel scheduled notification
      if (checkInNotifId) {
        Notifications.cancelScheduledNotificationAsync(checkInNotifId).catch(() => {});
      }
      clearCheckIn();

      // Send SMS to all emergency contacts
      const loc = lastKnownLocation ?? { lat: 0, lng: 0 };
      const mapsUrl = `https://maps.google.com/maps?q=${loc.lat},${loc.lng}`;
      const riderName = user?.email ?? 'A rider';
      const timestamp = new Date().toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
      const checkInTime = checkInDeadline
        ? new Date(checkInDeadline).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '—';

      for (const contact of emergencyContacts) {
        try {
          await supabase.functions.invoke('send-checkin-alert', {
            body: {
              contactPhone: contact.phone,
              riderName,
              mapsUrl,
              timestamp,
              checkInTime,
            },
          });
        } catch {}
      }
    }, 15_000); // poll every 15 s

    return () => clearInterval(checkInRef.current!);
  }, [checkInActive, checkInDeadline]);

  // ── Notification response handler (user taps check-in notification) ──
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      // Any tap on a TTM notification = check-in
      if (checkInNotifId) {
        Notifications.cancelScheduledNotificationAsync(checkInNotifId).catch(() => {});
      }
      clearCheckIn();
    });
    return () => sub.remove();
  }, [checkInNotifId]);

  // ── GPS track recording — every 5 s while isRecording ──
  useEffect(() => {
    if (isRecording) {
      Location.requestForegroundPermissionsAsync().then(({ status }) => {
        if (status !== 'granted') return;
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 0 },
          (loc) => {
            updateLocation(loc.coords.latitude, loc.coords.longitude);
            if (useSafetyStore.getState().isRidePaused) return;
            const pt: TrackPoint = {
              lat:  loc.coords.latitude,
              lng:  loc.coords.longitude,
              ele:  loc.coords.altitude ?? undefined,
              time: new Date(loc.timestamp).toISOString(),
            };
            addRecordedPoint(pt);
          },
        ).then((sub) => { trackSub.current = sub; });
      });
    } else {
      trackSub.current?.remove();
      trackSub.current = null;
    }
    return () => {
      trackSub.current?.remove();
    };
  }, [isRecording]);

  // ── Cleanup share + background location when recording ends externally ──
  useEffect(() => {
    if (!isRecording && shareToken) {
      endShare(shareToken).catch(() => {});
      setShareToken(null);
      setShareActive(false);
      stopBackgroundLocation().catch(() => {});
    }
  }, [isRecording]);

  return null;
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

function RootLayoutInner() {
  const { mode, theme } = useTheme();
  const { loadSavedMode } = useThemeStore();
  useEffect(() => {
    loadSavedMode();
    useMapStyleStore.getState().loadSavedMapStyle();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} backgroundColor={theme.bg} />
      <AuthGuard />
      <SafetyService />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="account" />
        <Stack.Screen name="emergency-contacts" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="weather-favorites" />
        <Stack.Screen name="favorite-locations" />
        <Stack.Screen name="help-contact" />
      </Stack>
      <CrashAlertModal />
      <ScoutPanel />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return <RootLayoutInner />;
}
