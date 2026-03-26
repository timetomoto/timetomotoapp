import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTripPlannerStore, useRoutesStore, useGarageStore, useSafetyStore } from './store';
import { useNavigationStore } from './navigationStore';
import { calcDistance } from './gpx';
import { geocodeLocation, reverseGeocode } from './geocode';
import { addMaintenanceRecord, addModification, updateMaintenanceRecord, updateModification, deleteMaintenanceRecord, deleteModification, loadMaintenance, loadModifications, type MaintenanceRecord, type Modification } from './garage';
import { supabase } from './supabase';
import { fetchDirections } from './directions';
import { fetchRouteWeather, sampleRouteCoordinates, hasRouteWeatherConcern, getRouteWarningMessage } from './routeWeather';
import { fetchHEREConditions } from './discoverStore';
import { createRoute } from './routes';
import type { ScoutContext, TripStop } from './scoutTypes';

// Re-export from split files so existing imports from './scoutTools' still work
export { SCOUT_TOOL_DEFINITIONS, CRASH_MODE_TOOLS } from './scoutToolDefinitions';
export type { ToolDefinition } from './scoutToolDefinitions';
import { uuid, PREFERENCE_MAP, stopRideConfirmationPending, setStopRideConfirmationPending, resolveSegmentIndex, findSavedRoute, fmtTime, findBikeByName } from './scoutToolHelpers';

// ---------------------------------------------------------------------------
// Tool executor — helpers imported from ./scoutToolHelpers.ts
// ---------------------------------------------------------------------------

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
        // Use route midpoint for proximity so geocoding stays near the route
        const steerTs = useTripPlannerStore.getState();
        const steerProx = (() => {
          const o = steerTs.tripOrigin;
          const d = steerTs.tripDestination;
          if (o && d) return { lat: (o.lat + d.lat) / 2, lng: (o.lng + d.lng) / 2 };
          if (o) return { lat: o.lat, lng: o.lng };
          return context.currentLocation;
        })();
        const viaResults = await geocodeLocation(parameters.via, steerProx);
        if (viaResults.length === 0) return `Could not find "${parameters.via}" to route through.`;
        const via = viaResults[0];

        const startIdx = resolveSegmentIndex(parameters.segment_start, context);
        const endIdx = resolveSegmentIndex(parameters.segment_end, context);
        // Insert after the start point
        const insertAt = Math.max(0, startIdx + 1);
        const wp: TripStop = { name: via.name, lat: via.lat, lng: via.lng };
        const liveWps = useTripPlannerStore.getState().tripWaypoints as TripStop[];
        const waypoints = [...liveWps];
        waypoints.splice(insertAt, 0, wp);
        tripStore.setTripWaypoints(waypoints);
        return `Inserted via-waypoint at ${via.name} between ${parameters.segment_start} and ${parameters.segment_end} to steer the route.`;
      }

      case 'avoid_road': {
        // Route around the named road by inserting a bypass via-point
        // Use route midpoint for proximity so geocoding stays near the route
        const ts = useTripPlannerStore.getState();
        const routeProx = (() => {
          const o = ts.tripOrigin;
          const d = ts.tripDestination;
          if (o && d) return { lat: (o.lat + d.lat) / 2, lng: (o.lng + d.lng) / 2 };
          if (o) return { lat: o.lat, lng: o.lng };
          return context.currentLocation;
        })();
        // Build a query that stays near the route region
        const originName = context.currentTrip.origin?.name ?? '';
        const destName = context.currentTrip.destination?.name ?? '';
        const regionHint = originName && destName ? ` between ${originName} and ${destName}` : '';
        const bypassQuery = `town not on ${parameters.road_name}${regionHint}`;
        const viaResults = await geocodeLocation(bypassQuery, routeProx);
        if (viaResults.length === 0) {
          // Fallback: try just a town near the segment
          const fallback = await geocodeLocation(
            `town near ${parameters.segment_start ?? originName}`,
            routeProx,
          );
          if (fallback.length === 0) return `Could not find a bypass route to avoid ${parameters.road_name}.`;
          const via = fallback[0];
          const startIdx = resolveSegmentIndex(parameters.segment_start, context);
          const insertAt = Math.max(0, startIdx + 1);
          const liveWps = useTripPlannerStore.getState().tripWaypoints as TripStop[];
          const waypoints = [...liveWps];
          waypoints.splice(insertAt, 0, { name: via.name, lat: via.lat, lng: via.lng });
          tripStore.setTripWaypoints(waypoints);
          return `Added bypass waypoint at ${via.name} to avoid ${parameters.road_name}. Check the map to confirm the new routing.`;
        }
        const via = viaResults[0];
        const startIdx = resolveSegmentIndex(parameters.segment_start, context);
        const insertAt = Math.max(0, startIdx + 1);
        const liveWps = useTripPlannerStore.getState().tripWaypoints as TripStop[];
        const waypoints = [...liveWps];
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
        // Prioritize severe/moderate, cap total to keep response manageable
        const sorted = allConditions.sort((a, b) => {
          const sev = { critical: 0, major: 1, severe: 1, moderate: 2, minor: 3, low: 4 } as Record<string, number>;
          return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
        });
        const capped = sorted.slice(0, 15);
        const construction = capped.filter((c) => c.type === 'construction');
        const hazards = capped.filter((c) => c.type === 'hazard');
        const closures = capped.filter((c) => c.type === 'closure');
        const parts: string[] = [];
        parts.push(`${allConditions.length} total conditions found (showing top ${capped.length} by severity).`);
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
          const match = allBikes.find((b) => {
            const nick = b.nickname?.toLowerCase() ?? '';
            const model = b.model?.toLowerCase() ?? '';
            const make = b.make?.toLowerCase() ?? '';
            const year = b.year ? String(b.year) : '';
            const fullLabel = `${year} ${make} ${model} ${nick}`.toLowerCase();
            // Match in either direction: query contains bike fields OR bike fields contain query
            return nick.includes(query) || model.includes(query) || make.includes(query) ||
              query.includes(nick) || query.includes(model) || query.includes(make) ||
              fullLabel.includes(query) || query.includes(fullLabel.trim());
          });
          if (match) {
            bike = match;
            isActive = match.id === (context.activeBike?.id ?? null);
          } else {
            return `No bike matching "${bikeName}" found in your garage.`;
          }
        }

        if (!bike) return 'No active bike selected. Add a bike in the Garage first.';
        // Read specs from live store — context bike may have stale/empty specs
        const liveBike = garageStore.bikes.find((b) => b.id === bike!.id);
        const specs = liveBike?.specs ?? bike.specs ?? {};
        const parts: string[] = [];
        const label = `${[bike.year, bike.make, bike.model].filter(Boolean).join(' ')}${bike.nickname ? ` "${bike.nickname}"` : ''}`;
        parts.push(`Bike: ${label}${isActive ? ' (active)' : ' (not active)'}`);
        if (bike.odometer) parts.push(`Odometer: ${bike.odometer.toLocaleString()} mi`);
        if (Object.keys(specs).length > 0) {
          // Format specs as readable key-value pairs instead of raw JSON
          const specLines = Object.entries(specs)
            .filter(([, v]) => v != null && v !== '' && v !== false)
            .map(([k, v]) => `  ${k}: ${v}`)
            .join('\n');
          parts.push(`Specs:\n${specLines}`);
        }
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
        // Load cached service intervals
        const intervalCacheKey = `ttm_service_intervals_${bike.id}`;
        try {
          const intervalRaw = await AsyncStorage.getItem(intervalCacheKey);
          if (intervalRaw) {
            const cached = JSON.parse(intervalRaw);
            if (cached.items?.length > 0) {
              const intervalList = cached.items
                .map((it: any) => `${it.item}: ${it.interval}${it.notes ? ` (${it.notes})` : ''}`)
                .join('\n  ');
              parts.push(`Service intervals:\n  ${intervalList}`);
            }
          }
        } catch {}
        parts.push(`Question: ${parameters.question}`);
        return parts.join('\n');
      }

      case 'set_active_bike': {
        const query = (parameters.query as string).toLowerCase();
        const bikes = garageStore.bikes;
        const match = bikes.find((b) => {
          const nick = b.nickname?.toLowerCase() ?? '';
          const model = b.model?.toLowerCase() ?? '';
          const make = b.make?.toLowerCase() ?? '';
          const fullLabel = `${b.year ?? ''} ${make} ${model} ${nick}`.toLowerCase();
          return nick.includes(query) || model.includes(query) || make.includes(query) ||
            query.includes(nick) || query.includes(model) || query.includes(make) ||
            fullLabel.includes(query) || query.includes(fullLabel.trim());
        });
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
            (b) => {
              const nick = b.nickname?.toLowerCase() ?? ''; const mdl = b.model?.toLowerCase() ?? ''; const mk = b.make?.toLowerCase() ?? '';
              return nick.includes(q) || mdl.includes(q) || mk.includes(q) || q.includes(nick) || q.includes(mdl) || q.includes(mk);
            },
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
            (b) => {
              const nick = b.nickname?.toLowerCase() ?? ''; const mdl = b.model?.toLowerCase() ?? ''; const mk = b.make?.toLowerCase() ?? '';
              return nick.includes(q) || mdl.includes(q) || mk.includes(q) || q.includes(nick) || q.includes(mdl) || q.includes(mk);
            },
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
            (b) => {
              const nick = b.nickname?.toLowerCase() ?? ''; const mdl = b.model?.toLowerCase() ?? ''; const mk = b.make?.toLowerCase() ?? '';
              return nick.includes(q) || mdl.includes(q) || mk.includes(q) || q.includes(nick) || q.includes(mdl) || q.includes(mk);
            },
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
            (b) => {
              const nick = b.nickname?.toLowerCase() ?? ''; const mdl = b.model?.toLowerCase() ?? ''; const mk = b.make?.toLowerCase() ?? '';
              return nick.includes(q) || mdl.includes(q) || mk.includes(q) || q.includes(nick) || q.includes(mdl) || q.includes(mk);
            },
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
            (b) => {
              const nick = b.nickname?.toLowerCase() ?? ''; const mdl = b.model?.toLowerCase() ?? ''; const mk = b.make?.toLowerCase() ?? '';
              return nick.includes(q) || mdl.includes(q) || mk.includes(q) || q.includes(nick) || q.includes(mdl) || q.includes(mk);
            },
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

      case 'delete_maintenance_log': {
        const bikeName = parameters.bike_name as string | undefined;
        let bike = context.activeBike;
        if (bikeName) {
          const q = bikeName.toLowerCase();
          const allBikes = garageStore.bikes;
          const found = allBikes.find((b) => {
            const nick = b.nickname?.toLowerCase() ?? '';
            const model = b.model?.toLowerCase() ?? '';
            const make = b.make?.toLowerCase() ?? '';
            return nick.includes(q) || model.includes(q) || make.includes(q) ||
              q.includes(nick) || q.includes(model) || q.includes(make);
          });
          if (!found) return `No bike matching "${bikeName}" found in your garage.`;
          bike = found;
        }
        if (!bike) return 'No active bike selected.';
        const userId = bike.user_id ?? garageStore.bikes[0]?.user_id ?? 'local';
        const logs = await loadMaintenance(bike.id, userId);
        const mType = (parameters.maintenance_type as string).toLowerCase();
        const entry = logs.find((m) => m.maintenanceType.toLowerCase().includes(mType));
        if (!entry) return `No "${parameters.maintenance_type}" entry found for ${bike.nickname ?? bike.model}.`;
        try {
          await deleteMaintenanceRecord(bike.id, entry.id, userId);
          garageStore.bumpMaintenanceRefresh();
        } catch (e: any) {
          return `Failed to delete: ${e?.message ?? 'unknown error'}`;
        }
        const bikeLabel = bike.nickname ?? [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
        return `Deleted "${entry.maintenanceType}" from ${bikeLabel}'s maintenance log.`;
      }

      case 'delete_modification': {
        const bikeName = parameters.bike_name as string | undefined;
        let bike = context.activeBike;
        if (bikeName) {
          const q = bikeName.toLowerCase();
          const allBikes = garageStore.bikes;
          const found = allBikes.find((b) => {
            const nick = b.nickname?.toLowerCase() ?? '';
            const model = b.model?.toLowerCase() ?? '';
            const make = b.make?.toLowerCase() ?? '';
            return nick.includes(q) || model.includes(q) || make.includes(q) ||
              q.includes(nick) || q.includes(model) || q.includes(make);
          });
          if (!found) return `No bike matching "${bikeName}" found in your garage.`;
          bike = found;
        }
        if (!bike) return 'No active bike selected.';
        const userId = bike.user_id ?? garageStore.bikes[0]?.user_id ?? 'local';
        const mods = await loadModifications(bike.id, userId);
        const title = (parameters.title as string).toLowerCase();
        const mod = mods.find((m) => m.title.toLowerCase().includes(title));
        if (!mod) return `No modification matching "${parameters.title}" found for ${bike.nickname ?? bike.model}.`;
        try {
          await deleteModification(bike.id, mod.id, userId);
          garageStore.bumpMaintenanceRefresh();
        } catch (e: any) {
          return `Failed to delete: ${e?.message ?? 'unknown error'}`;
        }
        const bikeLabel = bike.nickname ?? [bike.year, bike.make, bike.model].filter(Boolean).join(' ');
        return `Deleted "${mod.title}" from ${bikeLabel}'s modifications.`;
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
        // Use current location, or fall back to route origin/midpoint
        const proximity = context.currentLocation ?? (() => {
          const ts = useTripPlannerStore.getState();
          const o = ts.tripOrigin;
          const d = ts.tripDestination;
          if (o && d) return { lat: (o.lat + d.lat) / 2, lng: (o.lng + d.lng) / 2 };
          if (o) return { lat: o.lat, lng: o.lng };
          return null;
        })();
        // Append city hint to avoid matching road names in other states
        const cityHint = context.currentLocation?.city
          ?? (proximity ? await reverseGeocode(proximity.lat, proximity.lng) : '');
        const searchQuery = cityHint ? `${query} near ${cityHint}` : query;
        const results = await geocodeLocation(searchQuery, proximity);
        if (results.length === 0) return `No "${query}" found nearby.`;
        const place = results[0];
        return `Found: ${place.name}. Want me to add it as a stop?`;
      }

      case 'start_ride': {
        const safety = useSafetyStore.getState();
        if (safety.isRecording) return 'You already have a ride in progress.';
        safety.setPendingStartRide(true);
        return 'Opening your pre-ride checklist. Review your settings and tap START & RECORD RIDE when ready.';
      }

      case 'stop_ride': {
        const safety = useSafetyStore.getState();
        if (!safety.isRecording) return 'No active ride to stop.';

        const confirmed = parameters.confirmed as boolean;
        if (!confirmed) {
          setStopRideConfirmationPending(true);
          const dist = calcDistance(safety.recordedPoints);
          return `You've ridden ${dist.toFixed(1)} miles. Are you sure you want to stop and save your ride?`;
        }

        // Only allow confirmed:true if a prior call set the confirmation flag
        if (!stopRideConfirmationPending) {
          setStopRideConfirmationPending(true);
          const dist = calcDistance(safety.recordedPoints);
          return `You've ridden ${dist.toFixed(1)} miles. Are you sure you want to stop and save your ride?`;
        }

        setStopRideConfirmationPending(false);
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

// Helpers moved to ./scoutToolHelpers.ts
