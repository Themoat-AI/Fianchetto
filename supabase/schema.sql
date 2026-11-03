-- Run this in the Supabase SQL Editor to set up the separate room-chat database.
-- Then enable Anonymous Sign-Ins in Authentication settings and Realtime for this table.

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_code text not null check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  display_name text not null check (char_length(display_name) between 1 and 20),
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now()
);

create index if not exists room_messages_room_created_idx
  on public.room_messages (room_code, created_at);

alter table public.room_messages enable row level security;

-- Anonymous Auth sessions use the authenticated role. The browser's public/anon key
-- alone cannot read or write rows without an authenticated Supabase session.
create policy "authenticated players can read room chat"
  on public.room_messages for select to authenticated
  using (true);

create policy "players can write their own room chat"
  on public.room_messages for insert to authenticated
  with check (
    auth.uid() = user_id
    and char_length(message) between 1 and 300
    and char_length(display_name) between 1 and 20
  );

grant select, insert on public.room_messages to authenticated;
