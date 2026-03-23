import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
// Lazy-loaded — expo-av requires a dev build (crashes Expo Go)
let Audio: typeof import('expo-av').Audio | null = null;
try { Audio = require('expo-av').Audio; } catch {}
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import {
  useGarageStore,
  useTripPlannerStore,
  useSafetyStore,
} from '../../lib/store';
import { useScoutStore } from '../../lib/scoutStore';
import { sendScoutMessage } from '../../lib/scoutAgent';
import type { ScoutContext, ScoutMessage, TripStop } from '../../lib/scoutTypes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MESSAGES_PER_SESSION = 25;

const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? '';

const ROUTE_MODIFYING_TOOLS = new Set([
  'set_origin', 'set_destination', 'add_waypoint', 'steer_segment',
  'avoid_road', 'set_route_preference', 'make_loop', 'clear_route',
  'remove_waypoint', 'reorder_waypoints', 'set_origin_to_home',
  'set_origin_to_current_location',
]);

// ---------------------------------------------------------------------------
// Compass SVG (simple 4-point compass drawn with Views)
// ---------------------------------------------------------------------------

function CompassIcon({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  const half = size / 2;
  const arm = size * 0.35;
  const thick = 2;
  return (
    <View style={{ width: size, height: size }}>
      {/* Circle */}
      <View style={{
        position: 'absolute', width: size, height: size, borderRadius: half,
        borderWidth: 1.5, borderColor: color,
      }} />
      {/* N */}
      <View style={{
        position: 'absolute', left: half - thick / 2, top: half - arm,
        width: thick, height: arm, backgroundColor: color, borderRadius: 1,
      }} />
      {/* S */}
      <View style={{
        position: 'absolute', left: half - thick / 2, top: half,
        width: thick, height: arm, backgroundColor: color, opacity: 0.4, borderRadius: 1,
      }} />
      {/* E */}
      <View style={{
        position: 'absolute', top: half - thick / 2, left: half,
        width: arm, height: thick, backgroundColor: color, opacity: 0.4, borderRadius: 1,
      }} />
      {/* W */}
      <View style={{
        position: 'absolute', top: half - thick / 2, left: half - arm,
        width: arm, height: thick, backgroundColor: color, opacity: 0.4, borderRadius: 1,
      }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Typing dots animation
// ---------------------------------------------------------------------------

function TypingDots({ color }: { color: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotStyle = (val: Animated.Value) => ({
    width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginHorizontal: 2,
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
      <Animated.View style={dotStyle(dot1)} />
      <Animated.View style={dotStyle(dot2)} />
      <Animated.View style={dotStyle(dot3)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 30) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  onClose: () => void;
  initialMessage?: string;
  onRouteUpdated?: () => void;
}

export default function ScoutPanel({ visible, onClose, initialMessage, onRouteUpdated }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Stores
  const { messages, isLoading, addMessage, setLoading, setError, clearSession } = useScoutStore();
  const bikes = useGarageStore((s) => s.bikes);
  const selectedBikeId = useGarageStore((s) => s.selectedBikeId);
  const activeBike = bikes.find((b) => b.id === selectedBikeId) ?? null;
  const tripStore = useTripPlannerStore();
  const currentLocation = useSafetyStore((s) => s.lastKnownLocation);

  // Local state
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const initialSent = useRef(false);

  // Voice input state
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [micPermDenied, setMicPermDenied] = useState(false);
  const recordingRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [voiceToast, setVoiceToast] = useState<string | null>(null);
  const voiceToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-send initialMessage
  useEffect(() => {
    if (visible && initialMessage && !initialSent.current && messages.length === 0) {
      initialSent.current = true;
      const timer = setTimeout(() => handleSend(initialMessage), 300);
      return () => clearTimeout(timer);
    }
  }, [visible, initialMessage]);

  // Reset when panel closes
  useEffect(() => {
    if (!visible) {
      initialSent.current = false;
      clearSession();
    }
  }, [visible]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, isLoading]);

  // ── Voice input ─────────────────────────────────────────────────────────

  // Pulse animation while listening
  useEffect(() => {
    if (voiceState === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [voiceState]);

  // Cleanup recording on unmount or close
  useEffect(() => {
    if (!visible && recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
      setVoiceState('idle');
    }
  }, [visible]);

  function showVoiceToast(msg: string) {
    setVoiceToast(msg);
    if (voiceToastTimer.current) clearTimeout(voiceToastTimer.current);
    voiceToastTimer.current = setTimeout(() => setVoiceToast(null), 2500);
  }

  async function transcribeAudio(uri: string): Promise<string | null> {
    if (!GEMINI_KEY) return null;
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] ?? '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: 'Transcribe this audio exactly as spoken. Return only the transcribed text, nothing else.' },
                { inlineData: { mimeType: 'audio/m4a', data: base64 } },
              ],
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 200 },
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = await res.json();
      const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return text.trim() || null;
    } catch {
      return null;
    }
  }

  const handleMicPress = useCallback(async () => {
    // Cancel if already recording
    if (voiceState === 'listening' && recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
      setVoiceState('idle');
      return;
    }

    if (voiceState === 'transcribing') return;

    // Request permission
    if (!Audio) { showVoiceToast('Voice input not available'); return; }
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      setMicPermDenied(true);
      showVoiceToast('Microphone access needed for voice input');
      return;
    }

    // Start recording
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await Audio!.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const recording = new Audio!.Recording();
      await recording.prepareToRecordAsync(Audio!.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setVoiceState('listening');
    } catch {
      showVoiceToast("Couldn't start recording — try again");
      setVoiceState('idle');
    }
  }, [voiceState]);

  const handleMicRelease = useCallback(async () => {
    if (voiceState !== 'listening' || !recordingRef.current) return;

    setVoiceState('transcribing');
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      await Audio?.setAudioModeAsync({ allowsRecordingIOS: false });

      if (!uri) {
        showVoiceToast("Couldn't hear that — try again");
        setVoiceState('idle');
        return;
      }

      const text = await transcribeAudio(uri);
      if (text) {
        setInput(text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showVoiceToast("Couldn't hear that — try again");
      }
    } catch {
      showVoiceToast("Couldn't hear that — try again");
    } finally {
      setVoiceState('idle');
    }
  }, [voiceState]);

  // ── Context assembly ───────────────────────────────────────────────────

  const buildContext = useCallback((): ScoutContext => {
    const loc = currentLocation
      ? { lat: currentLocation.lat, lng: currentLocation.lng }
      : null;

    const tripOrigin = tripStore.tripOrigin;
    const tripDest = tripStore.tripDestination;
    const tripWps = tripStore.tripWaypoints as TripStop[];

    return {
      bikes,
      activeBike,
      currentLocation: loc,
      currentTrip: {
        origin: tripOrigin ? { name: tripOrigin.name, lat: tripOrigin.lat, lng: tripOrigin.lng } : null,
        destination: tripDest ? { name: tripDest.name, lat: tripDest.lat, lng: tripDest.lng } : null,
        waypoints: tripWps.map((w) => ({ name: w.name, lat: w.lat, lng: w.lng })),
        departureDate: tripStore.tripCustomDate?.toISOString().split('T')[0] ?? null,
        departureTime: tripStore.tripCustomDate
          ? tripStore.tripCustomDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : null,
        preference: null,
        routeDistance: tripStore.tripRouteDistance || undefined,
        routeDuration: tripStore.tripRouteDuration || undefined,
      },
      savedRoutes: [],
      favoriteLocations: [],
      recentMaintenanceLogs: [],
      serviceIntervals: null,
    };
  }, [bikes, activeBike, currentLocation, tripStore]);

  // ── Send message ───────────────────────────────────────────────────────

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isLoading) return;
    if (messages.length >= MAX_MESSAGES_PER_SESSION) return;

    if (!text) setInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ScoutMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };
    addMessage(userMsg);
    setLoading(true);
    setError(null);

    try {
      const ctx = buildContext();
      const history = useScoutStore.getState().messages;
      const result = await sendScoutMessage(msg, history.slice(0, -1), ctx);

      const assistantMsg: ScoutMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: result.text,
        timestamp: new Date(),
        toolCalls: result.toolsExecuted.map((n) => ({ name: n, parameters: {} })),
      };
      addMessage(assistantMsg);

      // Notify parent if route was modified
      if (result.toolsExecuted.some((t) => ROUTE_MODIFYING_TOOLS.has(t))) {
        onRouteUpdated?.();
      }
    } catch {
      const errMsg: ScoutMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: 'Something went wrong on my end. Try again in a moment.',
        timestamp: new Date(),
      };
      addMessage(errMsg);
    } finally {
      setLoading(false);
    }
  }, [input, isLoading, messages.length, addMessage, setLoading, setError, buildContext]);

  // ── Suggested prompts ──────────────────────────────────────────────────

  const getSuggestedPrompts = useCallback((): string[] => {
    const hasOrigin = !!tripStore.tripOrigin;
    const hasDest = !!tripStore.tripDestination;
    const hasRoute = !!tripStore.tripRouteGeojson;
    const bikeLabel = activeBike?.nickname ?? activeBike?.model ?? 'my bike';

    if (!hasOrigin && !hasDest) {
      // No trip planned
      return [
        'Plan a loop from here',
        `Ask about my ${bikeLabel}`,
        'Plan a back roads trip',
        'Ride to my favorites',
      ];
    }
    if (hasRoute && tripStore.tripCustomDate) {
      // Fully planned
      return [
        'Try a different road',
        'Check road conditions',
        'What time should I leave?',
        'Save this route',
      ];
    }
    // Trip planned, no departure
    return [
      'Check weather for this Saturday',
      'Check weather tomorrow morning',
      'Add a fuel stop',
      'Avoid highways',
      'Make it a loop',
    ];
  }, [tripStore, activeBike]);

  // ── No bikes empty state ───────────────────────────────────────────────

  if (!visible) return null;

  if (bikes.length === 0) {
    return (
      <View style={[st.container, { backgroundColor: theme.bgPanel }]}>
        <View style={[st.header, { borderBottomColor: theme.border }]}>
          <View style={st.headerLeft}>
            <CompassIcon size={18} color={theme.red} />
            <Text style={[st.headerTitle, { color: theme.textPrimary }]}>SCOUT</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={20} color={theme.textMuted} />
          </Pressable>
        </View>
        <View style={st.emptyState}>
          <CompassIcon size={48} color={theme.textMuted} />
          <Text style={[st.emptyTitle, { color: theme.textPrimary }]}>Add a bike first</Text>
          <Text style={[st.emptySubtitle, { color: theme.textMuted }]}>
            Scout needs to know your ride before planning trips.
          </Text>
          <Pressable
            style={[st.emptyBtn, { backgroundColor: theme.red }]}
            onPress={() => { onClose(); router.push('/(tabs)/garage'); }}
          >
            <Text style={st.emptyBtnText}>Go to Garage</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Session limit check ────────────────────────────────────────────────

  const atLimit = messages.length >= MAX_MESSAGES_PER_SESSION;

  // ── Render ─────────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ScoutMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[st.bubbleRow, isUser ? st.bubbleRowRight : st.bubbleRowLeft]}>
        {!isUser && (
          <View style={[st.avatar, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <CompassIcon size={12} color={theme.red} />
          </View>
        )}
        <View style={[
          st.bubble,
          isUser
            ? { backgroundColor: theme.red, borderBottomRightRadius: 4 }
            : { backgroundColor: theme.bgCard, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 },
        ]}>
          <Text style={[
            st.bubbleText,
            { color: isUser ? theme.white : theme.textPrimary },
          ]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[st.container, { backgroundColor: theme.bgPanel }]}
    >
      {/* Drag handle */}
      <View style={st.dragHandleWrap}>
        <View style={[st.dragHandle, { backgroundColor: theme.border }]} />
      </View>

      {/* Header */}
      <View style={[st.header, { borderBottomColor: theme.border }]}>
        <View style={st.headerLeft}>
          <CompassIcon size={18} color={theme.red} />
          <Text style={[st.headerTitle, { color: theme.textPrimary }]}>SCOUT</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      {/* Message list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={[st.messageList, { paddingBottom: 8 }]}
        ListHeaderComponent={
          messages.length === 0 ? (
            <View style={st.promptsWrap}>
              <Text style={[st.promptsLabel, { color: theme.textMuted }]}>SUGGESTIONS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.promptsScroll}>
                {getSuggestedPrompts().map((p, i) => (
                  <Pressable
                    key={i}
                    style={[st.promptChip, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
                    onPress={() => handleSend(p)}
                  >
                    <Text style={[st.promptChipText, { color: theme.textSecondary }]}>{p}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null
        }
        ListFooterComponent={
          isLoading ? (
            <View style={[st.bubbleRow, st.bubbleRowLeft]}>
              <View style={[st.avatar, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <CompassIcon size={12} color={theme.red} />
              </View>
              <View style={[st.bubble, { backgroundColor: theme.bgCard, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
                <TypingDots color={theme.textMuted} />
              </View>
            </View>
          ) : null
        }
      />

      {/* Session limit banner */}
      {atLimit && (
        <View style={[st.limitBanner, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[st.limitText, { color: theme.textMuted }]}>
            Session limit reached. Close and reopen Scout to continue.
          </Text>
        </View>
      )}

      {/* Voice toast */}
      {voiceToast && (
        <View style={[st.voiceToast, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Feather name="alert-circle" size={14} color={theme.textMuted} />
          <Text style={{ fontSize: 12, color: theme.textMuted, flex: 1 }}>{voiceToast}</Text>
        </View>
      )}

      {/* Input row */}
      {!atLimit && (
        <View style={[st.inputRow, { borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Mic button */}
          {Audio && !micPermDenied && !isLoading && (
            <Pressable
              style={st.micBtn}
              onPress={voiceState === 'listening' ? handleMicRelease : handleMicPress}
              disabled={voiceState === 'transcribing'}
            >
              {voiceState === 'transcribing' ? (
                <ActivityIndicator size="small" color={theme.textMuted} />
              ) : voiceState === 'listening' ? (
                <View style={st.micListening}>
                  <Animated.View style={[st.micPulseRing, {
                    borderColor: theme.red,
                    opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] }),
                    transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
                  }]} />
                  <Feather name="mic" size={18} color={theme.red} />
                </View>
              ) : (
                <Feather name="mic" size={18} color={theme.textMuted} />
              )}
            </Pressable>
          )}
          <TextInput
            style={[st.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder={voiceState === 'listening' ? 'Listening...' : voiceState === 'transcribing' ? 'Transcribing...' : 'Ask Scout...'}
            placeholderTextColor={voiceState !== 'idle' ? theme.red : theme.inputPlaceholder}
            value={input}
            onChangeText={setInput}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
            editable={!isLoading && voiceState === 'idle'}
          />
          <Pressable
            style={[st.sendBtn, { backgroundColor: input.trim() && !isLoading ? theme.red : theme.bgCard }]}
            onPress={() => handleSend()}
            disabled={!input.trim() || isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color={theme.textMuted} />
              : <Feather name="arrow-up" size={18} color={input.trim() ? theme.white : theme.textMuted} />
            }
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const st = StyleSheet.create({
  container: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  dragHandleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  dragHandle: { width: 36, height: 4, borderRadius: 2 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 1.2 },

  // Messages
  messageList: { paddingHorizontal: 12, paddingTop: 12 },
  bubbleRow: { flexDirection: 'row', marginBottom: 12, maxWidth: '85%' },
  bubbleRowLeft: { alignSelf: 'flex-start' },
  bubbleRowRight: { alignSelf: 'flex-end' },
  avatar: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginRight: 6, marginTop: 2,
  },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },

  // Suggestions
  promptsWrap: { paddingTop: 20, paddingBottom: 8 },
  promptsLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 4, marginBottom: 10 },
  promptsScroll: { gap: 8, paddingHorizontal: 4 },
  promptChip: {
    borderWidth: 1, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  promptChipText: { fontSize: 13, fontWeight: '500' },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  micBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  micListening: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  micPulseRing: {
    position: 'absolute',
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 2,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  voiceToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Limit banner
  limitBanner: { padding: 12, borderTopWidth: 1, alignItems: 'center' },
  limitText: { fontSize: 12, textAlign: 'center' },
});
