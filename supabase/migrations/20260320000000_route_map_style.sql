ALTER TABLE saved_routes ADD COLUMN IF NOT EXISTS map_style text DEFAULT 'mapbox://styles/mapbox/satellite-streets-v12';
