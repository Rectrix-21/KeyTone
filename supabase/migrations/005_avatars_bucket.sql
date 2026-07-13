insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists storage_avatars_public_read on storage.objects;
create policy storage_avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists storage_avatars_insert_own on storage.objects;
create policy storage_avatars_insert_own on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists storage_avatars_update_own on storage.objects;
create policy storage_avatars_update_own on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists storage_avatars_delete_own on storage.objects;
create policy storage_avatars_delete_own on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
