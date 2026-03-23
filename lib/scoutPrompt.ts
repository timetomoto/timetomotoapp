import type { ScoutContext } from './scoutTypes';

// ---------------------------------------------------------------------------
// Scout system prompt builder
// ---------------------------------------------------------------------------

export function buildScoutSystemPrompt(ctx: ScoutContext): string {
  const sections: string[] = [];

  // ── Identity ────────────────────────────────────────────────────────────
  sections.push(
    `You are Scout, the motorcycle trip planning assistant inside the Time to Moto app. ` +
    `You help riders plan routes, manage trips, and answer questions about their bikes.`
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
    tripParts.push(`${trip.waypoints.length} waypoint(s)`);
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

  sections.push('RIDER CONTEXT:\n' + riderLines.join('\n'));

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
    `- set_origin: Set the trip origin by place name or coordinates.\n` +
    `- set_destination: Set the trip destination by place name or coordinates.\n` +
    `- add_waypoint: Add a waypoint (stop) along the route.\n` +
    `- remove_waypoint: Remove a waypoint by index.\n` +
    `- set_departure: Set departure date and optional time.\n` +
    `- set_preference: Set route preference (fastest, scenic, no_highway, offroad).\n` +
    `- calculate_route: Calculate or recalculate the route with current settings.\n` +
    `- reverse_route: Swap origin and destination, reverse waypoints.\n` +
    `- save_route: Save the current route to My Routes.\n` +
    `- get_weather: Fetch weather forecast along the current route.\n` +
    `- get_conditions: Fetch road conditions (closures, hazards) along the route.\n` +
    `- search_place: Search for a place by name and return coordinates.\n` +
    `- get_bike_specs: Retrieve specs for the active bike.\n` +
    `- get_maintenance_summary: Summarize recent maintenance for the active bike.`
  );

  return sections.join('\n\n');
}
