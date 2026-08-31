-- ============================================================================
-- 0003 — Étage commercial : offres, abonnements, consommation IA, journal
--        d'accès, et les agrégats que voit le revendeur.
--
-- Le revendeur ne lit pas les tables de santé. Il lit :
--   · ses cabinets et ses interlocuteurs (0001),
--   · les offres et abonnements qu'il vend (ici),
--   · des COMPTEURS, produits par une fonction qui filtre sur son
--     appartenance et supprime les agrégats calculés sur trop peu de patients.
-- ============================================================================

create type public.subscription_status as enum ('essai', 'actif', 'impaye', 'suspendu', 'resilie');
create type public.ai_call_kind as enum ('brouillon_seance', 'module', 'affirmations', 'profil');

create table public.plans (
  code                 text primary key,
  label                text not null,
  price_cents          integer not null check (price_cents >= 0),
  max_patients         integer check (max_patients > 0),
  -- Plafond de consommation IA par mois. Les quatre appels coûtent de
  -- l'argent : sans plafond, la marge du revendeur fond quand une thérapeute
  -- capte beaucoup de séances.
  ai_monthly_cap_cents integer check (ai_monthly_cap_cents >= 0),
  position             integer not null default 0
);

create table public.subscriptions (
  cabinet_id            uuid primary key references public.cabinets (id) on delete cascade,
  plan_code             text not null references public.plans (code),
  status                public.subscription_status not null default 'essai',
  trial_ends_at         timestamptz,
  current_period_end    timestamptz,
  ai_cap_override_cents integer check (ai_cap_override_cents >= 0),
  updated_at            timestamptz not null default now()
);

-- Compteurs de consommation IA. Volontairement SANS patient_id ni contenu :
-- le revendeur facture des appels, il ne remonte pas à une personne.
create table public.ai_usage (
  id            bigint generated always as identity primary key,
  cabinet_id    uuid not null references public.cabinets (id) on delete cascade,
  kind          public.ai_call_kind not null,
  model         text not null,
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_cents    numeric(10, 4) not null default 0 check (cost_cents >= 0),
  occurred_at   timestamptz not null default now()
);

create index ai_usage_cabinet_month_idx on public.ai_usage (cabinet_id, occurred_at);

-- Journal d'accès, en ajout seul. Aucune donnée de santé n'y entre : on
-- journalise QUI a fait QUOI et SUR QUELLE TABLE, jamais le contenu.
create table public.audit_log (
  id            bigint generated always as identity primary key,
  cabinet_id    uuid references public.cabinets (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action        text not null,
  target_table  text,
  target_id     uuid,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index audit_log_cabinet_idx on public.audit_log (cabinet_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_usage      enable row level security;
alter table public.audit_log     enable row level security;

revoke all on public.plans, public.subscriptions, public.ai_usage, public.audit_log from anon;

create policy "les offres sont lisibles par les comptes authentifiés"
  on public.plans for select to authenticated using (true);

create policy "le revendeur gère les abonnements de ses cabinets"
  on public.subscriptions for all to authenticated
  using (public.is_reseller_of_cabinet(cabinet_id))
  with check (public.is_reseller_of_cabinet(cabinet_id));

create policy "le cabinet lit son abonnement"
  on public.subscriptions for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

-- Le cabinet voit sa propre consommation, en détail. Le revendeur ne voit que
-- l'agrégat mensuel renvoyé par reseller_cabinet_overview() : l'horodatage
-- d'un appel dirait quand une séance a eu lieu.
create policy "le cabinet lit sa consommation"
  on public.ai_usage for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

create policy "le cabinet lit son journal d'accès"
  on public.audit_log for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

create policy "toute action authentifiée peut être journalisée"
  on public.audit_log for insert to authenticated
  with check (actor_user_id = auth.uid());

-- Le journal ne se réécrit pas.
revoke update, delete on public.audit_log from authenticated;
revoke update, delete on public.ai_usage from authenticated;

-- ---------------------------------------------------------------------------
-- La vue du revendeur : des compteurs, rien d'autre.
--
-- SECURITY DEFINER, donc la RLS des tables de santé ne s'applique pas ici :
-- c'est précisément pourquoi cette fonction ne renvoie AUCUNE colonne
-- nominative, et pourquoi elle filtre d'abord sur l'appartenance du
-- demandeur. Toute modification de cette fonction doit être relue comme une
-- modification de sécurité.
--
-- Les moyennes sont supprimées sous trois patients actifs : dans un cabinet
-- d'un ou deux patients, une moyenne est un chiffre individuel.
-- ---------------------------------------------------------------------------

create or replace function public.reseller_cabinet_overview()
returns table (
  cabinet_id            uuid,
  cabinet_name          text,
  slug                  text,
  created_at            timestamptz,
  archived              boolean,
  therapists            bigint,
  patients_active       bigint,
  adherence_avg         numeric,
  sessions_30d          bigint,
  ai_spend_cents_month  numeric,
  ai_cap_cents          integer,
  plan_code             text,
  plan_label            text,
  status                public.subscription_status,
  current_period_end    timestamptz
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
    -- Secret statistique : pas de moyenne sous trois patients actifs.
    case when coalesce(patients_count.n, 0) >= 3 then round(adherence.pct, 1) end,
    coalesce(sessions.n, 0),
    coalesce(spend.cents, 0),
    coalesce(sub.ai_cap_override_cents, plans.ai_monthly_cap_cents),
    sub.plan_code,
    plans.label,
    sub.status,
    sub.current_period_end
  from mine
  left join staff           on staff.cabinet_id = mine.id
  left join patients_count  on patients_count.cabinet_id = mine.id
  left join adherence       on adherence.cabinet_id = mine.id
  left join sessions        on sessions.cabinet_id = mine.id
  left join spend           on spend.cabinet_id = mine.id
  left join public.subscriptions sub on sub.cabinet_id = mine.id
  left join public.plans    on plans.code = sub.plan_code
  order by mine.name;
$$;

revoke execute on function public.reseller_cabinet_overview() from public, anon;
grant execute on function public.reseller_cabinet_overview() to authenticated;

-- Le cabinet, lui, a besoin de savoir où il en est de son plafond : cette
-- fonction-ci ne sert qu'à son propre cabinet.
create or replace function public.cabinet_ai_spend_this_month(p_cabinet uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select case
    when public.is_cabinet_member(p_cabinet) or public.is_reseller_of_cabinet(p_cabinet)
    then coalesce((
      select sum(u.cost_cents) from public.ai_usage u
      where u.cabinet_id = p_cabinet and u.occurred_at >= date_trunc('month', now())
    ), 0)
  end;
$$;

revoke execute on function public.cabinet_ai_spend_this_month(uuid) from public, anon;
grant execute on function public.cabinet_ai_spend_this_month(uuid) to authenticated;

-- Offres de départ. Les prix sont des valeurs de travail, à fixer avec le
-- revendeur.
insert into public.plans (code, label, price_cents, max_patients, ai_monthly_cap_cents, position) values
  ('essentiel', 'Essentiel', 3900,  25,  1500, 1),
  ('cabinet',   'Cabinet',   7900,  80,  5000, 2),
  ('reseau',    'Réseau',   14900, null, 15000, 3);
