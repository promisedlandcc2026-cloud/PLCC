-- Create the prayer_requests table
create table if not exists public.prayer_requests (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  user_id uuid references auth.users(id), -- Optional: Link to authenticated user
  member_name text not null, -- Display name (can be 'Anonymous')
  category text not null check (category in ('Healing', 'Guidance', 'Praise', 'Family', 'Financial', 'Other')),
  content text not null,
  status text not null default 'Vetting' check (status in ('Vetting', 'Published', 'Confidential', 'Archived')),
  prayed_count integer default 0 not null,
  is_anonymous boolean default false
);

-- Enable Row Level Security
alter table public.prayer_requests enable row level security;

-- Policies

-- 1. Everyone can read 'Published' requests
create policy "Public requests are viewable by everyone"
  on public.prayer_requests for select
  using (status = 'Published');

-- 2. Authenticated users can create requests
create policy "Authenticated users can create prayer requests"
  on public.prayer_requests for insert
  to authenticated
  with check (true);

-- 3. Users can view their own requests (even if Vetting/Confidential)
create policy "Users can view own requests"
  on public.prayer_requests for select
  to authenticated
  using (auth.uid() = user_id);

-- 4. Admins/Pastors can view all requests
-- Note: This assumes a custom claim or a separate 'user_roles' table check.
-- For simplicity in this migration, using a simple check or relying on service_role for admin dashboard.
-- Ideally: 
-- create policy "Admins can view all" on public.prayer_requests for all 
-- using (exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('ADMIN', 'PASTOR', 'SUPER_ADMIN')));
-- For now, we will rely on the API to use service_role for admin actions or ensure the user_roles table exists.

-- Checking if user_roles table exists and adding policy if so
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'user_roles') then
    create policy "Admins can manage all requests"
      on public.prayer_requests for all
      to authenticated
      using (
        exists (
          select 1 from public.user_roles 
          where user_id = auth.uid() 
          and role in ('ADMIN', 'PASTOR', 'SUPER_ADMIN')
        )
      );
  end if;
end
$$;
