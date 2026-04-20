create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  subscription_status text not null default 'free' check (subscription_status in ('free', 'active', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  remaining_credits int not null default 3,
  total_conversions int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  analysis jsonb,
  assets jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  event_type text not null,
  raw_event jsonb not null,
  processed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_projects_user_id_created_at on public.projects(user_id, created_at desc);
create index if not exists idx_credit_transactions_user_id on public.credit_transactions(user_id);
create index if not exists idx_stripe_events_processed on public.stripe_events(processed);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.stripe_events enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists credit_transactions_select_own on public.credit_transactions;
create policy credit_transactions_select_own on public.credit_transactions
  for select using (auth.uid() = user_id);

drop policy if exists stripe_events_service_only on public.stripe_events;
create policy stripe_events_service_only on public.stripe_events
  for select using (false);

insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('midi', 'midi', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('analysis', 'analysis', false)
on conflict (id) do nothing;

drop policy if exists storage_audio_access on storage.objects;
create policy storage_audio_access on storage.objects
  for select using (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists storage_midi_access on storage.objects;
create policy storage_midi_access on storage.objects
  for select using (bucket_id = 'midi' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists storage_analysis_access on storage.objects;
create policy storage_analysis_access on storage.objects
  for select using (bucket_id = 'analysis' and auth.uid()::text = (storage.foldername(name))[1]);
