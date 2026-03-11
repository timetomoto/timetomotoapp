-- Add fuel range specs to bikes table
alter table public.bikes
  add column if not exists tank_gallons numeric,
  add column if not exists avg_mpg      numeric;
