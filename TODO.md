# TIME TO MOTO — TODO

## DEV — P0 (Blockers)

- [ ] Twilio crash SMS — crash detection fires but no SMS sent, connect handler → Supabase Edge Function → Twilio send
- [ ] Onboarding flag — change @ttm/onboarding_v1 to @ttm/onboarding_v1_{userId} (per-user not per-device)

## DEV — P1 (High — Pre-Launch)

- [ ] EAS build setup — eas.json, Apple Developer account link, push notification certificates
- [ ] Social auth — Apple + Google Sign-In via Supabase Auth providers
- [ ] Subscription — single tier $4.99/month Apple IAP with 14-day trial
- [ ] Account deletion — delete all Supabase data + AsyncStorage for user (App Store requirement)
- [ ] Live Share — ride_shares table migration, Share.share(), viewer page at timetomoto.app/track/[token]
- [ ] Scout Phase 1 — full device testing per testing script
- [ ] Voice — expo-av Scout input, expo-speech turn-by-turn (dev build required)

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
- [ ] Scout — add update_maintenance_log tool (update mileage/cost on existing entry)
- [ ] Scout — add update_modification tool (same pattern)
- [ ] Scout — mid-ride navigation commands
- [ ] Scout — ride controls via chat (start/stop recording)
- [ ] Scout — Hey Scout wake word during active ride
- [ ] Scout — detect truncated responses and append friendly message
- [ ] Scout — "plan a loop" workflow with actual loop shape waypoints
- [ ] Scout quota bypass — configure with Supabase user ID before launch

## DEV — P4 (Nice to Have)

- [ ] Moto Mode — large glove-friendly buttons, minimal UI
- [ ] Trip planner onboarding hint — toast on first open
- [ ] Trip planner recent history — last 10 planned trips in AsyncStorage
- [ ] Code consolidation — lib/limits.ts, lib/dateFormatting.ts, lib/apiConstants.ts
- [ ] Code consolidation — colors into theme.ts (warningOrange, fuelYellow, rainBlue)
- [ ] Code consolidation — lib/animationConstants.ts, lib/layoutConstants.ts

## TESTING (Device Required)

- [ ] Screen navigation lag — verify improved after Reanimated cleanup
- [ ] Scout conversation persistence after close/reopen
- [ ] All modal positioning on different iPhone sizes
- [ ] fitRoute accuracy — collapsed vs expanded panel
- [ ] Scout home location race — force quit test
- [ ] Crash detection SMS end to end
- [ ] Pause/resume GPS recording — no gap jumps
- [ ] Compass heading — track-up/north-up toggle
- [ ] Voice input microphone and transcription (dev build)
- [ ] Turn-by-turn voice announcements (dev build)
- [ ] Background location threshold
- [ ] Pre-ride checklist — default bike selection working
- [ ] Stale refresh badges — weather 30min TTL, conditions 15min TTL
- [ ] Dashed overlay lines — cleared on navigation end
- [ ] Navigate from imported route — full geometry sent to ride screen
- [ ] Weather on imported route — populates in Trip Planner
- [ ] Map style consistency — RIDE↔PLAN sync, thumbnail style, persists on relaunch
- [ ] Floating tab bar — all screens, modals hide/show correctly
- [ ] Auth edge cases — stale token, two users same device, sign out/in
- [ ] Scout maintenance/modification log — records appear in Garage

## RELEASE

- [ ] Sentry crash reporting — install, wrap app, add SENTRY_DSN
- [ ] Firebase Analytics — project setup, plist, log key events
- [ ] Remove __DEV__ developer section — app/settings.tsx
- [ ] API key rotation — Mapbox, HERE, OWM, Gemini, Supabase (do last)
- [ ] Open-Meteo commercial plan — $29/month before launch
- [ ] Privacy Policy — host at timetomoto.com/privacy
- [ ] Terms of Service — host at timetomoto.com/terms
- [ ] App Store listing — screenshots, description, keywords, category
- [ ] TestFlight beta — eas build --profile preview
- [ ] App Store submission — eas build --profile production
- [ ] Scout — set daily quota to 50 for production
- [ ] Remove EXPO_PUBLIC_TOMORROW_API_KEY from .env.local
- [ ] Sweep console.error statements — keep only essential ones

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
- [x] Scout home location race fix attempted
