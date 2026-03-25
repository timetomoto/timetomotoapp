// Supabase Edge Function — send check-in alert SMS via Twilio
//
// Same Twilio secrets as send-crash-alert:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
//
// Deploy: supabase functions deploy send-checkin-alert

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const {
    contactPhone,
    riderName,
    mapsUrl,
    timestamp,
    checkInTime,
  }: {
    contactPhone: string;
    riderName: string;
    mapsUrl: string;
    timestamp: string;
    checkInTime?: string;
  } = await req.json();

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    return new Response(
      JSON.stringify({ error: 'Twilio credentials not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const body =
    `TIME to MOTO: ${riderName} has not checked in on Time to Moto.\n` +
    `Last known location: ${mapsUrl}\n` +
    (checkInTime ? `Check-in was due at: ${checkInTime}\n` : '') +
    `Time: ${timestamp}\n` +
    `This is an automated safety alert.`;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: contactPhone, From: fromNumber, Body: body }),
    },
  );

  const data = await res.json();
  return new Response(
    JSON.stringify({ ok: res.ok, sid: data.sid, error: data.message }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
