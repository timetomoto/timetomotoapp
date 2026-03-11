// ---------------------------------------------------------------------------
// Live Location Sharing — ride_shares table helpers
// ---------------------------------------------------------------------------

import { supabase } from './supabase';

export const SHARE_BASE = 'https://timetomoto.app/track';

// ---------------------------------------------------------------------------
// UUID v4 generator (no external dep)
// ---------------------------------------------------------------------------

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function shareUrl(token: string): string {
  return `${SHARE_BASE}/${token}`;
}

// ---------------------------------------------------------------------------
// DB operations
// ---------------------------------------------------------------------------

export async function startShare(
  userId: string,
  lat: number,
  lng: number,
): Promise<string> {
  const token = uuid();
  const { error } = await supabase.from('ride_shares').insert({
    user_id:      userId,
    token,
    last_lat:     lat,
    last_lng:     lng,
    last_updated: new Date().toISOString(),
    active:       true,
  });
  if (error) throw new Error(error.message);
  return token;
}

export async function updateShareLocation(
  token: string,
  lat: number,
  lng: number,
): Promise<void> {
  await supabase
    .from('ride_shares')
    .update({ last_lat: lat, last_lng: lng, last_updated: new Date().toISOString() })
    .eq('token', token)
    .eq('active', true);
}

export async function endShare(token: string): Promise<void> {
  await supabase
    .from('ride_shares')
    .update({ active: false })
    .eq('token', token);
}
