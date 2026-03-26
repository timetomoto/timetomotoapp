// ---------------------------------------------------------------------------
// Scout tool helpers — shared utilities for tool execution
// Split from scoutTools.ts for maintainability
// ---------------------------------------------------------------------------

import { useRoutesStore } from './store';
import type { ScoutContext } from './scoutTypes';

/** Generate a v4 UUID for Supabase compatibility */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Preference alias mapping */
export const PREFERENCE_MAP: Record<string, string> = {
  scenic: 'scenic',
  backroads: 'offroad',
  no_highway: 'no_highway',
  fastest: 'fastest',
};

/** Gate for stop_ride two-step confirmation */
export let stopRideConfirmationPending = false;
export function setStopRideConfirmationPending(v: boolean) { stopRideConfirmationPending = v; }

/**
 * Find the insertion index for a waypoint between two named points.
 */
export function resolveSegmentIndex(segRef: string, ctx: ScoutContext): number {
  const lower = segRef.toLowerCase().trim();
  if (lower === 'origin' || lower === 'start') return -1;
  if (lower === 'destination' || lower === 'end') return ctx.currentTrip.waypoints.length;
  const idx = ctx.currentTrip.waypoints.findIndex(
    (w) => w.name.toLowerCase().includes(lower) || (lower.includes(w.name.toLowerCase())),
  );
  return idx >= 0 ? idx : -1;
}

/** Fuzzy match a saved route by name or category */
export function findSavedRoute(query: string) {
  const allRoutes = useRoutesStore.getState().routes;
  const q = query.toLowerCase();

  const exact = allRoutes.find((r) => r.name.toLowerCase().includes(q));
  if (exact) return exact;

  const catMatch = allRoutes.find((r) => r.category?.toLowerCase().includes(q));
  if (catMatch) return catMatch;

  const queryWords = q.split(/[\s\-_]+/).filter((w) => w.length > 2);
  if (queryWords.length === 0) return null;
  const minScore = Math.max(1, Math.ceil(queryWords.length / 2));
  let bestRoute: typeof allRoutes[0] | null = null;
  let bestScore = 0;
  for (const r of allRoutes) {
    const text = `${r.name} ${r.category ?? ''}`.toLowerCase();
    const score = queryWords.filter((w) => text.includes(w)).length;
    if (score > bestScore) { bestScore = score; bestRoute = r; }
  }
  return bestScore >= minScore ? bestRoute : null;
}

/** Format minutes-since-midnight to 12h time string */
export function fmtTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Bidirectional bike matching — matches query against nickname, model, make in either direction */
export function findBikeByName(query: string, bikes: any[]): any | undefined {
  const q = query.toLowerCase();
  return bikes.find((b) => {
    const nick = b.nickname?.toLowerCase() ?? '';
    const mdl = b.model?.toLowerCase() ?? '';
    const mk = b.make?.toLowerCase() ?? '';
    return nick.includes(q) || mdl.includes(q) || mk.includes(q) ||
      q.includes(nick) || q.includes(mdl) || q.includes(mk);
  });
}
