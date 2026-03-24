import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import {
  useGarageStore,
  useTripPlannerStore,
  useRoutesStore,
  useSafetyStore,
  useAuthStore,
  useTabResetStore,
} from '../../lib/store';
import { useScoutStore } from '../../lib/scoutStore';
import { sendScoutMessage, abortScoutRequest } from '../../lib/scoutAgent';
import { loadFavorites } from '../../lib/favorites';
import { canSend, recordUsage, getRemaining, getDailyLimit, isQuotaBypassed } from '../../lib/scoutQuota';
import type { ScoutContext, ScoutMessage, TripStop } from '../../lib/scoutTypes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MESSAGES_PER_SESSION = 50;

const ROUTE_MODIFYING_TOOLS = new Set([
  'set_origin', 'set_destination', 'add_waypoint', 'steer_segment',
  'avoid_road', 'set_route_preference', 'make_loop', 'clear_route',
  'remove_waypoint', 'reorder_waypoints', 'set_origin_to_home',
  'set_origin_to_current_location',
  'load_saved_route',
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
      <View style={{
        position: 'absolute', width: size, height: size, borderRadius: half,
        borderWidth: 1.5, borderColor: color,
      }} />
      <View style={{
        position: 'absolute', left: half - thick / 2, top: half - arm,
        width: thick, height: arm, backgroundColor: color, borderRadius: 1,
      }} />
      <View style={{
        position: 'absolute', left: half - thick / 2, top: half,
        width: thick, height: arm, backgroundColor: color, opacity: 0.4, borderRadius: 1,
      }} />
      <View style={{
        position: 'absolute', top: half - thick / 2, left: half,
        width: arm, height: thick, backgroundColor: color, opacity: 0.4, borderRadius: 1,
      }} />
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
// Main component — always mounted, visibility via store
// ---------------------------------------------------------------------------

/** Outer shell — only reads isScoutOpen to avoid re-renders when hidden */
export default function ScoutPanel() {
  const isScoutOpen = useScoutStore((s) => s.isScoutOpen);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const closeScout = useScoutStore((s) => s.closeScout);

  return (
    <View
      style={[StyleSheet.absoluteFillObject, { display: isScoutOpen ? 'flex' : 'none', zIndex: 100 }]}
      pointerEvents={isScoutOpen ? 'auto' : 'none'}
    >
      {/* Tap backdrop to close */}
      <Pressable style={{ height: insets.top + 60 }} onPress={closeScout} />
      {isScoutOpen && <ScoutPanelContent />}
    </View>
  );
}

/** Inner content — only mounted when Scout is open, all heavy hooks live here */
function ScoutPanelContent() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  // Derive current screen for context
  const currentScreen: 'ride' | 'trip' | 'garage' | 'other' =
    pathname.includes('ride') ? 'ride' :
    pathname.includes('trip') ? 'trip' :
    pathname.includes('garage') ? 'garage' : 'other';

  // Scout store (visibility + conversation)
  const storeInitialMessage = useScoutStore((s) => s.initialMessage);
  const closeScout = useScoutStore((s) => s.closeScout);
  const isScoutOpen = useScoutStore((s) => s.isScoutOpen);
  const { messages, isLoading, addMessage, setLoading, setError, clearSession } = useScoutStore();

  // App stores
  const bikes = useGarageStore((s) => s.bikes);
  const selectedBikeId = useGarageStore((s) => s.selectedBikeId);
  const activeBike = bikes.find((b) => b.id === selectedBikeId) ?? null;
  const tripStore = useTripPlannerStore();
  const routes = useRoutesStore((s) => s.routes);
  const currentLocation = useSafetyStore((s) => s.lastKnownLocation);
  const userId = useAuthStore((s) => s.user?.id) ?? 'local';

  // Local state
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const initialSent = useRef(false);
  const [favorites, setFavorites] = useState<Array<{ id: string; nickname: string; address: string; isHome: boolean }>>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [quotaRemaining, setQuotaRemaining] = useState<number>(Infinity);
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const bypassed = isQuotaBypassed(userId);

  // Load favorites + quota when panel opens
  useEffect(() => {
    if (isScoutOpen) {
      if (!bypassed) {
        getRemaining(userId).then((r) => {
          setQuotaRemaining(r);
          setQuotaExhausted(r <= 0);
        });
      }
      setFavoritesLoaded(false);
      loadFavorites(userId).then((favs) => {
        setFavorites(
          favs.map((f) => ({
            id: f.id ?? f.name,
            nickname: f.nickname ?? f.name,
            address: f.address ?? f.name,
            isHome: f.is_home ?? false,
          })),
        );
        setFavoritesLoaded(true);
      });
    }
  }, [isScoutOpen, userId]);

  // Auto-send initialMessage (wait for favorites to load first)
  useEffect(() => {
    if (isScoutOpen && favoritesLoaded && storeInitialMessage && !initialSent.current && messages.length === 0) {
      initialSent.current = true;
      const timer = setTimeout(() => handleSend(storeInitialMessage), 300);
      return () => clearTimeout(timer);
    }
  }, [isScoutOpen, storeInitialMessage, favoritesLoaded]);

  // Reset guards + abort in-flight requests when panel closes
  useEffect(() => {
    if (!isScoutOpen) {
      initialSent.current = false;
      abortScoutRequest();
    }
  }, [isScoutOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, isLoading]);

  // ── Context assembly ───────────────────────────────────────────────────

  const buildContext = useCallback((): ScoutContext => {
    const loc = currentLocation
      ? { lat: currentLocation.lat, lng: currentLocation.lng }
      : null;

    const tripOrigin = tripStore.tripOrigin;
    const tripDest = tripStore.tripDestination;
    const tripWps = tripStore.tripWaypoints as TripStop[];

    return {
      currentScreen,
      bikes,
      activeBike,
      currentLocation: loc,
      currentTrip: {
        origin: tripOrigin ? { name: tripOrigin.name, lat: tripOrigin.lat, lng: tripOrigin.lng } : null,
        destination: tripDest ? { name: tripDest.name, lat: tripDest.lat, lng: tripDest.lng } : null,
        waypoints: tripWps.map((w) => ({ name: w.name, lat: w.lat, lng: w.lng })),
        departureDate: tripStore.tripDeparture?.toISOString().split('T')[0] ?? null,
        departureTime: tripStore.tripDeparture && (tripStore.tripDeparture.getHours() !== 0 || tripStore.tripDeparture.getMinutes() !== 0)
          ? tripStore.tripDeparture.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : null,
        preference: null,
        routeDistance: tripStore.tripRouteDistance || undefined,
        routeDuration: tripStore.tripRouteDuration || undefined,
      },
      savedRoutes: routes.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category ?? '',
        distance: r.distance_miles ?? 0,
      })),
      favoriteLocations: favorites,
      recentMaintenanceLogs: [],
      serviceIntervals: null,
    };
  }, [bikes, activeBike, currentLocation, tripStore, favorites, routes, currentScreen]);

  // ── Send message ───────────────────────────────────────────────────────

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isLoading) return;
    if (messages.length >= MAX_MESSAGES_PER_SESSION) return;

    // Check daily quota
    if (!bypassed) {
      const allowed = await canSend(userId);
      if (!allowed) { setQuotaExhausted(true); return; }
    }

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
      // Ensure favorites are loaded before building context (fixes Home location race)
      let currentFavorites = favorites;
      if (currentFavorites.length === 0) {
        try {
          const freshFavs = await loadFavorites(userId);
          if (freshFavs.length > 0) {
            currentFavorites = freshFavs.map((f) => ({
              id: f.id ?? f.name,
              nickname: f.nickname ?? f.name,
              address: f.address ?? f.name,
              isHome: f.is_home ?? false,
            }));
            setFavorites(currentFavorites);
          }
        } catch {}
      }

      // Build context with guaranteed-fresh favorites
      const ctx: ScoutContext = {
        ...buildContext(),
        favoriteLocations: currentFavorites,
      };
      const history = useScoutStore.getState().messages;
      const result = await sendScoutMessage(msg, history.slice(0, -1), ctx);

      // Silent return if request was aborted (empty string from abortScoutRequest)
      if (!result.text) { setLoading(false); return; }

      // Append nav hint before adding to store
      let content = result.text;
      const routeModified = result.toolsExecuted.some((t) => ROUTE_MODIFYING_TOOLS.has(t));
      if (routeModified) {
        // Strip any Gemini-generated nav hints before appending ours
        content = content
          .replace(/\n*Head (over )?(to|on over to) (the )?Trip Planner[^\n]*/gi, '')
          .replace(/\n*Close Scout[^\n]*/gi, '')
          .replace(/\n*Go to (the )?Trip Planner[^\n]*/gi, '')
          .replace(/\n*Your route is ready[^\n]*/gi, '')
          .replace(/\n*Check (the |your )?Trip Planner[^\n]*/gi, '')
          .replace(/\n*Open (the )?Trip Planner[^\n]*/gi, '')
          .replace(/\n*Switch (over )?(to )?(the )?Trip Planner[^\n]*/gi, '')
          .replace(/\n*You can (now )?(see|view|check|find) (it |this |the route )?(in |on )?(the )?Trip Planner[^\n]*/gi, '')
          .trimEnd();
        content += '\n\nHead to Trip Planner to see your route.';
      }

      const assistantMsg: ScoutMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date(),
        toolCalls: result.toolsExecuted.map((n) => ({ name: n, parameters: {} })),
      };
      addMessage(assistantMsg);

      // Track quota usage
      if (!bypassed) {
        const remaining = await recordUsage(userId);
        setQuotaRemaining(remaining);
        if (remaining <= 0) setQuotaExhausted(true);
      }

      // Notify TripPlanner if route was modified
      if (routeModified) {
        useScoutStore.getState().onRouteUpdated?.();
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


  // ── Welcome message (display-only, not stored) ─────────────────────────

  const bikeLabel = activeBike?.nickname ?? (activeBike ? [activeBike.year, activeBike.make, activeBike.model].filter(Boolean).join(' ') : null) ?? 'my bike';

  const welcomeExamples = [
    'Plan a 2-hour loop from here on back roads',
    'Check weather for my route this Saturday',
    `What oil does ${bikeLabel} take?`,
    'Add a fuel stop halfway through my trip',
  ];

  const WelcomeMessage = () => (
    <View style={[st.bubbleRow, st.bubbleRowLeft, { maxWidth: '92%' }]}>
      <View style={[st.avatar, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <CompassIcon size={12} color={theme.red} />
      </View>
      <View style={[st.bubble, { backgroundColor: theme.bgCard, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
        <Text style={[st.bubbleText, { color: theme.textPrimary }]}>
          {'I\'m Scout. I can help you:\n\n'}
          {'Plan routes\n'}
          {'Check weather\n'}
          {'Answer bike questions\n'}
          {'Update your trip\n\n'}
          {'Try:'}
        </Text>
        <View style={{ marginTop: 8, gap: 6 }}>
          {welcomeExamples.map((ex, i) => (
            <Pressable
              key={i}
              style={[st.promptChip, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}
              onPress={() => handleSend(ex)}
            >
              <Text style={[st.promptChipText, { color: theme.textSecondary }]}>{ex}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[st.bubbleText, { color: theme.textPrimary, marginTop: 10 }]}>
          Where are we riding today?
        </Text>
      </View>
    </View>
  );

  // ── Render (always mounted, display toggled) ───────────────────────────

  const atLimit = messages.length >= MAX_MESSAGES_PER_SESSION;

  // Screen link map for tappable navigation in messages
  const screenLinks: Array<{ pattern: RegExp; route: string }> = [
    { pattern: /Trip Planner/g, route: '/(tabs)/trip' },
    { pattern: /Garage/g, route: '/(tabs)/garage' },
    { pattern: /Ride screen/g, route: '/(tabs)/ride' },
  ];

  /** Parse message text and replace screen names with tappable links */
  const renderLinkedText = (text: string, textColor: string) => {
    // Build a combined regex
    const combined = /(Trip Planner|Garage|Ride screen)/g;
    const parts: Array<{ text: string; link?: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = combined.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, match.index) });
      }
      const route = screenLinks.find((l) => l.pattern.test(match![0]))?.route;
      parts.push({ text: match[0], link: route });
      // Reset the per-link pattern lastIndex
      screenLinks.forEach((l) => { l.pattern.lastIndex = 0; });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex) });
    }

    if (parts.length <= 1 && !parts[0]?.link) {
      return <Text style={[st.bubbleText, { color: textColor }]}>{text}</Text>;
    }

    return (
      <Text style={[st.bubbleText, { color: textColor }]}>
        {parts.map((p, i) =>
          p.link ? (
            <Text
              key={i}
              style={{ textDecorationLine: 'underline', color: theme.red }}
              onPress={() => {
                closeScout();
                if (p.link === '/(tabs)/trip') {
                  useTabResetStore.getState().setPendingTripSubTab('trip-planner');
                }
                router.navigate(p.link as any);
              }}
            >
              {p.text}
            </Text>
          ) : (
            <Text key={i}>{p.text}</Text>
          ),
        )}
      </Text>
    );
  };

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
          {isUser
            ? <Text style={[st.bubbleText, { color: theme.white }]}>{item.content}</Text>
            : renderLinkedText(item.content, theme.textPrimary)
          }
        </View>
      </View>
    );
  };

  // No bikes empty state
  const noBikes = bikes.length === 0;

  // Swipe-down to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 50) closeScout();
      },
    }),
  ).current;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[st.container, { backgroundColor: theme.bgPanel }]}
    >
        {/* Drag handle — swipe down to close */}
        <View {...panResponder.panHandlers} style={st.dragHandleWrap}>
          <View style={[st.dragHandle, { backgroundColor: theme.border }]} />
        </View>

        {/* Header */}
        <View style={[st.header, { borderBottomColor: theme.border }]}>
          <View style={st.headerLeft}>
            <CompassIcon size={18} color={theme.red} />
            <Text style={[st.headerTitle, { color: theme.textPrimary }]}>SCOUT</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {messages.length > 0 && (
              <Pressable onPress={clearSession} hitSlop={12}>
                <Feather name="refresh-cw" size={16} color={theme.textMuted} />
              </Pressable>
            )}
            <Pressable onPress={closeScout} hitSlop={12}>
              <Feather name="x" size={20} color={theme.textMuted} />
            </Pressable>
          </View>
        </View>

        {noBikes ? (
          <View style={st.emptyState}>
            <CompassIcon size={48} color={theme.textMuted} />
            <Text style={[st.emptyTitle, { color: theme.textPrimary }]}>Add a bike first</Text>
            <Text style={[st.emptySubtitle, { color: theme.textMuted }]}>
              Scout needs to know your ride before planning trips.
            </Text>
            <Pressable
              style={[st.emptyBtn, { backgroundColor: theme.red }]}
              onPress={() => { closeScout(); router.push('/(tabs)/garage'); }}
            >
              <Text style={st.emptyBtnText}>Go to Garage</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Message list */}
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={renderMessage}
              contentContainerStyle={[st.messageList, { paddingBottom: 8 }]}
              ListHeaderComponent={
                messages.length === 0 ? <WelcomeMessage /> : null
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

            {/* Quota exhausted banner */}
            {quotaExhausted && (
              <View style={[st.limitBanner, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <Text style={[st.limitText, { color: theme.textMuted }]}>
                  You've used all {getDailyLimit()} Scout messages for today. Resets at midnight.
                </Text>
              </View>
            )}

            {/* Session limit banner */}
            {!quotaExhausted && atLimit && (
              <View style={[st.limitBanner, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <Text style={[st.limitText, { color: theme.textMuted }]}>
                  Session limit reached.
                </Text>
                <Pressable onPress={clearSession} style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.red, fontSize: 13, fontWeight: '600' }}>Start new conversation</Text>
                </Pressable>
              </View>
            )}

            {/* Remaining messages hint */}
            {!bypassed && !quotaExhausted && quotaRemaining <= 10 && quotaRemaining > 0 && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                <Text style={{ color: theme.textMuted, fontSize: 11, textAlign: 'center' }}>
                  {quotaRemaining} message{quotaRemaining === 1 ? '' : 's'} remaining today
                </Text>
              </View>
            )}

            {/* Input row */}
            {!atLimit && !quotaExhausted && (
              <View style={[st.inputRow, { borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom + 70, 82) }]}>
                <TextInput
                  style={[st.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
                  placeholder="Ask Scout..."
                  placeholderTextColor={theme.inputPlaceholder}
                  value={input}
                  onChangeText={setInput}
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={() => handleSend()}
                  editable={!isLoading}
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
          </>
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
  dragHandleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
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

  // Prompt chips (used in welcome message)
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
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
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
