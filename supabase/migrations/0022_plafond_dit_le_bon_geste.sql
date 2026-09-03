-- ============================================================================
-- Le plafond nomme un geste qui existe
--
-- Le message disait « Archivez un suivi terminé ». L'application ne proposait
-- pas d'archiver : elle proposait de SUPPRIMER, ce qui emporte le dossier.
-- Une praticienne qui suivait la consigne à la lettre ne trouvait rien ; celle
-- qui cherchait un équivalent risquait de détruire un dossier pour faire de la
-- place.
--
-- L'application a maintenant « Clore le suivi » — la fiche sort des actives,
-- le dossier reste, et le suivi se rouvre. Le message emploie donc le même
-- mot. Deux vocabulaires pour un même geste, c'est un geste qu'on ne fait pas.
-- ============================================================================

create or replace function public.verifier_plafond_patientes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_max integer;
  v_actives integer;
begin
  select coalesce(s.max_patients_override, p.max_patients)
    into v_max
  from public.subscriptions s
  left join public.plans p on p.code = s.plan_code
  where s.cabinet_id = new.cabinet_id;

  -- Sans offre ou sans plafond, il n'y a rien à tenir : « sans limite » est
  -- une valeur légitime, pas une configuration manquante.
  if v_max is null then
    return new;
  end if;

  select count(*) into v_actives
  from public.patients
  where cabinet_id = new.cabinet_id and archived_at is null;

  if v_actives >= v_max then
    raise exception
      'Votre offre permet % fiches actives, et elles le sont toutes. Closez un suivi terminé depuis sa fiche, ou demandez à votre revendeur de relever le plafond.',
      v_max
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.verifier_plafond_patientes() from public, anon, authenticated;

comment on function public.verifier_plafond_patientes() is
  'Déclencheur du plafond de fiches actives. Jamais appelée directement : aucun droit d''exécution n''est accordé.';
