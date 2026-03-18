-- Assign default "My Routes" category to uncategorized non-recorded routes
UPDATE public.saved_routes
SET category = 'My Routes'
WHERE category IS NULL AND (source IS NULL OR source NOT IN ('recorded', 'planned'));
