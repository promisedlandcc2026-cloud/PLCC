-- Fix Admin Policy
-- Drop the old one if it exists (it might not if the previous migration conditional failed)
drop policy if exists "Admins can manage all requests" on public.prayer_requests;

-- Create the correct policy checking public.users
create policy "Admins can manage all requests"
  on public.prayer_requests for all
  to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() 
      and role in ('ADMIN', 'PASTOR', 'SUPER_ADMIN')
    )
  );

-- Create RPC for praying (Atomic Increment)
create or replace function increment_prayer_count(request_id uuid)
returns void as $$
begin
  update public.prayer_requests
  set prayed_count = prayed_count + 1
  where id = request_id;
end;
$$ language plpgsql security definer;
