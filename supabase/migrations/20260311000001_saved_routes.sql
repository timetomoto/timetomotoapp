-- saved_routes: stores imported GPX files and recorded rides
create table if not exists public.saved_routes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  points            jsonb not null default '[]',
  distance_miles    double precision not null default 0,
  elevation_gain_ft double precision not null default 0,
  duration_seconds  integer,
  created_at        timestamptz not null default now()
);

-- Users can only see/modify their own routes
alter table public.saved_routes enable row level security;

create policy "Users manage their own routes"
  on public.saved_routes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
