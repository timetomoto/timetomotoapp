import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { RideWindowResult } from './rideWindow';
import type { TrackPoint } from './gpx';
import type { Route } from './routes';

// ---------------------------------------------------------------------------
// Safety / crash-detection store
// ---------------------------------------------------------------------------

export interface EmergencyContact {
  name: string;
  phone: string;
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
  recordedPoints: TrackPoint[];

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
  addRecordedPoint: (p: TrackPoint) => void;
  clearRecordedPoints: () => void;
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
  recordedPoints: [],

  setMonitoring:    (isMonitoring) => set({ isMonitoring }),
  setRecording:     (isRecording)  => set({ isRecording }),
  setCrashDetected: (crashDetected) => set({ crashDetected }),
  updateLocation:   (lat, lng) =>
    set({ lastKnownLocation: { lat, lng, timestamp: Date.now() } }),
  setContacts:    (emergencyContacts) => set({ emergencyContacts }),
  setShareToken:  (shareToken)  => set({ shareToken }),
  setShareActive: (shareActive) => set({ shareActive }),

  setCheckIn: (deadline, notifId) =>
    set({ checkInDeadline: deadline, checkInActive: true, checkInNotifId: notifId }),

  clearCheckIn: () =>
    set({ checkInDeadline: null, checkInActive: false, checkInNotifId: null }),

  addRecordedPoint: (p) =>
    set((s) => ({ recordedPoints: [...s.recordedPoints, p] })),

  clearRecordedPoints: () => set({ recordedPoints: [] }),

  loadContacts: async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('contacts')
      .eq('id', userId)
      .single();
    if (data?.contacts) {
      set({ emergencyContacts: data.contacts as EmergencyContact[] });
    }
  },

  saveContacts: async (userId, contacts) => {
    set({ emergencyContacts: contacts });
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
  setSession: (session: Session | null) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,

  setSession: (session) =>
    set({ session, user: session?.user ?? null, loading: false }),

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
// Garage store
// ---------------------------------------------------------------------------

export interface Bike {
  id: string;
  user_id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  odometer: number | null;
  tank_gallons: number | null;
  avg_mpg: number | null;
  created_at: string;
}

interface GarageState {
  bikes: Bike[];
  selectedBikeId: string | null;
  loading: boolean;
  fetchBikes: (userId: string) => Promise<void>;
  addBike: (bike: Bike) => void;
  selectBike: (id: string) => void;
}

export const useGarageStore = create<GarageState>((set) => ({
  bikes: [],
  selectedBikeId: null,
  loading: false,

  fetchBikes: async (userId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('bikes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      set({ bikes: data as Bike[], selectedBikeId: data[0]?.id ?? null });
    }
    set({ loading: false });
  },

  addBike: (bike) =>
    set((s) => ({ bikes: [bike, ...s.bikes], selectedBikeId: bike.id })),

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
  setRoutes: (routes: Route[]) => void;
  setLoading: (v: boolean) => void;
  addRoute: (r: Route) => void;
  removeRoute: (id: string) => void;
}

export const useRoutesStore = create<RoutesState>((set) => ({
  routes: [],
  loading: false,
  setRoutes:  (routes)  => set({ routes }),
  setLoading: (loading) => set({ loading }),
  addRoute:   (r)       => set((s) => ({ routes: [r, ...s.routes] })),
  removeRoute: (id)     => set((s) => ({ routes: s.routes.filter((r) => r.id !== id) })),
}));

// ---------------------------------------------------------------------------
// App store (non-auth global state)
// ---------------------------------------------------------------------------

interface AppState {
  // extend as features are added
}

export const useAppStore = create<AppState>(() => ({}));
