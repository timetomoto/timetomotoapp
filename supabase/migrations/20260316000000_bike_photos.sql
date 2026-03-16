-- Add photo_url column to bikes table
ALTER TABLE bikes ADD COLUMN IF NOT EXISTS photo_url text;

-- Create bike-photos storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bike-photos', 'bike-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Users can upload their own bike photos
CREATE POLICY "Users can upload their own bike photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bike-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Bike photos are publicly readable
CREATE POLICY "Bike photos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'bike-photos');

-- Users can update their own bike photos
CREATE POLICY "Users can update their own bike photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'bike-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own bike photos
CREATE POLICY "Users can delete their own bike photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'bike-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
