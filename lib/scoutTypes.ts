import type { Bike } from './store';
import type { MaintenanceRecord } from './garage';

// ---------------------------------------------------------------------------
// Scout AI assistant — core types
// ---------------------------------------------------------------------------

export type TripStop = {
  name: string;
  lat: number;
  lng: number;
};

export type ScoutToolCall = {
  name: string;
  parameters: Record<string, unknown>;
  result?: string;
};

export type ScoutMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ScoutToolCall[];
};

export type ScoutContext = {
  bikes: Bike[];
  activeBike: Bike | null;
  currentLocation: { lat: number; lng: number; city?: string } | null;
  currentTrip: {
    origin: TripStop | null;
    destination: TripStop | null;
    waypoints: TripStop[];
    departureDate: string | null;
    departureTime: string | null;
    preference: string | null;
    routeDistance?: number;
    routeDuration?: number;
  };
  savedRoutes: {
    id: string;
    name: string;
    category: string;
    distance: number;
  }[];
  favoriteLocations: {
    id: string;
    nickname: string;
    address: string;
    isHome: boolean;
  }[];
  recentMaintenanceLogs: MaintenanceRecord[];
  serviceIntervals: unknown;
};

export type ScoutSession = {
  messages: ScoutMessage[];
  isLoading: boolean;
  error: string | null;
};
