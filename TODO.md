# TIME TO MOTO — TODO

## DEV — P0 (Blockers)

- [ ] Twilio crash SMS — crash detection fires but no SMS sent, connect handler → Supabase Edge Function → Twilio send
- [ ] Onboarding flag — change @ttm/onboarding_v1 to @ttm/onboarding_v1_{userId} (per-user not per-device)

## DEV — P1 (High)

- [ ] Live Share — ride_shares table migration, Share.share(), viewer page at timetomoto.app/track/[token]
- [ ] Trip planner state persistence — full end-to-end verification across tab switches and backgrounding
- [ ] Weather/road conditions stale refresh badges — verify TTL triggers and refresh tap re-fetches
- [ ] Trip planner drag route — true drag-to-snap not complete, tap-to-insert waypoint works
- [ ] Explore alternate routes layout — dropdown as possible replacement for route pills
- [ ] Mapbox thumbnail watermark — some routes showing wrong zoom level
- [ ] Scout Phase 1 — full device testing per testing script
- [ ] Social auth — add Google and Apple Sign-In to login and user creation flow via Supabase Auth providers
- [ ] User roles + subscription model — define tiers, gate features, Supabase RLS by role, paywall UI

## DEV — P2 (Medium)

- [ ] Trip planner swipe panel edge cases — rapid swipe, keyboard open, landscape
- [ ] Trip planner onboarding hint — toast on first open "Tap the map to set your origin"
- [ ] Trip planner recent history — last 10 planned trips in AsyncStorage @ttm/trip_history
- [ ] Trip planner waypoint limit alert — when user hits 25 waypoints show message suggesting Kurviger (kurviger.de) or gpx.studio, with link to GPX import flow
- [ ] User location arrow — blue Garmin-style, resolve Mapbox topImage error
- [ ] Replace react-native-draggable-flatlist before Android launch
- [ ] Register TTM as GPX file handler (EAS session)
- [ ] Moto Mode — large glove-friendly buttons, minimal UI
- [ ] Scout — clear tripRouteIsManual when user drags waypoint on loaded route
- [x] Scout — fix home location race condition (awaits loadFavorites before building context)
- [x] Scout — resolve "I didn't get a clear answer" (thinking budget 1024, maxOutput 4096)
- [ ] Scout — store selector optimization in ScoutPanelContent (useTripPlannerStore subscribes to full store)
- [ ] Scout — voice input re-implement in dev build (expo-av stubbed out)
- [x] fitRoute padding — reads actual panelY._value, verify on device
- [ ] SlideUpWrapper animation — build and apply to all modals (work started, not completed)
- [ ] Scout quota bypass — configure with Supabase user ID before launch
- [ ] Onboarding redesign — keep the simple 3-screen flow but update screen 1

## TESTING

- [ ] Crash detection end-to-end — toggle on, simulate crash, verify SMS fires
- [ ] Active ride guard — all entry points (trip planner, MY ROUTES, START & RECORD)
- [ ] Pause/resume — GPS stops/resumes, no gap jumps in saved route, stats bar states
- [ ] Trip planner state — tab switch, background 5min, weather/conditions TTL
- [ ] Map style consistency — RIDE↔TRIP sync, thumbnail uses save-time style, persists on relaunch
- [ ] Pre-ride checklist contacts — primary pre-selected, selection persists for ride session
- [ ] Compass/heading — physical device only, track-up/north-up toggle, rose behavior
- [ ] Floating tab bar — all screens, modals hide/show correctly, no overlap
- [ ] OpenWeatherMap overlay — tiles appear, no watermark zoom 0–12, toggle off cleans up
- [ ] Auth edge cases — stale token, two users same device, sign out/in
- [ ] Scout Phase 1 — full testing script (separate doc)
- [ ] Folder delete — verify My Routes and Recorded Rides don't affect each other
- [ ] Navigate from imported route — verify full geometry sent to ride screen
- [ ] Weather on imported route — verify weather section populates in Trip Planner
- [ ] CLEAR TRIP — verify resets everything and returns to normal editable planning mode
- [ ] Scout maintenance log — verify records appear in Garage after Scout adds them
- [ ] Scout modification log — verify mods appear in Garage after Scout adds them
- [ ] Imported route view-only — verify fields not editable, Add Stop hidden, info card shown

## RELEASE

- [ ] EAS build setup — eas.json, Apple Developer account link
- [ ] Push notification certificates — APNs for crash alerts
- [ ] Sentry crash reporting — install, wrap app, add SENTRY_DSN
- [ ] Firebase Analytics — project setup, plist, log key events
- [ ] Remove __DEV__ developer section — app/settings.tsx
- [x] Sweep remaining console.log statements — Scout + TripPlanner debug logs removed
- [ ] API key rotation — Mapbox, HERE, OWM, Gemini, Supabase (do last before submission)
- [ ] Open-Meteo commercial plan — $29/month before launch
- [ ] Privacy Policy — location, crash detection, contacts — host at timetomoto.com/privacy
- [ ] Terms of Service — host at timetomoto.com/terms
- [ ] App Store listing — screenshots, description, keywords, category
- [ ] TestFlight beta — eas build --profile preview, internal testers
- [ ] App Store submission — eas build --profile production, submit via EAS
- [ ] Scout — set daily quota to 50, configure bypass list with Supabase user ID
- [ ] Remove EXPO_PUBLIC_TOMORROW_API_KEY from .env.local

---

## Completed This Session (feature/scout-phase1)

- [x] Gemini 2.0-flash → 2.5-flash upgrade (all 4 files)
- [x] Scout global overlay — lifted to _layout.tsx, accessible from all screens
- [x] Scout FAB in FloatingTabBar (left of pill, absolutely positioned)
- [x] Conversation persists across all tab switches (display:none/flex, never unmounts)
- [x] Screen-aware context (ride/trip/garage/other) in system prompt
- [x] Welcome message with tappable example prompts
- [x] Linked screen names in Scout responses (Trip Planner, Garage, Ride screen)
- [x] set_active_bike tool
- [x] ask_garage queries any bike by name (not just active)
- [x] add_maintenance_log tool (oil change, tire change, etc.)
- [x] add_modification tool (exhaust, crash bars, luggage, etc.)
- [x] describe_saved_route + load_saved_route tools
- [x] Route proximity geocoding bias for waypoint placement
- [x] Daily quota system (500 for testing, 50 for production)
- [x] Departure date + time picker (smart defaults: now/9am)
- [x] Weather fetches hourly forecast for departure time
- [x] BDR seed data removed (1847→230 lines), cleanup-on-launch
- [x] Imported routes view-only in Trip Planner (banner, info card, no editing)
- [x] VIEW button on My Routes → loads into Trip Planner
- [x] View in Trip Planner on Start Ride preview screen
- [x] Navigate from Trip Planner preserves manual geometry
- [x] Request cancellation (AbortController) on Scout panel close
- [x] ScoutPanel split into shell + content (perf: no re-renders when hidden)
- [x] Swipe-down to close Scout panel
- [x] Nav hint duplicate stripping (8 regex patterns)
- [x] CLEAR TRIP button in Trip Planner
- [x] Folder delete fix for virtual categories
- [x] Removed ASK SCOUT button from Garage specs
- [x] Removed orange weather dot from Scout FAB
- [x] 1px black text stroke on Scout FAB + ride button labels
- [x] Ride settings reverted to single-column layout
- [x] Removed pendingTripFullScreen dead code
- [x] Removed 5 debug console.log lines
