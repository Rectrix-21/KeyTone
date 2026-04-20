alter table if exists public.projects
  add column if not exists feature text not null default 'extraction'
  check (feature in ('extraction', 'variation'));

alter table if exists public.projects
  add column if not exists options jsonb;