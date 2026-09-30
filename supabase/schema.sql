-- Ejecuta este archivo en Supabase: SQL Editor > New query > Run.
-- Las tablas y el bucket quedan privados. La aplicación usa únicamente
-- SUPABASE_SECRET_KEY desde rutas del servidor de Vercel.

create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  title text not null check (char_length(title) between 1 and 80),
  host_key text not null,
  status text not null default 'lobby' check (status in ('lobby', 'countdown', 'voting', 'results', 'reveal', 'leaderboard', 'finished')),
  current_round integer not null default 0 check (current_round >= 0),
  voting_ends_at double precision,
  created_at timestamptz not null default now()
);

-- Safe migration for projects created with an earlier version of the app.
alter table public.games
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_games_owner on public.games(owner_id);

comment on column public.games.host_key is 'Legacy compatibility digest; organizer access is now controlled by Supabase Auth and owner_id.';

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text not null check (char_length(description) between 1 and 500),
  photo_path text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  joined_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_index integer not null check (round_index >= 0),
  player_id uuid not null references public.players(id) on delete cascade,
  guess_participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, round_index, player_id)
);

create index if not exists idx_participants_game_order on public.participants(game_id, sort_order, id);
create index if not exists idx_players_game_joined on public.players(game_id, joined_at, id);
create index if not exists idx_votes_game_round on public.votes(game_id, round_index);

-- The browser only uses Supabase Auth. RLS remains enabled with no
-- public/authenticated database policies, so the publishable key cannot read
-- or write game data directly.
alter table public.games enable row level security;
alter table public.participants enable row level security;
alter table public.players enable row level security;
alter table public.votes enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  false,
  8000000,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Do not create storage policies for anon/authenticated. The server-only
-- service role bypasses RLS and is the only component that touches this bucket.
