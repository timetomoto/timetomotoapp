import type { ScoutContext } from './scoutTypes';

// ---------------------------------------------------------------------------
// Scout system prompt builder
// ---------------------------------------------------------------------------

export function buildScoutSystemPrompt(ctx: ScoutContext): string {
  const sections: string[] = [];

  // ── Identity ────────────────────────────────────────────────────────────
  const screenHints: Record<string, string> = {
    ride: 'The rider is on the Ride screen — prioritize navigation, weather, and road conditions. You can still plan trips.',
    trip: 'The rider is on the Trip Planner — full trip planning mode. Help build and refine their route.',
    garage: 'The rider is on the Garage screen — prioritize bike specs, maintenance, and service questions. You can still plan trips if asked.',
    other: 'The rider opened Scout from a secondary screen.',
  };
  // ── CRASH ALERT MODE — overrides everything ─────────────────────────
  if (ctx.isCrashAlertActive) {
    sections.push(
      `You are Scout. A CRASH HAS BEEN DETECTED. Your ONLY job right now is crash response.\n` +
      `RULES:\n` +
      `- All other tools are disabled. Only use: cancel_crash_alert, trigger_emergency, get_safety_status.\n` +
      `- Responses MUST be under 10 words.\n` +
      `- Lead with action, not confirmation.\n` +
      `- "I'm ok" / "I'm fine" / "yes" / "okay" → call cancel_crash_alert\n` +
      `- "help" / "call" / "emergency" / "hurt" → call trigger_emergency\n` +
      `- "status" → call get_safety_status`
    );
    return sections.join('\n\n');
  }

  // Current date/time for relative date calculations ("this Saturday", "next week", etc.)
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayStr = `${dayNames[now.getDay()]}, ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

  sections.push(
    `You are Scout, the motorcycle trip planning assistant inside the Time to Moto app. ` +
    `You help riders plan routes, manage trips, and answer questions about their bikes.\n` +
    `Today is ${todayStr}.\n` +
    screenHints[ctx.currentScreen]
  );

  // ── Ride state (when actively riding) ──────────────────────────────────
  if (ctx.rideState) {
    const r = ctx.rideState;
    const parts: string[] = [];
    if (r.isRecording) parts.push(r.isPaused ? 'RECORDING (paused)' : 'RECORDING');
    if (r.isNavigating) parts.push('NAVIGATING');
    if (r.speedMph > 0) parts.push(`${r.speedMph} mph`);
    if (r.distanceMiles > 0) parts.push(`${r.distanceMiles} mi ridden`);
    if (r.remainingDistanceMiles > 0) parts.push(`${r.remainingDistanceMiles} mi remaining`);
    if (r.eta) parts.push(`ETA ${r.eta}`);
    if (r.destinationName) parts.push(`heading to ${r.destinationName}`);
    sections.push(`ACTIVE RIDE: ${parts.join(' · ')}`);

    sections.push(
      `RIDING MODE RULES:\n` +
      `- The rider is actively on the road. Keep all responses to 2 sentences max.\n` +
      `- No markdown, bullet points, or formatting — plain text only.\n` +
      `- Be direct and concise. The rider may be glancing at their phone.\n` +
      `- For navigation questions, read from the ride state above.\n` +
      `- You can pause, resume, or report ride stats. NEVER stop a ride without explicit confirmation.`
    );
  }

  // ── Rider context ──────────────────────────────────────────────────────
  const riderLines: string[] = [];

  // Bikes
  if (ctx.bikes.length > 0) {
    const list = ctx.bikes
      .map((b) => {
        const label = [b.year, b.make, b.model].filter(Boolean).join(' ');
        return b.nickname ? `${label} ("${b.nickname}")` : label;
      })
      .join(', ');
    riderLines.push(`Bikes in garage: ${list}.`);
  } else {
    riderLines.push('No bikes in garage yet.');
  }

  // Active bike
  if (ctx.activeBike) {
    const ab = ctx.activeBike;
    const label = [ab.year, ab.make, ab.model].filter(Boolean).join(' ');
    riderLines.push(`Active bike: ${ab.nickname ? `${label} ("${ab.nickname}")` : label}.`);
  }

  // Location
  if (ctx.currentLocation) {
    const loc = ctx.currentLocation;
    riderLines.push(
      loc.city
        ? `Current location: ${loc.city} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}).`
        : `Current location: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}.`
    );
  }

  // Current trip
  const trip = ctx.currentTrip;
  const tripParts: string[] = [];
  if (trip.origin) tripParts.push(`origin: ${trip.origin.name}`);
  if (trip.destination) tripParts.push(`destination: ${trip.destination.name}`);
  if (trip.waypoints.length > 0)
    tripParts.push(`waypoints: [${trip.waypoints.map((w) => w.name).join(', ')}]`);
  else
    tripParts.push('waypoints: none');
  if (trip.departureDate) tripParts.push(`departure: ${trip.departureDate}${trip.departureTime ? ` ${trip.departureTime}` : ''}`);
  if (trip.preference) tripParts.push(`preference: ${trip.preference}`);
  if (trip.routeDistance) tripParts.push(`${trip.routeDistance.toFixed(1)} mi`);
  if (trip.routeDuration) {
    const hrs = Math.floor(trip.routeDuration / 3600);
    const mins = Math.round((trip.routeDuration % 3600) / 60);
    tripParts.push(`${hrs}h ${mins}m`);
  }

  if (tripParts.length > 0) {
    riderLines.push(`Current trip: ${tripParts.join(' · ')}.`);
  } else {
    riderLines.push('No trip in progress.');
  }

  // Saved routes — grouped by category with route names
  if (ctx.savedRoutes.length > 0) {
    const byCategory = new Map<string, typeof ctx.savedRoutes>();
    for (const r of ctx.savedRoutes) {
      const cat = r.category || 'Uncategorized';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(r);
    }
    const catLines = [...byCategory.entries()].map(([cat, routes]) => {
      const names = routes.slice(0, 5).map((r) => `${r.name} (${r.distance.toFixed(1)} mi)`).join(', ');
      const extra = routes.length > 5 ? ` +${routes.length - 5} more` : '';
      return `  ${cat} (${routes.length}): ${names}${extra}`;
    });
    riderLines.push(`Saved routes (${ctx.savedRoutes.length} total):\n${catLines.join('\n')}`);
  }

  // Favorites
  if (ctx.favoriteLocations.length > 0) {
    const home = ctx.favoriteLocations.find((f) => f.isHome);
    const others = ctx.favoriteLocations.filter((f) => !f.isHome);
    const parts: string[] = [];
    if (home) parts.push(`Home: ${home.nickname || home.address}`);
    if (others.length > 0) parts.push(`${others.length} other favorite(s)`);
    riderLines.push(`Favorite locations: ${parts.join(', ')}.`);
  }

  // Recent maintenance
  if (ctx.recentMaintenanceLogs.length > 0) {
    const recent = ctx.recentMaintenanceLogs.slice(0, 5);
    const summary = recent
      .map((m) => `${m.maintenanceType} on ${m.date}`)
      .join('; ');
    riderLines.push(`Recent maintenance (active bike): ${summary}.`);
  }

  // Service intervals — include when data has been looked up for the active bike
  const intervals = ctx.serviceIntervals as any;
  if (intervals?.items?.length > 0) {
    const intervalSummary = intervals.items
      .slice(0, 5)
      .map((it: any) => `${it.item}: ${it.interval}`)
      .join('; ');
    riderLines.push(`Service intervals (active bike): ${intervalSummary}.`);
  }

  sections.push(
    'RIDER CONTEXT (live state — always trust this over conversation history, the rider may have made changes outside of this chat):\n' +
    riderLines.join('\n'),
  );

  // ── Personality rules ──────────────────────────────────────────────────
  sections.push(
    `PERSONALITY RULES:\n` +
    `- Be brief and direct — 4 sentences max unless the rider asks for more.\n` +
    `- Always confirm what was DONE, not what will be done.\n` +
    `- Offer one follow-up suggestion. Never present a list of options.\n` +
    `- Never say "I cannot" — offer the closest alternative instead.\n` +
    `- When modifying a route segment, mention which road or town was used to steer the route.\n` +
    `- MAINTENANCE: "I need to do X" = help/lookup via ask_garage. "I did X" or "log X" = add_maintenance_log. After logging, ask about mileage/cost. Use update (not add) when rider provides details for an already-logged entry. Confirm before creating a duplicate of the same type. To move entries between bikes: delete from old bike + add to new bike.`
  );

  // ── Voice behavior (only when voice input is active) ────────────────
  if (ctx.isVoiceInput) {
    sections.push(
      `VOICE MODE — ACTIVE. The rider is speaking, not typing. You MUST follow these rules:\n` +
      `- Start with the answer immediately — no preamble, no filler.\n` +
      `- Keep responses under 15 words so TTS reads them quickly.\n` +
      `- Never start a sentence with "I".\n` +
      `- Use road names and cardinal directions ("Turn left on Route 66", not "Make a left turn on the upcoming road").\n` +
      `- Numbers: say "half a mile" not "0.5 miles", "two hours" not "2h".\n` +
      `- For weather/conditions: lead with the actionable detail ("Rain in 20 miles — consider stopping").\n` +
      `- No follow-up questions. Just answer and stop.\n` +
      `- Never mention Trip Planner, Garage, or screen names — the rider can't tap while riding.`
    );
  }

  // ── Constraints ────────────────────────────────────────────────────────
  sections.push(
    `CONSTRAINTS:\n` +
    `- You cannot guarantee road surface type — use "likely" or "typically" when describing surfaces.\n` +
    `- You do not have access to real-time traffic data.\n` +
    `- All routing goes through the Mapbox Directions API — US geographic focus.\n` +
    `- Garage answers should draw from the bike specs and maintenance history provided in the rider context above.`
  );

  // ── Tool behavior rules (tool schemas are in function declarations) ──
  sections.push(
    `TOOL BEHAVIOR:\n` +
    `- Chain tools when needed. Example: "check weather for my Colorado route" → load_saved_route then get_weather_briefing.\n` +
    `- Routes calculate automatically when origin + destination are set. No separate "calculate" step needed.\n` +
    `- Do NOT add navigation hints like "head to Trip Planner" — the app appends these automatically.\n` +
    `- When adding a waypoint, include the state or city in the query to stay near the route.\n` +
    `- NEVER call clear_route unless the rider explicitly says "clear" or "start over".\n` +
    `- stop_ride: ALWAYS call with confirmed:false first. Only confirmed:true after rider says "yes".\n` +
    `- If a route or trip action fails, suggest the rider set it up in Trip Planner or Garage (these render as tappable links).`
  );

  return sections.join('\n\n');
}
