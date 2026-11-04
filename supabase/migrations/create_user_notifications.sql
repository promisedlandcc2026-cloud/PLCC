-- Per-user in-app notification inbox

create table if not exists public.user_notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('announcement', 'prayer', 'assignment')),
  title text not null,
  body text,
  link text,
  source_id uuid,
  read_at timestamptz,
  created_at timestamptz default now() not null
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id)
  where read_at is null;

alter table public.user_notifications enable row level security;

drop policy if exists "users_select_own_notifications" on public.user_notifications;
create policy "users_select_own_notifications"
  on public.user_notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "users_update_own_notifications" on public.user_notifications;
create policy "users_update_own_notifications"
  on public.user_notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Inserts go through the service-role API (notify helper), not PostgREST.
