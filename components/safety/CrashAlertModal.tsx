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

const COUNTDOWN_SEC = 30;

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
  const { crashDetected, emergencyContacts, lastKnownLocation, setCrashDetected } = useSafetyStore();

  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!crashDetected) return;

    setCountdown(COUNTDOWN_SEC);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

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
          pulse.stop();
          const loc = lastKnownLocation ?? { lat: 0, lng: 0 };
          const name = user?.email ?? 'A rider';
          sendCrashAlerts(name, loc.lat, loc.lng, emergencyContacts).finally(() => {
            setCrashDetected(false);
          });
          return 0;
        }
        return n - 1;
      });
    }, 1000);

    return () => {
      clearInterval(intervalRef.current!);
      clearInterval(hapticRef.current!);
      pulse.stop();
    };
  }, [crashDetected]);

  function handleImOK() {
    clearInterval(intervalRef.current!);
    clearInterval(hapticRef.current!);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCrashDetected(false);
  }

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
            style={({ pressed }) => [s.okBtn, pressed && s.okBtnPressed]}
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
    letterSpacing: 3,
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
    letterSpacing: 3,
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
    backgroundColor: '#4CAF50',
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
    letterSpacing: 4,
  },
  hint: {
    fontSize: 11,
    letterSpacing: 1,
  },
});
