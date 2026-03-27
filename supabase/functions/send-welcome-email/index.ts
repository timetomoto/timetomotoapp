// Supabase Edge Function — send welcome email via Resend
//
// Fires once after a user completes onboarding (email confirmed + onboarding done).
// The app calls this from the onboarding finish() handler.
//
// Required Supabase Secrets:
//   RESEND_API_KEY
//
// Deploy: supabase functions deploy send-welcome-email --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function welcomeHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0D0D0D; color: #FFFFFF;">

  <img src="https://timetomoto.com/logo.png" alt="Time to Moto" style="width: 160px; margin-bottom: 32px;" />

  <h1 style="color: #FFFFFF; font-size: 24px; margin-bottom: 8px;">Welcome to Time to Moto, ${firstName}.</h1>

  <p style="color: #E8E4DC; font-size: 16px; margin-bottom: 32px;">Your account is confirmed and ready to ride. Here's how to get the most out of it.</p>

  <div style="background: #1A1A1A; border: 1px solid #242424; border-radius: 8px; padding: 16px; margin-bottom: 32px;">
    <p style="color: #E8E4DC; font-size: 15px; line-height: 24px; margin: 0;">Time to Moto is currently in beta and not yet available on the App Store. If you're selected for the Break-In Crew, you'll receive a TestFlight link from Keith directly. We'll email everyone the moment the app goes live on the App Store.</p>
  </div>

  <h2 style="color: #C62828; font-size: 18px; margin-bottom: 16px;">Get set up in 2 minutes</h2>

  <table style="width: 100%; margin-bottom: 32px;">
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #242424; color: #E8E4DC; vertical-align: top;">
        <strong style="color: #FFFFFF;">🏍 Add your bike</strong><br/>
        Open the Garage tab and add your year, make, and model. Scout will use this to answer questions specific to your bike — tire pressure, service intervals, even recall lookups.
      </td>
    </tr>
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #242424; color: #E8E4DC; vertical-align: top;">
        <strong style="color: #FFFFFF;">🆘 Set up emergency contacts</strong><br/>
        Go to Settings and add at least one emergency contact. If crash detection activates during a ride, they'll get an SMS with your exact GPS location automatically.
      </td>
    </tr>
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #242424; color: #E8E4DC; vertical-align: top;">
        <strong style="color: #FFFFFF;">🤖 Talk to Scout</strong><br/>
        Tap the Scout tab and ask anything. Plan a route, check the weather along your ride, log a maintenance entry, or ask what recalls exist for your bike. Scout knows your garage and your road.
      </td>
    </tr>
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #242424; color: #E8E4DC; vertical-align: top;">
        <strong style="color: #FFFFFF;">🗺 Plan your first ride</strong><br/>
        Open the Plan tab, set your destination, and choose your route preference — Scenic, Back Roads, No Highway, or Fastest. See weather sampled along your entire route before you leave.
      </td>
    </tr>
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #242424; color: #E8E4DC; vertical-align: top;">
        <strong style="color: #FFFFFF;">📍 Share your ride live</strong><br/>
        Before you head out, start Live Share from the pre-ride checklist. It generates a link your family or riding buddy can open in any browser to follow your location in real time. No app required on their end.
      </td>
    </tr>
    <tr>
      <td style="padding: 12px 0; color: #E8E4DC; vertical-align: top;">
        <strong style="color: #FFFFFF;">📥 Import your GPX routes</strong><br/>
        Already have routes saved from other apps? Import any GPX file — full geometry preserved including off-road sections. TTM never snaps your route to roads.
      </td>
    </tr>
  </table>

  <p style="color: #E8E4DC; font-size: 16px; margin-bottom: 8px;">If you run into anything or have a question, just reply to this email. I actually read every message.</p>

  <p style="color: #E8E4DC; font-size: 16px; margin-bottom: 32px;">Ride safe.<br/><strong style="color: #FFFFFF;">— Keith</strong></p>

  <hr style="border: none; border-top: 1px solid #242424; margin-bottom: 24px;" />

  <p style="color: #999999; font-size: 12px;">Time to Moto · Lago Vista, Texas<br/><a href="https://timetomoto.com/privacy" style="color: #999999;">Privacy Policy</a> · <a href="https://timetomoto.com/terms" style="color: #999999;">Terms of Service</a></p>

</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, email, first_name }: {
      user_id: string;
      email: string;
      first_name?: string;
    } = await req.json();

    if (!user_id || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing user_id or email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Duplicate guard: check if welcome email already sent ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: profile } = await admin
      .from('profiles')
      .select('welcome_email_sent')
      .eq('id', user_id)
      .single();

    if (profile?.welcome_email_sent) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'already sent' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Send welcome email ──
    const firstName = first_name || 'rider';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Time to Moto <keith@timetomoto.com>',
        to: [email],
        reply_to: 'keith@timetomoto.com',
        subject: `Welcome to Time to Moto, ${firstName}`,
        html: welcomeHtml(firstName),
        text: `Welcome to Time to Moto, ${firstName}.\n\nYour account is confirmed and ready to ride. Here's how to get the most out of it:\n\n🏍 Add your bike — Open the Garage tab and add your year, make, and model.\n🆘 Set up emergency contacts — Go to Settings and add at least one.\n🤖 Talk to Scout — Tap the Scout tab and ask anything.\n🗺 Plan your first ride — Open the Plan tab, set your destination.\n📍 Share your ride live — Start Live Share from the pre-ride checklist.\n📥 Import your GPX routes — Import any GPX file from other apps.\n\nIf you run into anything, just reply to this email. I actually read every message.\n\nRide safe.\n— Keith`,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Resend error: ${error}`);
    }

    // ── Mark welcome email as sent ──
    await admin
      .from('profiles')
      .update({ welcome_email_sent: true })
      .eq('id', user_id);

    const data = await res.json();
    return new Response(
      JSON.stringify({ ok: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('send-welcome-email error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
