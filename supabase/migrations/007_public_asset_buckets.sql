update storage.buckets set public = true where id in ('audio', 'midi', 'analysis');

drop policy if exists storage_audio_access on storage.objects;
drop policy if exists storage_audio_public_read on storage.objects;
create policy storage_audio_public_read on storage.objects
  for select using (bucket_id = 'audio');

drop policy if exists storage_midi_access on storage.objects;
drop policy if exists storage_midi_public_read on storage.objects;
create policy storage_midi_public_read on storage.objects
  for select using (bucket_id = 'midi');

drop policy if exists storage_analysis_access on storage.objects;
drop policy if exists storage_analysis_public_read on storage.objects;
create policy storage_analysis_public_read on storage.objects
  for select using (bucket_id = 'analysis');
