import { supabase } from './supabase';
import type { TrackPoint } from './gpx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Route {
  id: string;
  user_id: string;
  name: string;
  points: TrackPoint[];
  distance_miles: number;
  elevation_gain_ft: number;
  duration_seconds: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function fetchUserRoutes(userId: string): Promise<Route[]> {
  const { data, error } = await supabase
    .from('saved_routes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as Route[];
}

export async function createRoute(
  userId: string,
  name: string,
  points: TrackPoint[],
  distanceMiles: number,
  elevationGainFt: number,
  durationSeconds: number | null,
): Promise<Route | null> {
  const { data, error } = await supabase
    .from('saved_routes')
    .insert({
      user_id: userId,
      name,
      points,
      distance_miles: distanceMiles,
      elevation_gain_ft: elevationGainFt,
      duration_seconds: durationSeconds,
    })
    .select()
    .single();
  if (error || !data) return null;
  return data as Route;
}

export async function deleteRoute(id: string): Promise<void> {
  await supabase.from('saved_routes').delete().eq('id', id);
}
