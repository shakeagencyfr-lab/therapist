-- ============================================================================
-- 0011 — Les fichiers audio du cabinet : un compartiment privé, rangé par
-- cabinet (« <cabinet_id>/<fichier> »).
--
-- Jamais d'URL publique sur un enregistrement de thérapie : chaque lecture
-- passe par une URL signée, courte, obtenue sous les droits de qui écoute.
-- Le cabinet dépose, lit et retire dans son propre dossier ; le patient
-- n'écoute que ce qui lui a été envoyé (patient_audios).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audios', 'audios', false, 52428800,
  array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm']
)
on conflict (id) do nothing;

-- Le cabinet propriétaire d'un chemin. Null si le chemin n'a pas cette forme,
-- plutôt qu'une erreur de conversion qui ferait échouer la politique.
create or replace function public.cabinet_of_path(p_name text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return (split_part(p_name, '/', 1))::uuid;
exception when others then
  return null;
end;
$$;

revoke execute on function public.cabinet_of_path(text) from public, anon;
grant execute on function public.cabinet_of_path(text) to authenticated;

create policy "le cabinet dépose ses audios"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'audios' and public.is_cabinet_member(public.cabinet_of_path(name)));

create policy "le cabinet lit ses audios"
  on storage.objects for select to authenticated
  using (bucket_id = 'audios' and public.is_cabinet_member(public.cabinet_of_path(name)));

create policy "le cabinet retire ses audios"
  on storage.objects for delete to authenticated
  using (bucket_id = 'audios' and public.is_cabinet_member(public.cabinet_of_path(name)));

create policy "le patient écoute ses audios"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'audios'
    and exists (
      select 1
      from public.patient_audios pa
      join public.audio_library al on al.id = pa.audio_id
      where al.storage_path = storage.objects.name
        and public.is_patient_record(pa.patient_id)
    )
  );
