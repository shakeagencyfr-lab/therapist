-- ============================================================================
-- 0046 — L'assiduité du portefeuille ne compte que ce qui se fait
-- ============================================================================
--
-- L'assiduité moyenne qu'un revendeur lit pour chaque cabinet
-- (`reseller_cabinet_overview`, 0035) comptait TOUTES les lignes de
-- `patient_modules`. Or trois sortes de lignes ne sont pas des tâches que le
-- patient a devant lui :
--
--   1. Les modules « Audio » et « Échelle ». L'espace du patient ne les
--      montre jamais comme une tâche — les audios ont leur liste d'écoutes,
--      l'échelle sa carte du soir — et ne permet donc pas de les cocher. Le
--      brouillon de séance en proposait pourtant ; constaté en production :
--      deux « Audio » et deux « Échelle », tous non faits, pour toujours.
--      Le cabinet ne les compte plus (src/lib/typesDeModules.ts) ; le
--      portefeuille les comptait encore.
--   2. Les modules retirés du parcours (0045) : le patient ne les voit plus.
--   3. Les modules des fiches closes : le suivi est terminé, la fiche ne
--      compte plus parmi les patients actifs — son parcours non plus.
--
-- Chacune faisait baisser la moyenne pour ce que personne n'avait à faire.
-- Seule la définition de l'assiduité change ; la signature, les droits et
-- le reste du calcul sont ceux de 0035.

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
  -- Les tâches du parcours en cours, chez les patients suivis : la même
  -- définition que la fiche du cabinet (src/cabinet/useCabinet.ts).
  adherence as (
    select m.cabinet_id,
           avg(case when m.done_at is not null then 1.0 else 0.0 end) * 100 as pct
    from public.patient_modules m
    join public.patients p on p.id = m.patient_id
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

-- `create or replace` garde les droits ; on les redit, comme 0035.
revoke execute on function public.reseller_cabinet_overview() from public, anon;
grant execute on function public.reseller_cabinet_overview() to authenticated;
