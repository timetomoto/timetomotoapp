import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NavMode =
  | 'idle'
  | 'preview'
  | 'navigating'
  | 'paused'
  | 'off_route'
  | 'recalculating'
  | 'completed';

export type RoutePreference = 'fastest' | 'scenic' | 'no_highway' | 'offroad';

export interface NavDestination {
  name: string;
  lat: number;
  lng: number;
}

export interface NavStep {
  type:
    | 'turn_left'
    | 'turn_right'
    | 'continue'
    | 'merge'
    | 'exit_highway'
    | 'roundabout'
    | 'arrive'
    | 'depart'
    | 'fork'
    | 'off_ramp'
    | 'on_ramp'
    | 'end_of_road';
  road: string;
  distanceMiles: number;
  instruction: string;
  maneuverLocation?: [number, number]; // [lng, lat]
}

export interface NavRoute {
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  steps: NavStep[];
  distanceMiles: number;
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface NavigationState {
  mode: NavMode;
  destination: NavDestination | null;
  activeRoute: NavRoute | null;
  alternateRoutes: NavRoute[];
  currentStepIndex: number;
  remainingDistanceMiles: number;
  eta: Date | null;
  routePreference: RoutePreference;
  speedMph: number;
  headingDeg: number;
  isOffRoute: boolean;

  // Setters
  setMode: (mode: NavMode) => void;
  setDestination: (dest: NavDestination | null) => void;
  setActiveRoute: (route: NavRoute | null) => void;
  setAlternateRoutes: (routes: NavRoute[]) => void;
  setCurrentStepIndex: (idx: number) => void;
  setRemainingDistance: (miles: number) => void;
  setEta: (eta: Date | null) => void;
  setRoutePreference: (pref: RoutePreference) => void;
  setSpeed: (mph: number) => void;
  setHeading: (deg: number) => void;
  setIsOffRoute: (v: boolean) => void;
  resetNavigation: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useNavigationStore = create<NavigationState>((set) => ({
  mode: 'idle',
  destination: null,
  activeRoute: null,
  alternateRoutes: [],
  currentStepIndex: 0,
  remainingDistanceMiles: 0,
  eta: null,
  routePreference: 'fastest',
  speedMph: 0,
  headingDeg: 0,
  isOffRoute: false,

  setMode: (mode) => set({ mode }),
  setDestination: (destination) => set({ destination }),
  setActiveRoute: (activeRoute) => set({ activeRoute }),
  setAlternateRoutes: (alternateRoutes) => set({ alternateRoutes }),
  setCurrentStepIndex: (currentStepIndex) => set({ currentStepIndex }),
  setRemainingDistance: (remainingDistanceMiles) => set({ remainingDistanceMiles }),
  setEta: (eta) => set({ eta }),
  setRoutePreference: (routePreference) => set({ routePreference }),
  setSpeed: (speedMph) => set({ speedMph }),
  setHeading: (headingDeg) => set({ headingDeg }),
  setIsOffRoute: (isOffRoute) => set({ isOffRoute }),

  resetNavigation: () =>
    set({
      mode: 'idle',
      destination: null,
      activeRoute: null,
      alternateRoutes: [],
      currentStepIndex: 0,
      remainingDistanceMiles: 0,
      eta: null,
      isOffRoute: false,
    }),
}));
