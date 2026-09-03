-- ============================================================================
-- Une auto-évaluation par soir, pas une par tap
--
-- L'espace de la patiente insérait une ligne à chaque appui sur l'échelle.
-- Une patiente qui hésite — 6, puis 7, puis finalement 5 — posait trois
-- points le même soir. La courbe de la thérapeute comptait trois mesures là
-- où il y avait une soirée, et la dernière valeur affichée dépendait de
-- l'ordre de lecture.
--
-- La note du soir se corrige donc au lieu de s'empiler : une ligne par jour et
-- par fiche, la dernière valeur est celle qui compte. Le jour est celui de la
-- patiente — Europe/Paris — pas celui du serveur : une note prise à minuit
-- vingt appartient à la soirée qu'on vient de vivre.
--
-- Écrit en fonction plutôt qu'en contrainte : les journées déjà en double
-- restent lisibles telles quelles, sans migration destructrice de données de
-- santé.
-- ============================================================================

create or replace function public.patient_note_echelle(p_value integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_patient uuid;
  v_cabinet uuid;
  v_ligne   uuid;
begin
  select p.id, p.cabinet_id into v_patient, v_cabinet
  from public.patients p
  where p.auth_user_id = auth.uid() and p.archived_at is null
  limit 1;

  if v_patient is null then
    raise exception 'Aucune fiche active pour ce compte.';
  end if;
  if p_value is null or p_value < 0 or p_value > 10 then
    raise exception 'Cette valeur est hors de l''échelle.';
  end if;

  select e.id into v_ligne
  from public.scale_entries e
  where e.patient_id = v_patient
    and (e.recorded_at at time zone 'Europe/Paris')::date
        = (now() at time zone 'Europe/Paris')::date
  order by e.recorded_at desc
  limit 1;

  if v_ligne is null then
    insert into public.scale_entries (patient_id, cabinet_id, value)
    values (v_patient, v_cabinet, p_value);
  else
    update public.scale_entries
       set value = p_value, recorded_at = now()
     where id = v_ligne;
  end if;
end;
$$;

revoke execute on function public.patient_note_echelle(integer) from public, anon;
grant execute on function public.patient_note_echelle(integer) to authenticated;

comment on function public.patient_note_echelle(integer) is
  'La note du soir : une ligne par jour et par fiche, corrigée si la patiente change d''avis.';
