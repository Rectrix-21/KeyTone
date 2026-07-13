alter table public.profiles
  add column if not exists credits_reset_at timestamptz not null default timezone('utc', now());
