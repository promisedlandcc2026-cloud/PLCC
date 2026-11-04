-- Daily devotionals for PLCC Connect. Run once in the Supabase SQL editor.
create table if not exists public.daily_devotionals (day date primary key, title text not null, verse_ref text not null, verse_text text, body text not null, question text, prayer text, series_title text, author_id uuid references public.users(id) on delete set null, author_name text, updated_at timestamptz not null default now());
create table if not exists public.daily_devotional_reminders (day date primary key, sent int, sent_at timestamptz not null default now());
alter table public.daily_devotionals enable row level security;
alter table public.daily_devotional_reminders enable row level security;
revoke all on public.daily_devotionals from anon, authenticated;
revoke all on public.daily_devotional_reminders from anon, authenticated;
