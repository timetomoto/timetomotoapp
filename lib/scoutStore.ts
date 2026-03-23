import { create } from 'zustand';
import type { ScoutMessage } from './scoutTypes';

// ---------------------------------------------------------------------------
// Scout session store — conversation state + global visibility
// ---------------------------------------------------------------------------

interface ScoutState {
  // Visibility
  isScoutOpen: boolean;
  initialMessage: string | null;
  openScout: (opts?: { initialMessage?: string }) => void;
  closeScout: () => void;

  // Route-updated callback (registered by TripPlanner)
  onRouteUpdated: (() => void) | null;
  setOnRouteUpdated: (cb: (() => void) | null) => void;

  // Conversation
  messages: ScoutMessage[];
  isLoading: boolean;
  error: string | null;

  addMessage: (message: ScoutMessage) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearSession: () => void;
}

export const useScoutStore = create<ScoutState>((set) => ({
  // Visibility
  isScoutOpen: false,
  initialMessage: null,
  openScout: (opts) => set({ isScoutOpen: true, initialMessage: opts?.initialMessage ?? null }),
  closeScout: () => set({ isScoutOpen: false, initialMessage: null }),

  // Route-updated callback
  onRouteUpdated: null,
  setOnRouteUpdated: (cb) => set({ onRouteUpdated: cb }),

  // Conversation
  messages: [],
  isLoading: false,
  error: null,

  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  clearSession: () => set({ messages: [], isLoading: false, error: null }),
}));
