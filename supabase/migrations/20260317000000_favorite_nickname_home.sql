-- Add nickname and home designation to favorite_locations
ALTER TABLE public.favorite_locations ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.favorite_locations ADD COLUMN IF NOT EXISTS is_home boolean DEFAULT false;
