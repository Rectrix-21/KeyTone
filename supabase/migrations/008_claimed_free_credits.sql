create table if not exists public.claimed_free_credits (
  email text primary key,
  first_granted_at timestamptz not null default timezone('utc', now())
);

alter table public.claimed_free_credits enable row level security;

drop policy if exists claimed_free_credits_service_only on public.claimed_free_credits;
create policy claimed_free_credits_service_only on public.claimed_free_credits
  for select using (false);
