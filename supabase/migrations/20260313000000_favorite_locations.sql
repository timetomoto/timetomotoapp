-- favorite_locations: stores user's favorite weather and navigation locations
create table if not exists public.favorite_locations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  latitude   numeric not null,
  longitude  numeric not null,
  created_at timestamptz not null default now()
);

-- Users can only see/modify their own favorites
alter table public.favorite_locations enable row level security;

create policy "Users manage their own favorites"
  on public.favorite_locations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
