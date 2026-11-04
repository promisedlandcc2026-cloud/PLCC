-- Create worship_songs table
create table if not exists public.worship_songs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  title text not null,
  key text,
  bpm integer,
  time_signature text default '4/4',
  lead_vocal text,
  lyrics text,
  ccli_number text,
  spotify_link text,
  youtube_link text,
  tags text[],
  archived boolean default false
);

-- Create setlists table
create table if not exists public.setlists (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  date date not null,
  title text, -- e.g. "Sunday AM"
  leader_id uuid references auth.users(id),
  songs jsonb default '[]'::jsonb, -- Array of song objects or IDs with order
  notes text,
  status text default 'Draft' check (status in ('Draft', 'Finalized', 'Archived'))
);

-- Enable RLS
alter table public.worship_songs enable row level security;
alter table public.setlists enable row level security;

-- Policies for Songs
-- Everyone can view songs (read-only for members, maybe?)
-- Let's say all authenticated users can view.
create policy "Authenticated users can view songs"
  on public.worship_songs for select
  to authenticated
  using (true);

-- Only Admins/Worship Leaders can insert/update/delete
-- Assuming public.users.role check
create policy "Admins can manage songs"
  on public.worship_songs for all
  to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() 
      and (role in ('ADMIN', 'PASTOR', 'SUPER_ADMIN') or role = 'WORSHIP_LEADER') -- Assuming WORSHIP_LEADER role exists or just ADMIN
    )
  );

-- Policies for Setlists
create policy "Authenticated users can view setlists"
  on public.setlists for select
  to authenticated
  using (true);

create policy "Admins can manage setlists"
  on public.setlists for all
  to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() 
      and role in ('ADMIN', 'PASTOR', 'SUPER_ADMIN', 'WORSHIP_LEADER')
    )
  );
