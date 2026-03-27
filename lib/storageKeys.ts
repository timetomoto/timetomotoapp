// ---------------------------------------------------------------------------
// Centralized AsyncStorage key constants
// Prevents typos and makes key discovery easy via search
// ---------------------------------------------------------------------------

// Auth / onboarding
export const ONBOARDING_KEY = '@ttm/onboarding_v1';

// Theme & preferences
export const THEME_MODE_KEY = 'ttm_theme_mode';
export const MAP_STYLE_KEY = '@ttm/map_style_preference';
export const UNITS_TEMP_KEY = 'ttm_units_temp';
export const UNITS_DISTANCE_KEY = 'ttm_units_distance';
export const UNITS_CAPACITY_KEY = 'ttm_units_capacity';

// Notifications
export const NOTIF_RIDE_START_KEY = 'ttm_notif_ride_start';
export const NOTIF_WEATHER_KEY = 'ttm_notif_weather';
export const NOTIF_EMERGENCY_KEY = 'ttm_notif_emergency';

// Garage
export const LOCAL_BIKES_KEY = 'ttm_bikes_local';
export const LOCAL_CONTACTS_KEY = 'ttm_contacts_local';
export const maintenanceKey = (bikeId: string) => `ttm_maintenance_${bikeId}`;
export const modificationsKey = (bikeId: string) => `ttm_modifications_${bikeId}`;
export const documentsKey = (bikeId: string) => `ttm_documents_${bikeId}`;
export const garageSectionsKey = (bikeId: string) => `@ttm/garage_sections_${bikeId}`;
export const wikiPhotoKey = (bikeId: string) => `wiki_photo_${bikeId}`;

// Routes
export const routesLocalKey = (userId: string) => `ttm_routes_${userId}`;
export const bdrCleanupKey = (userId: string) => `@ttm/bdr_cleanup_done_${userId}`;
export const routesSeededKey = (userId: string) => `@ttm/routes_seeded_${userId}`;
export const CATEGORY_ORDER_KEY = 'ttm_route_category_order';
export const routeSortKey = (userId: string) => `@ttm/routes_sort_order_${userId}`;
export const expandedStateKey = (userId: string) => `@ttm/routes_expanded_state_${userId}`;

// Favorites
export const FAVORITE_LOCATIONS_PREFIX = 'ttm_favorite_locations';
export const favoriteCacheKey = (userId?: string | null) =>
  userId && userId !== 'local' ? `${FAVORITE_LOCATIONS_PREFIX}_${userId}` : FAVORITE_LOCATIONS_PREFIX;

// Garage
export const SELECTED_BIKE_KEY = 'ttm_selected_bike_id';

// Safety defaults
export const SAFETY_CRASH_DETECTION_KEY = 'ttm_safety_crash_detection';
export const SAFETY_LIVE_SHARE_KEY = 'ttm_safety_live_share';

// Onboarding nudges — dismissed one-time banners
export const NUDGE_ADD_BIKE_KEY = 'ttm_nudge_add_bike_dismissed';
export const NUDGE_ADD_CONTACT_KEY = 'ttm_nudge_add_contact_dismissed';

// Scout
export const SCOUT_QUOTA_PREFIX = 'ttm_scout_quota';
export const scoutQuotaKey = (userId: string) => `${SCOUT_QUOTA_PREFIX}_${userId}`;

// Search / navigation
export const NAV_RECENTS_KEY = 'ttm_nav_recents';
export const WEATHER_RECENTS_KEY = 'ttm_weather_recents';
