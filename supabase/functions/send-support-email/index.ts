// Supabase Edge Function — send support email via Resend
//
// Required Supabase Secrets (set via: supabase secrets set KEY=value):
//   RESEND_API_KEY   (from resend.com)
//
// Deploy: supabase functions deploy send-support-email --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      name,
      email,
      phone,
      description,
      timestamp,
      appVersion,
      deviceInfo,
    }: {
      name: string;
      email: string;
      phone?: string;
      description: string;
      timestamp: string;
      appVersion?: string;
      deviceInfo?: string;
    } = await req.json();

    if (!name || !email || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Resend API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const htmlBody = `
<h2>New Support Request — timetomoto</h2>
<table cellpadding="8" style="border-collapse:collapse;">
  <tr><td><strong>Name</strong></td><td>${name}</td></tr>
  <tr><td><strong>Email</strong></td><td>${email}</td></tr>
  ${phone ? `<tr><td><strong>Phone</strong></td><td>${phone}</td></tr>` : ''}
  <tr><td><strong>Submitted</strong></td><td>${timestamp}</td></tr>
  <tr><td><strong>App Version</strong></td><td>${appVersion ?? 'unknown'}</td></tr>
  <tr><td><strong>Platform</strong></td><td>${deviceInfo ?? 'unknown'}</td></tr>
</table>
<hr/>
<h3>Description</h3>
<p style="white-space:pre-wrap;">${description}</p>
`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Time to Moto <support@timetomoto.com>',
        to: ['keith@timetomoto.com'],
        reply_to: email,
        subject: `[Support] ${name} — ${description.slice(0, 60)}`,
        html: htmlBody,
        text: `New support request from ${name} (${email})\n\n${description}`,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Resend error: ${error}`);
    }

    const data = await res.json();
    return new Response(
      JSON.stringify({ ok: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('send-support-email error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
