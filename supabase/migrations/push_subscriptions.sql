-- Phone alerts for PLCC Connect (web push). Run once in the Supabase SQL editor.
-- Only the server (service role) reads or writes this table.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  topics text[] not null default array['church','prayer','community'],
  user_agent text,
  failure_count int not null default 0,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
