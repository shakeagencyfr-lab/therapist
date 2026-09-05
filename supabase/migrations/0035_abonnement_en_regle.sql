-- L'abonnement décide enfin quelque chose.
--
-- `subscriptions.status` existait depuis la première migration, avec ses cinq
-- valeurs — essai, actif, impayé, suspendu, résilié — et n'était lu par
-- personne : ni la base, ni le serveur, ni un écran. `trial_ends_at` était
-- écrit à l'ouverture du cabinet et jamais relu. Autrement dit, un essai ne
-- se terminait pas, un impayé gardait la boutique, la marque blanche, le site
-- et le droit d'ouvrir des fiches, et le revendeur n'avait aucun levier autre
-- que la parole.
--
-- CE QUE PERD UN CABINET HORS CONTRAT — et ce qu'il ne perd pas. Il perd les
-- leviers : boutique, marque blanche, site vitrine, et le droit d'ouvrir une
-- fiche de plus. Il ne perd RIEN de ce qui est déjà là : les dossiers restent
-- lisibles par la thérapeute, les espaces patients continuent de répondre,
-- les audios s'écoutent. Un dossier de santé ne se ferme pas sur un impayé —
-- ce serait faire payer au patient un différend qui ne le regarde pas.
--
-- La règle est calculée EN BASE, à un seul endroit, parce que trois endroits
-- qui décident du même droit finissent par ne plus être d'accord.

create or replace function public.abonnement_en_regle(p_cabinet uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case s.status
      when 'actif' then true
      /* Un essai sans date de fin reste ouvert : c'est une donnée qui manque,
         pas un contrat rompu, et fermer un cabinet sur une colonne vide
         serait la pire façon de l'apprendre. */
      when 'essai' then coalesce(s.trial_ends_at, 'infinity'::timestamptz) > now()
      else false
    end
    from public.subscriptions s
    where s.cabinet_id = p_cabinet
  ), false);
$$;

comment on function public.abonnement_en_regle(uuid) is
  'Le contrat de ce cabinet court-il ? Actif, ou essai non expiré. Sans ligne d''abonnement : non.';

-- ============================================================================
-- Les droits, corrigés du contrat
-- ============================================================================
--
-- Hors contrat, `max_patients` vaut le nombre de fiches DÉJÀ actives : il ne
-- reste donc aucune place, et pas une fiche n'est fermée. C'est la traduction
-- exacte de « les leviers, pas les dossiers ».

create or replace function public.cabinet_droits(p_cabinet uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case
    when public.is_cabinet_member(p_cabinet) or public.is_reseller_of_cabinet(p_cabinet)
    then (
      select jsonb_build_object(
        'max_patients',     case when r.ok then coalesce(s.max_patients_override, p.max_patients)
                                 else n.actives end,
        'patients_actives', n.actives,
        'shop',             r.ok and coalesce(s.shop_override,           p.shop,           false),
        'marque_blanche',   r.ok and coalesce(s.marque_blanche_override, p.marque_blanche, false),
        'site',             r.ok and coalesce(s.site_override,           p.site,           false),
        'offre',            p.label,
        'offre_code',       p.code,
        'en_regle',         r.ok,
        'statut',           s.status::text,
        'echeance',         coalesce(s.current_period_end, s.trial_ends_at)
      )
      from (select public.abonnement_en_regle(p_cabinet) as ok) r,
           (select count(*)::int as actives from public.patients pa
             where pa.cabinet_id = p_cabinet and pa.archived_at is null) n
    )
  end
  from public.cabinets c
  left join public.subscriptions s on s.cabinet_id = c.id
  left join public.plans p on p.code = s.plan_code
  where c.id = p_cabinet;
$$;

-- ============================================================================
-- Le plafond dit la vraie raison
-- ============================================================================
--
-- Sans ce garde, un cabinet hors contrat lisait « Votre offre permet 3 fiches
-- actives » — le nombre qu'il a — au lieu de la raison réelle.

create or replace function public.verifier_plafond_patientes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_max integer;
  v_actives integer;
begin
  if tg_op = 'UPDATE' and not (old.archived_at is not null and new.archived_at is null) then
    return new;
  end if;

  if not public.abonnement_en_regle(new.cabinet_id) then
    raise exception
      'Votre abonnement n''est plus en cours : aucune nouvelle fiche ne peut être ouverte. Vos dossiers restent accessibles ; votre revendeur peut réactiver l''offre.'
      using errcode = 'check_violation';
  end if;

  select coalesce(s.max_patients_override, p.max_patients)
    into v_max
  from public.subscriptions s
  left join public.plans p on p.code = s.plan_code
  where s.cabinet_id = new.cabinet_id;

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

-- ============================================================================
-- Le portefeuille du revendeur voit la date, pas seulement le mot
-- ============================================================================
--
-- « Essai » sans échéance ne dit pas s'il reste douze jours ou s'il est passé
-- depuis six mois. On rend donc la date de fin d'essai et le verdict.

drop function if exists public.reseller_cabinet_overview();

create function public.reseller_cabinet_overview()
returns table(
  cabinet_id uuid, cabinet_name text, slug text, created_at timestamptz, archived boolean,
  therapists bigint, patients_active bigint, adherence_avg numeric, sessions_30d bigint,
  ai_spend_cents_month numeric, ai_cap_cents integer, plan_code text, plan_label text,
  status subscription_status, current_period_end timestamptz,
  trial_ends_at timestamptz, en_regle boolean
)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select c.*
    from public.cabinets c
    where exists (
      select 1 from public.reseller_members m
      where m.reseller_id = c.reseller_id and m.user_id = auth.uid()
    )
  ),
  patients_count as (
    select p.cabinet_id, count(*) as n
    from public.patients p
    where p.archived_at is null and p.cabinet_id in (select id from mine)
    group by p.cabinet_id
  ),
  adherence as (
    select m.cabinet_id,
           avg(case when m.done_at is not null then 1.0 else 0.0 end) * 100 as pct
    from public.patient_modules m
    where m.cabinet_id in (select id from mine)
    group by m.cabinet_id
  ),
  sessions as (
    select s.cabinet_id, count(*) as n
    from public.therapy_sessions s
    where s.cabinet_id in (select id from mine)
      and s.occurred_at >= now() - interval '30 days'
    group by s.cabinet_id
  ),
  spend as (
    select u.cabinet_id, sum(u.cost_cents) as cents
    from public.ai_usage u
    where u.cabinet_id in (select id from mine)
      and u.occurred_at >= date_trunc('month', now())
    group by u.cabinet_id
  ),
  staff as (
    select cm.cabinet_id, count(*) as n
    from public.cabinet_members cm
    where cm.cabinet_id in (select id from mine)
    group by cm.cabinet_id
  )
  select
    mine.id,
    mine.name,
    mine.slug,
    mine.created_at,
    mine.archived_at is not null,
    coalesce(staff.n, 0),
    coalesce(patients_count.n, 0),
    case when coalesce(patients_count.n, 0) >= 3 then round(adherence.pct, 1) end,
    coalesce(sessions.n, 0),
    coalesce(spend.cents, 0),
    coalesce(sub.ai_cap_override_cents, plans.ai_monthly_cap_cents),
    sub.plan_code,
    plans.label,
    sub.status,
    sub.current_period_end,
    sub.trial_ends_at,
    public.abonnement_en_regle(mine.id)
  from mine
  left join staff          on staff.cabinet_id = mine.id
  left join patients_count on patients_count.cabinet_id = mine.id
  left join adherence      on adherence.cabinet_id = mine.id
  left join sessions       on sessions.cabinet_id = mine.id
  left join spend          on spend.cabinet_id = mine.id
  left join public.subscriptions sub on sub.cabinet_id = mine.id
  left join public.plans   on plans.code = sub.plan_code
  order by mine.name;
$$;

revoke execute on function public.reseller_cabinet_overview() from public, anon;
grant execute on function public.reseller_cabinet_overview() to authenticated;
