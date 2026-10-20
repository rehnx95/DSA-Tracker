-- DSA Sheet Tracker Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table: stores user information
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  email text,
  bio text,
  location text,
  website text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Progress table: stores problem completion states
create table progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  problem_id text not null,
  state text not null check (state in ('todo', 'done', 'skipped')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, problem_id)
);

-- Activity log table: stores daily problem completion counts
create table activity_log (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  date date not null,
  count integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, date)
);

-- User settings table: stores UI preferences
create table user_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null unique,
  theme text default 'dark',
  expanded_steps jsonb default '[]'::jsonb,
  filter text default 'all',
  hide_skipped boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Row Level Security (RLS) Policies
alter table profiles enable row level security;
alter table progress enable row level security;
alter table activity_log enable row level security;
alter table user_settings enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Progress policies
create policy "Users can view own progress"
  on progress for select
  using (auth.uid() = user_id);

create policy "Users can insert own progress"
  on progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own progress"
  on progress for update
  using (auth.uid() = user_id);

create policy "Users can delete own progress"
  on progress for delete
  using (auth.uid() = user_id);

-- Activity log policies
create policy "Users can view own activity"
  on activity_log for select
  using (auth.uid() = user_id);

create policy "Users can insert own activity"
  on activity_log for insert
  with check (auth.uid() = user_id);

create policy "Users can update own activity"
  on activity_log for update
  using (auth.uid() = user_id);

-- User settings policies
create policy "Users can view own settings"
  on user_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on user_settings for update
  using (auth.uid() = user_id);

-- Trigger to automatically create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  insert into public.user_settings (user_id)
  values (new.id);

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Indexes for performance
create index progress_user_id_idx on progress(user_id);
create index activity_log_user_id_idx on activity_log(user_id);
create index activity_log_date_idx on activity_log(date);
