// Supabase Edge Function — send crash-alert SMS + email
//
// Sends both a Twilio SMS and a Resend email to the emergency contact.
//
// Required Supabase Secrets (set via: supabase secrets set KEY=value):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
//   RESEND_API_KEY
//
// Deploy: supabase functions deploy send-crash-alert

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

function crashAlertHtml(riderName: string, mapsUrl: string, timestamp: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#F4F4F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F4;">
    <tr><td align="center" style="padding:24px 0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:#C62828;padding:20px 32px;border-radius:8px 8px 0 0;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;">TIME TO MOTO</span>
          <span style="color:#FFFFFF;font-size:13px;font-weight:700;float:right;padding-top:3px;">SAFETY ALERT</span>
        </td></tr>
        <tr><td style="background-color:#FFFFFF;padding:40px 32px;">
          <h1 style="color:#C62828;font-size:24px;font-weight:700;margin:0 0 16px 0;">Possible Crash Detected</h1>
          <div style="color:#222222;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;"><strong style="color:#111111;">${riderName}</strong> may have been in a crash. Their phone detected a sudden impact and they have not responded.</p>
            <table cellpadding="8" style="border-collapse:collapse;width:100%;margin:0 0 16px 0;">
              <tr>
                <td style="color:#777777;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Time</td>
                <td style="color:#222222;padding:6px 0;font-size:14px;">${timestamp}</td>
              </tr>
            </table>
            <p style="margin:0 0 8px 0;">Their last known location is below. Please try to contact them.</p>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:20px 0 0 0;">
            <tr><td style="background-color:#C62828;border-radius:8px;">
              <a href="${mapsUrl}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;">VIEW LOCATION ON MAP</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background-color:#F4F4F4;padding:24px 32px;border-top:1px solid #E0E0E0;">
          <p style="color:#777777;font-size:12px;margin:0;">This is an automated safety alert from Time to Moto.</p>
          <p style="color:#777777;font-size:11px;margin:8px 0 0 0;">If this was sent in error, ${riderName} can dismiss it from the app.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  const {
    contactPhone,
    contactEmail,
    riderName,
    mapsUrl,
    timestamp,
    overrideBody,
  }: {
    contactPhone: string;
    contactEmail?: string;
    riderName: string;
    mapsUrl: string;
    timestamp: string;
    overrideBody?: string;
  } = await req.json();

  const accountSid  = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken   = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber  = Deno.env.get('TWILIO_PHONE_NUMBER');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  if (!accountSid || !authToken || !fromNumber) {
    return new Response(
      JSON.stringify({ error: 'Twilio credentials not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ── 1. SMS via Twilio ──
  const smsBody = overrideBody
    ?? `TIME to MOTO: ${riderName} may have had a crash.\nLast known location: ${mapsUrl}\nTime: ${timestamp}`;

  const smsRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: contactPhone, From: fromNumber, Body: smsBody }),
    },
  );

  const smsData = await smsRes.json();

  // ── 2. Email via Resend (if contact email provided) ──
  let emailId: string | undefined;
  if (resendApiKey && contactEmail) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Time to Moto <support@timetomoto.com>',
          to: [contactEmail],
          subject: `SAFETY ALERT — ${riderName} may have crashed`,
          html: crashAlertHtml(riderName, mapsUrl, timestamp),
          text: `TIME TO MOTO SAFETY ALERT: ${riderName} may have been in a crash. Their phone detected a sudden impact and they have not responded.\n\nTime: ${timestamp}\nLast known location: ${mapsUrl}\n\nPlease try to contact them.`,
        }),
      });
      const emailData = await emailRes.json();
      emailId = emailData.id;
    } catch (emailErr) {
      console.error('crash alert email error:', emailErr);
    }
  }

  return new Response(
    JSON.stringify({ ok: smsRes.ok, sid: smsData.sid, emailId, error: smsData.message }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
