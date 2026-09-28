-- ============================================================================
-- 0052 — Le portefeuille compte les jours, comme la fiche
-- ============================================================================
--
-- Depuis 0051, un exercice se refait chaque jour : la fiche du cabinet lit
-- l'assiduité comme la part des jours faits sur les sept derniers. Le
-- portefeuille du revendeur (0046) la lisait encore sur `done_at` — « fait au
-- moins une fois » — si bien qu'un cabinet dont les patients avaient tout
-- coché le premier soir restait à 100 % des semaines plus tard. Deux chiffres
-- pour un même mot : le revendeur et la praticienne ne parlaient plus de la
-- même chose.
--
-- Seul le calcul de l'assiduité change ; la signature, les droits, le seuil
-- de trois fiches (anonymat) et le reste sont ceux de 0046.

create or replace function public.reseller_cabinet_overview()
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
  -- Les jours faits sur les jours possibles de la semaine, tâche par tâche,
  -- puis en somme par cabinet : la règle de src/lib/assiduite.ts (septJours,
  -- assiduite), mot pour mot.
  --   - la fenêtre finit aujourd'hui si l'exercice est fait aujourd'hui,
  --     hier sinon : la journée en cours n'est pas encore manquée ;
  --   - un jour compte s'il est fait, ou s'il est postérieur au jour où
  --     l'exercice a été confié ;
  --   - une somme, pas une moyenne de pourcentages.
  adherence as (
    select m.cabinet_id,
           sum(j.faits)::numeric     as faits,
           sum(j.possibles)::numeric as possibles
    from public.patient_modules m
    join public.patients p on p.id = m.patient_id
    cross join lateral (
      select
        count(*) filter (where c.jour is not null) as faits,
        count(*) filter (
          where c.jour is not null
             or d.jour > (m.created_at at time zone 'Europe/Paris')::date
        ) as possibles
      from (
        select f.fin - g.i as jour
        from (
          select case
                   when exists (
                     select 1 from public.module_completions x
                      where x.module_id = m.id
                        and x.jour = (now() at time zone 'Europe/Paris')::date
                   ) then (now() at time zone 'Europe/Paris')::date
                   else (now() at time zone 'Europe/Paris')::date - 1
                 end as fin
        ) f
        cross join generate_series(0, 6) as g(i)
      ) d
      left join public.module_completions c on c.module_id = m.id and c.jour = d.jour
    ) j
    where m.cabinet_id in (select id from mine)
      and m.archived_at is null
      and p.archived_at is null
      and m.kind not in ('Audio', 'Échelle')
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
    case
      when coalesce(patients_count.n, 0) >= 3 and adherence.possibles > 0
        then round(adherence.faits / adherence.possibles * 100, 1)
    end,
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

-- `create or replace` garde les droits ; on les redit, comme 0035.
revoke execute on function public.reseller_cabinet_overview() from public, anon;
grant execute on function public.reseller_cabinet_overview() to authenticated;
