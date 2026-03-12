-- Scorecard App Schema
-- Run this in Supabase SQL Editor after creating the project

-- Enable RLS
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- ============================================
-- USERS PROFILE (extends Supabase Auth)
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- SCORECARDS
-- ============================================
create table public.scorecards (
  id text primary key,                    -- client-generated UUID
  user_id uuid references auth.users on delete cascade not null,
  game_pk integer,                         -- MLB game ID (null for manual)
  date date not null,
  venue text default '',
  away_name text not null,
  away_abbr text not null,
  home_name text not null,
  home_abbr text not null,
  innings integer default 9,
  card_data jsonb not null,                -- Full scorecard JSON (batters, at-bats, drawings, etc.)
  notes text default '',
  completed boolean default false,
  shared boolean default false,            -- Public share link enabled
  share_slug text unique,                  -- Short slug for share URL
  pdf_path text,                           -- Storage path to generated PDF
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.scorecards enable row level security;

-- Users can CRUD their own scorecards
create policy "Users can view own scorecards"
  on public.scorecards for select
  using (auth.uid() = user_id);

create policy "Users can insert own scorecards"
  on public.scorecards for insert
  with check (auth.uid() = user_id);

create policy "Users can update own scorecards"
  on public.scorecards for update
  using (auth.uid() = user_id);

create policy "Users can delete own scorecards"
  on public.scorecards for delete
  using (auth.uid() = user_id);

-- Anyone can view shared scorecards (by slug)
create policy "Anyone can view shared scorecards"
  on public.scorecards for select
  using (shared = true);

-- Indexes
create index idx_scorecards_user_date on public.scorecards (user_id, date desc);
create index idx_scorecards_share_slug on public.scorecards (share_slug) where share_slug is not null;
create index idx_scorecards_game_pk on public.scorecards (game_pk) where game_pk is not null;

-- Auto-update timestamp
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger scorecards_updated_at
  before update on public.scorecards
  for each row execute procedure public.update_updated_at();

-- ============================================
-- STORAGE BUCKET (for PDF exports)
-- ============================================
-- Run in SQL editor:
insert into storage.buckets (id, name, public) values ('scorecard-pdfs', 'scorecard-pdfs', true);

-- Storage policies
create policy "Users can upload own PDFs"
  on storage.objects for insert
  with check (bucket_id = 'scorecard-pdfs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own PDFs"
  on storage.objects for select
  using (bucket_id = 'scorecard-pdfs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Anyone can view shared PDFs"
  on storage.objects for select
  using (bucket_id = 'scorecard-pdfs');
