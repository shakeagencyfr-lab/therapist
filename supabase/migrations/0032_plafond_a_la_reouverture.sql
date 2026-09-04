-- Le plafond de fiches actives se contournait en rouvrant un suivi clos.
--
-- Le déclencheur ne jouait qu'à l'INSERTION. Or une fiche redevient active par
-- une simple mise à jour — `archived_at = null` — et l'écran de la thérapeute
-- le propose (« Rouvrir le suivi »). Le contrôle existait bien à cet endroit
-- du navigateur, mais un contrôle dans le navigateur n'en est pas un : la même
-- ligne s'écrit directement en PostgREST avec la clé publiable.
--
-- Un revendeur vendait donc un plafond de vingt-cinq fiches qu'un cabinet
-- pouvait dépasser sans rien forcer, simplement en archivant puis rouvrant.
--
-- LA RÈGLE NE COMPTE QUE LES RÉOUVERTURES. Une mise à jour qui laisse
-- `archived_at` tel quel — renommer une fiche, changer son programme — ne doit
-- rien coûter, et surtout ne doit pas devenir impossible quand le plafond est
-- atteint : sinon un cabinet plein ne pourrait plus modifier une seule fiche.

create or replace function public.verifier_plafond_patientes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_max integer;
  v_actives integer;
begin
  -- À la mise à jour, seul le passage d'archivé à actif est en cause.
  if tg_op = 'UPDATE' and not (old.archived_at is not null and new.archived_at is null) then
    return new;
  end if;

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
  where cabinet_id = new.cabinet_id
    and archived_at is null
    and id <> new.id;

  if v_actives >= v_max then
    raise exception
      'Votre offre permet % fiches actives, et elles le sont toutes. Archivez un suivi terminé, ou demandez à votre revendeur de relever le plafond.',
      v_max
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists patients_plafond on public.patients;
create trigger patients_plafond
  before insert or update on public.patients
  for each row execute function public.verifier_plafond_patientes();
