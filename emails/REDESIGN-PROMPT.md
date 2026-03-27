Redesign all transactional email templates for the Time to Moto motorcycle app (timetomoto.com). There are three groups of templates that need different treatment. Read all instructions before starting.

---

## RULES — READ BEFORE STARTING

1. **DO NOT change any text content, copy, or wording.** Every word, sentence, heading, and list item must remain exactly as-is.
2. **DO NOT change any {{variable}} placeholders.** They must appear exactly as written.
3. **DO NOT invent letter-spacing values.** Visit https://timetomoto.com first. Inspect the logo, headings, body text, and buttons. Use the exact same letter-spacing the website uses for each element — no more, no less.
4. **Use the LIGHT THEME color palette below.** These are the exact CSS custom properties from the timetomoto.com website.
5. **Visit https://timetomoto.com** to see the real website design. Match its visual style: typography hierarchy, spacing rhythm, button style, header/footer treatment, and overall feel. The emails should look like they came from that website.
6. **Table-based layouts only** — these are HTML emails, not web pages. No CSS classes, no media queries, no external stylesheets. Inline styles only.
7. **Font stack:** -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
8. **Max width:** 600px, centered

---

## LIGHT THEME COLOR PALETTE

These are the exact tokens from the timetomoto.com light theme CSS custom properties:

```
--bg:               #F4F4F4    (outer/body background)
--bg-panel:         #FFFFFF    (content panel background)
--bg-card:          #FFFFFF    (card background)
--border:           #E0E0E0    (borders and dividers)
--text-primary:     #111111    (headlines, strong text)
--text-secondary:   #222222    (body text)
--text-muted:       #777777    (labels, captions, footer text)
--input-bg:         #F9F9F9    (stat cells, input backgrounds)
--input-border:     #DDDDDD    (input borders)
--card-divider:     #E0E0E0    (dividers inside cards)
```

Constant brand colors (same across light and dark themes):
```
--red:              #C62828    (primary brand — header bar, buttons, links)
--green:            #2E7D32
--warning:          #FF9800
```

Use these mappings:
- **Body/outer background:** #F4F4F4
- **Header bar:** #C62828 with white text
- **Content area:** #FFFFFF
- **Card/stat cell backgrounds:** #F9F9F9
- **Headline text:** #111111
- **Body text:** #222222
- **Muted/label text:** #777777
- **Borders and dividers:** #E0E0E0
- **Links:** #C62828
- **CTA buttons:** #C62828 background, #FFFFFF text, border-radius 8px
- **Footer background:** #F4F4F4
- **Footer text:** #777777

---

## WHAT YOU NEED TO DELIVER

There are **3 groups**. Each group has a different destination. Label your output clearly so I know which HTML goes where.

### GROUP A — App Email Templates (9 templates)
**Destination:** I will hand these back to a Claude Code terminal to save as files in the app repo.
**Format:** Return each as a complete, standalone HTML file, clearly labeled with the filename.
**What to do:** Restyle from dark theme to light theme matching timetomoto.com.

### GROUP B — Website Edge Function Emails (2 templates)
**Destination:** I will hand these back to a Claude Code terminal working on the timetomoto-web repo to replace the plain-text emails with branded HTML.
**Format:** Return each as a complete, standalone HTML file, clearly labeled with the function name.
**What to do:** These are currently plain text. Create branded HTML templates matching the same visual style as Group A. Keep the exact same text content.

### GROUP C — Supabase Auth Emails (2 templates)
**Destination:** I will paste these directly into the Supabase dashboard under Authentication → Email Templates.
**Format:** Return each as complete HTML. Note that Supabase Auth uses these specific variables: `{{ .ConfirmationURL }}` and `{{ .SiteURL }}` — use those exact Supabase variable names.
**What to do:** Create branded HTML templates matching the same visual style as Group A.

---

## GROUP A — APP EMAIL TEMPLATES

### A1. welcome.html
Sent after new user sign-up. Variables: {{firstName}}

```html
<!-- TIME TO MOTO — Welcome Email -->
<!-- Sent after new user sign-up -->
<!-- Variables: {{firstName}} -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#D32F2F;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0 0 16px 0;">Welcome to Time to Moto</h1>
          <div style="color:#E8E4DC;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;">Hey {{firstName}},</p>
            <p style="margin:0 0 16px 0;">You're in. Time to Moto is built for riders who want to track rides, manage their garage, and stay connected on the road.</p>
            <p style="margin:0 0 16px 0;">Here's what you can do right now:</p>
            <ul style="color:#E8E4DC;padding-left:20px;margin:0 0 16px 0;">
              <li style="margin-bottom:8px;">Add your bikes to the Garage</li>
              <li style="margin-bottom:8px;">Record your first ride</li>
              <li style="margin-bottom:8px;">Set up an emergency contact</li>
              <li style="margin-bottom:8px;">Check weather before you head out</li>
            </ul>
            <p style="margin:0;">Ride safe.</p>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:28px 0 0 0;">
            <tr><td style="background-color:#D32F2F;border-radius:8px;">
              <a href="https://timetomoto.com" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">OPEN THE APP</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">Questions? Hit us at <a href="mailto:support@timetomoto.com" style="color:#D32F2F;text-decoration:none;">support@timetomoto.com</a></p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">Time to Moto — Ride. Record. Discover.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

### A2. magic-link.html
Passwordless login / email verification. Variables: {{firstName}}, {{magicLinkUrl}}

```html
<!-- TIME TO MOTO — Magic Link / Email Verification -->
<!-- Sent for passwordless login or email verification -->
<!-- Variables: {{firstName}}, {{magicLinkUrl}} -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#D32F2F;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0 0 16px 0;">Sign In to Time to Moto</h1>
          <div style="color:#E8E4DC;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;">Hey {{firstName}},</p>
            <p style="margin:0 0 16px 0;">Tap the button below to sign in. This link expires in 10 minutes.</p>
            <p style="margin:0;">If you didn't request this, you can safely ignore this email.</p>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:28px 0 0 0;">
            <tr><td style="background-color:#D32F2F;border-radius:8px;">
              <a href="{{magicLinkUrl}}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">SIGN IN</a>
            </td></tr>
          </table>
          <p style="color:#666666;font-size:13px;margin:20px 0 0 0;">Or copy this link:<br/>
            <a href="{{magicLinkUrl}}" style="color:#D32F2F;text-decoration:none;word-break:break-all;">{{magicLinkUrl}}</a>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">Questions? Hit us at <a href="mailto:support@timetomoto.com" style="color:#D32F2F;text-decoration:none;">support@timetomoto.com</a></p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">Time to Moto — Ride. Record. Discover.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

### A3. password-reset.html
Password reset. Variables: {{firstName}}, {{resetUrl}}

```html
<!-- TIME TO MOTO — Password Reset -->
<!-- Sent when user requests a password reset -->
<!-- Variables: {{firstName}}, {{resetUrl}} -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#D32F2F;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0 0 16px 0;">Reset Your Password</h1>
          <div style="color:#E8E4DC;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;">Hey {{firstName}},</p>
            <p style="margin:0 0 16px 0;">We received a request to reset your password. Tap the button below to choose a new one.</p>
            <p style="margin:0;">This link expires in 60 minutes. If you didn't request this, you can safely ignore this email.</p>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:28px 0 0 0;">
            <tr><td style="background-color:#D32F2F;border-radius:8px;">
              <a href="{{resetUrl}}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">RESET PASSWORD</a>
            </td></tr>
          </table>
          <p style="color:#666666;font-size:13px;margin:20px 0 0 0;">Or copy this link:<br/>
            <a href="{{resetUrl}}" style="color:#D32F2F;text-decoration:none;word-break:break-all;">{{resetUrl}}</a>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">Questions? Hit us at <a href="mailto:support@timetomoto.com" style="color:#D32F2F;text-decoration:none;">support@timetomoto.com</a></p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">Time to Moto — Ride. Record. Discover.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

### A4. support-auto-reply.html
Auto-reply to user after support request. Variables: {{firstName}}

```html
<!-- TIME TO MOTO — Support Auto-Reply -->
<!-- Sent to user after they submit a support request -->
<!-- Variables: {{firstName}} -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#D32F2F;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0 0 16px 0;">We got your message.</h1>
          <div style="color:#E8E4DC;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;">Thanks for reaching out, {{firstName}}.</p>
            <p style="margin:0 0 16px 0;">We've received your message and will get back to you within 24 hours.</p>
            <p style="margin:0;">In the meantime, ride safe.</p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">Questions? Hit us at <a href="mailto:support@timetomoto.com" style="color:#D32F2F;text-decoration:none;">support@timetomoto.com</a></p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">Time to Moto — Ride. Record. Discover.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

### A5. support-internal.html
Internal notification to keith@timetomoto.com. Variables: {{name}}, {{email}}, {{phone}}, {{timestamp}}, {{appVersion}}, {{deviceInfo}}, {{description}}

```html
<!-- TIME TO MOTO — Internal Support Notification -->
<!-- Sent to keith@timetomoto.com when a support request comes in -->
<!-- Variables: {{name}}, {{email}}, {{phone}}, {{timestamp}}, {{appVersion}}, {{deviceInfo}}, {{description}} -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#D32F2F;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0 0 16px 0;">New Support Request</h1>
          <table cellpadding="8" style="border-collapse:collapse;width:100%;">
            <tr>
              <td style="color:#999999;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Name</td>
              <td style="color:#E8E4DC;padding:6px 0;font-size:14px;">{{name}}</td>
            </tr>
            <tr>
              <td style="color:#999999;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Email</td>
              <td style="color:#E8E4DC;padding:6px 0;font-size:14px;"><a href="mailto:{{email}}" style="color:#D32F2F;text-decoration:none;">{{email}}</a></td>
            </tr>
            <tr>
              <td style="color:#999999;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Phone</td>
              <td style="color:#E8E4DC;padding:6px 0;font-size:14px;">{{phone}}</td>
            </tr>
            <tr>
              <td style="color:#999999;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Submitted</td>
              <td style="color:#E8E4DC;padding:6px 0;font-size:14px;">{{timestamp}}</td>
            </tr>
            <tr>
              <td style="color:#999999;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">App</td>
              <td style="color:#E8E4DC;padding:6px 0;font-size:14px;">{{appVersion}} / {{deviceInfo}}</td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #242424;margin:16px 0;"/>
          <h2 style="color:#FFFFFF;font-size:18px;font-weight:700;margin:0 0 8px 0;">Message</h2>
          <p style="color:#E8E4DC;font-size:15px;white-space:pre-wrap;line-height:22px;margin:0;">{{description}}</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">Reply directly to the sender at <a href="mailto:{{email}}" style="color:#D32F2F;text-decoration:none;">{{email}}</a></p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">Time to Moto — Internal Notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

### A6. ride-summary.html
Post-ride email recap. Variables: {{firstName}}, {{rideDate}}, {{duration}}, {{distance}}, {{avgSpeed}}, {{maxSpeed}}, {{mapImageUrl}}, {{rideUrl}}

```html
<!-- TIME TO MOTO — Ride Summary -->
<!-- Sent after a ride is completed (optional, user-enabled) -->
<!-- Variables: {{firstName}}, {{rideDate}}, {{duration}}, {{distance}}, {{avgSpeed}}, {{maxSpeed}}, {{mapImageUrl}}, {{rideUrl}} -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#D32F2F;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0 0 8px 0;">Ride Complete</h1>
          <p style="color:#999999;font-size:13px;margin:0 0 24px 0;">{{rideDate}}</p>

          <!-- Map Image -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr><td style="background-color:#1A1A1A;border-radius:8px;overflow:hidden;">
              <img src="{{mapImageUrl}}" alt="Ride route" width="536" style="display:block;width:100%;height:auto;border-radius:8px;"/>
            </td></tr>
          </table>

          <!-- Stats Grid -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr>
              <td width="50%" style="padding:16px;background-color:#1A1A1A;border-radius:8px 0 0 0;border-bottom:1px solid #242424;border-right:1px solid #242424;">
                <p style="color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Distance</p>
                <p style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0;">{{distance}}<span style="color:#999999;font-size:13px;font-weight:400;"> mi</span></p>
              </td>
              <td width="50%" style="padding:16px;background-color:#1A1A1A;border-radius:0 8px 0 0;border-bottom:1px solid #242424;">
                <p style="color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Duration</p>
                <p style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0;">{{duration}}</p>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding:16px;background-color:#1A1A1A;border-radius:0 0 0 8px;border-right:1px solid #242424;">
                <p style="color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Avg Speed</p>
                <p style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0;">{{avgSpeed}}<span style="color:#999999;font-size:13px;font-weight:400;"> mph</span></p>
              </td>
              <td width="50%" style="padding:16px;background-color:#1A1A1A;border-radius:0 0 8px 0;">
                <p style="color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Max Speed</p>
                <p style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0;">{{maxSpeed}}<span style="color:#999999;font-size:13px;font-weight:400;"> mph</span></p>
              </td>
            </tr>
          </table>

          <table cellpadding="0" cellspacing="0" style="margin:4px 0 0 0;">
            <tr><td style="background-color:#D32F2F;border-radius:8px;">
              <a href="{{rideUrl}}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">VIEW FULL RIDE</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">Questions? Hit us at <a href="mailto:support@timetomoto.com" style="color:#D32F2F;text-decoration:none;">support@timetomoto.com</a></p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">Time to Moto — Ride. Record. Discover.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

### A7. crash-alert.html
Emergency contact crash detection alert. Variables: {{riderName}}, {{mapsUrl}}, {{timestamp}}

```html
<!-- TIME TO MOTO — Crash Alert (Email version) -->
<!-- Sent to emergency contact when crash is detected -->
<!-- Variables: {{riderName}}, {{mapsUrl}}, {{timestamp}} -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header — urgent red -->
        <tr><td style="background-color:#D32F2F;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
          <span style="color:#FFFFFF;font-size:13px;font-weight:700;float:right;padding-top:3px;letter-spacing:1px;">SAFETY ALERT</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#D32F2F;font-size:24px;font-weight:700;margin:0 0 16px 0;">Possible Crash Detected</h1>
          <div style="color:#E8E4DC;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;"><strong style="color:#FFFFFF;">{{riderName}}</strong> may have been in a crash. Their phone detected a sudden impact and they have not responded.</p>
            <table cellpadding="8" style="border-collapse:collapse;width:100%;margin:0 0 16px 0;">
              <tr>
                <td style="color:#999999;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Time</td>
                <td style="color:#E8E4DC;padding:6px 0;font-size:14px;">{{timestamp}}</td>
              </tr>
            </table>
            <p style="margin:0 0 8px 0;">Their last known location is below. Please try to contact them.</p>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:20px 0 0 0;">
            <tr><td style="background-color:#D32F2F;border-radius:8px;">
              <a href="{{mapsUrl}}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">VIEW LOCATION ON MAP</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">This is an automated safety alert from Time to Moto.</p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">If this was sent in error, {{riderName}} can dismiss it from the app.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

### A8. checkin-missed.html
Emergency contact missed check-in. Variables: {{riderName}}, {{mapsUrl}}, {{checkInTime}}, {{timestamp}}

```html
<!-- TIME TO MOTO — Missed Check-In Alert (Email version) -->
<!-- Sent to emergency contact when rider misses a check-in -->
<!-- Variables: {{riderName}}, {{mapsUrl}}, {{checkInTime}}, {{timestamp}} -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#D32F2F;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
          <span style="color:#FFFFFF;font-size:13px;font-weight:700;float:right;padding-top:3px;letter-spacing:1px;">SAFETY ALERT</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#D32F2F;font-size:24px;font-weight:700;margin:0 0 16px 0;">Missed Check-In</h1>
          <div style="color:#E8E4DC;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;"><strong style="color:#FFFFFF;">{{riderName}}</strong> has not checked in on Time to Moto.</p>
            <table cellpadding="8" style="border-collapse:collapse;width:100%;margin:0 0 16px 0;">
              <tr>
                <td style="color:#999999;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Check-in was due</td>
                <td style="color:#E8E4DC;padding:6px 0;font-size:14px;">{{checkInTime}}</td>
              </tr>
              <tr>
                <td style="color:#999999;padding:6px 12px 6px 0;vertical-align:top;font-size:14px;">Alert sent</td>
                <td style="color:#E8E4DC;padding:6px 0;font-size:14px;">{{timestamp}}</td>
              </tr>
            </table>
            <p style="margin:0;">Their last known location is below. Please try to reach them.</p>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin:20px 0 0 0;">
            <tr><td style="background-color:#D32F2F;border-radius:8px;">
              <a href="{{mapsUrl}}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">VIEW LOCATION ON MAP</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">This is an automated safety alert from Time to Moto.</p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">If this was sent in error, {{riderName}} can dismiss it from the app.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

### A9. account-deleted.html
Account deletion confirmation. Variables: {{firstName}}

```html
<!-- TIME TO MOTO — Account Deletion Confirmation -->
<!-- Sent after account is permanently deleted -->
<!-- Variables: {{firstName}} -->
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0D0D;">
    <tr><td align="center" style="padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background-color:#D32F2F;padding:20px 32px;">
          <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:2px;">TIME TO MOTO</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background-color:#141414;padding:40px 32px;">
          <h1 style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0 0 16px 0;">Account Deleted</h1>
          <div style="color:#E8E4DC;font-size:15px;line-height:24px;">
            <p style="margin:0 0 16px 0;">Hey {{firstName}},</p>
            <p style="margin:0 0 16px 0;">Your Time to Moto account and all associated data have been permanently deleted. This includes your profile, bikes, ride history, and saved routes.</p>
            <p style="margin:0 0 16px 0;">This action cannot be undone. If you'd like to use Time to Moto again in the future, you're welcome to create a new account.</p>
            <p style="margin:0;">Thanks for riding with us.</p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#0D0D0D;padding:24px 32px;border-top:1px solid #242424;">
          <p style="color:#999999;font-size:12px;margin:0;">Questions? Hit us at <a href="mailto:support@timetomoto.com" style="color:#D32F2F;text-decoration:none;">support@timetomoto.com</a></p>
          <p style="color:#666666;font-size:11px;margin:8px 0 0 0;">Time to Moto — Ride. Record. Discover.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## GROUP B — WEBSITE EDGE FUNCTION EMAILS

These currently send plain text via Resend. Create branded HTML templates using the same visual style as Group A. Keep the exact same text content.

### B1. send-launch-email
Sent to all Break-In Crew members announcing the app launch. Variables: ${firstName}

Current plain text content (do not change the wording):
```
Hey ${firstName},

It's here.

Time to Moto is live on the App Store. You helped build it.

[App Store link — coming soon]

Thank you for being part of the Break-In Crew.
— Keith
```

Subject line: "Time to Moto is live on the App Store"
From: Time to Moto <support@timetomoto.com>

Create a branded HTML version of this email. Include a CTA button that says "DOWNLOAD THE APP" linking to a placeholder {{appStoreUrl}}. Keep the personal sign-off from Keith.

---

### B2. send-weekly-survey
Sent to Break-In Crew members who haven't submitted their weekly survey. Variables: ${firstName}

Current plain text content (do not change the wording):
```
Hey ${firstName},

How was your week on the bike?

Takes 90 seconds:
https://timetomoto.com/survey

— Keith
```

Subject line: "Time to Moto — quick weekly check-in"
From: Time to Moto <support@timetomoto.com>

Create a branded HTML version of this email. Include a CTA button that says "TAKE THE SURVEY" linking to https://timetomoto.com/survey. Keep the personal sign-off from Keith.

---

## GROUP C — SUPABASE AUTH EMAILS

These are managed in the Supabase dashboard under Authentication → Email Templates. Supabase uses Go template syntax for variables. Create branded HTML templates using the same visual style as Group A.

**IMPORTANT:** Supabase Auth variables use this exact syntax — do not change them:
- `{{ .ConfirmationURL }}` — the confirmation/action link
- `{{ .SiteURL }}` — the site base URL

### C1. Confirm Signup
Sent when a new user signs up and needs to verify their email.

Text content to use:
```
Hey there,

Thanks for signing up for Time to Moto. Tap the button below to confirm your email address.

If you didn't create an account, you can safely ignore this email.
```

Subject line: "Confirm your email — Time to Moto"
CTA button: "CONFIRM EMAIL" linking to {{ .ConfirmationURL }}
Include a fallback "Or copy this link:" with {{ .ConfirmationURL }}

---

### C2. Reset Password
Sent when a user requests a password reset.

Text content to use:
```
Hey there,

We received a request to reset your password. Tap the button below to choose a new one.

This link expires in 60 minutes. If you didn't request this, you can safely ignore this email.
```

Subject line: "Reset your password — Time to Moto"
CTA button: "RESET PASSWORD" linking to {{ .ConfirmationURL }}
Include a fallback "Or copy this link:" with {{ .ConfirmationURL }}

---

## OUTPUT FORMAT

Label your output clearly using these exact headers so I can route each template to the right place:

```
## GROUP A — App Templates (give to Claude Code for timetomoto-app)
### A1. welcome.html
[complete HTML]
### A2. magic-link.html
[complete HTML]
... etc

## GROUP B — Website Edge Function Templates (give to Claude Code for timetomoto-web)
### B1. send-launch-email
[complete HTML]
### B2. send-weekly-survey
[complete HTML]

## GROUP C — Supabase Auth Templates (paste into Supabase dashboard)
### C1. Confirm Signup
[complete HTML]
### C2. Reset Password
[complete HTML]
```

Every template must use the same light theme palette and visual style. They should all look like they came from the same brand.
