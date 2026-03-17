// Supabase Edge Function — send support email via Resend
//
// Sends two emails:
//   1. Internal notification to keith@timetomoto.com
//   2. Auto-reply confirmation to the user
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

// ---------------------------------------------------------------------------
// Branded HTML wrapper
// ---------------------------------------------------------------------------

function brandedEmail(headline: string, body: string, ctaText?: string, ctaUrl?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#E53935;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0 0 16px 0;">${headline}</h1>
          <div style="color:#E8E4DC;font-size:15px;line-height:24px;">${body}</div>
          ${ctaText && ctaUrl ? `
          <table cellpadding="0" cellspacing="0" style="margin:28px 0 0 0;">
            <tr><td style="background-color:#E53935;border-radius:8px;">
              <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">${ctaText}</a>
            </td></tr>
          </table>` : ''}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">Questions? Hit us at <a href="mailto:support@timetomoto.com" style="color:#E53935;text-decoration:none;">support@timetomoto.com</a></p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">Time to Moto — Ride. Record. Discover.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

    // ── 1. Internal notification to keith@ ──
    const internalHtml = `
<h2 style="color:#FFFFFF;margin:0 0 16px 0;">New Support Request</h2>
<table cellpadding="8" style="border-collapse:collapse;width:100%;">
  <tr><td style="color:#999;padding:6px 12px 6px 0;vertical-align:top;">Name</td><td style="color:#E8E4DC;padding:6px 0;">${name}</td></tr>
  <tr><td style="color:#999;padding:6px 12px 6px 0;vertical-align:top;">Email</td><td style="color:#E8E4DC;padding:6px 0;"><a href="mailto:${email}" style="color:#E53935;">${email}</a></td></tr>
  ${phone ? `<tr><td style="color:#999;padding:6px 12px 6px 0;vertical-align:top;">Phone</td><td style="color:#E8E4DC;padding:6px 0;">${phone}</td></tr>` : ''}
  <tr><td style="color:#999;padding:6px 12px 6px 0;vertical-align:top;">Submitted</td><td style="color:#E8E4DC;padding:6px 0;">${new Date(timestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' })}</td></tr>
  <tr><td style="color:#999;padding:6px 12px 6px 0;vertical-align:top;">App</td><td style="color:#E8E4DC;padding:6px 0;">${appVersion ?? 'unknown'} / ${deviceInfo ?? 'unknown'}</td></tr>
</table>
<hr style="border:none;border-top:1px solid #333;margin:16px 0;"/>
<h3 style="color:#FFFFFF;margin:0 0 8px 0;">Message</h3>
<p style="color:#E8E4DC;white-space:pre-wrap;line-height:22px;">${description}</p>`;

    const internalEmail = brandedEmail('New Support Request', internalHtml);

    const internalRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Time to Moto <support@timetomoto.com>',
        to: ['keith@timetomoto.com'],
        reply_to: email,
        subject: `New TTM Support Request — ${email}`,
        html: internalEmail,
        text: `New support request from ${name} (${email})\n\n${description}`,
      }),
    });

    // ── 2. Auto-reply to user ──
    const autoReplyBody = `
<p style="margin:0 0 16px 0;">Thanks for reaching out, ${name.split(' ')[0]}.</p>
<p style="margin:0 0 16px 0;">We've received your message and will get back to you within 24 hours.</p>
<p style="margin:0;">In the meantime, ride safe.</p>`;

    const autoReplyHtml = brandedEmail("We got your message.", autoReplyBody);

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Time to Moto <support@timetomoto.com>',
        to: [email],
        subject: "We got your message — Time to Moto",
        html: autoReplyHtml,
        text: `Thanks for reaching out, ${name.split(' ')[0]}. We've received your message and will get back to you within 24 hours. In the meantime, ride safe.\n\n— Time to Moto`,
      }),
    });

    if (!internalRes.ok) {
      const error = await internalRes.text();
      throw new Error(`Resend error: ${error}`);
    }

    const data = await internalRes.json();
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
