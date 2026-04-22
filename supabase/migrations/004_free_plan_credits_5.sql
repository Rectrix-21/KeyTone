alter table if exists public.profiles
  alter column remaining_credits set default 5;

update public.profiles
set
  remaining_credits = 5,
  updated_at = timezone('utc', now())
where subscription_status = 'free' and remaining_credits = 3;
