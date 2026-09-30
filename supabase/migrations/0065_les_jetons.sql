-- ============================================================================
-- 0065 — Les jetons : la clé du revendeur, un barème, des forfaits, des recharges
-- ============================================================================
--
-- Jusqu'ici chaque cabinet branchait sa clé Anthropic et payait ses appels.
-- Un revendeur peut désormais brancher LA SIENNE, qui alimente tous ses
-- cabinets : chaque action d'analyse coûte alors un nombre de jetons qu'il
-- fixe lui-même (le barème), et chaque offre attribue d'office un forfait
-- mensuel. Quand le compteur tombe à zéro avant le renouvellement, la
-- praticienne achète une recharge — sur le compte Stripe du revendeur.
--
-- DEUX MODES, ET LE PREMIER NE BOUGE PAS. Tant que le revendeur n'a pas
-- activé les jetons ET posé sa clé, rien ne change : chaque cabinet garde sa
-- clé, rien n'est décompté, aucun lot n'est ouvert. Le déploiement de cette
-- migration ne change donc rien à ce qui tourne — à une exception près,
-- voulue : l'hypnose devient une option (plus bas), et les cabinets qui s'en
-- servent déjà la gardent.
--
-- LES JETONS SONT DES LOTS. Un lot, c'est une quantité, ce qui en reste, et
-- une date où il expire :
--   mensuel         le forfait de l'offre, versé le premier jour où l'on
--                   lit ou dépense le solde dans le mois (Europe/Paris), et
--                   qui expire au premier du mois suivant — il ne se cumule
--                   pas ;
--   essai           pendant l'essai, un lot unique qui expire avec l'essai ;
--   achat           une recharge payée, valable douze mois ;
--   option_hypnose  les jetons offerts avec l'option, valables le temps du pass ;
--   geste           ce que le revendeur accorde à la main, douze mois.
-- On dépense d'abord ce qui expire d'abord : le mois, puis le reste.
--
-- RÉSERVER, PUIS CONFIRMER OU RENDRE. Le serveur réserve les jetons avant
-- l'appel au modèle — deux analyses lancées ensemble ne passent pas toutes
-- deux sur un solde qui n'en couvre qu'une — et les rend si l'appel échoue :
-- une analyse qui n'a rien produit ne se paie pas.
--
-- LA BASE DÉCIDE, LE SERVEUR APPELLE. Toutes les écritures passent par des
-- fonctions réservées au rôle de service ; aucun navigateur n'écrit une
-- ligne de ces tables. Le cabinet lit son état par `cabinet_jetons()`, le
-- revendeur ses réglages par ses tables — jamais une clé, seulement le fait
-- qu'elle est posée.
--
-- L'ancien système de crédits (0016) reste en place, intact et inerte : on ne
-- le déterre pas, on écrit à côté.

-- ============================================================================
-- 1. L'offre : un forfait mensuel, et l'hypnose comprise ou non
-- ============================================================================

alter table public.plans
  add column if not exists jetons_mois integer not null default 0,
  add column if not exists hypnose_incluse boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_jetons_mois_borne') then
    alter table public.plans
      add constraint plans_jetons_mois_borne check (jetons_mois between 0 and 1000000);
  end if;
end $$;

-- Le revendeur règle ces deux colonnes comme les autres leviers (0049).
grant update (jetons_mois, hypnose_incluse) on public.plans to authenticated;

comment on column public.plans.jetons_mois is
  'Jetons attribués d''office chaque mois civil (Europe/Paris), en mode jetons. Ne se cumulent pas.';
comment on column public.plans.hypnose_incluse is
  'L''hypnose personnalisée est comprise dans l''offre. Sinon, elle s''achète en option.';

-- Le journal de l'offre dit aussi ces deux réglages.
create or replace function public.journaliser_l_offre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_champs jsonb := '{}'::jsonb;
begin
  if new.label is distinct from old.label then
    v_champs := v_champs || jsonb_build_object('label', jsonb_build_object('avant', old.label, 'apres', new.label));
  end if;
  if new.price_cents is distinct from old.price_cents then
    v_champs := v_champs || jsonb_build_object('price_cents', jsonb_build_object('avant', old.price_cents, 'apres', new.price_cents));
  end if;
  if new.max_patients is distinct from old.max_patients then
    v_champs := v_champs || jsonb_build_object('max_patients', jsonb_build_object('avant', old.max_patients, 'apres', new.max_patients));
  end if;
  if new.shop is distinct from old.shop then
    v_champs := v_champs || jsonb_build_object('shop', jsonb_build_object('avant', old.shop, 'apres', new.shop));
  end if;
  if new.marque_blanche is distinct from old.marque_blanche then
    v_champs := v_champs || jsonb_build_object('marque_blanche', jsonb_build_object('avant', old.marque_blanche, 'apres', new.marque_blanche));
  end if;
  if new.site is distinct from old.site then
    v_champs := v_champs || jsonb_build_object('site', jsonb_build_object('avant', old.site, 'apres', new.site));
  end if;
  if new.jetons_mois is distinct from old.jetons_mois then
    v_champs := v_champs || jsonb_build_object('jetons_mois', jsonb_build_object('avant', old.jetons_mois, 'apres', new.jetons_mois));
  end if;
  if new.hypnose_incluse is distinct from old.hypnose_incluse then
    v_champs := v_champs || jsonb_build_object('hypnose_incluse', jsonb_build_object('avant', old.hypnose_incluse, 'apres', new.hypnose_incluse));
  end if;

  if v_champs <> '{}'::jsonb then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (null, auth.uid(), 'offre.reglee', 'plans', null,
            jsonb_build_object('code', new.code, 'reseller_id', new.reseller_id, 'champs', v_champs));
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 2. Le contrat : les exceptions du forfait et de l'hypnose, et le pass
-- ============================================================================

alter table public.subscriptions
  add column if not exists jetons_mois_override integer,
  add column if not exists hypnose_override boolean,
  add column if not exists hypnose_jusqu_au timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_jetons_mois_borne') then
    alter table public.subscriptions
      add constraint subscriptions_jetons_mois_borne
      check (jetons_mois_override is null or jetons_mois_override between 0 and 1000000);
  end if;
end $$;

comment on column public.subscriptions.jetons_mois_override is
  'Forfait mensuel négocié pour ce cabinet. Null : celui de l''offre.';
comment on column public.subscriptions.hypnose_override is
  'Hypnose ouverte (true) ou fermée (false) pour ce cabinet, quoi qu''en dise l''offre. Null : l''offre décide.';
comment on column public.subscriptions.hypnose_jusqu_au is
  'Fin du pass Hypnose acheté. L''hypnose est ouverte jusque-là, quelle que soit l''offre.';

-- L'équipe du revendeur n'ouvre qu'un essai ordinaire (0063) : aucune
-- exception, pas plus sur les jetons et l'hypnose que sur le reste.
drop policy if exists "l equipe ouvre un essai, le proprietaire tout contrat" on public.subscriptions;
create policy "l equipe ouvre un essai, le proprietaire tout contrat" on public.subscriptions
  for insert to authenticated
  with check (
    public.is_reseller_of_cabinet(cabinet_id)
    and (
      public.is_reseller_owner_of_cabinet(cabinet_id)
      or (
        status = 'essai'
        and (trial_ends_at is null or trial_ends_at <= now() + interval '15 days')
        and current_period_end is null
        and ai_cap_override_cents is null
        and ai_billing = 'cle_cabinet'
        and max_patients_override is null
        and shop_override is null
        and marque_blanche_override is null
        and site_override is null
        and jetons_mois_override is null
        and hypnose_override is null
        and hypnose_jusqu_au is null
      )
    )
  );

-- Le journal du contrat dit les nouvelles exceptions, et le pass à part :
-- c'est un achat, pas une faveur.
create or replace function public.journaliser_le_contrat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exceptions jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.pose', 'subscriptions', new.cabinet_id,
            jsonb_build_object('offre', new.plan_code, 'statut', new.status,
                               'fin_essai', new.trial_ends_at, 'echeance', new.current_period_end));
    return new;
  end if;

  if new.plan_code is distinct from old.plan_code then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.offre', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.plan_code, 'apres', new.plan_code));
  end if;

  if new.status is distinct from old.status then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.statut', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.status, 'apres', new.status));
  end if;

  if new.trial_ends_at is distinct from old.trial_ends_at then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.fin_essai', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.trial_ends_at, 'apres', new.trial_ends_at));
  end if;

  if new.current_period_end is distinct from old.current_period_end then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.echeance', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.current_period_end, 'apres', new.current_period_end));
  end if;

  if new.hypnose_jusqu_au is distinct from old.hypnose_jusqu_au then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.option_hypnose', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.hypnose_jusqu_au, 'apres', new.hypnose_jusqu_au));
  end if;

  if new.max_patients_override is distinct from old.max_patients_override then
    v_exceptions := v_exceptions || jsonb_build_object('max_patients',
      jsonb_build_object('avant', old.max_patients_override, 'apres', new.max_patients_override));
  end if;
  if new.shop_override is distinct from old.shop_override then
    v_exceptions := v_exceptions || jsonb_build_object('shop',
      jsonb_build_object('avant', old.shop_override, 'apres', new.shop_override));
  end if;
  if new.marque_blanche_override is distinct from old.marque_blanche_override then
    v_exceptions := v_exceptions || jsonb_build_object('marque_blanche',
      jsonb_build_object('avant', old.marque_blanche_override, 'apres', new.marque_blanche_override));
  end if;
  if new.site_override is distinct from old.site_override then
    v_exceptions := v_exceptions || jsonb_build_object('site',
      jsonb_build_object('avant', old.site_override, 'apres', new.site_override));
  end if;
  if new.jetons_mois_override is distinct from old.jetons_mois_override then
    v_exceptions := v_exceptions || jsonb_build_object('jetons_mois',
      jsonb_build_object('avant', old.jetons_mois_override, 'apres', new.jetons_mois_override));
  end if;
  if new.hypnose_override is distinct from old.hypnose_override then
    v_exceptions := v_exceptions || jsonb_build_object('hypnose',
      jsonb_build_object('avant', old.hypnose_override, 'apres', new.hypnose_override));
  end if;
  if v_exceptions <> '{}'::jsonb then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.exception', 'subscriptions', new.cabinet_id, v_exceptions);
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 3. Les réglages du revendeur, ses recharges
-- ============================================================================

create table if not exists public.reseller_jetons (
  reseller_id               uuid primary key references public.resellers (id) on delete cascade,
  -- Les jetons ne valent qu'activés ET avec une clé posée : l'un sans l'autre,
  -- chaque cabinet garde la sienne.
  actif                     boolean not null default false,
  bareme_seance             integer not null default 12 check (bareme_seance between 0 and 10000),
  bareme_module             integer not null default 5  check (bareme_module between 0 and 10000),
  bareme_profil             integer not null default 5  check (bareme_profil between 0 and 10000),
  bareme_affirmations       integer not null default 1  check (bareme_affirmations between 0 and 10000),
  bareme_hypnose            integer not null default 50 check (bareme_hypnose between 0 and 10000),
  bareme_retouche           integer not null default 3  check (bareme_retouche between 0 and 10000),
  bareme_retouche_hypnose   integer not null default 8  check (bareme_retouche_hypnose between 0 and 10000),
  essai_jetons              integer not null default 100 check (essai_jetons between 0 and 1000000),
  option_hypnose_prix_cents integer not null default 1900 check (option_hypnose_prix_cents between 100 and 10000000),
  option_hypnose_jours      integer not null default 30 check (option_hypnose_jours between 1 and 366),
  option_hypnose_jetons     integer not null default 200 check (option_hypnose_jetons between 0 and 1000000),
  -- Des dates, jamais un caractère des clés (elles dorment dans reseller_secrets).
  cle_posee_le              timestamptz,
  stripe_pose_le            timestamptz,
  stripe_compte             text check (stripe_compte is null or char_length(stripe_compte) <= 200),
  updated_at                timestamptz not null default now()
);

alter table public.reseller_jetons enable row level security;
revoke all on public.reseller_jetons from anon, authenticated;
grant select on public.reseller_jetons to authenticated;

drop policy if exists "le revendeur lit ses reglages de jetons" on public.reseller_jetons;
create policy "le revendeur lit ses reglages de jetons"
  on public.reseller_jetons for select to authenticated
  using (public.is_reseller_member(reseller_id));

comment on table public.reseller_jetons is
  'Le mode jetons d''un revendeur : activé ou non, son barème par action, l''essai et l''option Hypnose. Écrite par le serveur seul.';

create table if not exists public.jetons_recharges (
  id          uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers (id) on delete cascade,
  libelle     text not null check (char_length(btrim(libelle)) between 1 and 80),
  jetons      integer not null check (jetons between 1 and 1000000),
  prix_cents  integer not null check (prix_cents between 100 and 10000000),
  actif       boolean not null default true,
  position    integer not null default 0,
  archivee_le timestamptz,
  cree_le     timestamptz not null default now()
);

create index if not exists jetons_recharges_revendeur_idx on public.jetons_recharges (reseller_id, position);

alter table public.jetons_recharges enable row level security;
revoke all on public.jetons_recharges from anon, authenticated;
grant select on public.jetons_recharges to authenticated;

drop policy if exists "le revendeur lit ses recharges" on public.jetons_recharges;
create policy "le revendeur lit ses recharges"
  on public.jetons_recharges for select to authenticated
  using (public.is_reseller_member(reseller_id));

comment on table public.jetons_recharges is
  'Les recharges qu''un revendeur vend à ses cabinets. Le cabinet ne les lit que par cabinet_jetons().';

-- ============================================================================
-- 4. Les commandes, les lots, les consommations
-- ============================================================================

create table if not exists public.jetons_commandes (
  id                uuid primary key default gen_random_uuid(),
  cabinet_id        uuid not null references public.cabinets (id) on delete cascade,
  reseller_id       uuid not null references public.resellers (id) on delete cascade,
  objet             text not null check (objet in ('recharge', 'option_hypnose')),
  recharge_id       uuid references public.jetons_recharges (id) on delete set null,
  libelle           text not null default '' check (char_length(libelle) <= 120),
  jetons            integer not null default 0 check (jetons between 0 and 1000000),
  -- Le pass : sa durée au moment de l'achat, pas celle d'un réglage changé depuis.
  jours             integer check (jours is null or jours between 1 and 366),
  prix_cents        integer not null check (prix_cents >= 100),
  devise            text not null default 'eur' check (devise = 'eur'),
  stripe_session_id text unique,
  statut            text not null default 'en_attente' check (statut in ('en_attente', 'payee', 'annulee')),
  cree_le           timestamptz not null default now(),
  payee_le          timestamptz
);

create index if not exists jetons_commandes_cabinet_idx on public.jetons_commandes (cabinet_id, cree_le desc);
create index if not exists jetons_commandes_revendeur_idx on public.jetons_commandes (reseller_id, cree_le desc);
create index if not exists jetons_commandes_recharge_idx on public.jetons_commandes (recharge_id);

alter table public.jetons_commandes enable row level security;
revoke all on public.jetons_commandes from anon, authenticated;
grant select on public.jetons_commandes to authenticated;

drop policy if exists "le cabinet et son revendeur lisent les commandes de jetons" on public.jetons_commandes;
create policy "le cabinet et son revendeur lisent les commandes de jetons"
  on public.jetons_commandes for select to authenticated
  using (public.is_cabinet_member(cabinet_id) or public.is_reseller_member(reseller_id));

comment on table public.jetons_commandes is
  'Un achat de recharge ou de pass Hypnose, payé sur le compte Stripe du revendeur. Seul Stripe, relu par le serveur, la dit payée.';

create table if not exists public.jetons_lots (
  id              uuid primary key default gen_random_uuid(),
  cabinet_id      uuid not null references public.cabinets (id) on delete cascade,
  origine         text not null check (origine in ('mensuel', 'essai', 'achat', 'option_hypnose', 'geste')),
  jetons_initiaux integer not null check (jetons_initiaux >= 0),
  restants        integer not null check (restants >= 0 and restants <= jetons_initiaux),
  expire_le       timestamptz not null,
  -- Le mois du forfait (premier jour, Europe/Paris) ; null pour le reste.
  periode         date,
  commande_id     uuid references public.jetons_commandes (id) on delete set null,
  cree_le         timestamptz not null default now()
);

-- Un forfait par mois et par cabinet, un seul lot d'essai par cabinet : c'est
-- ce qui rend l'attribution paresseuse sûre, même lue deux fois à la fois.
create unique index if not exists jetons_lots_une_periode
  on public.jetons_lots (cabinet_id, origine, periode) where periode is not null;
create unique index if not exists jetons_lots_un_essai
  on public.jetons_lots (cabinet_id) where origine = 'essai';
create index if not exists jetons_lots_cabinet_idx on public.jetons_lots (cabinet_id, expire_le);
create index if not exists jetons_lots_commande_idx on public.jetons_lots (commande_id);

alter table public.jetons_lots enable row level security;
revoke all on public.jetons_lots from anon, authenticated;
grant select on public.jetons_lots to authenticated;

drop policy if exists "le cabinet lit ses lots de jetons" on public.jetons_lots;
create policy "le cabinet lit ses lots de jetons"
  on public.jetons_lots for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

comment on table public.jetons_lots is
  'Les jetons d''un cabinet, par lot : forfait du mois, essai, achat, option Hypnose, geste du revendeur. Écrite par les fonctions jetons_* seules.';

create table if not exists public.jetons_consommations (
  id         uuid primary key default gen_random_uuid(),
  cabinet_id uuid not null references public.cabinets (id) on delete cascade,
  action     text not null check (action in ('seance', 'module', 'profil', 'affirmations', 'hypnose', 'retouche', 'retouche_hypnose')),
  -- Zéro : une action comprise dans un forfait (les consignes d'une séance
  -- payée, les mouvements d'une hypnose payée). Elle est inscrite quand même :
  -- c'est ce qui permet de la compter, et de borner ce qui est compris.
  jetons     integer not null check (jetons >= 0),
  -- La séance ou l'hypnose à laquelle l'action se rattache.
  ref        text check (ref is null or char_length(ref) <= 100),
  statut     text not null default 'reserve' check (statut in ('reserve', 'confirme', 'rembourse')),
  le         timestamptz not null default now()
);

create index if not exists jetons_consommations_cabinet_idx on public.jetons_consommations (cabinet_id, le desc);
create index if not exists jetons_consommations_ref_idx on public.jetons_consommations (cabinet_id, action, ref) where ref is not null;

alter table public.jetons_consommations enable row level security;
revoke all on public.jetons_consommations from anon, authenticated;
grant select on public.jetons_consommations to authenticated;

drop policy if exists "le cabinet lit ses consommations de jetons" on public.jetons_consommations;
create policy "le cabinet lit ses consommations de jetons"
  on public.jetons_consommations for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

comment on table public.jetons_consommations is
  'Chaque action d''analyse décomptée en jetons : réservée avant l''appel, confirmée après, rendue s''il échoue.';

create table if not exists public.jetons_consommation_lots (
  consommation_id uuid not null references public.jetons_consommations (id) on delete cascade,
  lot_id          uuid not null references public.jetons_lots (id) on delete cascade,
  jetons          integer not null check (jetons > 0),
  primary key (consommation_id, lot_id)
);

create index if not exists jetons_consommation_lots_lot_idx on public.jetons_consommation_lots (lot_id);

-- Le détail par lot ne sert qu'à rendre juste : personne ne le lit du navigateur.
alter table public.jetons_consommation_lots enable row level security;
revoke all on public.jetons_consommation_lots from anon, authenticated;

comment on table public.jetons_consommation_lots is
  'Dans quels lots une consommation a puisé, et combien : ce qui permet de rendre exactement ce qui a été pris.';

-- ============================================================================
-- 5. Les revendeurs d'aujourd'hui et de demain : réglages et recharges par défaut
-- ============================================================================

-- La clé d'un revendeur posée avant (0016) garde sa date : l'écran dit
-- « posée le … » plutôt que « posée, on ne sait quand ».
insert into public.reseller_jetons (reseller_id, cle_posee_le)
select r.id, case when s.anthropic_key_enc is not null then a.anthropic_set_at end
  from public.resellers r
  left join public.reseller_secrets s on s.reseller_id = r.id
  left join public.reseller_ai_settings a on a.reseller_id = r.id
on conflict (reseller_id) do nothing;

insert into public.jetons_recharges (reseller_id, libelle, jetons, prix_cents, position)
select r.id, v.libelle, v.jetons, v.prix, v.pos
  from public.resellers r
 cross join (values ('100 jetons', 100, 1200, 1), ('300 jetons', 300, 3000, 2), ('1 000 jetons', 1000, 8500, 3))
       as v(libelle, jetons, prix, pos)
 where not exists (select 1 from public.jetons_recharges x where x.reseller_id = r.id);

create or replace function public.jetons_revendeur_neuf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reseller_jetons (reseller_id) values (new.id) on conflict (reseller_id) do nothing;
  insert into public.jetons_recharges (reseller_id, libelle, jetons, prix_cents, position)
  values (new.id, '100 jetons', 100, 1200, 1),
         (new.id, '300 jetons', 300, 3000, 2),
         (new.id, '1 000 jetons', 1000, 8500, 3);
  return new;
end;
$$;

revoke execute on function public.jetons_revendeur_neuf() from public, anon, authenticated;

drop trigger if exists resellers_jetons_par_defaut on public.resellers;
create trigger resellers_jetons_par_defaut
  after insert on public.resellers
  for each row execute function public.jetons_revendeur_neuf();

-- ============================================================================
-- 6. Les fonctions du serveur (rôle de service seulement)
-- ============================================================================

/* Les réglages d'un revendeur — créés au besoin, pour qu'aucune fonction
   n'ait à deviner des valeurs par défaut que la table porte déjà. */
create or replace function public.jetons_reglages(p_reseller uuid)
returns public.reseller_jetons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.reseller_jetons;
begin
  select * into v from public.reseller_jetons r where r.reseller_id = p_reseller;
  if not found then
    insert into public.reseller_jetons (reseller_id) values (p_reseller) on conflict (reseller_id) do nothing;
    select * into v from public.reseller_jetons r where r.reseller_id = p_reseller;
  end if;
  return v;
end;
$$;

/* Le mode jetons vaut-il pour ce revendeur ? Activé ET une clé posée. La
   même règle que le serveur (server/jetons.ts, facturationDuCabinet). */
create or replace function public.jetons_mode_actif(p_reseller uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.actif from public.reseller_jetons r where r.reseller_id = p_reseller), false)
     and exists (select 1 from public.reseller_secrets s
                  where s.reseller_id = p_reseller and s.anthropic_key_enc is not null);
$$;

/* L'hypnose est-elle ouverte à ce cabinet ? L'exception l'emporte sur
   l'offre ; un pass en cours l'ouvre dans tous les cas ; hors contrat, rien. */
create or replace function public.hypnose_ouverte(p_cabinet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.abonnement_en_regle(p_cabinet)
     and coalesce((
       select coalesce(s.hypnose_override, p.hypnose_incluse, false)
           or coalesce(s.hypnose_jusqu_au > now(), false)
         from public.subscriptions s
         left join public.plans p on p.code = s.plan_code
        where s.cabinet_id = p_cabinet
     ), false);
$$;

/*
 * Le forfait du mois, ou le lot d'essai — versés la première fois qu'on en a
 * besoin, et une seule fois.
 *
 * Paresseuse, parce qu'aucune tâche planifiée n'a à passer le premier du mois
 * sur tous les cabinets : le premier geste du mois le fait, et les index
 * uniques empêchent deux lectures simultanées de verser deux fois.
 *
 * Rien hors du mode jetons, rien hors contrat, rien pour un cabinet fermé.
 */
create or replace function public.jetons_assurer_periode(p_cabinet uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reseller uuid;
  v_sub      public.subscriptions;
  v_reg      public.reseller_jetons;
  v_n        integer;
  v_mois     date;
begin
  select c.reseller_id into v_reseller
    from public.cabinets c
   where c.id = p_cabinet and c.archived_at is null;
  if v_reseller is null then return; end if;
  if not public.jetons_mode_actif(v_reseller) then return; end if;
  if not public.abonnement_en_regle(p_cabinet) then return; end if;

  select * into v_sub from public.subscriptions s where s.cabinet_id = p_cabinet;
  if not found then return; end if;
  v_reg := public.jetons_reglages(v_reseller);

  if v_sub.status = 'essai' then
    if v_reg.essai_jetons > 0 then
      insert into public.jetons_lots (cabinet_id, origine, jetons_initiaux, restants, expire_le)
      values (p_cabinet, 'essai', v_reg.essai_jetons, v_reg.essai_jetons,
              coalesce(v_sub.trial_ends_at, now() + interval '14 days'))
      on conflict (cabinet_id) where origine = 'essai' do nothing;
    end if;
    -- Un essai prolongé prolonge son lot : il expire avec l'essai.
    if v_sub.trial_ends_at is not null then
      update public.jetons_lots l
         set expire_le = v_sub.trial_ends_at
       where l.cabinet_id = p_cabinet
         and l.origine = 'essai'
         and l.expire_le < v_sub.trial_ends_at;
    end if;
    return;
  end if;

  if v_sub.status <> 'actif' then return; end if;

  select coalesce(v_sub.jetons_mois_override, p.jetons_mois) into v_n
    from public.plans p where p.code = v_sub.plan_code;
  v_n := coalesce(v_n, v_sub.jetons_mois_override, 0);
  if v_n <= 0 then return; end if;

  v_mois := date_trunc('month', now() at time zone 'Europe/Paris')::date;
  insert into public.jetons_lots (cabinet_id, origine, jetons_initiaux, restants, expire_le, periode)
  values (p_cabinet, 'mensuel', v_n, v_n,
          (v_mois + interval '1 month')::timestamp at time zone 'Europe/Paris', v_mois)
  on conflict (cabinet_id, origine, periode) where periode is not null do nothing;
end;
$$;

/*
 * Réserver des jetons pour une action. Rend la consommation, à confirmer
 * après l'appel ou à rendre s'il échoue.
 *
 * Un verrou par cabinet : deux analyses lancées ensemble passent l'une après
 * l'autre, et la seconde voit le solde que la première a laissé. On puise
 * d'abord dans ce qui expire d'abord.
 *
 * Solde insuffisant : KL402, avec le solde et le besoin — en clair dans le
 * message, et lisibles dans le détail pour que le serveur les redise.
 * Zéro jeton est permis : c'est une action comprise dans un forfait, qu'on
 * inscrit pour pouvoir la compter.
 */
create or replace function public.jetons_debiter(p_cabinet uuid, p_action text, p_jetons integer, p_ref text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solde integer;
  v_id    uuid;
  v_reste integer;
  v_pris  integer;
  v_lot   record;
begin
  if p_action is null or p_action not in ('seance', 'module', 'profil', 'affirmations', 'hypnose', 'retouche', 'retouche_hypnose') then
    raise exception 'Action inconnue : %.', coalesce(p_action, '(aucune)') using errcode = 'check_violation';
  end if;
  if p_jetons is null or p_jetons < 0 or p_jetons > 1000000 then
    raise exception 'Nombre de jetons invalide.' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('klaro.jetons:' || p_cabinet::text));
  perform public.jetons_assurer_periode(p_cabinet);

  select coalesce(sum(l.restants), 0)::integer into v_solde
    from public.jetons_lots l
   where l.cabinet_id = p_cabinet and l.expire_le > now() and l.restants > 0;
  if v_solde < p_jetons then
    raise exception 'Solde de jetons insuffisant : % restant(s), % nécessaire(s).', v_solde, p_jetons
      using errcode = 'KL402',
            detail = json_build_object('solde', v_solde, 'besoin', p_jetons)::text;
  end if;

  insert into public.jetons_consommations (cabinet_id, action, jetons, ref)
  values (p_cabinet, p_action, p_jetons, nullif(btrim(coalesce(p_ref, '')), ''))
  returning id into v_id;

  v_reste := p_jetons;
  for v_lot in
    select l.id, l.restants
      from public.jetons_lots l
     where l.cabinet_id = p_cabinet and l.expire_le > now() and l.restants > 0
     order by l.expire_le, l.cree_le, l.id
       for update
  loop
    exit when v_reste <= 0;
    v_pris := least(v_lot.restants, v_reste);
    update public.jetons_lots set restants = restants - v_pris where id = v_lot.id;
    insert into public.jetons_consommation_lots (consommation_id, lot_id, jetons) values (v_id, v_lot.id, v_pris);
    v_reste := v_reste - v_pris;
  end loop;

  return v_id;
end;
$$;

/* L'appel a réussi : la réservation devient une dépense. */
create or replace function public.jetons_confirmer(p_consommation uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.jetons_consommations
     set statut = 'confirme'
   where id = p_consommation and statut = 'reserve';
$$;

/* L'appel a échoué : chaque lot retrouve ce qu'on y avait pris. Une seconde
   fois ne rend rien de plus. */
create or replace function public.jetons_rembourser(p_consommation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cabinet uuid;
  v_statut  text;
  v_part    record;
begin
  select c.cabinet_id into v_cabinet from public.jetons_consommations c where c.id = p_consommation;
  if v_cabinet is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('klaro.jetons:' || v_cabinet::text));

  select c.statut into v_statut from public.jetons_consommations c where c.id = p_consommation for update;
  if v_statut is null or v_statut = 'rembourse' then return; end if;

  for v_part in
    select cl.lot_id, cl.jetons from public.jetons_consommation_lots cl where cl.consommation_id = p_consommation
  loop
    update public.jetons_lots l
       set restants = least(l.jetons_initiaux, l.restants + v_part.jetons)
     where l.id = v_part.lot_id;
  end loop;
  update public.jetons_consommations set statut = 'rembourse' where id = p_consommation;
end;
$$;

/* Verser un lot : un achat, les jetons d'un pass, un geste du revendeur. */
create or replace function public.jetons_crediter(
  p_cabinet uuid, p_origine text, p_jetons integer, p_expire timestamptz, p_commande uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_origine is null or p_origine not in ('achat', 'option_hypnose', 'geste') then
    raise exception 'Origine de lot inconnue : %.', coalesce(p_origine, '(aucune)') using errcode = 'check_violation';
  end if;
  if p_jetons is null or p_jetons < 1 or p_jetons > 1000000 then
    raise exception 'Nombre de jetons invalide.' using errcode = 'check_violation';
  end if;
  if p_expire is null or p_expire <= now() then
    raise exception 'Un lot doit expirer dans le futur.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.cabinets c where c.id = p_cabinet) then
    raise exception 'Ce cabinet n''existe pas.' using errcode = 'P0002';
  end if;
  insert into public.jetons_lots (cabinet_id, origine, jetons_initiaux, restants, expire_le, commande_id)
  values (p_cabinet, p_origine, p_jetons, p_jetons, p_expire, p_commande)
  returning id into v_id;
  return v_id;
end;
$$;

/*
 * Une commande payée — Stripe l'a dit au serveur, qui l'a relu. D'un seul
 * geste : la commande passe payée, ET la recharge est versée ou le pass
 * prolongé. Une seconde vérification ne fait rien : la commande porte son
 * état, et c'est lui qu'on verrouille.
 */
create or replace function public.jetons_encaisser(p_commande uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.jetons_commandes;
  v_lot   uuid;
  v_fin   timestamptz;
begin
  select * into v from public.jetons_commandes c where c.id = p_commande for update;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'P0002';
  end if;
  if v.statut = 'payee' then
    return jsonb_build_object('deja', true, 'objet', v.objet, 'jetons', v.jetons);
  end if;
  if v.statut <> 'en_attente' then
    raise exception 'Cette commande a été annulée.' using errcode = 'check_violation';
  end if;

  update public.jetons_commandes set statut = 'payee', payee_le = now() where id = v.id;

  if v.objet = 'recharge' then
    if v.jetons > 0 then
      v_lot := public.jetons_crediter(v.cabinet_id, 'achat', v.jetons, now() + interval '12 months', v.id);
    end if;
  else
    -- Le pass s'ajoute à ce qui reste : acheter avant la fin ne fait rien perdre.
    update public.subscriptions s
       set hypnose_jusqu_au = greatest(now(), coalesce(s.hypnose_jusqu_au, now()))
                              + make_interval(days => coalesce(v.jours, 30)),
           updated_at = now()
     where s.cabinet_id = v.cabinet_id
    returning s.hypnose_jusqu_au into v_fin;
    if v.jetons > 0 and v_fin is not null then
      v_lot := public.jetons_crediter(v.cabinet_id, 'option_hypnose', v.jetons, v_fin, v.id);
    end if;
  end if;

  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
  values (v.cabinet_id, null,
          case v.objet when 'recharge' then 'jetons.recharge_payee' else 'jetons.option_hypnose_payee' end,
          'jetons_commandes', v.id,
          jsonb_build_object('jetons', v.jetons, 'prix_cents', v.prix_cents,
                             'reseller_id', v.reseller_id, 'jusqu_au', v_fin));

  return jsonb_build_object('deja', false, 'objet', v.objet, 'jetons', v.jetons, 'jusqu_au', v_fin, 'lot', v_lot);
end;
$$;

/*
 * Ce que le revendeur voit de ses cabinets : le coût réel de chaque action
 * sur quatre-vingt-dix jours (en centimes de dollar, tels que ai_usage les
 * compte), et, cabinet par cabinet, les jetons dépensés ce mois et le solde.
 * Lue par le serveur après avoir vérifié que l'appelant en est membre.
 */
create or replace function public.revendeur_jetons_apercu(p_reseller uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cab   record;
  v_debut timestamptz := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
begin
  -- Le solde affiché doit compter le forfait du mois, même s'il n'a pas encore servi.
  for v_cab in select c.id from public.cabinets c where c.reseller_id = p_reseller and c.archived_at is null loop
    perform public.jetons_assurer_periode(v_cab.id);
  end loop;

  return jsonb_build_object(
    'couts', coalesce((
      select jsonb_agg(jsonb_build_object('kind', k.kind, 'appels', k.n, 'moyen_cents', k.moyen) order by k.kind)
        from (
          select u.kind::text as kind, count(*)::integer as n, round(avg(u.cost_cents), 4) as moyen
            from public.ai_usage u
            join public.cabinets c on c.id = u.cabinet_id
           where c.reseller_id = p_reseller
             and u.occurred_at >= now() - interval '90 days'
           group by u.kind
        ) k
    ), '[]'::jsonb),
    'cabinets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cabinet_id', c.id,
               'nom', c.name,
               'consommes_mois', coalesce(cm.n, 0),
               'solde', coalesce(sl.n, 0)
             ) order by c.name)
        from public.cabinets c
        left join lateral (
          select sum(j.jetons)::integer as n
            from public.jetons_consommations j
           where j.cabinet_id = c.id and j.statut <> 'rembourse' and j.le >= v_debut
        ) cm on true
        left join lateral (
          select sum(l.restants)::integer as n
            from public.jetons_lots l
           where l.cabinet_id = c.id and l.expire_le > now()
        ) sl on true
       where c.reseller_id = p_reseller and c.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.jetons_reglages(uuid) from public, anon, authenticated;
revoke execute on function public.jetons_mode_actif(uuid) from public, anon, authenticated;
revoke execute on function public.hypnose_ouverte(uuid) from public, anon, authenticated;
revoke execute on function public.jetons_assurer_periode(uuid) from public, anon, authenticated;
revoke execute on function public.jetons_debiter(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.jetons_confirmer(uuid) from public, anon, authenticated;
revoke execute on function public.jetons_rembourser(uuid) from public, anon, authenticated;
revoke execute on function public.jetons_crediter(uuid, text, integer, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.jetons_encaisser(uuid) from public, anon, authenticated;
revoke execute on function public.revendeur_jetons_apercu(uuid) from public, anon, authenticated;

grant execute on function public.jetons_reglages(uuid) to service_role;
grant execute on function public.jetons_mode_actif(uuid) to service_role;
grant execute on function public.hypnose_ouverte(uuid) to service_role;
grant execute on function public.jetons_assurer_periode(uuid) to service_role;
grant execute on function public.jetons_debiter(uuid, text, integer, text) to service_role;
grant execute on function public.jetons_confirmer(uuid) to service_role;
grant execute on function public.jetons_rembourser(uuid) to service_role;
grant execute on function public.jetons_crediter(uuid, text, integer, timestamptz, uuid) to service_role;
grant execute on function public.jetons_encaisser(uuid) to service_role;
grant execute on function public.revendeur_jetons_apercu(uuid) to service_role;

-- ============================================================================
-- 7. Pour le navigateur : l'état des jetons du cabinet, et le droit à l'hypnose
-- ============================================================================

/*
 * Tout ce que l'écran des jetons affiche, pour un cabinet dont l'appelant est
 * membre (second facteur compris, comme is_cabinet_member) — null sinon.
 *
 * Rien de secret : que le revendeur ait branché Stripe se dit par un booléen,
 * sans la moindre trace de la clé.
 */
create or replace function public.cabinet_jetons(p_cabinet uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reseller uuid;
  v_reg      public.reseller_jetons;
  v_sub      public.subscriptions;
  v_plan     public.plans;
  v_mois     date := date_trunc('month', now() at time zone 'Europe/Paris')::date;
begin
  if p_cabinet is null or not public.is_cabinet_member(p_cabinet) then
    return null;
  end if;
  select c.reseller_id into v_reseller from public.cabinets c where c.id = p_cabinet;
  if v_reseller is null then return null; end if;

  perform public.jetons_assurer_periode(p_cabinet);
  v_reg := public.jetons_reglages(v_reseller);
  select * into v_sub from public.subscriptions s where s.cabinet_id = p_cabinet;
  select * into v_plan from public.plans p where p.code = v_sub.plan_code;

  return jsonb_build_object(
    'mode', case when public.jetons_mode_actif(v_reseller) then 'jetons' else 'cle_cabinet' end,
    'en_regle', public.abonnement_en_regle(p_cabinet),
    'solde', (
      select coalesce(sum(l.restants), 0)::integer from public.jetons_lots l
       where l.cabinet_id = p_cabinet and l.expire_le > now()
    ),
    'mensuel', case when v_sub.status = 'actif' then (
      select jsonb_build_object(
               'total', coalesce(l.jetons_initiaux, v_sub.jetons_mois_override, v_plan.jetons_mois, 0),
               'restant', coalesce(l.restants, 0),
               'renouvellement', (v_mois + interval '1 month')::date
             )
        from (select 1) x
        left join public.jetons_lots l
          on l.cabinet_id = p_cabinet and l.origine = 'mensuel' and l.periode = v_mois
    ) end,
    'essai', (
      select jsonb_build_object('total', l.jetons_initiaux, 'restant', l.restants, 'fin', l.expire_le)
        from public.jetons_lots l
       where l.cabinet_id = p_cabinet and l.origine = 'essai' and l.expire_le > now()
    ),
    'achete_restant', (
      select coalesce(sum(l.restants), 0)::integer from public.jetons_lots l
       where l.cabinet_id = p_cabinet and l.expire_le > now()
         and l.origine in ('achat', 'option_hypnose', 'geste')
    ),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'origine', l.origine, 'jetons_initiaux', l.jetons_initiaux,
               'restants', l.restants, 'expire_le', l.expire_le
             ) order by l.expire_le, l.cree_le)
        from public.jetons_lots l
       where l.cabinet_id = p_cabinet and l.expire_le > now() and l.restants > 0
    ), '[]'::jsonb),
    'hypnose', jsonb_build_object(
      'droit', public.hypnose_ouverte(p_cabinet),
      'incluse', coalesce(v_sub.hypnose_override, v_plan.hypnose_incluse, false),
      'jusqu_au', v_sub.hypnose_jusqu_au
    ),
    'bareme', jsonb_build_object(
      'seance', v_reg.bareme_seance,
      'module', v_reg.bareme_module,
      'profil', v_reg.bareme_profil,
      'affirmations', v_reg.bareme_affirmations,
      'hypnose', v_reg.bareme_hypnose,
      'retouche', v_reg.bareme_retouche,
      'retouche_hypnose', v_reg.bareme_retouche_hypnose
    ),
    'recharges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'libelle', r.libelle, 'jetons', r.jetons, 'prix_cents', r.prix_cents
             ) order by r.position, r.prix_cents)
        from public.jetons_recharges r
       where r.reseller_id = v_reseller and r.actif and r.archivee_le is null
    ), '[]'::jsonb),
    'option_hypnose', jsonb_build_object(
      'prix_cents', v_reg.option_hypnose_prix_cents,
      'jours', v_reg.option_hypnose_jours,
      'jetons', v_reg.option_hypnose_jetons
    ),
    'paiement_possible', exists (
      select 1 from public.reseller_secrets s
       where s.reseller_id = v_reseller and s.stripe_secret_enc is not null
    ),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object('le', h.le, 'action', h.action, 'jetons', h.jetons, 'statut', h.statut)
                       order by h.le desc)
        from (
          select j.le, j.action, j.jetons, j.statut
            from public.jetons_consommations j
           where j.cabinet_id = p_cabinet
           order by j.le desc
           limit 30
        ) h
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.cabinet_jetons(uuid) from public, anon;
grant execute on function public.cabinet_jetons(uuid) to authenticated, service_role;

-- Les droits du cabinet disent aussi l'hypnose — même règle que
-- hypnose_ouverte(), écrite avec les lignes déjà jointes. Le reste à l'identique.
create or replace function public.cabinet_droits(p_cabinet uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_cabinet_member(p_cabinet) or public.is_reseller_of_cabinet(p_cabinet)
    then (
      select jsonb_build_object(
        'max_patients',       case when r.ok then coalesce(s.max_patients_override, p.max_patients)
                                   else n.actives end,
        'patients_actives',   n.actives,
        'shop',               r.ok and coalesce(s.shop_override,           p.shop,           false),
        'marque_blanche',     r.ok and coalesce(s.marque_blanche_override, p.marque_blanche, false),
        'site',               r.ok and coalesce(s.site_override,           p.site,           false),
        'hypnose',            r.ok and (coalesce(s.hypnose_override, p.hypnose_incluse, false)
                                        or coalesce(s.hypnose_jusqu_au > now(), false)),
        'offre',              p.label,
        'offre_code',         p.code,
        'en_regle',           r.ok,
        'statut',             s.status::text,
        'echeance',           coalesce(s.current_period_end, s.trial_ends_at),
        'fin_essai',          case when s.status = 'essai' then s.trial_ends_at end,
        'revendeur',          rv.name,
        'revendeur_courriel', rv.support_email,
        'ferme',              c.archived_at is not null,
        'ferme_le',           c.archived_at
      )
      from (select public.abonnement_en_regle(p_cabinet) as ok) r,
           (select count(*)::int as actives from public.patients pa
             where pa.cabinet_id = p_cabinet and pa.archived_at is null) n
    )
  end
  from public.cabinets c
  left join public.subscriptions s on s.cabinet_id = c.id
  left join public.plans p on p.code = s.plan_code
  left join public.resellers rv on rv.id = c.reseller_id
  where c.id = p_cabinet;
$$;

-- ============================================================================
-- 8. Le catalogue d'aujourd'hui, et personne ne perd l'hypnose qu'il utilise
-- ============================================================================

-- Les forfaits par défaut du catalogue en place. Le revendeur les règle
-- ensuite comme le reste ; le journal de l'offre garde la trace du changement.
update public.plans set jetons_mois = 300 where code = 'essentiel' and jetons_mois = 0;
update public.plans set jetons_mois = 800 where code = 'cabinet' and jetons_mois = 0;
update public.plans set jetons_mois = 2000, hypnose_incluse = true
 where code = 'reseau' and jetons_mois = 0 and not hypnose_incluse;

-- L'hypnose devient une option. Un cabinet qui a déjà écrit une hypnose la
-- garde, par exception à son nom : on ne retire pas un outil à qui s'en sert.
update public.subscriptions s
   set hypnose_override = true
 where s.hypnose_override is null
   and exists (select 1 from public.hypnoses h where h.cabinet_id = s.cabinet_id);
