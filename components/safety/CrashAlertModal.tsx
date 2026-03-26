import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuthStore, useSafetyStore } from '../../lib/store';
import { useTheme } from '../../lib/useTheme';
import { speakResponse, stopSpeaking, startRecordingCommand, stopRecordingCommand } from '../../lib/scoutVoice';

const COUNTDOWN_SEC = 60;

async function sendCrashAlerts(
  userName: string,
  lat: number,
  lng: number,
  contacts: { name: string; phone: string }[],
) {
  if (contacts.length === 0) return;
  const mapsUrl = `https://maps.google.com/maps?q=${lat},${lng}`;
  const timestamp = new Date().toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  for (const contact of contacts) {
    try {
      await supabase.functions.invoke('send-crash-alert', {
        body: {
          contactPhone: contact.phone,
          contactName:  contact.name,
          riderName:    userName,
          lat,
          lng,
          mapsUrl,
          timestamp,
        },
      });
    } catch {
      // Best-effort — don't surface individual failures
    }
  }
}

// ---------------------------------------------------------------------------
// CrashAlertModal
// ---------------------------------------------------------------------------

export default function CrashAlertModal() {
  const { theme } = useTheme();
  const { user } = useAuthStore();
  const { crashDetected, crashSimulated, emergencyContacts, lastKnownLocation, setCrashDetected, setCrashAlertHandlers, onCrashAlertsSent } = useSafetyStore();

  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceListenRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedRef = useRef(false);

  // Phrases that cancel the alert (rider is OK)
  const CANCEL_PHRASES = ['i\'m ok', 'i\'m fine', 'im ok', 'im fine', 'yes', 'okay', 'cancel'];
  // Phrases that escalate (rider needs help)
  const EMERGENCY_PHRASES = ['help', 'emergency', 'call', 'hurt'];

  useEffect(() => {
    if (!crashDetected) return;
    dismissedRef.current = false;

    setCountdown(COUNTDOWN_SEC);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    // NOTE: Initial voice announcement + startRecordingCommand() are fired
    // by CrashDetector in lib/safety.ts BEFORE setCrashDetected(true).
    // This avoids duplicate speech — safety.ts owns the instant voice hooks,
    // this modal owns the ongoing listening, phrase matching, and cleanup.

    // Poll for voice transcription results (stub returns '' until dev build).
    // In the real implementation, startRecordingCommand (already running from
    // safety.ts) continuously transcribes; this interval checks for matches.
    voiceListenRef.current = setInterval(async () => {
      if (dismissedRef.current) return;
      try {
        const transcript = await startRecordingCommand();
        if (!transcript) return;
        const lower = transcript.toLowerCase().trim();

        if (CANCEL_PHRASES.some((p) => lower.includes(p))) {
          stopRecordingCommand();
          handleImOK();
        } else if (EMERGENCY_PHRASES.some((p) => lower.includes(p))) {
          stopRecordingCommand();
          handleEmergencyNow();
        }
      } catch {}
    }, 2000);

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.00, duration: 600, useNativeDriver: true }),
      ]),
    );
    pulse.start();

    hapticRef.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, 5000);

    intervalRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(intervalRef.current!);
          clearInterval(hapticRef.current!);
          clearInterval(voiceListenRef.current!);
          pulse.stop();
          stopRecordingCommand();
          if (crashSimulated) {
            console.log('[CrashAlert] Simulated — skipping SMS');
            onCrashAlertsSent?.();
            useSafetyStore.setState({ crashSimulated: false });
            setCrashDetected(false);
          } else {
            const loc = lastKnownLocation ?? { lat: 0, lng: 0 };
            const name = user?.email ?? 'A rider';
            sendCrashAlerts(name, loc.lat, loc.lng, emergencyContacts).finally(() => {
              onCrashAlertsSent?.();
              setCrashDetected(false);
            });
          }
          return 0;
        }
        return n - 1;
      });
    }, 1000);

    return () => {
      clearInterval(intervalRef.current!);
      clearInterval(hapticRef.current!);
      clearInterval(voiceListenRef.current!);
      stopRecordingCommand();
      stopSpeaking();
      pulse.stop();
    };
  }, [crashDetected]);

  function handleImOK() {
    dismissedRef.current = true;
    clearInterval(intervalRef.current!);
    clearInterval(hapticRef.current!);
    clearInterval(voiceListenRef.current!);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopRecordingCommand();
    stopSpeaking();
    speakResponse("Glad you're okay. Countdown cancelled.");
    setCrashDetected(false);
  }

  /** Skip countdown and fire SMS immediately (voice command or future UI trigger) */
  function handleEmergencyNow() {
    dismissedRef.current = true;
    clearInterval(intervalRef.current!);
    clearInterval(hapticRef.current!);
    clearInterval(voiceListenRef.current!);
    stopRecordingCommand();
    if (crashSimulated) {
      console.log('[CrashAlert] Simulated — skipping SMS (emergency)');
      speakResponse('Simulation: emergency contacts would be notified.');
      onCrashAlertsSent?.();
      useSafetyStore.setState({ crashSimulated: false });
      setCrashDetected(false);
    } else {
      speakResponse('Alerting your emergency contacts now.');
      const loc = lastKnownLocation ?? { lat: 0, lng: 0 };
      const name = user?.email ?? 'A rider';
      sendCrashAlerts(name, loc.lat, loc.lng, emergencyContacts).finally(() => {
        onCrashAlertsSent?.();
        setCrashDetected(false);
      });
    }
  }

  // Register handlers so Scout tools can cancel or escalate
  useEffect(() => {
    if (crashDetected) {
      setCrashAlertHandlers(handleImOK, handleEmergencyNow);
    } else {
      setCrashAlertHandlers(null, null);
    }
  }, [crashDetected]);

  if (!crashDetected) return null;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={s.overlay}>
        {/* Pulsing ring behind the timer */}
        <Animated.View style={[s.ring, { borderColor: theme.red + '44', transform: [{ scale: pulseAnim }] }]} />

        <View style={[s.panel, { backgroundColor: theme.bgPanel, borderColor: theme.red }]}>
          {/* Header */}
          <Text style={[s.warningLabel, { color: theme.red }]}>⚠ CRASH DETECTED</Text>
          <Text style={[s.subLabel, { color: theme.textSecondary }]}>
            {emergencyContacts.length > 0
              ? `Alerting your emergency contacts in`
              : 'No emergency contacts saved.\nCancel if you are OK.'}
          </Text>

          {/* Countdown */}
          <View style={s.countdownWrapper}>
            <Text style={[s.countdownNumber, { color: theme.textPrimary }]}>{countdown}</Text>
            <Text style={[s.countdownUnit, { color: theme.textSecondary }]}>seconds</Text>
          </View>

          {/* Contacts preview */}
          {emergencyContacts.length > 0 && (
            <View style={[s.contactList, { backgroundColor: theme.bgCard }]}>
              {emergencyContacts.map((c, i) => (
                <Text key={i} style={[s.contactItem, { color: theme.textSecondary }]}>
                  {c.name} · {c.phone}
                </Text>
              ))}
            </View>
          )}

          {/* I'm OK button */}
          <Pressable
            style={({ pressed }) => [s.okBtn, { backgroundColor: theme.green }, pressed && s.okBtnPressed]}
            onPress={handleImOK}
          >
            <Text style={s.okBtnText}>I'M OK</Text>
          </Pressable>

          <Text style={[s.hint, { color: theme.textSecondary }]}>Press to cancel the alert</Text>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ring: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 2,
  },
  panel: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  warningLabel: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  subLabel: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  countdownWrapper: {
    marginVertical: 8,
    alignItems: 'center',
  },
  countdownNumber: {
    fontSize: 96,
    fontWeight: '700',
    lineHeight: 100,
  },
  countdownUnit: {
    fontSize: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  contactList: {
    gap: 4,
    alignSelf: 'stretch',
    borderRadius: 8,
    padding: 12,
  },
  contactItem: {
    fontSize: 13,
    textAlign: 'center',
  },
  okBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 22,
    paddingHorizontal: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  okBtnPressed: { opacity: 0.85 },
  okBtnText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  hint: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
