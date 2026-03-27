// Supabase Edge Function — permanently delete a user account and all data
//
// Security: Requires a valid JWT. Uses service role key for admin operations.
// Sends a confirmation email to the user after deletion via Resend.
// Deploy: supabase functions deploy delete-account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function accountDeletedHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#F4F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F4;">
    <tr><td align="center" style="padding:24px 0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#C62828;padding:20px 32px;border-radius:8px 8px 0 0;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;">TIME TO MOTO</span>
        </td></tr>
        <tr><td style="background-color:#FFFFFF;padding:40px 32px;">
          <h1 style="color:#111111;font-size:24px;font-weight:700;margin:0 0 16px 0;">Account Deleted</h1>
          <div style="color:#222222;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;">Hey ${firstName},</p>
            <p style="margin:0 0 16px 0;">Your Time to Moto account and all associated data have been permanently deleted. This includes your profile, bikes, ride history, and saved routes.</p>
            <p style="margin:0 0 16px 0;">This action cannot be undone. If you'd like to use Time to Moto again in the future, you're welcome to create a new account.</p>
            <p style="margin:0;">Thanks for riding with us.</p>
          </div>
        </td></tr>
        <tr><td style="background-color:#F4F4F4;padding:24px 32px;border-top:1px solid #E0E0E0;">
          <p style="color:#777777;font-size:12px;margin:0;">Questions? Hit us at <a href="mailto:keith@timetomoto.com" style="color:#C62828;text-decoration:none;">keith@timetomoto.com</a></p>
          <p style="color:#777777;font-size:11px;margin:8px 0 0 0;">Time to Moto — Ride more. Worry less.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

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
    const userEmail = user.email;
    const firstName = user.user_metadata?.first_name || user.user_metadata?.name?.split(' ')[0] || 'Rider';
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

    // ── 13. Send deletion confirmation email ──────────────────────────────
    if (resendApiKey && userEmail) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Time to Moto <support@timetomoto.com>',
            to: [userEmail],
            subject: 'Your account has been deleted — Time to Moto',
            html: accountDeletedHtml(firstName),
            text: `Hey ${firstName}, your Time to Moto account and all associated data have been permanently deleted. This includes your profile, bikes, ride history, and saved routes. This action cannot be undone. Thanks for riding with us.\n\n— Time to Moto`,
          }),
        });
      } catch (emailErr) {
        // Don't fail the deletion if email fails
        console.error('deletion confirmation email error:', emailErr);
      }
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
