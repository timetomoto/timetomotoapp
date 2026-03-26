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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Client scoped to the caller's JWT — used only to verify identity
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      console.error('auth error:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const userId = user.id;
    console.log('Deleting account for user:', userId);

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

    // ── 2-4. Delete bike-related data (ignore errors for tables that may not exist) ──
    if (bikeIds.length > 0) {
      const bikeTables = ['documents', 'maintenance_logs', 'mod_logs'];
      for (const table of bikeTables) {
        try {
          const { error } = await admin.from(table).delete().in('bike_id', bikeIds);
          if (error) console.error(`delete ${table}:`, error.message);
        } catch (e) {
          console.error(`delete ${table} (table may not exist):`, e);
        }
      }
    }

    // ── 5-8. Delete user-level data (ignore errors for tables that may not exist) ──
    const userTables = ['saved_routes', 'favorite_locations', 'emergency_contacts', 'ride_shares'];
    for (const table of userTables) {
      try {
        const { error } = await admin.from(table).delete().eq('user_id', userId);
        if (error) console.error(`delete ${table}:`, error.message);
      } catch (e) {
        console.error(`delete ${table} (table may not exist):`, e);
      }
    }

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
