-- Create chat_channels table
create table if not exists public.chat_channels (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  name text not null,
  type text default 'public' check (type in ('public', 'private', 'group')),
  created_by uuid references auth.users(id),
  description text,
  participants uuid[] -- Array of user IDs for private/group chats permission check
);

-- Create chat_messages table
create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  channel_id uuid references public.chat_channels(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  content text not null,
  edited_at timestamptz
);

-- Enable RLS
alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;

-- Policies for Channels
-- Public channels: readable by all authenticated users
create policy "Public channels are viewable by everyone"
  on public.chat_channels for select
  to authenticated
  using (type = 'public');

-- Private/Group channels: readable only by participants or creator
create policy "Private channels are viewable by participants"
  on public.chat_channels for select
  to authenticated
  using (
    type != 'public' and (
      auth.uid() = created_by or 
      auth.uid() = any(participants)
    )
  );

-- Insert: Authenticated users can create channels
create policy "Authenticated users can create channels"
  on public.chat_channels for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Policies for Messages
-- Select: If you can see the channel, you can see the messages?
-- Simpler: Check channel visibility logic again or join?
-- RLS performance with joins can be tricky.
-- For now, let's allow reading messages if the user has access to the channel.
-- Using Exist clause.
create policy "Users can view messages in visible channels"
  on public.chat_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.chat_channels
      where id = channel_id
      and (
        type = 'public' 
        or created_by = auth.uid()
        or auth.uid() = any(participants)
      )
    )
  );

-- Insert: Users can insert messages into visible channels
create policy "Users can post messages in visible channels"
  on public.chat_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.chat_channels
      where id = channel_id
      and (
        type = 'public' 
        or created_by = auth.uid()
        or auth.uid() = any(participants)
      )
    )
    and auth.uid() = user_id
  );

-- Initial Data: Default channels
insert into public.chat_channels (name, type, description)
values 
  ('General', 'public', 'General discussion for everyone'),
  ('Prayer', 'public', 'Share prayer requests and praise'),
  ('Worship Team', 'public', 'Coordination for worship team'),
  ('Tech Team', 'public', 'AV and Tech discussions')
on conflict do nothing;
