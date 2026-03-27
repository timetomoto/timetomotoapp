# TIME TO MOTO — TODO

## DEV — P0 (Blockers)

- [ ] Apple Developer account — required for dev build, TestFlight, App Store
- [x] Twilio secrets — configured in Supabase
- [x] Onboarding flag — per-user key @ttm/onboarding_v1_${userId}
- [x] Resend production key rotated + RESEND_API_KEY secret in Supabase

## DEV — P1 (High — Pre-Launch)

- [ ] EAS build setup — eas.json, Apple Developer account link, push notification certificates
- [ ] Social auth — Apple + Google Sign-In via Supabase Auth providers
- [ ] send-welcome-email OAuth trigger — add when Google/Apple auth ships (currently only fires after email confirmation onboarding)
- [ ] Subscription — single tier $4.99/month Apple IAP with 14-day trial
- [ ] send-ride-summary Edge Function — create function, decide on map image generation (static Mapbox API), opt-in preference per user, trigger after ride save
- [ ] Live Share viewer page — timetomoto.com/track/[token] (backend wired, needs web page)
- [ ] Privacy Policy — host at timetomoto.com/privacy (Settings links ready)
- [ ] Terms of Service — host at timetomoto.com/terms (Settings links ready)
- [ ] Voice implementation — replace stubs in lib/scoutVoice.ts with expo-av + expo-speech (dev build required)
- [ ] Wake word — "Hey Scout" continuous listening during active ride (dev build required)
- [ ] Hands-free Scout + live map — voice commands while watching Trip Planner map update in real-time (dev build session)
- [ ] Bearing arrow for imported/GPX routes — directional arrow on TurnCard for routes without Mapbox steps (dev build session)
- [ ] Pass contactEmail to send-crash-alert and send-checkin-alert — app currently only sends contactPhone, email is optional new field

## DEV — P2 (Medium — Quality)

- [ ] Trip planner state persistence — verify survives backgrounding on real device
- [ ] Explore alternate routes layout — dropdown replacement for route pills
- [ ] Mapbox thumbnail watermark — some routes showing wrong zoom level
- [ ] User location arrow — blue Garmin-style, resolve Mapbox topImage error
- [ ] Replace react-native-draggable-flatlist before Android launch
- [ ] Register TTM as GPX file handler (EAS session)
- [ ] Remove Austin default coordinates before launch — use DEFAULT_LOCATION from geocode.ts everywhere

## DEV — P3 (Scout Improvements)

- [ ] Scout — clear tripRouteIsManual when user drags waypoint on loaded route
- [ ] Scout — avoid_road needs multi-waypoint strategy (single bypass can't force avoidance of long segments)
- [ ] Scout — steer_segment needs entry+exit waypoints for full loop roads
- [ ] Scout — load_saved_route should extract intermediate waypoints as markers
- [ ] Scout — "I can't" phrasing (Gemini says "I can't" instead of offering alternatives per personality rules)
- [ ] Scout quota bypass — configure with Supabase user ID before launch

## DEV — P4 (Nice to Have)

- [ ] Moto Mode — large glove-friendly buttons, minimal UI
- [ ] Trip planner onboarding hint — toast on first open
- [ ] Trip planner recent history — last 10 planned trips in AsyncStorage
- [ ] Code consolidation — lib/limits.ts, lib/dateFormatting.ts, lib/apiConstants.ts

## TESTING — Device Required

- [ ] Welcome email — verify fires once after signup + onboarding, check inbox
- [ ] Crash detection accelerometer — impact + 2s stillness fires modal
- [ ] Crash SMS + email end to end — Twilio SMS + Resend email to emergency contact
- [ ] Check-in timer SMS + email — send-checkin-alert delivers both SMS and email
- [ ] GPS lock — current location, navigation, turn-by-turn
- [ ] Turn-by-turn voice — speakResponse at 800m/150m/30m thresholds
- [ ] Background location — live share updates during ride
- [ ] Voice input — expo-av recording + transcription
- [ ] Voice output — expo-speech TTS responses
- [ ] Wake word — "Hey Scout" detection during ride
- [ ] Crash voice response — speak warning, listen for "I'm ok"/"help"
- [ ] Pause/resume GPS recording — no gap jumps
- [ ] Compass heading — track-up/north-up toggle
- [ ] Pre-ride checklist — crash/share toggle defaults from Settings
- [ ] Navigate from imported route — full geometry sent to ride screen
- [ ] All modal positioning on different iPhone sizes
- [ ] fitRoute accuracy — collapsed vs expanded panel
- [ ] Map style consistency — RIDE↔PLAN sync, persists on relaunch
- [ ] Floating tab bar — all screens, modals hide/show correctly
- [ ] Auth edge cases — stale token, two users same device, sign out/in
- [ ] Trip planner state persistence — verify survives backgrounding

## RELEASE

- [ ] Sentry crash reporting — install, wrap app, add SENTRY_DSN
- [ ] Firebase Analytics — project setup, plist, log key events
- [ ] Remove __DEV__ developer section — app/settings.tsx
- [ ] Remove "simulate crash" Scout command — dev-only but verify
- [ ] API key rotation — Mapbox, HERE, OWM, Gemini, Supabase, Resend, Twilio, Anthropic (do last, see memory/project_key_rotation.md)
- [ ] Open-Meteo commercial plan — $29/month before launch
- [ ] App Store listing — screenshots, description, keywords, category
- [ ] TestFlight beta — eas build --profile preview
- [ ] App Store submission — eas build --profile production
- [ ] TestFlight beta distribution to Break-In Crew — blocked by Apple Developer account
- [ ] Scout — set daily quota to 50 for production
- [ ] Remove EXPO_PUBLIC_TOMORROW_API_KEY from .env.local
- [ ] Sweep console.error statements — keep only essential ones

## POST-LAUNCH — Apple CarPlay Integration

- [ ] Apply for Apple CarPlay Navigation entitlement (MFi program — manual review, allow weeks)
- [ ] Install `react-native-carplay` package (dev build required)
- [ ] Build CarPlay map view with route display (CPMapTemplate)
- [ ] Build CarPlay turn-by-turn navigation (CPNavigationSession)
- [ ] Build CarPlay search/destination entry (CPListTemplate)
- [ ] Build CarPlay route preview screen
- [ ] Add CPTemplateApplicationSceneDelegate + Info.plist scene config
- [ ] Test on physical CarPlay head unit or simulator

## POST-LAUNCH — Round Trip / Loop Route Generator

### Overview
Integrate GraphHopper or Kurviger API for motorcycle-optimized round trip generation. Mapbox cannot generate loops from a single point + distance target — it only reorders supplied waypoints. GraphHopper has native `round_trip` with curvy road weighting (same tech stack as Calimoto). Do NOT build with Mapbox DIY — loops will follow main roads and be boring.

### Phase 1: GraphHopper Integration
- [ ] Evaluate GraphHopper vs Kurviger API pricing and access (GraphHopper: $49-299/mo, Kurviger: contact for API access)
- [ ] Sign up for API key, test `algorithm=round_trip` endpoint
- [ ] Create `lib/loopRoute.ts` — wrapper for GraphHopper round trip API
- [ ] Convert GraphHopper geometry to Mapbox-compatible format for map display
- [ ] Store generated loops as `tripRouteIsManual: true` (same as GPX imports — no Mapbox recalc)

### Phase 2: Scout Tool — `plan_loop`
- [ ] Add `plan_loop` tool to `lib/scoutTools.ts`
- [ ] Add voice support: "Hey Scout, plan a 2-hour loop heading west"
- [ ] System prompt update: remove "I can't plan routes by duration" limitation

### Phase 3: Trip Planner UI
- [ ] "GENERATE LOOP" button in Trip Planner
- [ ] Loop settings sheet: distance slider, compass direction, road preference
- [ ] Show 3 route options overlaid on map
- [ ] "REGENERATE" button for new variations

### Phase 4: Quality & Polish
- [ ] Elevation profile for generated loops
- [ ] "Curviness score" — rate how twisty the generated route is
- [ ] Favorite loop settings — save preferred distance/direction combos
- [ ] Loop history — recent generated loops for quick re-ride

## COMPLETED

- [x] Gemini 2.0-flash → 2.5-flash upgrade
- [x] Scout global overlay — accessible from all screens via FAB
- [x] Scout FAB in FloatingTabBar → pill redesign
- [x] Conversation persists across tab switches
- [x] Screen-aware context in system prompt
- [x] Welcome message — contextual by screen (ride/plan/garage)
- [x] Linked screen names in responses
- [x] 45+ Scout tools: route, garage, ride, safety, saved routes, map controls
- [x] describe_saved_route + load_saved_route tools
- [x] Route proximity geocoding bias
- [x] Daily quota system (500/day)
- [x] Departure date + time picker
- [x] Weather hourly forecast for departure time
- [x] BDR seed data removed, cleanup-on-launch
- [x] Imported routes view-only in Trip Planner
- [x] VIEW button on My Routes
- [x] Navigate from Trip Planner preserves manual geometry
- [x] Off-route preserves GPX geometry (no road-snapping)
- [x] Request cancellation on Scout close
- [x] ScoutPanel perf — returns null when closed
- [x] Nav hint duplicate stripping (all responses)
- [x] CLEAR TRIP button
- [x] Folder delete fix for virtual categories
- [x] TRIP tab → PLAN tab rename
- [x] Full-screen Trip Planner (removed sub-tabs)
- [x] MY ROUTES as pageSheet modal
- [x] Garage header removed, static map background
- [x] Marker detail floating card
- [x] Fuel station waypoint icons
- [x] Reverse geocoded addresses on stops
- [x] Waypoint limit warning (20+)
- [x] Haversine consolidated to lib/distance.ts
- [x] useActiveBike custom hook
- [x] lib/storageKeys.ts reference
- [x] Austin coords exported from geocode.ts
- [x] Scout store selectors optimized
- [x] panelY typed accessor (addListener)
- [x] Modals reverted to native pageSheet (perf)
- [x] Dashed overlay lines cleared on nav end
- [x] PlaceDetailPanel shifted up
- [x] MapControlDrawer — header + Gas Stations + Road Conditions labels
- [x] Duplicate maintenance log prevention (prompt + duplicate check)
- [x] Kurviger.de suggestion on waypoint limit
- [x] Ride settings single-column layout
- [x] Debug console.log lines removed
- [x] Bike selector syncs globally + persists across restart
- [x] Selected bike first in all chip lists
- [x] Scout thinking budget enabled (1024)
- [x] Scout home location race fix
- [x] Account deletion — Apple compliant, Supabase Edge Function
- [x] Scout ride integration — ride-aware context, controls, navigation
- [x] Voice stubs — scoutVoice.ts, voiceConfig.ts, ScoutVoiceIndicator
- [x] Turn-by-turn placeholders at 800m/150m/30m
- [x] Safety defaults persist across app restarts (AsyncStorage)
- [x] GPS Lock opens iOS Settings when denied
- [x] Crash countdown 30s → 60s
- [x] Scout crash response — voice hooks, phrase matching, safety tools
- [x] send-crash-alert Edge Function deployed
- [x] send-checkin-alert Edge Function deployed
- [x] Privacy Policy + Terms links in Settings
- [x] AI disclosure in Scout welcome message
- [x] Permission strings — NSMotion, NSMicrophone, NSSpeech, NSLocationWhenInUse
- [x] ASK SCOUT button on bike card in Garage
- [x] isVoiceInput flag — conditional voice mode in prompt
- [x] Today's date in system prompt (relative date math)
- [x] Sequential tool execution (multi-waypoint fix)
- [x] stop_ride two-step confirmation gate
- [x] ask_garage — bidirectional bike matching, live specs, modifications, service intervals, NHTSA bulletins
- [x] Emergency contacts loaded on app startup
- [x] Crash alerts sent to selected contacts only (not all)
- [x] Departure time timezone fix (UTC → local)
- [x] Fuzzy route search tightened
- [x] initialMessage works with existing sessions
- [x] PreRideChecklist — bike pre-selection, FAB overlap, cancel button
- [x] Easter egg joke — "Tell me a joke"
- [x] URLs updated timetomoto.app → timetomoto.com
- [x] Simulate crash dev command
- [x] Safe Mapbox import — Expo Go shows fallback, dev build works
- [x] Specs/intervals/bulletins clear on model name change
- [x] Service intervals wired into Scout context + auto-fetch from Gemini
- [x] delete_maintenance_log + delete_modification tools
- [x] Maintenance move between bikes (delete + re-add)
- [x] Token optimization: 14% normal, 59% crash mode reduction
- [x] scoutTools.ts split into 3 files (definitions, helpers, executor)
- [x] Store selectors optimized in ride.tsx + CrashAlertModal
- [x] Truncated response detection
- [x] Scout screen awareness in prompt
- [x] "Let's ride" opens pre-ride checklist
- [x] Road conditions — 14-day filter + cap top 15 by severity
- [x] find_nearby — route proximity + city hint + phrase normalization
- [x] Scout map controls — set_map_style + toggle_map_layer
- [x] Map naming: Satellite/Terrain/Standard/Dark + aliases
- [x] Consistent panel headers across all modals
- [x] Animated splash screen with pulsing TTM logo
- [x] 4-screen onboarding: Meet Scout → Features → Add Bike → Emergency Contact
- [x] Per-user onboarding key
- [x] Onboarding nudge keys for post-onboarding reminders
- [x] Fullscreen map toggle blue on state
- [x] update_bike — bidirectional matching + garage refresh
- [x] 70+ Scout simulator tests passed
- [x] 30+ bugs found and fixed during testing
- [x] Light-theme email templates — 9 HTML templates in emails/light-theme/
- [x] send-support-email — light-theme templates wired + deployed
- [x] send-welcome-email Edge Function — created, deployed, onboarding trigger wired
- [x] send-crash-alert — Resend email added alongside Twilio SMS, deployed
- [x] send-checkin-alert — Resend email added alongside Twilio SMS, deployed
- [x] delete-account — deletion confirmation email added, deployed
- [x] welcome_email_sent duplicate guard — migration + profiles column
- [x] Supabase Auth email templates — confirm signup + password reset (pasted into dashboard)
- [x] Resend API key rotated after exposure
