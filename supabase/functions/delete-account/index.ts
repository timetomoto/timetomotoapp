// Supabase Edge Function — permanently delete a user account and all data
//
// Security: Requires a valid JWT. Uses service role key for admin operations.
// Deploy: supabase functions deploy delete-account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Authenticate the request ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Client scoped to the caller's JWT — used only to verify identity
    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const userId = user.id;

    // Admin client with service role — used for all delete operations
    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // ── 1. Get user's bike IDs ────────────────────────────────────────────
    const { data: bikes } = await admin
      .from('bikes')
      .select('id')
      .eq('user_id', userId);

    const bikeIds = (bikes ?? []).map((b: { id: string }) => b.id);

    // ── 2-4. Delete bike-related data ─────────────────────────────────────
    if (bikeIds.length > 0) {
      const { error: e1 } = await admin
        .from('documents')
        .delete()
        .in('bike_id', bikeIds);
      if (e1) console.error('delete documents:', e1.message);

      const { error: e2 } = await admin
        .from('maintenance_logs')
        .delete()
        .in('bike_id', bikeIds);
      if (e2) console.error('delete maintenance_logs:', e2.message);

      const { error: e3 } = await admin
        .from('mod_logs')
        .delete()
        .in('bike_id', bikeIds);
      if (e3) console.error('delete mod_logs:', e3.message);
    }

    // ── 5. Delete saved routes ────────────────────────────────────────────
    const { error: e4 } = await admin
      .from('saved_routes')
      .delete()
      .eq('user_id', userId);
    if (e4) console.error('delete saved_routes:', e4.message);

    // ── 6. Delete favorite locations ──────────────────────────────────────
    const { error: e5 } = await admin
      .from('favorite_locations')
      .delete()
      .eq('user_id', userId);
    if (e5) console.error('delete favorite_locations:', e5.message);

    // ── 7. Delete emergency contacts ──────────────────────────────────────
    const { error: e6 } = await admin
      .from('emergency_contacts')
      .delete()
      .eq('user_id', userId);
    if (e6) console.error('delete emergency_contacts:', e6.message);

    // ── 8. Delete ride shares ─────────────────────────────────────────────
    const { error: e7 } = await admin
      .from('ride_shares')
      .delete()
      .eq('user_id', userId);
    if (e7) console.error('delete ride_shares:', e7.message);

    // ── 9. Delete bike photos from Storage ────────────────────────────────
    for (const bikeId of bikeIds) {
      const { data: files } = await admin.storage
        .from('bike-photos')
        .list(bikeId);
      if (files && files.length > 0) {
        const paths = files.map((f: { name: string }) => `${bikeId}/${f.name}`);
        await admin.storage.from('bike-photos').remove(paths);
      }
    }

    // ── 10. Delete bikes ──────────────────────────────────────────────────
    const { error: e8 } = await admin
      .from('bikes')
      .delete()
      .eq('user_id', userId);
    if (e8) console.error('delete bikes:', e8.message);

    // ── 11. Delete profile ────────────────────────────────────────────────
    const { error: e9 } = await admin
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (e9) console.error('delete profiles:', e9.message);

    // ── 12. Delete auth user ──────────────────────────────────────────────
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error('delete auth user:', deleteUserError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to delete account' }),
        { status: 500, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    console.error('delete-account error:', err);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: corsHeaders },
    );
  }
});
