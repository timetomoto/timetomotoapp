// Supabase Edge Function — send crash-alert SMS via Twilio
//
// Required Supabase Secrets (set via: supabase secrets set KEY=value):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER   (e.g. +15005550006)
//
// Deploy: supabase functions deploy send-crash-alert

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const {
    contactPhone,
    riderName,
    mapsUrl,
    timestamp,
    overrideBody,
  }: {
    contactPhone: string;
    riderName: string;
    mapsUrl: string;
    timestamp: string;
    overrideBody?: string;
  } = await req.json();

  const accountSid  = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken   = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber  = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    return new Response(
      JSON.stringify({ error: 'Twilio credentials not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const body = overrideBody
    ?? `TIME to MOTO: ${riderName} may have had a crash.\nLast known location: ${mapsUrl}\nTime: ${timestamp}`;

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
