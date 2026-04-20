alter table if exists public.projects
  drop constraint projects_feature_check;

alter table if exists public.projects
  add constraint projects_feature_check
  check (feature in ('extraction', 'variation', 'starter'));