# TIME TO MOTO — TODO

## DEV — P0 (Blockers)

- [ ] Apple Developer account — required for dev build, TestFlight, App Store
- [x] Twilio secrets — configured in Supabase (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
- [ ] Onboarding flag — change @ttm/onboarding_v1 to @ttm/onboarding_v1_{userId} (per-user not per-device)

## DEV — P1 (High — Pre-Launch)

- [ ] EAS build setup — eas.json, Apple Developer account link, push notification certificates
- [ ] Social auth — Apple + Google Sign-In via Supabase Auth providers
- [ ] Subscription — single tier $4.99/month Apple IAP with 14-day trial
- [ ] Live Share viewer page — timetomoto.com/track/[token] (backend wired, needs web page)
- [ ] Privacy Policy — host at timetomoto.com/privacy (Settings links ready)
- [ ] Terms of Service — host at timetomoto.com/terms (Settings links ready)
- [ ] Voice implementation — replace stubs in lib/scoutVoice.ts with expo-av + expo-speech (dev build required)
- [ ] Wake word — "Hey Scout" continuous listening during active ride (dev build required)
- [ ] Hands-free Scout + live map — "Hey Scout" triggers voice input, user watches Trip Planner map while Scout makes changes in real-time via store mutations. Scout speaks responses via TTS. User responds by voice without reopening panel. Full flow: voice command → map updates → Scout speaks follow-up → user replies by voice → repeat. Requires: minimized Scout bar on Plan tab (floating input + last response), voice input active while bar is visible, TTS for all responses in this mode. Build during voice implementation session.
- [ ] Bearing arrow for imported/GPX routes — find nearest point on route geometry, look ahead ~500m, show directional arrow on TurnCard. Makes imported routes navigable without Mapbox steps. No road names or maneuver types, just bearing direction. Build during voice/dev build session.

## DEV — P2 (Medium — Quality)

- [ ] Trip planner state persistence — verify survives tab switches and backgrounding
- [ ] Explore alternate routes layout — dropdown replacement for route pills
- [ ] Mapbox thumbnail watermark — some routes showing wrong zoom level
- [ ] User location arrow — blue Garmin-style, resolve Mapbox topImage error
- [ ] Replace react-native-draggable-flatlist before Android launch
- [ ] Register TTM as GPX file handler (EAS session)
- [ ] Onboarding redesign — highlight key features in 3-screen flow
- [ ] Splash screen animation — logo assembly sequence
- [ ] Remove Austin default coordinates before launch — use DEFAULT_LOCATION from geocode.ts everywhere

## DEV — P3 (Scout Improvements)

- [ ] Scout — clear tripRouteIsManual when user drags waypoint on loaded route
- [ ] Scout — "plan a loop" should add waypoints to fill requested duration
- [ ] Scout — avoid_road needs multi-waypoint strategy (single bypass can't force avoidance of long segments)
- [ ] Scout — steer_segment needs entry+exit waypoints for full loop roads
- [ ] Scout — load_saved_route should extract intermediate waypoints as markers
- [ ] Scout — detect truncated responses and append friendly message
- [ ] Scout — screen awareness ("What screen am I on?" — data exists, prompt doesn't report it)
- [ ] Scout — "I can't" phrasing (Gemini says "I can't" instead of offering alternatives per personality rules)
- [ ] Scout quota bypass — configure with Supabase user ID before launch

## DEV — P4 (Nice to Have)

- [ ] Moto Mode — large glove-friendly buttons, minimal UI
- [ ] Trip planner onboarding hint — toast on first open
- [ ] Trip planner recent history — last 10 planned trips in AsyncStorage
- [ ] Code consolidation — lib/limits.ts, lib/dateFormatting.ts, lib/apiConstants.ts
- [ ] Code consolidation — colors into theme.ts (warningOrange, fuelYellow, rainBlue)
- [ ] Code consolidation — lib/animationConstants.ts, lib/layoutConstants.ts

## TESTING — Device Required

- [ ] Crash detection accelerometer — impact + 2s stillness fires modal
- [ ] Crash SMS end to end — Twilio delivers to emergency contact
- [ ] Check-in timer SMS — send-checkin-alert Edge Function delivers
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
- [ ] Map style consistency — RIDE↔PLAN sync, thumbnail style, persists on relaunch
- [ ] Floating tab bar — all screens, modals hide/show correctly
- [ ] Auth edge cases — stale token, two users same device, sign out/in

## RELEASE

- [ ] Sentry crash reporting — install, wrap app, add SENTRY_DSN
- [ ] Firebase Analytics — project setup, plist, log key events
- [ ] Remove __DEV__ developer section — app/settings.tsx
- [ ] Remove "simulate crash" Scout command — dev-only but verify
- [ ] API key rotation — Mapbox, HERE, OWM, Gemini, Supabase (do last)
- [ ] Open-Meteo commercial plan — $29/month before launch
- [ ] App Store listing — screenshots, description, keywords, category
- [ ] TestFlight beta — eas build --profile preview
- [ ] App Store submission — eas build --profile production
- [ ] Scout — set daily quota to 50 for production
- [ ] Remove EXPO_PUBLIC_TOMORROW_API_KEY from .env.local
- [ ] Sweep console.error statements — keep only essential ones

## POST-LAUNCH — Round Trip / Loop Route Generator

### Overview
Integrate GraphHopper or Kurviger API for motorcycle-optimized round trip generation. Mapbox cannot generate loops from a single point + distance target — it only reorders supplied waypoints. GraphHopper has native `round_trip` with curvy road weighting (same tech stack as Calimoto). Do NOT build with Mapbox DIY — loops will follow main roads and be boring.

### Phase 1: GraphHopper Integration
- [ ] Evaluate GraphHopper vs Kurviger API pricing and access (GraphHopper: $49-299/mo, Kurviger: contact for API access)
- [ ] Sign up for API key, test `algorithm=round_trip` endpoint
- [ ] Create `lib/loopRoute.ts` — wrapper for GraphHopper round trip API
  - Input: `{ lat, lng, distanceMeters, heading?, seed? }`
  - Parameters: `round_trip.distance`, `round_trip.seed`, `heading`, `heading_penalty`
  - Kurviger adds: `weighting=curvature` (favors twisty roads), `avoid_edges` (reduces road reuse)
  - Output: GeoJSON LineString geometry + distance + duration
  - Generate 3 variations using different seeds
- [ ] Convert GraphHopper geometry to Mapbox-compatible format for map display
- [ ] Store generated loops as `tripRouteIsManual: true` (same as GPX imports — no Mapbox recalc)

### Phase 2: Scout Tool — `plan_loop`
- [ ] Add `plan_loop` tool to `lib/scoutTools.ts`
  - Parameters: `distance_miles` (or `duration_hours`), `direction` (north/south/east/west/any), `preference` (scenic/backroads/fastest)
  - Convert duration to distance estimate: `duration_hours * avg_speed_mph`
  - Call GraphHopper 3x with different seeds
  - Return: "I generated 3 loop options: 45mi/1.5hr, 52mi/1.8hr, 48mi/1.6hr. Which one looks good?"
  - On user selection, load into Trip Planner
- [ ] Add voice support: "Hey Scout, plan a 2-hour loop heading west"
- [ ] System prompt update: remove "I can't plan routes by duration" limitation

### Phase 3: Trip Planner UI
- [ ] "GENERATE LOOP" button in Trip Planner (next to route preference selector)
- [ ] Loop settings sheet:
  - Distance slider: 20-300 miles (or duration: 1-8 hours)
  - Compass direction picker (8 directions + "any")
  - Road preference: twisty/scenic/fastest
  - "GENERATE" button
- [ ] Show 3 route options overlaid on map (different colors)
- [ ] Tap to select → loads into trip planner as active route
- [ ] "REGENERATE" button for new variations (increments seed)

### Phase 4: Quality & Polish
- [ ] Elevation profile for generated loops (GraphHopper returns elevation data)
- [ ] "Curviness score" — rate how twisty the generated route is
- [ ] Favorite loop settings — save preferred distance/direction combos
- [ ] Loop history — recent generated loops for quick re-ride
- [ ] A/B test: show loop quality rating prompt after ride completion

### Technical Notes
- GraphHopper max round trip: 300km (186 miles) — sufficient for day rides
- Kurviger `curvature` weighting is the key differentiator vs generic routing
- Generated loops have no Mapbox turn-by-turn — use bearing arrow (also post-launch)
- Can hybrid: GraphHopper for loop shape, Mapbox Directions for turn-by-turn on the generated waypoints (if waypoint count ≤ 25)
- API cost scales with usage — monitor and add caching for repeated similar requests

### Why Not Mapbox
Mapbox Optimization API `roundtrip=true` only reorders supplied waypoints. No distance target, no curvy road preference, no motorcycle profile. DIY waypoint generation produces "boring rectangle" loops on main roads. Would hurt brand reputation vs Calimoto.

## COMPLETED

- [x] Gemini 2.0-flash → 2.5-flash upgrade
- [x] Scout global overlay — accessible from all screens via FAB
- [x] Scout FAB in FloatingTabBar
- [x] Conversation persists across tab switches
- [x] Screen-aware context in system prompt
- [x] Welcome message with tappable prompts
- [x] Linked screen names in responses
- [x] set_active_bike, ask_garage (any bike), add_maintenance_log, add_modification tools
- [x] describe_saved_route + load_saved_route tools
- [x] Route proximity geocoding bias
- [x] Daily quota system
- [x] Departure date + time picker
- [x] Weather hourly forecast for departure time
- [x] BDR seed data removed, cleanup-on-launch
- [x] Imported routes view-only in Trip Planner
- [x] VIEW button on My Routes
- [x] Navigate from Trip Planner preserves manual geometry
- [x] Request cancellation on Scout close
- [x] ScoutPanel perf — returns null when closed
- [x] Nav hint duplicate stripping
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
- [x] MapControlDrawer white gap fixed
- [x] Duplicate maintenance log prevention (prompt fix)
- [x] Kurviger.de suggestion on waypoint limit
- [x] Ride settings single-column layout
- [x] Debug console.log lines removed
- [x] Stale refresh badges verified wired up
- [x] Trip planner waypoint limit Kurviger message
- [x] Bike selector syncs globally
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
- [x] ASK SCOUT button in Garage SpecificationsSection
- [x] isVoiceInput flag — conditional voice mode in prompt
- [x] Today's date in system prompt (relative date math)
- [x] Sequential tool execution (multi-waypoint fix)
- [x] stop_ride two-step confirmation gate
- [x] ask_garage — bidirectional bike matching, live specs, modifications
- [x] Emergency contacts loaded on app startup
- [x] Departure time timezone fix (UTC → local)
- [x] Fuzzy route search tightened
- [x] Nav hints stripped on all responses
- [x] initialMessage works with existing sessions
- [x] PreRideChecklist bike pre-selection + FAB overlap fix
- [x] Easter egg joke — "Tell me a joke"
- [x] URLs updated timetomoto.app → timetomoto.com
- [x] Simulate crash dev command
- [x] 70+ Scout simulator tests passed (March 25-26)
- [x] 27 Scout bugs found and fixed during testing
- [x] Bidirectional bike matching on all Scout tools
- [x] Road conditions 14-day filter + severity cap
- [x] find_nearby uses route proximity + city hint
- [x] Safe Mapbox import — Expo Go fallback, dev build works
- [x] Specs/intervals/bulletins clear on model name change
- [x] Selected bike persists across app restart
- [x] Selected bike first in all chip lists
- [x] Crash alerts sent to selected contacts only
- [x] Service intervals wired into Scout context + ask_garage
- [x] delete_maintenance_log + delete_modification tools
- [x] Contextual Scout welcome messages by screen
- [x] Scout FAB pill redesign
- [x] Off-route preserves GPX geometry (no road-snapping)
- [x] Better error messaging for bike model lookup failures
