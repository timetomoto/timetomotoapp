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
// Light-theme email templates (from emails/light-theme/)
// ---------------------------------------------------------------------------

function internalNotificationHtml(vars: {
  name: string;
  email: string;
  phone?: string;
  timestamp: string;
  appVersion: string;
  deviceInfo: string;
  description: string;
}): string {
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
          <h1 style="color:#111111;font-size:24px;font-weight:700;margin:0 0 16px 0;">New Support Request</h1>
          <table cellpadding="8" style="border-collapse:collapse;width:100%;">
            <tr>
              <td style="color:#777777;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Name</td>
              <td style="color:#222222;padding:6px 0;font-size:14px;">${vars.name}</td>
            </tr>
            <tr>
              <td style="color:#777777;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Email</td>
              <td style="color:#222222;padding:6px 0;font-size:14px;"><a href="mailto:${vars.email}" style="color:#C62828;text-decoration:none;">${vars.email}</a></td>
            </tr>
            <tr>
              <td style="color:#777777;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Phone</td>
              <td style="color:#222222;padding:6px 0;font-size:14px;">${vars.phone || '—'}</td>
            </tr>
            <tr>
              <td style="color:#777777;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Submitted</td>
              <td style="color:#222222;padding:6px 0;font-size:14px;">${vars.timestamp}</td>
            </tr>
            <tr>
              <td style="color:#777777;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">App</td>
              <td style="color:#222222;padding:6px 0;font-size:14px;">${vars.appVersion} / ${vars.deviceInfo}</td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #E0E0E0;margin:16px 0;"/>
          <h2 style="color:#111111;font-size:18px;font-weight:700;margin:0 0 8px 0;">Message</h2>
          <p style="color:#222222;font-size:15px;white-space:pre-wrap;line-height:22px;margin:0;">${vars.description}</p>
        </td></tr>
        <tr><td style="background-color:#F4F4F4;padding:24px 32px;border-top:1px solid #E0E0E0;">
          <p style="color:#777777;font-size:12px;margin:0;">Reply directly to the sender at <a href="mailto:${vars.email}" style="color:#C62828;text-decoration:none;">${vars.email}</a></p>
          <p style="color:#777777;font-size:11px;margin:8px 0 0 0;">Time to Moto — Internal Notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function autoReplyHtml(firstName: string): string {
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
          <h1 style="color:#111111;font-size:24px;font-weight:700;margin:0 0 16px 0;">We got your message.</h1>
          <div style="color:#222222;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;">Thanks for reaching out, ${firstName}.</p>
            <p style="margin:0 0 16px 0;">We've received your message and will get back to you within 24 hours.</p>
            <p style="margin:0;">In the meantime, ride safe.</p>
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

    const formattedTimestamp = new Date(timestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' });

    // ── 1. Internal notification to keith@ ──
    const internalEmail = internalNotificationHtml({
      name,
      email,
      phone,
      timestamp: formattedTimestamp,
      appVersion: appVersion ?? 'unknown',
      deviceInfo: deviceInfo ?? 'unknown',
      description,
    });

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
    const firstName = name.split(' ')[0];
    const replyEmail = autoReplyHtml(firstName);

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Time to Moto <support@timetomoto.com>',
        to: [email],
        subject: "We got your message — Time to Moto",
        html: replyEmail,
        text: `Thanks for reaching out, ${firstName}. We've received your message and will get back to you within 24 hours. In the meantime, ride safe.\n\n— Time to Moto`,
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
