import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { RideWindowResult } from './rideWindow';
import type { TrackPoint } from './gpx';
import type { Route } from './routes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, sandTheme, lightTheme, Theme } from './theme';
import type { RouteWeatherPoint } from './routeWeather';
import type { RoadCondition } from './discoverStore';

// ---------------------------------------------------------------------------
// Safety / crash-detection store
// ---------------------------------------------------------------------------

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship?: string;
  email?: string;
  is_primary?: boolean;
}

interface SafetyState {
  // Core monitoring
  isMonitoring: boolean;  // crash detection only
  isRecording: boolean;   // ride recording (timer, GPS track)
  emergencyContacts: EmergencyContact[];
  lastKnownLocation: { lat: number; lng: number; timestamp: number } | null;
  crashDetected: boolean;

  // Live location sharing
  shareToken: string | null;
  shareActive: boolean;

  // Check-in timer
  checkInDeadline: number | null;   // ms timestamp
  checkInActive: boolean;
  checkInNotifId: string | null;    // scheduled notification identifier

  // GPS track recording
  isRidePaused: boolean;
  recordedPoints: TrackPoint[];

  // Session-only overrides (not persisted)
  crashDetectionOverride: boolean;
  locationSharingOverride: boolean;

  // Actions
  setMonitoring: (v: boolean) => void;
  setRecording: (v: boolean) => void;
  setCrashDetected: (v: boolean) => void;
  updateLocation: (lat: number, lng: number) => void;
  setContacts: (contacts: EmergencyContact[]) => void;
  setShareToken: (t: string | null) => void;
  setShareActive: (v: boolean) => void;
  setCheckIn: (deadline: number, notifId: string | null) => void;
  clearCheckIn: () => void;
  setRidePaused: (v: boolean) => void;
  addRecordedPoint: (p: TrackPoint) => void;
  clearRecordedPoints: () => void;
  setCrashDetectionOverride: (v: boolean) => void;
  setLocationSharingOverride: (v: boolean) => void;
  clearSessionOverrides: () => void;
  loadContacts: (userId: string) => Promise<void>;
  saveContacts: (userId: string, contacts: EmergencyContact[]) => Promise<string | null>;
}

export const useSafetyStore = create<SafetyState>((set) => ({
  isMonitoring: false,
  isRecording: false,
  emergencyContacts: [],
  lastKnownLocation: null,
  crashDetected: false,
  shareToken: null,
  shareActive: false,
  checkInDeadline: null,
  checkInActive: false,
  checkInNotifId: null,
  isRidePaused: false,
  recordedPoints: [],
  crashDetectionOverride: false,
  locationSharingOverride: false,

  setMonitoring:    (isMonitoring) => set({ isMonitoring }),
  setRecording:     (isRecording)  => set({ isRecording }),
  setCrashDetected: (crashDetected) => set({ crashDetected }),
  updateLocation:   (lat, lng) =>
    set({ lastKnownLocation: { lat, lng, timestamp: Date.now() } }),
  setContacts:    (emergencyContacts) => set({ emergencyContacts }),
  setShareToken:  (shareToken)  => set({ shareToken }),
  setShareActive: (shareActive) => set({ shareActive }),
  setCrashDetectionOverride: (crashDetectionOverride) => set({ crashDetectionOverride }),
  setLocationSharingOverride: (locationSharingOverride) => set({ locationSharingOverride }),
  clearSessionOverrides: () => set((s) => ({
    // Revert global toggles that were only enabled for this ride
    isMonitoring: s.crashDetectionOverride ? false : s.isMonitoring,
    shareActive: s.locationSharingOverride ? false : s.shareActive,
    crashDetectionOverride: false,
    locationSharingOverride: false,
  })),

  setCheckIn: (deadline, notifId) =>
    set({ checkInDeadline: deadline, checkInActive: true, checkInNotifId: notifId }),

  clearCheckIn: () =>
    set({ checkInDeadline: null, checkInActive: false, checkInNotifId: null }),

  setRidePaused: (isRidePaused) => set({ isRidePaused }),

  addRecordedPoint: (p) =>
    set((s) => ({ recordedPoints: [...s.recordedPoints, p] })),

  clearRecordedPoints: () => set({ recordedPoints: [] }),

  loadContacts: async (userId) => {
    // Always try local cache first so the UI shows something immediately
    const cacheKey = `${LOCAL_CONTACTS_KEY}_${userId}`;
    const stored = await AsyncStorage.getItem(cacheKey);
    if (stored) set({ emergencyContacts: JSON.parse(stored) as EmergencyContact[] });

    if (userId === 'local') return;

    // Attempt Supabase sync — if it returns data, overwrite local cache
    const { data } = await supabase
      .from('profiles')
      .select('contacts')
      .eq('id', userId)
      .single();
    if (data?.contacts) {
      set({ emergencyContacts: data.contacts as EmergencyContact[] });
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data.contacts));
    }
  },

  saveContacts: async (userId, contacts) => {
    set({ emergencyContacts: contacts });
    // Always persist locally so contacts survive restarts even if Supabase is unavailable
    const cacheKey = `${LOCAL_CONTACTS_KEY}_${userId}`;
    await AsyncStorage.setItem(cacheKey, JSON.stringify(contacts));

    if (userId === 'local') return null;

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, contacts });
    return error?.message ?? null;
  },
}));

// ---------------------------------------------------------------------------
// Auth store
// ---------------------------------------------------------------------------

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  onboardingDone: boolean | null;
  setSession: (session: Session | null) => void;
  setOnboardingDone: (done: boolean) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  onboardingDone: null,

  setSession: (session) =>
    set({ session, user: session?.user ?? null, loading: false }),

  setOnboardingDone: (done) => set({ onboardingDone: done }),

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error?.message ?? null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));

// ---------------------------------------------------------------------------
// Bike display helper
// ---------------------------------------------------------------------------

export function bikeLabel(bike: { nickname?: string | null; year?: number | null; make?: string | null; model?: string | null } | null): string {
  if (!bike) return '';
  if (bike.nickname?.trim()) return bike.nickname.trim();
  return [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Garage store
// ---------------------------------------------------------------------------

export type BikeType = 'adventure' | 'dual_sport' | 'cruiser' | 'chopper' | 'sport' | 'touring';

export type BikeSpecs = {
  tirePressureFrontPsi?: number;
  tirePressureRearPsi?: number;
  tireFrontSize?: string;
  tireRearSize?: string;
  fuelType?: string;
  fuelCapacityGal?: number;
  engineDisplacement?: string;
  engineType?: string;
  oilType?: string;
  oilCapacityQt?: number;
  maxLoadLbs?: number;
  seatHeight?: string;
  groundClearance?: string;
  overallLength?: string;
  overallWidth?: string;
  overallHeight?: string;
  wetWeightLbs?: number;
  specsSource?: 'api' | 'gemini' | 'manual';
  specsLookedUp?: boolean;
  specsLookedUpAt?: string;
};

export interface Bike {
  id: string;
  user_id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  nickname?: string | null;
  odometer: number | null;
  tank_gallons: number | null;
  avg_mpg: number | null;
  fuelCapacity?: number | null;
  fuelCapacityUnit?: 'gallons' | 'liters' | null;
  bike_type?: BikeType | null;
  specs?: BikeSpecs | null;
  photo_url?: string | null;
  created_at: string;
}

const LOCAL_BIKES_KEY    = 'ttm_bikes_local';
const LOCAL_CONTACTS_KEY = 'ttm_contacts_local';

interface GarageState {
  bikes: Bike[];
  selectedBikeId: string | null;
  loading: boolean;
  fetchBikes: (userId: string) => Promise<void>;
  addBike: (bike: Bike) => void;
  updateBike: (bike: Bike) => void;
  removeBike: (id: string, local?: boolean) => Promise<void>;
  selectBike: (id: string) => void;
}

export const useGarageStore = create<GarageState>((set, get) => ({
  bikes: [],
  selectedBikeId: null,
  loading: false,

  fetchBikes: async (userId) => {
    set({ loading: true });
    if (userId === 'local') {
      const stored = await AsyncStorage.getItem(LOCAL_BIKES_KEY);
      const bikes: Bike[] = stored ? JSON.parse(stored) : [];
      const current = get().selectedBikeId;
      const selected = (current && bikes.some((b) => b.id === current)) ? current : (bikes[0]?.id ?? null);
      set({ bikes, selectedBikeId: selected, loading: false });
      return;
    }
    const { data, error } = await supabase
      .from('bikes')
      .select('id, user_id, year, make, model, nickname, odometer, tank_gallons, avg_mpg, fuelCapacity, fuelCapacityUnit, bike_type, specs, photo_url, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      const current = get().selectedBikeId;
      const selected = (current && data.some((b) => b.id === current)) ? current : (data[0]?.id ?? null);
      set({ bikes: data as Bike[], selectedBikeId: selected });
    }
    set({ loading: false });
  },

  addBike: (bike) =>
    set((s) => ({ bikes: [bike, ...s.bikes], selectedBikeId: bike.id })),

  updateBike: (bike) =>
    set((s) => ({ bikes: s.bikes.map((b) => b.id === bike.id ? bike : b) })),

  removeBike: async (id, local = false) => {
    if (local) {
      const stored = await AsyncStorage.getItem(LOCAL_BIKES_KEY);
      if (stored) {
        const bikes = (JSON.parse(stored) as Bike[]).filter((b) => b.id !== id);
        await AsyncStorage.setItem(LOCAL_BIKES_KEY, JSON.stringify(bikes));
      }
    } else {
      await supabase.from('bikes').delete().eq('id', id);
    }
    set((s) => {
      const bikes = s.bikes.filter((b) => b.id !== id);
      const selectedBikeId =
        s.selectedBikeId === id ? (bikes[0]?.id ?? null) : s.selectedBikeId;
      return { bikes, selectedBikeId };
    });
  },

  selectBike: (id) => set({ selectedBikeId: id }),
}));

// ---------------------------------------------------------------------------
// Ride Window store
// ---------------------------------------------------------------------------

interface RideWindowStoreState {
  result: RideWindowResult | null;
  setResult: (r: RideWindowResult | null) => void;
}

export const useRideWindowStore = create<RideWindowStoreState>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
}));

// ---------------------------------------------------------------------------
// Routes store
// ---------------------------------------------------------------------------

interface RoutesState {
  routes: Route[];
  loading: boolean;
  pendingNavigateRoute: Route | null;
  setRoutes: (routes: Route[]) => void;
  setLoading: (v: boolean) => void;
  addRoute: (r: Route) => void;
  removeRoute: (id: string) => void;
  updateRouteName: (id: string, name: string) => void;
  updateRouteCategory: (id: string, category: string | null) => void;
  setPendingNavigateRoute: (route: Route | null) => void;
}

export const useRoutesStore = create<RoutesState>((set) => ({
  routes: [],
  loading: false,
  pendingNavigateRoute: null,
  setRoutes:  (routes)  => set({ routes }),
  setLoading: (loading) => set({ loading }),
  addRoute:   (r)       => set((s) => ({ routes: [r, ...s.routes] })),
  removeRoute: (id)     => set((s) => ({ routes: s.routes.filter((r) => r.id !== id) })),
  updateRouteName: (id, name) =>
    set((s) => ({ routes: s.routes.map((r) => r.id === id ? { ...r, name } : r) })),
  updateRouteCategory: (id, category) =>
    set((s) => ({ routes: s.routes.map((r) => r.id === id ? { ...r, category } : r) })),
  setPendingNavigateRoute: (route) => set({ pendingNavigateRoute: route }),
}));

// ---------------------------------------------------------------------------
// Theme store
// ---------------------------------------------------------------------------

type ThemeMode = 'dark' | 'light' | 'sand' | 'system';

type ThemeStore = {
  mode: ThemeMode;
  theme: Theme;
  setMode: (mode: ThemeMode, systemScheme?: 'dark' | 'light' | null) => void;
  resolveTheme: (systemScheme: 'dark' | 'light' | null) => void;
  loadSavedMode: () => Promise<void>;
};

export const useThemeStore = create<ThemeStore>()((set, get) => ({
  mode: 'light',
  theme: lightTheme,
  setMode: async (mode, systemScheme = null) => {
    await AsyncStorage.setItem('ttm_theme_mode', mode);
    const resolved = mode === 'sand' ? sandTheme
      : mode === 'system' ? (systemScheme === 'dark' ? darkTheme : lightTheme)
      : mode === 'light' ? lightTheme : darkTheme;
    set({ mode, theme: resolved });
  },
  resolveTheme: (systemScheme) => {
    const { mode } = get();
    const resolved = mode === 'sand' ? sandTheme
      : mode === 'system' ? (systemScheme === 'dark' ? darkTheme : lightTheme)
      : mode === 'light' ? lightTheme : darkTheme;
    set({ theme: resolved });
  },
  loadSavedMode: async () => {
    const saved = await AsyncStorage.getItem('ttm_theme_mode') as ThemeMode | null;
    if (saved) set({ mode: saved });
  },
}));

// ---------------------------------------------------------------------------
// Map style store — unified map style preference across all maps
// ---------------------------------------------------------------------------

const MAP_STYLE_KEY = '@ttm/map_style_preference';
const DEFAULT_MAP_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

type MapStyleStore = {
  mapStyle: string;
  setMapStyle: (style: string) => void;
  loadSavedMapStyle: () => Promise<void>;
};

export const useMapStyleStore = create<MapStyleStore>()((set) => ({
  mapStyle: DEFAULT_MAP_STYLE,
  setMapStyle: (mapStyle) => {
    set({ mapStyle });
    AsyncStorage.setItem(MAP_STYLE_KEY, mapStyle).catch(() => {});
  },
  loadSavedMapStyle: async () => {
    const saved = await AsyncStorage.getItem(MAP_STYLE_KEY);
    if (saved) set({ mapStyle: saved });
  },
}));

// ---------------------------------------------------------------------------
// Trip planner store — persists across tab switches
// ---------------------------------------------------------------------------

interface TripLoc { name: string; lat: number; lng: number; }

interface TripPlannerState {
  tripOrigin: TripLoc | null;
  tripDestination: TripLoc | null;
  tripWaypoints: TripLoc[];
  tripDeparture: Date;
  tripCustomDate: Date | null;
  tripRouteGeojson: any;
  tripRouteDistance: number;
  tripRouteDuration: number;
  tripWeatherPoints: RouteWeatherPoint[];
  tripWeatherMsg: string | null;
  tripWeatherHasConcern: boolean;
  tripWeatherCheckpoints: number;
  tripWeatherFetchedAt: number | null;
  tripConditions: RoadCondition[];
  tripConditionsFetchedAt: number | null;
  tripSaved: boolean;
  tripRoutePreference: 'scenic' | 'backroads' | 'no_highway' | 'fastest' | null;

  setTripOrigin: (v: TripLoc | null) => void;
  setTripDestination: (v: TripLoc | null) => void;
  setTripWaypoints: (v: TripLoc[]) => void;
  setTripDeparture: (v: Date) => void;
  setTripCustomDate: (v: Date | null) => void;
  setTripRoute: (geojson: any, distance: number, duration: number) => void;
  setTripWeather: (points: RouteWeatherPoint[], msg: string | null, hasConcern: boolean, checkpoints: number) => void;
  setTripConditions: (conditions: RoadCondition[]) => void;
  setTripSaved: (v: boolean) => void;
  setTripRoutePreference: (v: 'scenic' | 'backroads' | 'no_highway' | 'fastest' | null) => void;
  clearTrip: () => void;
}

const defaultDepartureTime = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
};

export const useTripPlannerStore = create<TripPlannerState>((set) => ({
  tripOrigin: null,
  tripDestination: null,
  tripWaypoints: [],
  tripDeparture: defaultDepartureTime(),
  tripCustomDate: null,
  tripRouteGeojson: null,
  tripRouteDistance: 0,
  tripRouteDuration: 0,
  tripWeatherPoints: [],
  tripWeatherMsg: null,
  tripWeatherHasConcern: false,
  tripWeatherCheckpoints: 0,
  tripWeatherFetchedAt: null,
  tripConditions: [],
  tripConditionsFetchedAt: null,
  tripSaved: false,
  tripRoutePreference: null,

  setTripOrigin: (tripOrigin) => set({ tripOrigin }),
  setTripDestination: (tripDestination) => set({ tripDestination }),
  setTripWaypoints: (tripWaypoints) => set({ tripWaypoints }),
  setTripDeparture: (tripDeparture) => set({ tripDeparture }),
  setTripCustomDate: (tripCustomDate) => set({ tripCustomDate }),
  setTripRoute: (tripRouteGeojson, tripRouteDistance, tripRouteDuration) =>
    set({ tripRouteGeojson, tripRouteDistance, tripRouteDuration }),
  setTripWeather: (tripWeatherPoints, tripWeatherMsg, tripWeatherHasConcern, tripWeatherCheckpoints) =>
    set({ tripWeatherPoints, tripWeatherMsg, tripWeatherHasConcern, tripWeatherCheckpoints, tripWeatherFetchedAt: Date.now() }),
  setTripConditions: (tripConditions) =>
    set({ tripConditions, tripConditionsFetchedAt: Date.now() }),
  setTripSaved: (tripSaved) => set({ tripSaved }),
  setTripRoutePreference: (tripRoutePreference) => set({ tripRoutePreference }),
  clearTrip: () => set({
    tripOrigin: null,
    tripDestination: null,
    tripWaypoints: [],
    tripDeparture: defaultDepartureTime(),
    tripCustomDate: null,
    tripRouteGeojson: null,
    tripRouteDistance: 0,
    tripRouteDuration: 0,
    tripWeatherPoints: [],
    tripWeatherMsg: null,
    tripWeatherHasConcern: false,
    tripWeatherCheckpoints: 0,
    tripWeatherFetchedAt: null,
    tripConditions: [],
    tripConditionsFetchedAt: null,
    tripSaved: false,
    tripRoutePreference: null,
  }),
}));

// ---------------------------------------------------------------------------
// Tab reset store — signals tabs to reset to default sub-screen
// ---------------------------------------------------------------------------

interface TabResetState {
  rideReset: number;
  weatherReset: number;
  garageReset: number;
  tripReset: number;
  pendingWeatherSubTab: 'current' | 'ride-window' | null;
  pendingTripSubTab: 'trip-planner' | null;
  resetTab: (tab: 'ride' | 'weather' | 'garage' | 'trip') => void;
  setPendingWeatherSubTab: (tab: 'current' | 'ride-window' | null) => void;
  setPendingTripSubTab: (tab: 'trip-planner' | null) => void;
}

export const useTabResetStore = create<TabResetState>((set) => ({
  rideReset: 0,
  weatherReset: 0,
  garageReset: 0,
  tripReset: 0,
  pendingWeatherSubTab: null,
  pendingTripSubTab: null,
  resetTab: (tab) => set((s) => ({ [`${tab}Reset`]: s[`${tab}Reset` as keyof TabResetState] as number + 1 })),
  setPendingWeatherSubTab: (tab) => set({ pendingWeatherSubTab: tab }),
  setPendingTripSubTab: (tab) => set({ pendingTripSubTab: tab }),
}));
