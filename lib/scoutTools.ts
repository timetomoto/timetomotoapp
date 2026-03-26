import { useTripPlannerStore, useRoutesStore, useGarageStore, useSafetyStore } from './store';
import { useNavigationStore } from './navigationStore';
import { calcDistance } from './gpx';
import { geocodeLocation, reverseGeocode } from './geocode';
import { addMaintenanceRecord, addModification, updateMaintenanceRecord, updateModification, loadMaintenance, loadModifications, type MaintenanceRecord, type Modification } from './garage';
import { supabase } from './supabase';

/** Generate a v4 UUID for Supabase compatibility */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
import { fetchDirections } from './directions';
import {
  fetchRouteWeather,
  sampleRouteCoordinates,
  hasRouteWeatherConcern,
  getRouteWarningMessage,
} from './routeWeather';
import { fetchHEREConditions } from './discoverStore';
import { createRoute } from './routes';
import type { ScoutContext, TripStop } from './scoutTypes';

// ---------------------------------------------------------------------------
// PART A — Gemini-compatible tool definitions
// ---------------------------------------------------------------------------

interface ToolParam {
  type: string;
  description: string;
  enum?: string[];
}

interface ToolDefinition {
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
  {
    name: 'set_origin',
    description: 'Geocode a place name and set it as the trip origin.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name or address to geocode.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'set_destination',
    description: 'Geocode a place name and set it as the trip destination.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name or address to geocode.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'set_origin_to_home',
    description: "Set the trip origin to the rider's saved Home favorite location.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_origin_to_current_location',
    description: "Set the trip origin to the rider's current GPS position.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'add_waypoint',
    description: 'Geocode a place and add it as a waypoint (stop) along the route.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name or address to add as a stop.' },
        label: { type: 'string', description: 'Optional friendly label for the waypoint.' },
        position: { type: 'number', description: 'Optional zero-based index to insert the waypoint at. Appended if omitted.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'remove_waypoint',
    description: 'Remove a waypoint by matching its label or location name.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Label or place name of the waypoint to remove.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'reorder_waypoints',
    description: 'Move a waypoint from one position to another in the list.',
    parameters: {
      type: 'object',
      properties: {
        from_index: { type: 'number', description: 'Current zero-based index of the waypoint.' },
        to_index: { type: 'number', description: 'Target zero-based index.' },
      },
      required: ['from_index', 'to_index'],
    },
  },
  {
    name: 'clear_route',
    description: 'Reset the entire trip — clears origin, destination, waypoints, and route.',
    parameters: { type: 'object', properties: {}, required: [] },
  },

  // ── Segment Steering ──────────────────────────────────────────────────
  {
    name: 'steer_segment',
    description:
      'Insert a via-waypoint between two existing points to force the route through a specific town or road. Use this when the rider wants a different road on part of the route.',
    parameters: {
      type: 'object',
      properties: {
        segment_start: { type: 'string', description: 'Waypoint label, "origin", or place name of the segment start.' },
        segment_end: { type: 'string', description: 'Waypoint label, "destination", or place name of the segment end.' },
        via: { type: 'string', description: 'Town, road, or place to route through.' },
      },
      required: ['segment_start', 'segment_end', 'via'],
    },
  },
  {
    name: 'avoid_road',
    description:
      'Insert a bypass waypoint to pull the route off a specific road between two points.',
    parameters: {
      type: 'object',
      properties: {
        road_name: { type: 'string', description: 'Name of the road to avoid.' },
        segment_start: { type: 'string', description: 'Waypoint label or "origin" for the start of the segment.' },
        segment_end: { type: 'string', description: 'Waypoint label or "destination" for the end of the segment.' },
      },
      required: ['road_name', 'segment_start', 'segment_end'],
    },
  },

  // ── Route Shaping ─────────────────────────────────────────────────────
  {
    name: 'set_route_preference',
    description: 'Set the routing style: scenic, backroads, no_highway, or fastest.',
    parameters: {
      type: 'object',
      properties: {
        preference: {
          type: 'string',
          description: 'Routing preference.',
          enum: ['scenic', 'backroads', 'no_highway', 'fastest'],
        },
      },
      required: ['preference'],
    },
  },
  {
    name: 'set_departure',
    description: 'Set the trip departure date and optional time.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Departure date in YYYY-MM-DD format.' },
        time: { type: 'string', description: 'Departure time in HH:MM (24h) format. Omit if rider did not specify a time.' },
      },
      required: ['date'],
    },
  },
  {
    name: 'make_loop',
    description: 'Set the destination equal to the origin to create a loop route.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'suggest_waypoints',
    description:
      'Suggest evenly-spaced town stops between origin and destination. Returns suggestions for the rider to confirm — does NOT add them automatically.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of waypoint suggestions to generate (2–6).' },
        preference: { type: 'string', description: 'Optional hint like "scenic" or "fuel stops".' },
      },
      required: ['count'],
    },
  },

  // ── Conditions & Intelligence ─────────────────────────────────────────
  {
    name: 'get_weather_briefing',
    description: 'Fetch a weather forecast along the current route and return a plain-language verdict with severity.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_departure_suggestion',
    description: 'Analyze the forecast window and suggest an optimal departure time to avoid rain, traffic, or riding in the dark.',
    parameters: {
      type: 'object',
      properties: {
        avoid: {
          type: 'string',
          description: 'What to avoid.',
          enum: ['rain', 'traffic', 'dark'],
        },
      },
      required: ['avoid'],
    },
  },
  {
    name: 'get_road_conditions',
    description: 'Fetch HERE Traffic incidents (construction, closures, hazards) along the current route and return a plain summary.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_route_eta_check',
    description: 'Compare the route duration against available time and report whether the rider can make it, with buffer time.',
    parameters: {
      type: 'object',
      properties: {
        departure_time: { type: 'string', description: 'Planned departure time in HH:MM (24h) format.' },
        deadline_time: { type: 'string', description: 'Must-arrive-by time in HH:MM (24h) format.' },
      },
      required: ['departure_time', 'deadline_time'],
    },
  },

  // ── Garage ────────────────────────────────────────────────────────────
  {
    name: 'ask_garage',
    description:
      'Retrieve structured bike context (specs, maintenance logs, service intervals) so Scout can answer a garage question. Can query any bike in the garage by nickname or model — defaults to the active bike if not specified.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The garage-related question the rider asked.' },
        bike_name: { type: 'string', description: 'Nickname or model of the bike to query. Omit to use the active bike.' },
      },
      required: ['question'],
    },
  },

  {
    name: 'set_active_bike',
    description: 'Switch the active bike by nickname or model name.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nickname or model name of the bike to activate.' },
      },
      required: ['query'],
    },
  },

  {
    name: 'add_maintenance_log',
    description: 'Add a maintenance log entry to a bike. Use when the rider says they did an oil change, tire change, chain lube, or any maintenance work.',
    parameters: {
      type: 'object',
      properties: {
        maintenance_type: { type: 'string', description: 'Type of maintenance: oil change, tire change, chain lube, brake pads, air filter, coolant flush, valve adjustment, general service, etc.' },
        bike_name: { type: 'string', description: 'Nickname or model of the bike. Omit to use the active bike.' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format. Defaults to today if omitted.' },
        mileage: { type: 'number', description: 'Odometer reading at time of service. Omit if unknown.' },
        cost: { type: 'number', description: 'Cost in dollars. Omit if unknown.' },
        notes: { type: 'string', description: 'Any additional notes about the service.' },
      },
      required: ['maintenance_type'],
    },
  },

  {
    name: 'refresh_bike_data',
    description: 'Refresh a bike\'s specifications, service intervals, and service bulletins from online sources. Use when the rider asks to update or refresh their bike data.',
    parameters: {
      type: 'object',
      properties: {
        bike_name: { type: 'string', description: 'Nickname or model of the bike to refresh. Omit to use the active bike.' },
      },
      required: [],
    },
  },

  {
    name: 'add_modification',
    description: 'Add a modification/accessory to a bike. Use when the rider says they installed exhaust, handguards, crash bars, luggage, GPS mount, suspension, lighting, or any aftermarket part.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Name of the modification or part installed.' },
        category: { type: 'string', description: 'Category: exhaust, protection, luggage, suspension, lighting, electronics, ergonomics, performance, cosmetic, other.' },
        bike_name: { type: 'string', description: 'Nickname or model of the bike. Omit to use the active bike.' },
        brand: { type: 'string', description: 'Brand name of the part (e.g. Akrapovic, SW-Motech). Omit if unknown.' },
        date_installed: { type: 'string', description: 'Date in YYYY-MM-DD format. Defaults to today if omitted.' },
        cost: { type: 'number', description: 'Cost in dollars. Omit if unknown.' },
        notes: { type: 'string', description: 'Any additional notes.' },
      },
      required: ['title', 'category'],
    },
  },

  {
    name: 'update_maintenance_log',
    description: 'Update an existing maintenance log entry — change mileage, cost, notes, or date. Finds the most recent matching entry by type and bike.',
    parameters: {
      type: 'object',
      properties: {
        maintenance_type: { type: 'string', description: 'Type of the maintenance entry to update (e.g. oil change, tire change).' },
        bike_name: { type: 'string', description: 'Nickname or model of the bike. Omit for active bike.' },
        mileage: { type: 'number', description: 'Updated odometer reading.' },
        cost: { type: 'number', description: 'Updated cost in dollars.' },
        notes: { type: 'string', description: 'Updated notes.' },
        date: { type: 'string', description: 'Updated date in YYYY-MM-DD format.' },
      },
      required: ['maintenance_type'],
    },
  },
  {
    name: 'update_modification',
    description: 'Update an existing modification entry — change cost, brand, notes, or date. Finds the most recent matching entry by title and bike.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the modification to update.' },
        bike_name: { type: 'string', description: 'Nickname or model of the bike. Omit for active bike.' },
        brand: { type: 'string', description: 'Updated brand name.' },
        cost: { type: 'number', description: 'Updated cost in dollars.' },
        notes: { type: 'string', description: 'Updated notes.' },
        date_installed: { type: 'string', description: 'Updated date in YYYY-MM-DD format.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_bike',
    description: 'Update a bike\'s details — nickname, odometer, year, make, or model.',
    parameters: {
      type: 'object',
      properties: {
        bike_name: { type: 'string', description: 'Current nickname or model of the bike to update.' },
        nickname: { type: 'string', description: 'New nickname.' },
        odometer: { type: 'number', description: 'Updated odometer reading in miles.' },
        year: { type: 'number', description: 'Updated year.' },
        make: { type: 'string', description: 'Updated make.' },
        model: { type: 'string', description: 'Updated model.' },
      },
      required: ['bike_name'],
    },
  },

  // ── Ride Controls ───────────────────────────────────────────────────
  {
    name: 'pause_ride',
    description: 'Pause the current ride recording. Only works when actively recording.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'resume_ride',
    description: 'Resume a paused ride recording.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_ride_stats',
    description: 'Get current ride statistics — speed, distance, duration, and navigation status.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_navigation_status',
    description: 'Get navigation status — distance remaining, ETA, destination, current step instruction.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'find_nearby',
    description: 'Find a nearby place (gas station, restaurant, rest stop, etc.) along the current route or near the rider\'s location.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to find — e.g. "gas station", "coffee shop", "rest area".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'stop_ride',
    description: 'Stop the current ride recording. ALWAYS call with confirmed: false first to ask the rider to confirm. Only call with confirmed: true after the rider explicitly says yes.',
    parameters: {
      type: 'object',
      properties: {
        confirmed: { type: 'boolean', description: 'false = ask user to confirm, true = execute stop after user confirmed.' },
      },
      required: ['confirmed'],
    },
  },
  {
    name: 'add_stop_to_navigation',
    description: 'Add a stop to the active navigation route. Geocodes the place and inserts it as the next waypoint. Falls back to trip planner if not navigating.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name or address to add as a stop.' },
      },
      required: ['query'],
    },
  },

  // ── Saved Routes ─────────────────────────────────────────────────────
  {
    name: 'describe_saved_route',
    description: 'Look up a saved route by name and return its details (distance, duration, category, departure time, points). Use this when the rider asks about a specific saved route.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or partial name of the saved route to look up.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'load_saved_route',
    description: 'Load a saved route into the Trip Planner so the rider can view, edit, or navigate it. Sets origin, destination, and waypoints from the saved route points.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or partial name of the saved route to load.' },
      },
      required: ['query'],
    },
  },

  // ── Saving ────────────────────────────────────────────────────────────
  {
    name: 'save_current_route',
    description: 'Save the current trip route to My Routes with an optional name and category.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Route name. Auto-generated if omitted.' },
        category: { type: 'string', description: 'Category to file the route under.' },
      },
      required: [],
    },
  },

  // ── Safety ──────────────────────────────────────────────────────────
  {
    name: 'cancel_crash_alert',
    description: 'Cancel the active crash detection countdown and dismiss the crash modal. Use when the rider says they are OK.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'trigger_emergency',
    description: 'Fire SMS to emergency contacts immediately without waiting for the crash countdown. Use when the rider says "help", "emergency", or "call".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'checkin_now',
    description: 'Reset the check-in timer and cancel any pending check-in alert. Use when the rider says "I\'m ok", "check in", or "I\'m fine".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_safety_status',
    description: 'Get the current state of crash detection, live share, and check-in timer.',
    parameters: { type: 'object', properties: {}, required: [] },
  },

  // ── Post-Ride ─────────────────────────────────────────────────────────
  {
    name: 'generate_ride_summary',
    description: 'Generate a suggested name and brief summary for a completed ride.',
    parameters: {
      type: 'object',
      properties: {
        distance: { type: 'number', description: 'Total distance in miles.' },
        duration: { type: 'number', description: 'Total duration in seconds.' },
        avg_speed: { type: 'number', description: 'Average speed in MPH.' },
        elevation_gain: { type: 'number', description: 'Total elevation gain in feet.' },
        bike_nickname: { type: 'string', description: 'Nickname of the bike used.' },
        start_city: { type: 'string', description: 'Starting city name.' },
      },
      required: ['distance', 'duration', 'avg_speed', 'elevation_gain', 'bike_nickname'],
    },
  },
];

// ---------------------------------------------------------------------------
// PART B — Tool executor
// ---------------------------------------------------------------------------

// Gate for stop_ride two-step confirmation — prevents model from skipping confirmation
let stopRideConfirmationPending = false;

// Preference alias mapping
const PREFERENCE_MAP: Record<string, string> = {
  scenic: 'scenic',
  backroads: 'offroad',
  no_highway: 'no_highway',
  fastest: 'fastest',
};

/**
 * Find the insertion index for a waypoint between two named points.
 * Points are identified by label matching against "origin", "destination",
 * or a waypoint name/label.
 */
function resolveSegmentIndex(
  segRef: string,
  ctx: ScoutContext,
): number {
  const lower = segRef.toLowerCase().trim();
  if (lower === 'origin' || lower === 'start') return -1;
  if (lower === 'destination' || lower === 'end') return ctx.currentTrip.waypoints.length;
  // Search waypoints for matching name
  const idx = ctx.currentTrip.waypoints.findIndex(
    (w) => w.name.toLowerCase().includes(lower) || (lower.includes(w.name.toLowerCase())),
  );
  return idx >= 0 ? idx : -1;
}

/**
 * Execute a Scout tool call against the app's existing functionality.
 * Always returns a plain string result — never throws.
 */
export async function executeScoutTool(
  toolName: string,
  parameters: Record<string, any>,
  context: ScoutContext,
): Promise<string> {
  const tripStore = useTripPlannerStore.getState();
  const garageStore = useGarageStore.getState();

  try {
    switch (toolName) {
      // ── Route Building ──────────────────────────────────────────────
      case 'set_origin': {
        const results = await geocodeLocation(parameters.query, context.currentLocation);
        if (results.length === 0) return `Could not find "${parameters.query}". Try a more specific place name.`;
        const place = results[0];
        tripStore.setTripOrigin({ name: place.name, lat: place.lat, lng: place.lng });
        return `Origin set to ${place.name}.`;
      }

      case 'set_destination': {
        const results = await geocodeLocation(parameters.query, context.currentLocation);
        if (results.length === 0) return `Could not find "${parameters.query}". Try a more specific place name.`;
        const place = results[0];
        tripStore.setTripDestination({ name: place.name, lat: place.lat, lng: place.lng });
        return `Destination set to ${place.name}.`;
      }

      case 'set_origin_to_home': {
        const home = context.favoriteLocations.find((f) => f.isHome);
        if (!home) return 'No Home location saved. Add one in Favorite Locations first.';
        // Geocode the home address to get coordinates
        const results = await geocodeLocation(home.address || home.nickname, context.currentLocation);
        if (results.length === 0) return `Could not geocode Home address "${home.nickname}".`;
        const place = results[0];
        tripStore.setTripOrigin({ name: home.nickname || place.name, lat: place.lat, lng: place.lng });
        return `Origin set to Home (${home.nickname || place.name}).`;
      }

      case 'set_origin_to_current_location': {
        if (!context.currentLocation) return 'Current location is not available. Enable location services and try again.';
        const loc = context.currentLocation;
        const name = loc.city ?? await reverseGeocode(loc.lat, loc.lng);
        tripStore.setTripOrigin({ name, lat: loc.lat, lng: loc.lng });
        return `Origin set to current location (${name}).`;
      }

      case 'add_waypoint': {
        // Check waypoint limit
        const currentWaypoints = useTripPlannerStore.getState().tripWaypoints;
        if (currentWaypoints.length >= 24) {
          return "You've reached the 24-stop limit. For longer routes, plan at kurviger.de and import the GPX into My Routes.";
        }
        // Read LIVE store state for proximity (context may be stale after load_saved_route)
        const routeProximity = (() => {
          const ts = useTripPlannerStore.getState();
          const geojson = ts.tripRouteGeojson;
          const pos = parameters.position as number | undefined;
          const wps = ts.tripWaypoints as TripStop[];
          const o = ts.tripOrigin;
          const d = ts.tripDestination;

          // Best: use route geometry at insertion fraction
          if (geojson?.coordinates?.length > 2) {
            const total = geojson.coordinates.length;
            // Estimate insertion fraction
            const fraction = pos != null && wps.length > 0 ? (pos + 0.5) / (wps.length + 2) : 0.5;
            const idx = Math.min(Math.floor(fraction * total), total - 1);
            const pt = geojson.coordinates[idx];
            return { lat: pt[1], lng: pt[0] };
          }

          // Fallback: midpoint of origin-destination
          if (o && d) return { lat: (o.lat + d.lat) / 2, lng: (o.lng + d.lng) / 2 };
          if (o) return { lat: o.lat, lng: o.lng };
          return context.currentLocation;
        })();
        const results = await geocodeLocation(parameters.query, routeProximity);
        if (results.length === 0) return `Could not find "${parameters.query}". Try a more specific place name.`;
        const place = results[0];
        const wp: TripStop = { name: parameters.label || place.name, lat: place.lat, lng: place.lng };
        // Read LIVE waypoints from store (not stale context) so sequential calls see prior additions
        const liveWaypoints = useTripPlannerStore.getState().tripWaypoints as TripStop[];
        const waypoints = [...liveWaypoints];
        const pos = parameters.position != null ? parameters.position : waypoints.length;
        waypoints.splice(pos, 0, wp);
        tripStore.setTripWaypoints(waypoints);
        return `Added waypoint "${wp.name}" at position ${pos + 1}.`;
      }

      case 'remove_waypoint': {
        const query = (parameters.query as string).toLowerCase();
        const waypoints = [...context.currentTrip.waypoints];
        const idx = waypoints.findIndex(
          (w) => w.name.toLowerCase().includes(query) || query.includes(w.name.toLowerCase()),
        );
        if (idx < 0) return `No waypoint matching "${parameters.query}" found.`;
        const removed = waypoints.splice(idx, 1)[0];
        tripStore.setTripWaypoints(waypoints);
        return `Removed waypoint "${removed.name}".`;
      }

      case 'reorder_waypoints': {
        const waypoints = [...context.currentTrip.waypoints];
        const from = parameters.from_index as number;
        const to = parameters.to_index as number;
        if (from < 0 || from >= waypoints.length || to < 0 || to >= waypoints.length)
          return `Invalid index. There are ${waypoints.length} waypoints (0–${waypoints.length - 1}).`;
        const [moved] = waypoints.splice(from, 1);
        waypoints.splice(to, 0, moved);
        tripStore.setTripWaypoints(waypoints);
        return `Moved "${moved.name}" from position ${from + 1} to ${to + 1}.`;
      }

      case 'clear_route': {
        tripStore.clearTrip();
        return 'Trip cleared — origin, destination, and all waypoints removed.';
      }

      // ── Segment Steering ────────────────────────────────────────────
      case 'steer_segment': {
        const viaResults = await geocodeLocation(parameters.via, context.currentLocation);
        if (viaResults.length === 0) return `Could not find "${parameters.via}" to route through.`;
        const via = viaResults[0];

        const startIdx = resolveSegmentIndex(parameters.segment_start, context);
        const endIdx = resolveSegmentIndex(parameters.segment_end, context);
        // Insert after the start point
        const insertAt = Math.max(0, startIdx + 1);
        const wp: TripStop = { name: via.name, lat: via.lat, lng: via.lng };
        const waypoints = [...context.currentTrip.waypoints];
        waypoints.splice(insertAt, 0, wp);
        tripStore.setTripWaypoints(waypoints);
        return `Inserted via-waypoint at ${via.name} between ${parameters.segment_start} and ${parameters.segment_end} to steer the route.`;
      }

      case 'avoid_road': {
        // Route around the named road by inserting a bypass via-point
        const bypassQuery = `${parameters.road_name} bypass near ${parameters.segment_start}`;
        const viaResults = await geocodeLocation(bypassQuery, context.currentLocation);
        if (viaResults.length === 0) {
          // Fallback: try just a town near the segment
          const fallback = await geocodeLocation(
            `town near ${parameters.segment_start}`,
            context.currentLocation,
          );
          if (fallback.length === 0) return `Could not find a bypass route to avoid ${parameters.road_name}.`;
          const via = fallback[0];
          const startIdx = resolveSegmentIndex(parameters.segment_start, context);
          const insertAt = Math.max(0, startIdx + 1);
          const waypoints = [...context.currentTrip.waypoints];
          waypoints.splice(insertAt, 0, { name: via.name, lat: via.lat, lng: via.lng });
          tripStore.setTripWaypoints(waypoints);
          return `Added bypass waypoint at ${via.name} to avoid ${parameters.road_name}. Check the map to confirm the new routing.`;
        }
        const via = viaResults[0];
        const startIdx = resolveSegmentIndex(parameters.segment_start, context);
        const insertAt = Math.max(0, startIdx + 1);
        const waypoints = [...context.currentTrip.waypoints];
        waypoints.splice(insertAt, 0, { name: via.name, lat: via.lat, lng: via.lng });
        tripStore.setTripWaypoints(waypoints);
        return `Added bypass waypoint at ${via.name} to avoid ${parameters.road_name}.`;
      }

      // ── Route Shaping ───────────────────────────────────────────────
      case 'set_route_preference': {
        const pref = parameters.preference as string;
        const mapped = PREFERENCE_MAP[pref] ?? 'fastest';
        tripStore.setTripRoutePreference(pref as any);
        return `Route preference set to "${pref}". The route will recalculate using ${mapped === 'offroad' ? 'back roads' : mapped} routing.`;
      }

      case 'set_departure': {
        const dateStr = parameters.date as string;
        const timeStr = parameters.time as string | undefined;
        const [year, month, day] = dateStr.split('-').map(Number);
        let hours = 0, minutes = 0;
        if (timeStr) {
          [hours, minutes] = timeStr.split(':').map(Number);
        }
        const departure = new Date(year, month - 1, day, hours, minutes);
        tripStore.setTripDeparture(departure);
        tripStore.setTripCustomDate(departure);
        const formatted = departure.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        });
        if (timeStr) {
          const timeFormatted = departure.toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit',
          });
          return `Departure set to ${formatted} at ${timeFormatted}.`;
        }
        return `Departure set to ${formatted}.`;
      }

      case 'make_loop': {
        const origin = context.currentTrip.origin;
        if (!origin) return 'Set an origin first before making a loop.';
        tripStore.setTripDestination({ name: origin.name, lat: origin.lat, lng: origin.lng });
        return `Destination set to ${origin.name} — this is now a loop route.`;
      }

      case 'suggest_waypoints': {
        const geojson = tripStore.tripRouteGeojson;
        if (!geojson?.coordinates || geojson.coordinates.length < 2)
          return 'No route to sample. Set origin and destination first.';
        const count = Math.min(Math.max(parameters.count ?? 3, 2), 6);
        const coords: [number, number][] = geojson.coordinates;
        const samples = sampleRouteCoordinates(coords, undefined);
        // Pick evenly-spaced samples (skip first and last which are origin/dest)
        const interior = samples.slice(1, -1);
        const step = Math.max(1, Math.floor(interior.length / count));
        const picks = interior.filter((_, i) => i % step === 0).slice(0, count);
        // Reverse geocode each
        const suggestions: string[] = [];
        for (const p of picks) {
          const name = await reverseGeocode(p.lat, p.lng);
          const distMi = (p.distanceKm * 0.621371).toFixed(0);
          suggestions.push(`• ${name} (~${distMi} mi from start)`);
        }
        if (suggestions.length === 0) return 'Could not determine waypoint suggestions for this route.';
        return `Suggested stops along the route:\n${suggestions.join('\n')}\n\nWant me to add any of these as waypoints?`;
      }

      // ── Conditions & Intelligence ───────────────────────────────────
      case 'get_weather_briefing': {
        const geojson = tripStore.tripRouteGeojson;
        if (!geojson?.coordinates || geojson.coordinates.length < 2)
          return 'No route set. Build a route first to check weather.';
        const { points, useCelsius } = await fetchRouteWeather(geojson.coordinates);
        if (points.length === 0) return 'Could not fetch weather data for this route.';
        const concern = hasRouteWeatherConcern(points, useCelsius);
        const warning = getRouteWarningMessage(points, useCelsius);
        const unit = useCelsius ? '°C' : '°F';
        const temps = points.map((p) => p.temp);
        const low = Math.min(...temps);
        const high = Math.max(...temps);
        const maxRain = Math.max(...points.map((p) => p.rainChance));
        const maxWind = Math.max(...points.map((p) => p.wind));
        // Store in trip state
        tripStore.setTripWeather(points, warning ?? null, concern, points.length);
        let brief = `Weather along route: ${low}–${high}${unit}`;
        if (maxRain > 0) brief += `, up to ${maxRain}% rain chance`;
        if (maxWind > 20) brief += `, gusts to ${maxWind} ${useCelsius ? 'km/h' : 'mph'}`;
        brief += '.';
        if (concern && warning) brief += ` ⚠️ ${warning}`;
        else brief += ' Conditions look clear.';
        return brief;
      }

      case 'get_departure_suggestion': {
        const avoid = parameters.avoid as string;
        const geojson = tripStore.tripRouteGeojson;
        if (!geojson?.coordinates || geojson.coordinates.length < 2)
          return 'No route set. Build a route first.';
        const { points, useCelsius } = await fetchRouteWeather(geojson.coordinates);
        const durationHrs = tripStore.tripRouteDuration / 3600;

        if (avoid === 'rain') {
          const dryPoints = points.filter((p) => p.rainChance < 20);
          if (dryPoints.length === points.length)
            return 'No rain expected along the route — any departure time works.';
          return `Rain is likely along parts of the route. Consider departing early morning to clear the wet sections before afternoon precipitation builds.`;
        }
        if (avoid === 'dark') {
          // Suggest departure so arrival is before sunset (~7pm conservative)
          const arriveBy = 19; // 7pm
          const suggestDepart = Math.max(6, Math.floor(arriveBy - durationHrs - 0.5));
          return `To finish before dark, depart by ${suggestDepart}:00 AM. Estimated ride time is ${durationHrs.toFixed(1)} hours.`;
        }
        if (avoid === 'traffic') {
          return `To avoid traffic, depart before 6:30 AM or after 9:30 AM. Avoid 4–7 PM near metro areas.`;
        }
        return `Departure suggestion: consider early morning for the best conditions.`;
      }

      case 'get_road_conditions': {
        const geojson = tripStore.tripRouteGeojson;
        if (!geojson?.coordinates || geojson.coordinates.length < 2)
          return 'No route set. Build a route first to check conditions.';
        const samples = sampleRouteCoordinates(geojson.coordinates, 30);
        const allConditions: Array<{ type: string; title: string; description: string; severity: string }> = [];
        const seenIds = new Set<string>();
        for (const sample of samples.slice(0, 5)) {
          const conds = await fetchHEREConditions(sample.lat, sample.lng);
          for (const c of conds) {
            if (!seenIds.has(c.id)) {
              seenIds.add(c.id);
              allConditions.push({
                type: c.type,
                title: c.title,
                description: c.description,
                severity: c.severity,
              });
            }
          }
        }
        if (allConditions.length === 0) return 'No active road conditions reported along the route. Ride clear.';
        const construction = allConditions.filter((c) => c.type === 'construction');
        const hazards = allConditions.filter((c) => c.type === 'hazard');
        const closures = allConditions.filter((c) => c.type === 'closure');
        const parts: string[] = [];
        if (construction.length > 0) {
          parts.push(`CONSTRUCTION (${construction.length}):\n${construction.map((c) => `• [${c.severity.toUpperCase()}] ${c.title}: ${c.description}`).join('\n')}`);
        }
        if (closures.length > 0) {
          parts.push(`CLOSURES (${closures.length}):\n${closures.map((c) => `• [${c.severity.toUpperCase()}] ${c.title}: ${c.description}`).join('\n')}`);
        }
        if (hazards.length > 0) {
          parts.push(`HAZARDS (${hazards.length}):\n${hazards.map((c) => `• [${c.severity.toUpperCase()}] ${c.title}: ${c.description}`).join('\n')}`);
        }
        return `${allConditions.length} condition(s) along the route:\n\n${parts.join('\n\n')}`;
      }

      case 'get_route_eta_check': {
        const durationSec = tripStore.tripRouteDuration;
        if (!durationSec) return 'No route calculated yet. Build a route first.';
        const [depH, depM] = (parameters.departure_time as string).split(':').map(Number);
        const [deadH, deadM] = (parameters.deadline_time as string).split(':').map(Number);
        const departureMin = depH * 60 + depM;
        const deadlineMin = deadH * 60 + deadM;
        const rideMins = Math.ceil(durationSec / 60);
        const arrivalMin = departureMin + rideMins;
        const bufferMin = deadlineMin - arrivalMin;
        if (bufferMin >= 30) {
          return `Yes — ETA is ${fmtTime(arrivalMin)}, giving you ${bufferMin} minutes of buffer before ${fmtTime(deadlineMin)}.`;
        } else if (bufferMin >= 0) {
          return `Tight — ETA is ${fmtTime(arrivalMin)}, only ${bufferMin} minutes before ${fmtTime(deadlineMin)}. No room for stops.`;
        } else {
          return `No — ETA is ${fmtTime(arrivalMin)}, which is ${Math.abs(bufferMin)} minutes past your ${fmtTime(deadlineMin)} deadline. Leave earlier or shorten the route.`;
        }
      }

      // ── Garage ──────────────────────────────────────────────────────
      case 'ask_garage': {
        const bikeName = parameters.bike_name as string | undefined;
        let bike = context.activeBike;
        let isActive = true;

        // If a specific bike was requested, look it up
        if (bikeName) {
          const query = bikeName.toLowerCase();
          const allBikes = garageStore.bikes;
          const match = allBikes.find(
            (b) =>
              b.nickname?.toLowerCase().includes(query) ||
              b.model?.toLowerCase().includes(query) ||
              b.make?.toLowerCase().includes(query),
          );
          if (match) {
            bike = match;
            isActive = match.id === (context.activeBike?.id ?? null);
          } else {
            return `No bike matching "${bikeName}" found in your garage.`;
          }
        }

        if (!bike) return 'No active bike selected. Add a bike in the Garage first.';
        const specs = bike.specs ?? {};
        const parts: string[] = [];
        const label = `${[bike.year, bike.make, bike.model].filter(Boolean).join(' ')}${bike.nickname ? ` "${bike.nickname}"` : ''}`;
        parts.push(`Bike: ${label}${isActive ? ' (active)' : ' (not active)'}`);
        if (bike.odometer) parts.push(`Odometer: ${bike.odometer.toLocaleString()} mi`);
        if (Object.keys(specs).length > 0) parts.push(`Specs: ${JSON.stringify(specs)}`);
        // Include maintenance and modifications for the queried bike
        const userId = garageStore.bikes[0]?.user_id ?? 'local';
        const maintenance = isActive
          ? context.recentMaintenanceLogs.slice(0, 10)
          : await loadMaintenance(bike.id, userId);
        if (maintenance.length > 0) {
          const mList = maintenance.slice(0, 10)
            .map((m) => `${m.maintenanceType} on ${m.date}${m.mileage ? ` @ ${m.mileage} mi` : ''}${m.cost ? ` ($${m.cost})` : ''}`)
            .join('; ');
          parts.push(`Recent maintenance: ${mList}`);
        }
        const mods = await loadModifications(bike.id, userId);
        if (mods.length > 0) {
          const modList = mods
            .map((m) => `${m.title}${m.brand ? ` (${m.brand})` : ''}${m.cost ? ` $${m.cost}` : ''}`)
            .join('; ');
          parts.push(`Modifications: ${modList}`);
        }
        if (isActive) {
          const intervals = context.serviceIntervals;
          if (intervals) parts.push(`Service intervals: ${JSON.stringify(intervals)}`);
        }
        parts.push(`Question: ${parameters.question}`);
        return parts.join('\n');
      }

      case 'set_active_bike': {
        const query = (parameters.query as string).toLowerCase();
        const bikes = garageStore.bikes;
        const match = bikes.find(
          (b) =>
            b.nickname?.toLowerCase().includes(query) ||
            b.model?.toLowerCase().includes(query) ||
            b.make?.toLowerCase().includes(query),
        );
        if (!match) return `No bike matching "${parameters.query}" found in your garage.`;
        garageStore.selectBike(match.id);
        const label = [match.year, match.make, match.model].filter(Boolean).join(' ');
        return `Switched active bike to ${match.nickname ? `${label} ("${match.nickname}")` : label}.`;
      }

      case 'refresh_bike_data': {
        const bikeName = parameters.bike_name as string | undefined;
        let bike = context.activeBike;
        if (bikeName) {
          const q = bikeName.toLowerCase();
          const match = garageStore.bikes.find(
            (b) => b.nickname?.toLowerCase().includes(q) || b.model?.toLowerCase().includes(q) || b.make?.toLowerCase().includes(q),
          );
          if (!match) return `No bike matching "${bikeName}" found in your garage.`;
          bike = match;
        }
        if (!bike) return 'No active bike selected. Add a bike in the Garage first.';
        garageStore.bumpGarageDataRefresh();
        const bikeLabel = bike.nickname ?? [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
        return `Refreshing specs, service intervals, and service bulletins for ${bikeLabel}. Head to Garage to see updated data.`;
      }

      case 'add_maintenance_log': {
        const bikeName = parameters.bike_name as string | undefined;
        let bike = context.activeBike;
        if (bikeName) {
          const q = bikeName.toLowerCase();
          const match = garageStore.bikes.find(
            (b) => b.nickname?.toLowerCase().includes(q) || b.model?.toLowerCase().includes(q) || b.make?.toLowerCase().includes(q),
          );
          if (!match) return `No bike matching "${bikeName}" found in your garage.`;
          bike = match;
        }
        if (!bike) return 'No active bike selected. Add a bike in the Garage first.';

        const now = new Date();
        const dateStr = (parameters.date as string) ?? now.toISOString().split('T')[0];
        const maintenanceType = parameters.maintenance_type as string;
        const title = maintenanceType.charAt(0).toUpperCase() + maintenanceType.slice(1);

        const record: MaintenanceRecord = {
          id: uuid(),
          bikeId: bike.id,
          title,
          maintenanceType: title,
          date: dateStr,
          mileage: parameters.mileage as number | undefined,
          cost: parameters.cost as number | undefined,
          notes: parameters.notes as string | undefined,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        const userId = bike.user_id ?? garageStore.bikes[0]?.user_id ?? 'local';
        try {
          await addMaintenanceRecord(bike.id, record, userId);
          garageStore.bumpMaintenanceRefresh();
        } catch (e: any) {
          return `Failed to save maintenance record: ${e?.message ?? 'unknown error'}. Try again.`;
        }

        const bikeLabel = bike.nickname ?? [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
        let confirmation = `Added "${title}" to ${bikeLabel}'s maintenance log for ${dateStr}.`;
        if (parameters.mileage) confirmation += ` Odometer: ${(parameters.mileage as number).toLocaleString()} mi.`;
        if (parameters.cost) confirmation += ` Cost: $${parameters.cost}.`;
        return confirmation;
      }

      case 'add_modification': {
        const bikeName = parameters.bike_name as string | undefined;
        let bike = context.activeBike;
        if (bikeName) {
          const q = bikeName.toLowerCase();
          const match = garageStore.bikes.find(
            (b) => b.nickname?.toLowerCase().includes(q) || b.model?.toLowerCase().includes(q) || b.make?.toLowerCase().includes(q),
          );
          if (!match) return `No bike matching "${bikeName}" found in your garage.`;
          bike = match;
        }
        if (!bike) return 'No active bike selected. Add a bike in the Garage first.';

        const now = new Date();
        const mod: Modification = {
          id: uuid(),
          bikeId: bike.id,
          title: parameters.title as string,
          brand: parameters.brand as string | undefined,
          category: parameters.category as string,
          dateInstalled: (parameters.date_installed as string) ?? now.toISOString().split('T')[0],
          cost: parameters.cost as number | undefined,
          notes: parameters.notes as string | undefined,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        const userId = bike.user_id ?? garageStore.bikes[0]?.user_id ?? 'local';
        try {
          await addModification(bike.id, mod, userId);
          garageStore.bumpMaintenanceRefresh();
        } catch (e: any) {
          return `Failed to save modification: ${e?.message ?? 'unknown error'}. Try again.`;
        }

        const bikeLabel = bike.nickname ?? [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
        let confirmation = `Added "${mod.title}" to ${bikeLabel}'s modifications.`;
        if (mod.brand) confirmation += ` Brand: ${mod.brand}.`;
        if (mod.cost) confirmation += ` Cost: $${mod.cost}.`;
        return confirmation;
      }

      case 'update_maintenance_log': {
        const bikeName = parameters.bike_name as string | undefined;
        let bike = context.activeBike;
        if (bikeName) {
          const q = bikeName.toLowerCase();
          const match = garageStore.bikes.find(
            (b) => b.nickname?.toLowerCase().includes(q) || b.model?.toLowerCase().includes(q) || b.make?.toLowerCase().includes(q),
          );
          if (!match) return `No bike matching "${bikeName}" found in your garage.`;
          bike = match;
        }
        if (!bike) return 'No active bike selected. Add a bike in the Garage first.';

        const userId = bike.user_id ?? garageStore.bikes[0]?.user_id ?? 'local';
        const records = await loadMaintenance(bike.id, userId);
        const type = (parameters.maintenance_type as string).toLowerCase();
        const match = records.find((r) => r.maintenanceType.toLowerCase().includes(type));
        if (!match) return `No "${parameters.maintenance_type}" entry found for ${bike.nickname ?? bike.model}. You can add one instead.`;

        // Update fields
        if (parameters.mileage != null) match.mileage = parameters.mileage as number;
        if (parameters.cost != null) match.cost = parameters.cost as number;
        if (parameters.notes) match.notes = parameters.notes as string;
        if (parameters.date) match.date = parameters.date as string;
        match.updatedAt = new Date().toISOString();

        try {
          await updateMaintenanceRecord(bike.id, match, userId);
          garageStore.bumpMaintenanceRefresh();
        } catch (e: any) {
          return `Failed to update: ${e?.message ?? 'unknown error'}`;
        }

        const bikeLabel = bike.nickname ?? [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
        let msg = `Updated "${match.maintenanceType}" on ${bikeLabel}.`;
        if (parameters.mileage != null) msg += ` Odometer: ${(parameters.mileage as number).toLocaleString()} mi.`;
        if (parameters.cost != null) msg += ` Cost: $${parameters.cost}.`;
        return msg;
      }

      case 'update_modification': {
        const bikeName = parameters.bike_name as string | undefined;
        let bike = context.activeBike;
        if (bikeName) {
          const q = bikeName.toLowerCase();
          const match = garageStore.bikes.find(
            (b) => b.nickname?.toLowerCase().includes(q) || b.model?.toLowerCase().includes(q) || b.make?.toLowerCase().includes(q),
          );
          if (!match) return `No bike matching "${bikeName}" found in your garage.`;
          bike = match;
        }
        if (!bike) return 'No active bike selected. Add a bike in the Garage first.';

        const userId = bike.user_id ?? garageStore.bikes[0]?.user_id ?? 'local';
        const mods = await loadModifications(bike.id, userId);
        const title = (parameters.title as string).toLowerCase();
        const match = mods.find((m) => m.title.toLowerCase().includes(title));
        if (!match) return `No modification matching "${parameters.title}" found for ${bike.nickname ?? bike.model}.`;

        if (parameters.brand) match.brand = parameters.brand as string;
        if (parameters.cost != null) match.cost = parameters.cost as number;
        if (parameters.notes) match.notes = parameters.notes as string;
        if (parameters.date_installed) match.dateInstalled = parameters.date_installed as string;
        match.updatedAt = new Date().toISOString();

        try {
          await updateModification(bike.id, match, userId);
          garageStore.bumpMaintenanceRefresh();
        } catch (e: any) {
          return `Failed to update: ${e?.message ?? 'unknown error'}`;
        }

        const bikeLabel = bike.nickname ?? [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
        return `Updated "${match.title}" on ${bikeLabel}.`;
      }

      case 'update_bike': {
        const bikeName = (parameters.bike_name as string).toLowerCase();
        const match = garageStore.bikes.find(
          (b) => b.nickname?.toLowerCase().includes(bikeName) || b.model?.toLowerCase().includes(bikeName) || b.make?.toLowerCase().includes(bikeName),
        );
        if (!match) return `No bike matching "${parameters.bike_name}" found in your garage.`;

        const updated = { ...match };
        if (parameters.nickname) updated.nickname = parameters.nickname as string;
        if (parameters.odometer != null) updated.odometer = parameters.odometer as number;
        if (parameters.year != null) updated.year = parameters.year as number;
        if (parameters.make) updated.make = parameters.make as string;
        if (parameters.model) updated.model = parameters.model as string;

        // Update store
        garageStore.updateBike(updated);

        // Persist to Supabase
        try {
          await supabase.from('bikes').update({
            nickname: updated.nickname,
            odometer: updated.odometer,
            year: updated.year,
            make: updated.make,
            model: updated.model,
          }).eq('id', updated.id);
        } catch {}

        const oldLabel = match.nickname ?? [match.year, match.make, match.model].filter(Boolean).join(' ');
        const newLabel = updated.nickname ?? [updated.year, updated.make, updated.model].filter(Boolean).join(' ');
        const changes: string[] = [];
        if (parameters.nickname) changes.push(`nickname → "${updated.nickname}"`);
        if (parameters.odometer != null) changes.push(`odometer → ${(updated.odometer ?? 0).toLocaleString()} mi`);
        if (parameters.year != null || parameters.make || parameters.model) changes.push(`${newLabel}`);
        return `Updated ${oldLabel}: ${changes.join(', ')}.`;
      }

      // ── Ride Controls ────────────────────────────────────────────────
      case 'pause_ride': {
        const safety = useSafetyStore.getState();
        if (!safety.isRecording) return 'No active ride to pause.';
        if (safety.isRidePaused) return 'Ride is already paused.';
        safety.setRidePaused(true);
        return 'Ride paused.';
      }

      case 'resume_ride': {
        const safety = useSafetyStore.getState();
        if (!safety.isRecording) return 'No active ride to resume.';
        if (!safety.isRidePaused) return 'Ride is not paused.';
        safety.setRidePaused(false);
        return 'Ride resumed.';
      }

      case 'get_ride_stats': {
        const safety = useSafetyStore.getState();
        const nav = useNavigationStore.getState();
        if (!safety.isRecording && nav.mode === 'idle') return 'No active ride or navigation.';

        const parts: string[] = [];
        if (safety.isRecording) {
          const dist = calcDistance(safety.recordedPoints);
          parts.push(`Distance: ${dist.toFixed(1)} mi`);
          parts.push(safety.isRidePaused ? 'Status: paused' : 'Status: recording');
        }
        if (nav.speedMph > 0) parts.push(`Speed: ${Math.round(nav.speedMph)} mph`);
        if (nav.mode !== 'idle') {
          parts.push(`Remaining: ${nav.remainingDistanceMiles.toFixed(1)} mi`);
          if (nav.eta) parts.push(`ETA: ${nav.eta.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`);
          if (nav.destination) parts.push(`Heading to: ${nav.destination.name}`);
        }
        return parts.join(' · ');
      }

      case 'get_navigation_status': {
        const nav = useNavigationStore.getState();
        if (nav.mode === 'idle') return 'No active navigation.';

        const parts: string[] = [];
        parts.push(`Mode: ${nav.mode}`);
        if (nav.destination) parts.push(`Destination: ${nav.destination.name}`);
        parts.push(`Remaining: ${nav.remainingDistanceMiles.toFixed(1)} mi`);
        if (nav.eta) parts.push(`ETA: ${nav.eta.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`);
        if (nav.speedMph > 0) parts.push(`Speed: ${Math.round(nav.speedMph)} mph`);
        if (nav.isOffRoute) parts.push('⚠️ OFF ROUTE');
        if (nav.activeRoute?.steps?.[nav.currentStepIndex]) {
          const step = nav.activeRoute.steps[nav.currentStepIndex];
          parts.push(`Next: ${step.instruction}`);
        }
        return parts.join(' · ');
      }

      case 'find_nearby': {
        const query = parameters.query as string;
        const results = await geocodeLocation(query, context.currentLocation);
        if (results.length === 0) return `No "${query}" found nearby.`;
        const place = results[0];
        return `Found: ${place.name}. Want me to add it as a stop?`;
      }

      case 'stop_ride': {
        const safety = useSafetyStore.getState();
        if (!safety.isRecording) return 'No active ride to stop.';

        const confirmed = parameters.confirmed as boolean;
        if (!confirmed) {
          stopRideConfirmationPending = true;
          const dist = calcDistance(safety.recordedPoints);
          return `You've ridden ${dist.toFixed(1)} miles. Are you sure you want to stop and save your ride?`;
        }

        // Only allow confirmed:true if a prior call set the confirmation flag
        if (!stopRideConfirmationPending) {
          stopRideConfirmationPending = true;
          const dist = calcDistance(safety.recordedPoints);
          return `You've ridden ${dist.toFixed(1)} miles. Are you sure you want to stop and save your ride?`;
        }

        stopRideConfirmationPending = false;
        safety.setRecording(false);
        return 'Ride stopped. Save your ride from the Ride screen.';
      }

      case 'add_stop_to_navigation': {
        const query = parameters.query as string;
        const nav = useNavigationStore.getState();
        const isNavigating = nav.mode === 'navigating' || nav.mode === 'off_route' || nav.mode === 'recalculating';

        const results = await geocodeLocation(query, context.currentLocation);
        if (results.length === 0) return `No "${query}" found nearby.`;
        const place = results[0];

        if (isNavigating && nav.activeRoute) {
          // Insert as next waypoint in active navigation
          // Calculate distance from current location
          let distToStop = 0;
          if (context.currentLocation) {
            const { haversineMiles } = await import('./distance');
            distToStop = haversineMiles(context.currentLocation.lat, context.currentLocation.lng, place.lat, place.lng);
          }
          // Add to trip planner store as a waypoint (navigation will pick it up)
          const wps = [...(tripStore.tripWaypoints as TripStop[])];
          wps.push({ name: place.name, lat: place.lat, lng: place.lng });
          tripStore.setTripWaypoints(wps);
          return `Added ${place.name} as your next stop — ${distToStop.toFixed(1)} mi away.`;
        }

        // Not navigating — add to trip planner
        const wps = [...(tripStore.tripWaypoints as TripStop[])];
        wps.push({ name: place.name, lat: place.lat, lng: place.lng });
        tripStore.setTripWaypoints(wps);
        return `Added ${place.name} to your trip. Head to Trip Planner to see it on the map.`;
      }

      // ── Saving ──────────────────────────────────────────────────────
      case 'describe_saved_route': {
        const match = findSavedRoute(parameters.query as string);
        if (!match) {
          const allRoutes = useRoutesStore.getState().routes;
          const cats = [...new Set(allRoutes.map((r) => r.category).filter(Boolean))];
          return `No saved route matching "${parameters.query}". You have ${allRoutes.length} route(s) in: ${cats.join(', ')}.`;
        }
        const parts: string[] = [];
        parts.push(`Route: ${match.name}`);
        if (match.category) parts.push(`Category: ${match.category}`);
        parts.push(`Distance: ${match.distance_miles.toFixed(1)} mi`);
        if (match.duration_seconds) {
          const hrs = Math.floor(match.duration_seconds / 3600);
          const mins = Math.round((match.duration_seconds % 3600) / 60);
          parts.push(`Duration: ${hrs}h ${mins}m`);
        }
        if (match.departure_time) {
          const dep = new Date(match.departure_time);
          if (!isNaN(dep.getTime())) {
            const dateStr = dep.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            const hasTime = dep.getHours() !== 0 || dep.getMinutes() !== 0;
            parts.push(`Departure: ${dateStr}${hasTime ? ` at ${dep.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`);
          }
        }
        if (match.source) parts.push(`Source: ${match.source}`);
        parts.push(`Points: ${match.points.length}`);
        parts.push(`Created: ${new Date(match.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
        return parts.join('\n');
      }

      case 'load_saved_route': {
        const match = findSavedRoute(parameters.query as string);
        if (!match) return `No saved route matching "${parameters.query}" found.`;
        if (match.points.length < 2) return `Route "${match.name}" doesn't have enough points to load.`;
        const first = match.points[0];
        const last = match.points[match.points.length - 1];
        tripStore.setTripOrigin({ name: match.name.split('→')[0]?.trim() || 'Start', lat: first.lat, lng: first.lng });
        tripStore.setTripDestination({ name: match.name.split('→')[1]?.trim() || 'End', lat: last.lat, lng: last.lng });
        tripStore.setTripWaypoints([]);
        // Set route geometry directly from saved points so weather/conditions tools work immediately
        const geometry = {
          type: 'LineString' as const,
          coordinates: match.points.map((p) => [p.lng, p.lat] as [number, number]),
        };
        tripStore.setTripRoute(geometry, match.distance_miles, match.duration_seconds ?? 0, true);
        return `Loaded "${match.name}" into Trip Planner — ${match.distance_miles.toFixed(1)} mi${match.duration_seconds ? `, ${Math.floor(match.duration_seconds / 3600)}h ${Math.round((match.duration_seconds % 3600) / 60)}m` : ''}.`;
      }

      case 'save_current_route': {
        const geojson = tripStore.tripRouteGeojson;
        if (!geojson?.coordinates || geojson.coordinates.length < 2)
          return 'No route to save. Build a route first.';
        const origin = context.currentTrip.origin;
        const dest = context.currentTrip.destination;
        const routeName = parameters.name ??
          `${origin?.name?.split(',')[0] ?? 'Start'} → ${dest?.name?.split(',')[0] ?? 'End'}`;
        const category = parameters.category ?? 'Scout Routes';
        const points = geojson.coordinates.map((c: [number, number]) => ({
          lat: c[1],
          lng: c[0],
        }));
        const userId = garageStore.bikes[0]?.user_id ?? 'local';
        const route = await createRoute(
          userId,
          routeName,
          points,
          tripStore.tripRouteDistance,
          0, // elevation not available from trip planner
          tripStore.tripRouteDuration || null,
          category,
          'planned',
          context.activeBike?.id ?? null,
          tripStore.tripCustomDate?.toISOString() ?? null,
        );
        if (!route) return 'Failed to save route. Try again.';
        tripStore.setTripSaved(true);
        return `Route "${routeName}" saved to ${category}.`;
      }

      // ── Post-Ride ───────────────────────────────────────────────────
      case 'generate_ride_summary': {
        const { distance, duration, avg_speed, elevation_gain, bike_nickname, start_city } =
          parameters as {
            distance: number;
            duration: number;
            avg_speed: number;
            elevation_gain: number;
            bike_nickname: string;
            start_city?: string;
          };
        const hrs = Math.floor(duration / 3600);
        const mins = Math.round((duration % 3600) / 60);
        const durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        const dayAbbr = new Date().toLocaleDateString('en-US', { weekday: 'short' });
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const suggestedName = start_city
          ? `${dayAbbr} ${dateStr} — ${start_city}`
          : `${dayAbbr} ${dateStr} Ride`;
        const summary =
          `${distance.toFixed(1)} miles in ${durationStr} on the ${bike_nickname}. ` +
          `Averaged ${avg_speed.toFixed(0)} mph with ${elevation_gain.toLocaleString()} ft of climbing.`;
        return JSON.stringify({ suggestedName, summary });
      }

      // ── Safety tools ─────────────────────────────────────────────────
      case 'cancel_crash_alert': {
        const safetyStore = useSafetyStore.getState();
        if (!safetyStore.isCrashAlertActive) return 'No crash alert is currently active.';
        if (safetyStore.cancelCrashAlert) {
          safetyStore.cancelCrashAlert();
          return 'Crash alert cancelled. Rider confirmed they are OK.';
        }
        return 'Crash alert is active but cancel handler is not available.';
      }

      case 'trigger_emergency': {
        const safetyStore = useSafetyStore.getState();
        if (!safetyStore.isCrashAlertActive) return 'No crash alert is currently active.';
        if (safetyStore.triggerEmergencyNow) {
          safetyStore.triggerEmergencyNow();
          return 'Emergency contacts are being notified immediately.';
        }
        return 'Crash alert is active but emergency handler is not available.';
      }

      case 'checkin_now': {
        const safetyStore = useSafetyStore.getState();
        if (!safetyStore.checkInActive) return 'No check-in timer is currently active.';
        if (safetyStore.checkInNotifId) {
          try {
            const Notifs = require('expo-notifications');
            Notifs.cancelScheduledNotificationAsync(safetyStore.checkInNotifId).catch(() => {});
          } catch {}
        }
        safetyStore.clearCheckIn();
        return 'Check-in timer reset. Your contacts will not be alerted.';
      }

      case 'get_safety_status': {
        const ss = useSafetyStore.getState();
        const parts: string[] = [];
        parts.push(`Crash detection: ${ss.isMonitoring ? 'ON' : 'OFF'}`);
        parts.push(`Crash alert active: ${ss.isCrashAlertActive ? 'YES' : 'no'}`);
        parts.push(`Live share: ${ss.shareActive ? 'ON' : 'OFF'}${ss.shareToken ? ` (token: ${ss.shareToken.slice(0, 8)}…)` : ''}`);
        if (ss.checkInActive && ss.checkInDeadline) {
          const secsLeft = Math.max(0, Math.round((ss.checkInDeadline - Date.now()) / 1000));
          const mins = Math.floor(secsLeft / 60);
          parts.push(`Check-in timer: ${mins}m ${secsLeft % 60}s remaining`);
        } else {
          parts.push('Check-in timer: OFF');
        }
        parts.push(`Emergency contacts: ${ss.emergencyContacts.length}`);
        return parts.join('\n');
      }

      default:
        return `Unknown tool "${toolName}".`;
    }
  } catch (err: any) {
    return `Tool "${toolName}" failed: ${err?.message ?? 'unknown error'}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format minutes-since-midnight to 12h time string. */
/** Fuzzy match a saved route by name or category — tries exact substring, then word overlap */
function findSavedRoute(query: string) {
  const allRoutes = useRoutesStore.getState().routes;
  const q = query.toLowerCase();

  // 1. Exact substring match on name
  const exact = allRoutes.find((r) => r.name.toLowerCase().includes(q));
  if (exact) return exact;

  // 2. Exact substring match on category
  const catMatch = allRoutes.find((r) => r.category?.toLowerCase().includes(q));
  if (catMatch) return catMatch;

  // 3. Word-level match — split query into words, require at least half to match
  const queryWords = q.split(/[\s\-_]+/).filter((w) => w.length > 2); // skip short words like "my", "to"
  if (queryWords.length === 0) return null;
  const minScore = Math.max(1, Math.ceil(queryWords.length / 2));
  let bestRoute: typeof allRoutes[0] | null = null;
  let bestScore = 0;
  for (const r of allRoutes) {
    const text = `${r.name} ${r.category ?? ''}`.toLowerCase();
    const score = queryWords.filter((w) => text.includes(w)).length;
    if (score > bestScore) { bestScore = score; bestRoute = r; }
  }
  return bestScore >= minScore ? bestRoute : null;
}

function fmtTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}
