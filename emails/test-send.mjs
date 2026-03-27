#!/usr/bin/env node

// Send all 9 light-theme email templates to a test address via Resend.
//
// Usage:
//   RESEND_API_KEY=re_xxx node emails/test-send.mjs keith@timetomoto.com
//
// Each email arrives with a [TEST] prefix in the subject so they're easy to spot.
// Templates use light theme: #F4F4F4 bg, #C62828 brand red, tagline "Ride more. Worry less."

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "light-theme");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO = process.argv[2];

if (!RESEND_API_KEY) {
  console.error("Missing RESEND_API_KEY env var");
  console.error("Usage: RESEND_API_KEY=re_xxx node emails/test-send.mjs you@email.com");
  process.exit(1);
}
if (!TO) {
  console.error("Missing recipient email");
  console.error("Usage: RESEND_API_KEY=re_xxx node emails/test-send.mjs you@email.com");
  process.exit(1);
}

// ── Sample data for each template ──────────────────────────────────────────

const templates = [
  {
    file: "welcome.html",
    subject: "[TEST] Welcome to Time to Moto",
    vars: { firstName: "Keith" },
  },
  {
    file: "magic-link.html",
    subject: "[TEST] Sign In to Time to Moto",
    vars: {
      firstName: "Keith",
      magicLinkUrl: "https://timetomoto.com/auth/callback?token=test-magic-link-token-123",
    },
  },
  {
    file: "password-reset.html",
    subject: "[TEST] Reset your password — Time to Moto",
    vars: {
      firstName: "Keith",
      resetUrl: "https://timetomoto.com/auth/reset?token=test-reset-token-456",
    },
  },
  {
    file: "support-auto-reply.html",
    subject: "[TEST] We got your message — Time to Moto",
    vars: { firstName: "Keith" },
  },
  {
    file: "support-internal.html",
    subject: "[TEST] New TTM Support Request — rider@example.com",
    vars: {
      name: "Test Rider",
      email: "rider@example.com",
      phone: "(512) 555-0199",
      timestamp: "March 27, 2026 at 2:45 PM CT",
      appVersion: "1.0.0 (42)",
      deviceInfo: "iPhone 16 Pro / iOS 19.3",
      description:
        "The map layer toggle isn't cycling back to dark mode after satellite. It gets stuck on outdoors. Happens every time on my phone.",
    },
  },
  {
    file: "ride-summary.html",
    subject: "[TEST] Ride Complete — Time to Moto",
    vars: {
      firstName: "Keith",
      rideDate: "Thursday, March 27, 2026",
      duration: "1h 42m",
      distance: "87.3",
      avgSpeed: "51",
      maxSpeed: "78",
      mapImageUrl: "https://placehold.co/536x300/F9F9F9/777777?text=Ride+Route+Map",
      rideUrl: "https://timetomoto.com/rides/test-ride-123",
    },
  },
  {
    file: "crash-alert.html",
    subject: "[TEST] SAFETY ALERT — Possible Crash Detected",
    vars: {
      riderName: "Keith Halpin",
      mapsUrl: "https://maps.google.com/?q=30.2672,-97.7431",
      timestamp: "March 27, 2026 at 3:12 PM CT",
    },
  },
  {
    file: "checkin-missed.html",
    subject: "[TEST] SAFETY ALERT — Missed Check-In",
    vars: {
      riderName: "Keith Halpin",
      mapsUrl: "https://maps.google.com/?q=30.2672,-97.7431",
      checkInTime: "3:00 PM CT",
      timestamp: "March 27, 2026 at 3:15 PM CT",
    },
  },
  {
    file: "account-deleted.html",
    subject: "[TEST] Account Deleted — Time to Moto",
    vars: { firstName: "Keith" },
  },
];

// ── Send ────────────────────────────────────────────────────────────────────

function fillTemplate(html, vars) {
  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

async function sendEmail(template) {
  const raw = readFileSync(join(TEMPLATE_DIR, template.file), "utf-8");
  const html = fillTemplate(raw, template.vars);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Time to Moto <support@timetomoto.com>",
      to: [TO],
      subject: template.subject,
      html,
    }),
  });

  const data = await res.json();

  if (res.ok) {
    console.log(`  ✓ ${template.file} → ${data.id}`);
  } else {
    console.error(`  ✗ ${template.file} → ${data.message || JSON.stringify(data)}`);
  }

  return res.ok;
}

console.log(`\nSending 9 test emails to ${TO}...\n`);

let passed = 0;
for (const t of templates) {
  const ok = await sendEmail(t);
  if (ok) passed++;
  // Small delay to avoid rate limits
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\nDone: ${passed}/9 sent successfully.\n`);
process.exit(passed === 9 ? 0 : 1);
