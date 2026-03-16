-- Add emergency contacts column to profiles table
alter table public.profiles
  add column if not exists contacts jsonb default '[]'::jsonb;
