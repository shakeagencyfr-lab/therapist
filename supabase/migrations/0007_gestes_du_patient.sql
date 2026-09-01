-- ============================================================================
-- 0007 — Ce qu'un patient peut modifier, et rien de plus.
--
-- Les politiques d'écriture posées en 0002 étaient trop larges : un patient
-- pouvait mettre à jour n'importe quelle colonne de ses modules ou de ses
-- audios — le titre, la consigne, le nombre d'écoutes. Les privilèges de
-- colonne ne peuvent pas distinguer la thérapeute du patient (même rôle
-- « authenticated »), donc on passe par des fonctions : deux gestes nommés,
-- rien autour.
-- ============================================================================

drop policy if exists "le patient coche et annote ses modules" on public.patient_modules;
drop policy if exists "le patient compte ses ecoutes" on public.patient_audios;

-- Cocher ou décocher un module de son propre parcours.
create or replace function public.patient_set_module_done(p_module uuid, p_done boolean)
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare v_done timestamptz;
begin
  update public.patient_modules m
     set done_at = case when p_done then now() else null end
   where m.id = p_module
     and public.is_patient_record(m.patient_id)
  returning m.done_at into v_done;

  if not found then
    raise exception 'Module introuvable ou hors de votre parcours.';
  end if;
  return v_done;
end;
$$;

-- Écrire la note libre d'un module.
create or replace function public.patient_save_note(p_module uuid, p_note text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.patient_modules m
     set patient_note = p_note
   where m.id = p_module
     and public.is_patient_record(m.patient_id);

  if not found then
    raise exception 'Module introuvable ou hors de votre parcours.';
  end if;
end;
$$;

-- Compter une écoute. Le patient ne fixe pas le compteur, il l'incrémente.
create or replace function public.patient_count_listen(p_audio uuid)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare v_listens integer;
begin
  update public.patient_audios a
     set listens = a.listens + 1, last_listened_at = now()
   where a.id = p_audio
     and public.is_patient_record(a.patient_id)
  returning a.listens into v_listens;

  if not found then
    raise exception 'Audio introuvable ou hors de votre bibliothèque.';
  end if;
  return v_listens;
end;
$$;

revoke execute on function public.patient_set_module_done(uuid, boolean) from public, anon;
revoke execute on function public.patient_save_note(uuid, text)          from public, anon;
revoke execute on function public.patient_count_listen(uuid)             from public, anon;
grant execute on function public.patient_set_module_done(uuid, boolean) to authenticated;
grant execute on function public.patient_save_note(uuid, text)          to authenticated;
grant execute on function public.patient_count_listen(uuid)             to authenticated;
