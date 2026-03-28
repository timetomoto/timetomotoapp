// ---------------------------------------------------------------------------
// Scout tool definitions — Gemini function-calling schemas
// Split from scoutTools.ts for maintainability
// ---------------------------------------------------------------------------

interface ToolParam {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParam>;
    required: string[];
  };
}

export const SCOUT_TOOL_DEFINITIONS: ToolDefinition[] = [
  // ── Route Building ────────────────────────────────────────────────────
  { name: 'set_origin', description: 'Geocode a place name and set it as the trip origin.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Place name or address to geocode.' } }, required: ['query'] } },
  { name: 'set_destination', description: 'Geocode a place name and set it as the trip destination.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Place name or address to geocode.' } }, required: ['query'] } },
  { name: 'set_origin_to_home', description: "Set the trip origin to the rider's saved Home favorite location.", parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'set_origin_to_current_location', description: "Set the trip origin to the rider's current GPS position.", parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'add_waypoint', description: 'Geocode a place and add it as a waypoint (stop) along the route.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Place name or address to add as a stop.' }, label: { type: 'string', description: 'Optional friendly label for the waypoint.' }, position: { type: 'number', description: 'Optional zero-based index to insert the waypoint at. Appended if omitted.' } }, required: ['query'] } },
  { name: 'remove_waypoint', description: 'Remove a waypoint by matching its label or location name.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Label or place name of the waypoint to remove.' } }, required: ['query'] } },
  { name: 'replace_waypoint', description: 'Replace an existing waypoint with a new place. Use when the rider says "change my stop to..." or "swap X for Y".', parameters: { type: 'object', properties: { old_query: { type: 'string', description: 'Label or name of the existing waypoint to replace.' }, new_query: { type: 'string', description: 'Place name or address for the replacement stop.' }, label: { type: 'string', description: 'Optional friendly label for the new waypoint.' } }, required: ['old_query', 'new_query'] } },
  { name: 'reorder_waypoints', description: 'Move a waypoint from one position to another in the list.', parameters: { type: 'object', properties: { from_index: { type: 'number', description: 'Current zero-based index of the waypoint.' }, to_index: { type: 'number', description: 'Target zero-based index.' } }, required: ['from_index', 'to_index'] } },
  { name: 'clear_route', description: 'Reset the entire trip — clears origin, destination, waypoints, and route.', parameters: { type: 'object', properties: {}, required: [] } },

  // ── Segment Steering ──────────────────────────────────────────────────
  { name: 'steer_segment', description: 'Insert a via-waypoint between two existing points to force the route through a specific town or road.', parameters: { type: 'object', properties: { segment_start: { type: 'string', description: 'Waypoint label, "origin", or place name of the segment start.' }, segment_end: { type: 'string', description: 'Waypoint label, "destination", or place name of the segment end.' }, via: { type: 'string', description: 'Town, road, or place to route through.' } }, required: ['segment_start', 'segment_end', 'via'] } },
  { name: 'avoid_road', description: 'Insert a bypass waypoint to pull the route off a specific road between two points.', parameters: { type: 'object', properties: { road_name: { type: 'string', description: 'Name of the road to avoid.' }, segment_start: { type: 'string', description: 'Waypoint label or "origin" for the start of the segment.' }, segment_end: { type: 'string', description: 'Waypoint label or "destination" for the end of the segment.' } }, required: ['road_name', 'segment_start', 'segment_end'] } },

  // ── Route Shaping ─────────────────────────────────────────────────────
  { name: 'set_route_preference', description: 'Set the routing style: scenic, backroads, no_highway, or fastest.', parameters: { type: 'object', properties: { preference: { type: 'string', description: 'Routing preference.', enum: ['scenic', 'backroads', 'no_highway', 'fastest'] } }, required: ['preference'] } },
  { name: 'set_departure', description: 'Set the trip departure date and optional time.', parameters: { type: 'object', properties: { date: { type: 'string', description: 'Departure date in YYYY-MM-DD format.' }, time: { type: 'string', description: 'Departure time in HH:MM (24h) format. Omit if rider did not specify a time.' } }, required: ['date'] } },
  { name: 'make_loop', description: 'Set the destination equal to the origin to create a loop route.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'suggest_waypoints', description: 'Suggest evenly-spaced town stops between origin and destination. Returns suggestions — does NOT add them automatically.', parameters: { type: 'object', properties: { count: { type: 'number', description: 'Number of waypoint suggestions to generate (2–6).' }, preference: { type: 'string', description: 'Optional hint like "scenic" or "fuel stops".' } }, required: ['count'] } },

  // ── Conditions & Intelligence ─────────────────────────────────────────
  { name: 'get_weather_briefing', description: 'Fetch a weather forecast along the current route.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'get_departure_suggestion', description: 'Suggest optimal departure time to avoid rain, traffic, or dark.', parameters: { type: 'object', properties: { avoid: { type: 'string', description: 'What to avoid.', enum: ['rain', 'traffic', 'dark'] } }, required: ['avoid'] } },
  { name: 'get_road_conditions', description: 'Fetch traffic incidents (construction, closures, hazards) along the current route.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'get_route_eta_check', description: 'Check if the rider can make it by a deadline given their route duration.', parameters: { type: 'object', properties: { departure_time: { type: 'string', description: 'Planned departure time in HH:MM (24h) format.' }, deadline_time: { type: 'string', description: 'Must-arrive-by time in HH:MM (24h) format.' } }, required: ['departure_time', 'deadline_time'] } },

  // ── Garage ────────────────────────────────────────────────────────────
  { name: 'ask_garage', description: 'Retrieve bike specs, maintenance logs, modifications, and service intervals. Can query any bike by nickname or model.', parameters: { type: 'object', properties: { question: { type: 'string', description: 'The garage-related question.' }, bike_name: { type: 'string', description: 'Nickname or model of the bike. Omit for active bike.' } }, required: ['question'] } },
  { name: 'set_active_bike', description: 'Switch the active bike by nickname or model name.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Nickname or model name of the bike to activate.' } }, required: ['query'] } },
  { name: 'add_maintenance_log', description: 'Add a maintenance log entry to a bike.', parameters: { type: 'object', properties: { maintenance_type: { type: 'string', description: 'Type: oil change, tire change, chain lube, brake pads, air filter, etc.' }, bike_name: { type: 'string', description: 'Nickname or model. Omit for active bike.' }, date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' }, mileage: { type: 'number', description: 'Odometer reading. Omit if unknown.' }, cost: { type: 'number', description: 'Cost in dollars. Omit if unknown.' }, notes: { type: 'string', description: 'Additional notes.' } }, required: ['maintenance_type'] } },
  { name: 'refresh_bike_data', description: "Refresh a bike's specs, service intervals, and bulletins from online sources.", parameters: { type: 'object', properties: { bike_name: { type: 'string', description: 'Nickname or model. Omit for active bike.' } }, required: [] } },
  { name: 'add_modification', description: 'Add a modification/accessory to a bike.', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Name of the modification.' }, category: { type: 'string', description: 'Category: exhaust, protection, luggage, suspension, lighting, electronics, ergonomics, performance, cosmetic, other.' }, bike_name: { type: 'string', description: 'Nickname or model. Omit for active bike.' }, brand: { type: 'string', description: 'Brand name. Omit if unknown.' }, date_installed: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' }, cost: { type: 'number', description: 'Cost in dollars. Omit if unknown.' }, notes: { type: 'string', description: 'Additional notes.' } }, required: ['title', 'category'] } },
  { name: 'update_maintenance_log', description: 'Update an existing maintenance entry — change mileage, cost, notes, or date.', parameters: { type: 'object', properties: { maintenance_type: { type: 'string', description: 'Type of the entry to update.' }, bike_name: { type: 'string', description: 'Nickname or model. Omit for active bike.' }, mileage: { type: 'number', description: 'Updated odometer.' }, cost: { type: 'number', description: 'Updated cost.' }, notes: { type: 'string', description: 'Updated notes.' }, date: { type: 'string', description: 'Updated date.' } }, required: ['maintenance_type'] } },
  { name: 'update_modification', description: 'Update an existing modification — change cost, brand, notes, or date.', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Title of the modification to update.' }, bike_name: { type: 'string', description: 'Nickname or model. Omit for active bike.' }, brand: { type: 'string', description: 'Updated brand.' }, cost: { type: 'number', description: 'Updated cost.' }, notes: { type: 'string', description: 'Updated notes.' }, date_installed: { type: 'string', description: 'Updated date.' } }, required: ['title'] } },
  { name: 'delete_maintenance_log', description: 'Delete a maintenance entry by type. Use when moving entries to another bike (delete + re-add).', parameters: { type: 'object', properties: { maintenance_type: { type: 'string', description: 'Type to delete.' }, bike_name: { type: 'string', description: 'Nickname or model. Omit for active bike.' } }, required: ['maintenance_type'] } },
  { name: 'delete_modification', description: 'Delete a modification by title.', parameters: { type: 'object', properties: { title: { type: 'string', description: 'Title to delete.' }, bike_name: { type: 'string', description: 'Nickname or model. Omit for active bike.' } }, required: ['title'] } },
  { name: 'update_bike', description: "Update a bike's nickname, odometer, year, make, or model.", parameters: { type: 'object', properties: { bike_name: { type: 'string', description: 'Current nickname or model.' }, nickname: { type: 'string', description: 'New nickname.' }, odometer: { type: 'number', description: 'Updated odometer.' }, year: { type: 'number', description: 'Updated year.' }, make: { type: 'string', description: 'Updated make.' }, model: { type: 'string', description: 'Updated model.' } }, required: ['bike_name'] } },

  // ── Ride Controls ─────────────────────────────────────────────────────
  { name: 'start_ride', description: "Open the pre-ride checklist to start recording.", parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'pause_ride', description: 'Pause the current ride recording.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'resume_ride', description: 'Resume a paused ride recording.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'get_ride_stats', description: 'Get current ride statistics — speed, distance, duration, navigation status.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'get_navigation_status', description: 'Get navigation status — distance remaining, ETA, destination, current instruction.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'find_nearby', description: "Find a nearby place (gas, food, rest) along the route or near rider's location.", parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to find — e.g. "gas station", "coffee shop".' } }, required: ['query'] } },
  { name: 'stop_ride', description: 'Stop the ride recording. ALWAYS call with confirmed: false first. Only confirmed: true after rider says yes.', parameters: { type: 'object', properties: { confirmed: { type: 'boolean', description: 'false = ask to confirm, true = execute after confirmation.' } }, required: ['confirmed'] } },
  { name: 'add_stop_to_navigation', description: 'Add a stop to active navigation. Geocodes and inserts as next waypoint.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Place name or address.' } }, required: ['query'] } },

  // ── Saved Routes ──────────────────────────────────────────────────────
  { name: 'describe_saved_route', description: 'Look up a saved route by name and return details.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Name or partial name of the saved route.' } }, required: ['query'] } },
  { name: 'load_saved_route', description: 'Load a saved route into Trip Planner.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Name or partial name of the saved route.' } }, required: ['query'] } },
  { name: 'save_current_route', description: 'Save the current trip route to My Routes.', parameters: { type: 'object', properties: { name: { type: 'string', description: 'Route name. Auto-generated if omitted.' }, category: { type: 'string', description: 'Category.' } }, required: [] } },
  { name: 'generate_ride_summary', description: 'Generate a name and summary for a completed ride.', parameters: { type: 'object', properties: { distance: { type: 'number', description: 'Miles.' }, duration: { type: 'number', description: 'Seconds.' }, avg_speed: { type: 'number', description: 'MPH.' }, elevation_gain: { type: 'number', description: 'Feet.' }, bike_nickname: { type: 'string', description: 'Bike nickname.' }, start_city: { type: 'string', description: 'Starting city.' } }, required: ['distance', 'duration', 'avg_speed', 'elevation_gain', 'bike_nickname'] } },

  // ── Safety ────────────────────────────────────────────────────────────
  { name: 'cancel_crash_alert', description: 'Cancel the active crash countdown. Use when rider says they are OK.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'trigger_emergency', description: 'Fire SMS to emergency contacts immediately.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'checkin_now', description: 'Reset the check-in timer and cancel pending alert.', parameters: { type: 'object', properties: {}, required: [] } },
  { name: 'get_safety_status', description: 'Get current state of crash detection, live share, and check-in timer.', parameters: { type: 'object', properties: {}, required: [] } },

  // ── Map Controls ──────────────────────────────────────────────────────
  { name: 'set_map_style', description: 'Switch the map base layer. Options: satellite (also called hybrid), terrain (also called outdoors), standard (also called streets), dark. Always respond using the primary name (satellite, terrain, standard, dark).', parameters: { type: 'object', properties: { style: { type: 'string', description: 'Map style.', enum: ['satellite', 'hybrid', 'terrain', 'outdoors', 'standard', 'streets', 'dark'] } }, required: ['style'] } },
  { name: 'toggle_map_layer', description: 'Turn a map overlay layer on or off. Layers: fuel (gas stations), food (restaurants/coffee), weather (radar), road conditions (construction/closures/hazards). Always respond using the primary name.', parameters: { type: 'object', properties: { layer: { type: 'string', description: 'Layer to toggle.', enum: ['fuel', 'food', 'weather', 'construction'] }, on: { type: 'boolean', description: 'true to show, false to hide.' } }, required: ['layer', 'on'] } },
];

/** Tool names that only apply during crash alerts */
export const CRASH_MODE_TOOLS = new Set(['cancel_crash_alert', 'trigger_emergency', 'get_safety_status']);
