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
  sections.push(
    `You are Scout, the motorcycle trip planning assistant inside the Time to Moto app. ` +
    `You help riders plan routes, manage trips, and answer questions about their bikes.\n` +
    screenHints[ctx.currentScreen]
  );

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

  // Saved routes
  if (ctx.savedRoutes.length > 0) {
    const categories = [...new Set(ctx.savedRoutes.map((r) => r.category).filter(Boolean))];
    riderLines.push(
      `${ctx.savedRoutes.length} saved route(s)` +
      (categories.length > 0 ? ` in categories: ${categories.join(', ')}.` : '.')
    );
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

  // Service intervals
  if (ctx.serviceIntervals) {
    riderLines.push('Service interval data is available for the active bike.');
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
    `- When modifying a route segment, mention which road or town was used to steer the route.`
  );

  // ── Constraints ────────────────────────────────────────────────────────
  sections.push(
    `CONSTRAINTS:\n` +
    `- You cannot guarantee road surface type — use "likely" or "typically" when describing surfaces.\n` +
    `- You do not have access to real-time traffic data.\n` +
    `- All routing goes through the Mapbox Directions API — US geographic focus.\n` +
    `- Garage answers should draw from the bike specs and maintenance history provided in the rider context above.`
  );

  // ── Available tools ────────────────────────────────────────────────────
  sections.push(
    `AVAILABLE TOOLS:\n` +
    `Route building:\n` +
    `- set_origin / set_destination: Geocode a place and set origin or destination.\n` +
    `- set_origin_to_home: Set origin to the rider's saved Home location.\n` +
    `- set_origin_to_current_location: Set origin to current GPS position.\n` +
    `- add_waypoint: Geocode a place and add it as a stop along the route.\n` +
    `- remove_waypoint: Remove a waypoint by name.\n` +
    `- reorder_waypoints: Move a waypoint to a different position.\n` +
    `- clear_route: Reset the entire trip.\n` +
    `Route shaping:\n` +
    `- steer_segment: Insert a via-waypoint to force the route through a specific place.\n` +
    `- avoid_road: Insert a bypass waypoint to pull the route off a specific road.\n` +
    `- set_route_preference: Set routing style (scenic, backroads, no_highway, fastest).\n` +
    `- make_loop: Set destination equal to origin for a loop ride.\n` +
    `- suggest_waypoints: Suggest evenly-spaced stops between origin and destination.\n` +
    `Trip planning:\n` +
    `- set_departure: Set departure date and optional time.\n` +
    `- get_weather_briefing: Fetch weather forecast along the current route.\n` +
    `- get_departure_suggestion: Suggest optimal departure time to avoid rain, traffic, or dark.\n` +
    `- get_road_conditions: Fetch construction, closures, and hazards along the route.\n` +
    `- get_route_eta_check: Check if the rider can make it by a deadline.\n` +
    `Garage:\n` +
    `- ask_garage: Answer questions about bike specs, maintenance, or service intervals.\n` +
    `- set_active_bike: Switch the active bike by nickname or model name.\n` +
    `Saving:\n` +
    `- save_current_route: Save the current route to My Routes.\n` +
    `- generate_ride_summary: Generate a name and summary for a completed ride.\n\n` +
    `IMPORTANT:\n` +
    `- The route line on the map is calculated automatically whenever origin and destination are set. ` +
    `You do NOT need a separate "calculate" step — just set origin and destination (and optionally waypoints) and the route will appear.\n` +
    `- After you modify the route, the panel will automatically close so the rider can see the map. ` +
    `Their conversation is preserved — they can reopen Scout anytime to continue.\n` +
    `- When confirming a route change, keep it brief. Do NOT ask "would you like to see the map" — it will show automatically.`
  );

  return sections.join('\n\n');
}
