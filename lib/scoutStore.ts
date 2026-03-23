import { create } from 'zustand';
import type { ScoutMessage } from './scoutTypes';

// ---------------------------------------------------------------------------
// Scout session store — conversation state for the AI assistant
// ---------------------------------------------------------------------------

interface ScoutState {
  messages: ScoutMessage[];
  isLoading: boolean;
  error: string | null;

  addMessage: (message: ScoutMessage) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearSession: () => void;
}

export const useScoutStore = create<ScoutState>((set) => ({
  messages: [],
  isLoading: false,
  error: null,

  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  clearSession: () => set({ messages: [], isLoading: false, error: null }),
}));
