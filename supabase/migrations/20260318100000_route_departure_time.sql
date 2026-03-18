-- Add departure_time to saved_routes for planned trips
ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS departure_time timestamptz;
