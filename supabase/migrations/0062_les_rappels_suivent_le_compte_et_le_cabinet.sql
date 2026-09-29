-- ============================================================================
-- 0062 — Un rappel ne part que vers le compte qui tient la fiche, et
--        seulement tant que le cabinet est ouvert
-- ============================================================================
--
-- Deux fuites relevées par la revue de code.
--
-- 1. LA FICHE DÉTACHÉE. Une fiche change de compte : nouvelle adresse posée
--    par le cabinet (cabinet_changer_adresse, 0045), compte supprimé d'une
--    personne qui est aussi praticienne (server/compte.ts : la fiche est
--    détachée, le compte reste), compte effacé (la clé étrangère remet
--    auth_user_id à vide). Les téléphones inscrits par l'ancien compte, eux,
--    restaient rangés sous la fiche : server/push.ts les choisit par fiche,
--    et continuait d'écrire sur l'écran verrouillé de quelqu'un qui n'a plus
--    accès au suivi. Ses réglages de rappel (discrétion, rappel du soir)
--    restaient aussi, et s'imposaient au compte suivant.
--
--    Désormais, quand la fiche quitte un compte, les téléphones de ce compte
--    pour cette fiche sont effacés, et ses réglages de rappel aussi : le
--    compte suivant repart des défauts (masqué, pas de rappel du soir). Le
--    serveur le redit de son côté (appareilDuCompte) : un téléphone ne reçoit
--    que si son compte est celui de la fiche.
--
-- 2. LE CABINET FERMÉ. 0057 ferme un cabinet : plus d'espace patient, plus
--    de connexion. Mais les rappels ne regardaient que le suivi
--    (p.archived_at) : les rappels récurrents s'écrivaient chaque jour, le
--    rappel du soir et la veille de séance partaient. Un cabinet fermé ne
--    parle plus à personne. Le filtre est posé AU MOMENT D'ENVOYER
--    (rappels_a_pousser, soirs_dus) et à l'écriture des récurrents : un mot
--    écrit avant la fermeture n'en part pas davantage, et un cabinet rouvert
--    retrouve ses rappels à venir sans qu'on ait à les réécrire. La veille
--    de séance (0059) n'a donc pas besoin d'être touchée.
--
-- Les définitions reprises ici sont celles de production, lues le
-- 29 septembre 2026 ; seules les conditions sur le cabinet sont nouvelles.

-- ============================================================================
-- 1. La fiche quitte un compte : ses téléphones et ses réglages partent
-- ============================================================================

create or replace function public.oublier_l_ancien_compte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.auth_user_id is null or new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;

  delete from public.push_subscriptions s
   where s.patient_id = new.id
     and s.user_id is distinct from new.auth_user_id;

  delete from public.preferences_rappels pr
   where pr.patient_id = new.id;

  return new;
end;
$$;

revoke execute on function public.oublier_l_ancien_compte() from public, anon, authenticated;

drop trigger if exists patients_oublier_l_ancien_compte on public.patients;
create trigger patients_oublier_l_ancien_compte
  after update of auth_user_id on public.patients
  for each row execute function public.oublier_l_ancien_compte();

-- Ce qui a déjà fui avant cette migration : un téléphone dont le compte
-- n'est plus celui de la fiche, des réglages sur une fiche sans compte.
delete from public.push_subscriptions s
 using public.patients p
 where p.id = s.patient_id
   and s.user_id is distinct from p.auth_user_id;

delete from public.preferences_rappels pr
 using public.patients p
 where p.id = pr.patient_id
   and p.auth_user_id is null;

-- ============================================================================
-- 2. Un cabinet fermé ne rappelle plus rien
-- ============================================================================

create or replace function public.rappels_a_pousser(p_limite integer default 50)
returns table (push_id uuid, patient_id uuid, titre text, corps text, masque boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with dus as (
    select r.push_id, r.patient_id
      from public.push_recipients r
      join public.push_notifications n on n.id = r.push_id
      join public.patients p on p.id = r.patient_id
     where r.push_status is null
       and p.archived_at is null
       and public.cabinet_ouvert(p.cabinet_id)
       and coalesce(n.scheduled_at, n.created_at) <= now()
       and coalesce(n.scheduled_at, n.created_at) > now() - interval '2 hours'
       and (r.push_claimed_at is null or r.push_claimed_at < now() - interval '5 minutes')
     order by coalesce(n.scheduled_at, n.created_at)
     limit greatest(1, least(coalesce(p_limite, 50), 500))
     for update of r skip locked
  ),
  pris as (
    update public.push_recipients r
       set push_claimed_at = now()
      from dus
     where r.push_id = dus.push_id
       and r.patient_id = dus.patient_id
    returning r.push_id, r.patient_id
  )
  select pris.push_id,
         pris.patient_id,
         case when m.masque then 'Un nouveau mot dans votre espace' else n.title end,
         case when m.masque then 'Il se lit en ouvrant votre espace.' else n.body end,
         m.masque
    from pris
    join public.push_notifications n on n.id = pris.push_id
    -- Sans réglage posé, masqué : c'est le défaut, et il vaut ici aussi.
    cross join lateral (
      select coalesce(
               (select pr.masquer_contenu from public.preferences_rappels pr where pr.patient_id = pris.patient_id),
               true
             ) as masque
    ) m;
end;
$$;

revoke execute on function public.rappels_a_pousser(integer) from public, anon, authenticated;
grant execute on function public.rappels_a_pousser(integer) to service_role;

create or replace function public.soirs_dus()
returns table (patient_id uuid, jour date)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.patient_id, d.jour
    from public.preferences_rappels pr
    join public.patients p on p.id = pr.patient_id
   cross join lateral (
     select x.jour
       from (values ((now() at time zone 'Europe/Paris')::date),
                    ((now() at time zone 'Europe/Paris')::date - 1)) as x(jour)
      where ((x.jour + pr.soir_heure) at time zone 'Europe/Paris') <= now()
        and ((x.jour + pr.soir_heure) at time zone 'Europe/Paris') > now() - interval '2 hours'
        and ((x.jour + pr.soir_heure) at time zone 'Europe/Paris') >= pr.soir_regle_le
      order by x.jour desc
      limit 1
   ) d
   where pr.soir_actif
     and p.archived_at is null
     and p.auth_user_id is not null
     and public.cabinet_ouvert(p.cabinet_id)
     and (pr.soir_envoye_le is null or pr.soir_envoye_le < d.jour)
     and (pr.soir_reclame_le is null or pr.soir_reclame_le < now() - interval '5 minutes')
     and exists (
       select 1 from public.push_subscriptions s
        where s.patient_id = pr.patient_id
          and s.user_id = p.auth_user_id
     )
     and not exists (
       select 1
         from public.scale_entries e
        where e.patient_id = pr.patient_id
          and e.recorded_at >= (d.jour::timestamp at time zone 'Europe/Paris')
          and e.recorded_at < ((d.jour + 1)::timestamp at time zone 'Europe/Paris')
     );
$$;

revoke execute on function public.soirs_dus() from public, anon, authenticated;
grant execute on function public.soirs_dus() to service_role;

create or replace function public.generer_rappels_recurrents()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := now();
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  c record;
  v_push uuid;
  v_n integer := 0;
begin
  for c in
    select r.id, r.cabinet_id, r.title, r.body, r.created_by, r.jour_semaine, r.heure, d.jour,
           ((d.jour + r.heure) at time zone 'Europe/Paris') as instant
      from public.rappels_recurrents r
     cross join (values (v_aujourdhui - 1), (v_aujourdhui)) as d(jour)
     where r.annule_le is null
       and r.fin_le >= v_aujourdhui - 1
       and d.jour <= r.fin_le
       and (r.jour_semaine is null or r.jour_semaine = extract(isodow from d.jour))
       and ((d.jour + r.heure) at time zone 'Europe/Paris') <= v_maintenant
       and ((d.jour + r.heure) at time zone 'Europe/Paris') > v_maintenant - interval '2 hours'
       and ((d.jour + r.heure) at time zone 'Europe/Paris') >= r.created_at
       -- Fermé ce jour-là : l'occurrence ne s'écrit pas, et ne se rattrape pas.
       and public.cabinet_ouvert(r.cabinet_id)
       and not exists (
         select 1 from public.push_notifications n
          where n.rappel_recurrent_id = r.id and n.occurrence = d.jour
       )
       and exists (
         select 1
           from public.rappels_recurrents_patients rp
           join public.patients p on p.id = rp.patient_id
          where rp.rappel_id = r.id and p.archived_at is null
       )
     order by instant
  loop
    v_push := null;
    insert into public.push_notifications
      (cabinet_id, title, body, scheduled_for, scheduled_at, created_by, rappel_recurrent_id, occurrence)
    values
      (c.cabinet_id, c.title, c.body, public.libelle_rappel_recurrent(c.jour_semaine, c.heure),
       c.instant, c.created_by, c.id, c.jour)
    on conflict (rappel_recurrent_id, occurrence) do nothing
    returning id into v_push;

    -- Un passage concurrent l'a écrit le premier : ses destinataires sont les siens.
    if v_push is null then
      continue;
    end if;

    insert into public.push_recipients (push_id, patient_id, cabinet_id)
    select v_push, rp.patient_id, rp.cabinet_id
      from public.rappels_recurrents_patients rp
      join public.patients p on p.id = rp.patient_id
     where rp.rappel_id = c.id
       and p.archived_at is null;

    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.generer_rappels_recurrents() from public, anon, authenticated;
grant execute on function public.generer_rappels_recurrents() to service_role;

-- La minute ne réveille plus le serveur pour un mot qu'il ne pourrait pas
-- réclamer : même condition que rappels_a_pousser().
create or replace function public.declencher_rappels()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  /* Un défaut dans l'écriture des rappels récurrents ne doit pas priver les
     autres mots de leur envoi : il se dit au journal de la base — sans rien
     du contenu — et le passage continue. */
  begin
    perform public.generer_rappels_recurrents();
  exception when others then
    raise warning '[rappels] les rappels récurrents du jour n''ont pas pu être écrits (%)', sqlstate;
  end;

  update public.push_recipients r
     set push_status = 'expiree', pushed_at = now()
    from public.push_notifications n
   where n.id = r.push_id
     and r.push_status is null
     and coalesce(n.scheduled_at, n.created_at) <= now() - interval '2 hours';

  if not exists (
    select 1
      from public.push_recipients r
      join public.push_notifications n on n.id = r.push_id
      join public.patients p on p.id = r.patient_id
     where r.push_status is null
       and p.archived_at is null
       and public.cabinet_ouvert(p.cabinet_id)
       and coalesce(n.scheduled_at, n.created_at) <= now()
       and (r.push_claimed_at is null or r.push_claimed_at < now() - interval '5 minutes')
  ) and not exists (select 1 from public.soirs_dus()) then
    return;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'klaro_cron_secret';

  if v_secret is null then
    raise warning '[rappels] le secret du planificateur manque dans le coffre : aucun envoi.';
    return;
  end if;

  perform net.http_post(
    url := 'https://klaroweb.site/api/cron/rappels',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.declencher_rappels() from public, anon, authenticated;
