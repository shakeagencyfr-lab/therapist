-- ============================================================================
-- 0049 — Le contrat tient parole : un catalogue par revendeur, des essais qui
--        finissent, des adresses qui ne cassent rien, et un journal
-- ============================================================================
--
-- Sept règles que l'espace revendeur promettait sans que la base les tienne.
--
--   1. Le catalogue appartient à SON revendeur. La politique de 0025 laissait
--      le propriétaire de n'importe quel revendeur régler toutes les offres :
--      dès le deuxième revendeur, l'un aurait pu fermer la boutique ou le site
--      des cabinets de l'autre, et changer leurs prix, d'un seul `update`.
--   2. Un essai a toujours une fin. Un abonnement posé sans date — le
--      changement d'offre d'un cabinet qui n'en avait pas — naissait « essai »
--      sans échéance, que `abonnement_en_regle` laisse courir : tous les
--      leviers de l'offre, pour toujours, sans payer.
--   3. Le message du plafond redit le bon geste. 0022 avait écrit « Closez un
--      suivi terminé depuis sa fiche » ; 0032 puis 0035 ont recréé le
--      déclencheur avec l'ancien « Archivez », un bouton qui n'existe pas.
--   4. L'identifiant du cabinet et son archivage reviennent au revendeur. La
--      praticienne pouvait les changer par l'API, alors que son écran dit
--      qu'ils se règlent chez lui.
--   5. Un ancien identifiant reste une adresse. Renommer un cabinet cassait
--      d'un coup les cartes imprimées, le widget posé sur son site, les
--      espaces installés sur les téléphones et les rappels déjà programmés.
--   6. La thérapeute sait à qui parler et quand son essai finit : les
--      coordonnées du revendeur et la fin d'essai partent avec ses droits.
--   7. Les changements d'offre et de contrat laissent une trace, que le
--      revendeur relit depuis l'écran Offres.

-- ============================================================================
-- 1. Le catalogue appartient à son revendeur
-- ============================================================================
--
-- POURQUOI UNE COLONNE, ET PAS UNE CLÉ (revendeur, code). Les abonnements
-- désignent leur offre par `plan_code`, et six fonctions — droits, plafond,
-- vitrine, domaine, boutique, portefeuille — joignent sur ce seul code. Une
-- clé composée les obligerait toutes à changer en même temps, et laisserait
-- les abonnements existants à migrer. Le code reste donc la clé ; l'offre
-- porte en plus son revendeur. Un second revendeur reçoit ses propres offres,
-- sous ses propres codes, créées par la plateforme.
--
-- Une offre sans revendeur est une offre de LA PLATEFORME : tout revendeur
-- peut la lire et la poser, aucun ne peut la régler.

alter table public.plans
  add column if not exists reseller_id uuid references public.resellers (id) on delete restrict;

comment on column public.plans.reseller_id is
  'Le revendeur qui règle cette offre. Null : une offre de la plateforme, que seul le service règle.';

create index if not exists plans_reseller_idx on public.plans (reseller_id);

-- Les offres d'aujourd'hui sont celles de l'unique revendeur : c'est lui qui
-- les règle depuis son écran Offres, et il doit continuer de le pouvoir. Sur
-- une base qui en compterait plusieurs, on ne devine pas : elles restent à la
-- plateforme, qui les attribuera.
update public.plans
   set reseller_id = (select r.id from public.resellers r order by r.created_at limit 1)
 where reseller_id is null
   and (select count(*) from public.resellers) = 1;

create or replace function public.is_reseller_owner(p_reseller uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reseller_members m
    where m.reseller_id = p_reseller
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

comment on function public.is_reseller_owner(uuid) is
  'L''appelant est-il propriétaire de CE revendeur ? Faux pour un revendeur nul (offre de la plateforme).';

revoke execute on function public.is_reseller_owner(uuid) from public, anon;
grant execute on function public.is_reseller_owner(uuid) to authenticated;

-- Les politiques sont cherchées plutôt que nommées : un accent de plus ou de
-- moins d'une base à l'autre suffit à faire rater un `drop policy` nommé, et
-- l'ancienne resterait permissive à côté de la nouvelle (voir 0030).
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'plans' and cmd in ('SELECT', 'UPDATE')
  loop
    execute format('drop policy %I on public.plans', r.policyname);
  end loop;
end $$;

-- Un revendeur lit son catalogue et celui de la plateforme — pas les prix
-- d'un concurrent.
create policy "le revendeur lit son catalogue"
  on public.plans for select to authenticated
  using (reseller_id is null or public.is_reseller_member(reseller_id));

-- Seul le propriétaire DE CE revendeur règle ses offres : ni un employé, qui
-- reprendrait les prix de toute l'enseigne d'un geste (0025), ni le
-- propriétaire d'un autre revendeur.
create policy "le proprietaire regle les offres de son revendeur"
  on public.plans for update to authenticated
  using (public.is_reseller_owner(reseller_id))
  with check (public.is_reseller_owner(reseller_id));

-- Et seulement ce que l'écran règle. Le code est la clé que portent les
-- abonnements, le revendeur est le propriétaire : ni l'un ni l'autre ne se
-- change depuis un navigateur.
revoke insert, update, delete on public.plans from authenticated;
grant update (label, price_cents, max_patients, shop, marque_blanche, site, position)
  on public.plans to authenticated;

-- Un revendeur ne pose à ses cabinets que ses propres offres, ou celles de la
-- plateforme. Sans cela, un cabinet pourrait porter l'offre d'un concurrent —
-- et en suivre les réglages, que ce concurrent change quand il veut.
--
-- La plateforme (clé de service, migrations, épreuves : pas d'auth.uid())
-- n'est pas retenue : c'est elle qui attribue les offres quand il le faut.
create or replace function public.offre_du_bon_catalogue()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_offre   uuid;
  v_cabinet uuid;
begin
  if auth.uid() is null then
    return new;
  end if;
  select p.reseller_id into v_offre from public.plans p where p.code = new.plan_code;
  -- Offre de la plateforme — ou code inconnu, que la clé étrangère refusera.
  if v_offre is null then
    return new;
  end if;
  select c.reseller_id into v_cabinet from public.cabinets c where c.id = new.cabinet_id;
  if v_cabinet is distinct from v_offre then
    raise exception 'Cette offre n''est pas à votre catalogue : choisissez l''une des vôtres.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.offre_du_bon_catalogue() from public, anon, authenticated;

drop trigger if exists subscriptions_offre_du_catalogue on public.subscriptions;
create trigger subscriptions_offre_du_catalogue
  before insert or update of plan_code on public.subscriptions
  for each row execute function public.offre_du_bon_catalogue();


-- ============================================================================
-- 2. Un essai a toujours une fin
-- ============================================================================
--
-- `abonnement_en_regle` laisse courir un essai sans date — une colonne vide
-- est une donnée qui manque, pas un contrat rompu (0035). La règle est bonne ;
-- c'est la colonne vide qui ne doit plus naître. Tout essai posé sans date
-- reçoit les quatorze jours de l'ouverture, quel que soit le chemin : le
-- formulaire, le changement d'offre d'un cabinet sans contrat, un import.

create or replace function public.borner_l_essai()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'essai' and new.trial_ends_at is null then
    new.trial_ends_at := now() + interval '14 days';
  end if;
  return new;
end;
$$;

revoke execute on function public.borner_l_essai() from public, anon, authenticated;

drop trigger if exists subscriptions_essai_borne on public.subscriptions;
create trigger subscriptions_essai_borne
  before insert or update of status, trial_ends_at on public.subscriptions
  for each row execute function public.borner_l_essai();

-- Les essais éternels déjà posés reçoivent la même borne, à compter
-- d'aujourd'hui : les fermer d'un coup, sans que personne ait été prévenu,
-- serait la pire façon d'apprendre la règle.
update public.subscriptions
   set trial_ends_at = now() + interval '14 days'
 where status = 'essai' and trial_ends_at is null;


-- ============================================================================
-- 3. Le plafond dit le geste qui existe
-- ============================================================================
--
-- Repris de la définition en production (0035), deux phrases changées : le
-- geste s'appelle « Clore le suivi » dans l'application, et la réouverture
-- d'un suivi passe par ce même déclencheur depuis 0032 — « aucune nouvelle
-- fiche » ne disait pas ce qui était refusé.

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
      'Votre abonnement n''est plus en cours : aucune fiche ne peut être ouverte ni rouverte. Vos dossiers restent accessibles ; votre revendeur peut réactiver l''offre.'
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
      'Votre offre permet % fiches actives, et elles le sont toutes. Closez un suivi terminé depuis sa fiche, ou demandez à votre revendeur de relever le plafond.',
      v_max
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.verifier_plafond_patientes() from public, anon, authenticated;


-- ============================================================================
-- 4. L'identifiant et l'archivage reviennent au revendeur
-- ============================================================================
--
-- La praticienne et le revendeur écrivent tous deux sous le rôle
-- `authenticated` : des droits par colonne ne sauraient pas les distinguer.
-- C'est donc un déclencheur, à côté de celui qui interdit déjà de changer de
-- revendeur (forbid_cabinet_transfer). La praticienne garde son nom, son
-- sur-titre et sa marque ; l'adresse publique, dont dépendent les liens déjà
-- donnés, et l'archivage, qui sort le cabinet du portefeuille, se règlent
-- chez le revendeur.
--
-- Le serveur et les migrations n'ont pas d'auth.uid() : ils ne sont pas
-- retenus.

create or replace function public.garder_ce_qui_revient_au_revendeur()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_reseller_member(old.reseller_id) then
    return new;
  end if;
  if new.slug is distinct from old.slug then
    raise exception 'L''identifiant du cabinet se règle chez votre revendeur : il porte votre adresse publique, et les liens déjà donnés en dépendent.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.archived_at is distinct from old.archived_at then
    raise exception 'L''archivage du cabinet se règle chez votre revendeur.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.locale is distinct from old.locale then
    raise exception 'Seuls le nom, le sur-titre et la marque du cabinet se règlent depuis son espace.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function public.garder_ce_qui_revient_au_revendeur() from public, anon, authenticated;

drop trigger if exists cabinets_ce_qui_revient_au_revendeur on public.cabinets;
create trigger cabinets_ce_qui_revient_au_revendeur
  before update on public.cabinets
  for each row execute function public.garder_ce_qui_revient_au_revendeur();


-- ============================================================================
-- 5. Un ancien identifiant reste une adresse
-- ============================================================================
--
-- Les trois portes d'un cabinet — /<identifiant>, /<identifiant>/mon et
-- /e/<identifiant> — passent par Vercel sans que rien y vérifie le mot : c'est
-- `cabinet_vitrine()` qui le résout. Il suffit donc qu'elle connaisse les
-- anciens identifiants pour que tout suive : le widget posé sur le site de la
-- thérapeute, l'espace installé (son manifeste rouvre ./mon depuis l'ancienne
-- adresse), les cartes imprimées. Elle rend l'identifiant ACTUEL, et l'écran
-- remplace l'adresse par la nouvelle.
--
-- Un ancien identifiant reste RÉSERVÉ à son cabinet : s'il revenait à un
-- autre, les liens du premier mèneraient chez le second.

create table if not exists public.cabinet_slug_aliases (
  slug        text primary key,
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.cabinet_slug_aliases is
  'Les anciens identifiants d''un cabinet : ils mènent toujours à lui, et ne peuvent servir à aucun autre.';

create index if not exists cabinet_slug_aliases_cabinet_idx on public.cabinet_slug_aliases (cabinet_id);

alter table public.cabinet_slug_aliases enable row level security;
revoke all on public.cabinet_slug_aliases from anon, authenticated;
grant select on public.cabinet_slug_aliases to authenticated;

-- Lu par l'éditeur de marque du revendeur (« les anciennes adresses mènent
-- ici »), et par le cabinet lui-même. Écrit par le déclencheur seul.
create policy "le revendeur et le cabinet lisent les anciens identifiants"
  on public.cabinet_slug_aliases for select to authenticated
  using (public.is_reseller_of_cabinet(cabinet_id) or public.is_cabinet_member(cabinet_id));

-- Un identifiant qui a déjà servi à un autre cabinet n'est pas libre. Le code
-- 23505 est celui du doublon : l'écran du revendeur dit déjà « déjà pris ».
create or replace function public.identifiant_libre()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.cabinet_slug_aliases a
     where a.slug = new.slug and a.cabinet_id <> new.id
  ) then
    raise exception 'L''identifiant « % » a déjà servi à un autre cabinet : ses anciens liens y mènent encore.', new.slug
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.identifiant_libre() from public, anon, authenticated;

drop trigger if exists cabinets_identifiant_libre on public.cabinets;
create trigger cabinets_identifiant_libre
  before insert or update of slug on public.cabinets
  for each row execute function public.identifiant_libre();

-- Le renommage garde l'ancien identifiant, rend le nouveau s'il était un
-- ancien de ce cabinet, et fait rouvrir aux rappels déjà programmés la
-- nouvelle porte plutôt que l'ancienne — les deux mènent au même espace, mais
-- autant ne pas dépendre d'un détour pour chaque notification.
create or replace function public.retenir_l_ancien_identifiant()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.slug is not distinct from old.slug then
    return new;
  end if;

  insert into public.cabinet_slug_aliases (slug, cabinet_id)
  values (old.slug, new.id)
  on conflict (slug) do nothing;

  delete from public.cabinet_slug_aliases
   where slug = new.slug and cabinet_id = new.id;

  update public.push_subscriptions
     set chemin = '/' || new.slug || '/mon'
   where cabinet_id = new.id
     and chemin in ('/' || old.slug || '/mon', '/' || old.slug || '/mon/');

  return new;
end;
$$;

revoke execute on function public.retenir_l_ancien_identifiant() from public, anon, authenticated;

drop trigger if exists cabinets_ancien_identifiant on public.cabinets;
create trigger cabinets_ancien_identifiant
  after update of slug on public.cabinets
  for each row execute function public.retenir_l_ancien_identifiant();

-- Le cabinet que désigne un identifiant, actuel ou ancien. L'actuel d'abord :
-- c'est lui que porte l'index unique, et il ne peut pas être l'ancien d'un
-- autre (identifiant_libre).
create or replace function public.cabinet_du_slug(p_slug text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select c.id from public.cabinets c where c.slug = lower(trim(p_slug))),
    (select a.cabinet_id from public.cabinet_slug_aliases a where a.slug = lower(trim(p_slug)))
  );
$$;

-- Appelée par les fonctions de la porte, jamais depuis un navigateur.
revoke execute on function public.cabinet_du_slug(text) from public, anon, authenticated;

-- Reprise de la définition en production, deux changements : l'identifiant
-- est résolu par `cabinet_du_slug`, et l'identifiant ACTUEL est rendu, pour
-- que l'écran remplace l'ancienne adresse et lise le site sous la nouvelle.
create or replace function public.cabinet_vitrine(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'slug', c.slug,
    'name', c.name,
    'tagline', c.tagline,
    'branding', c.branding
  )
  from public.cabinets c
  where c.id = public.cabinet_du_slug(p_slug)
  limit 1;
$$;

grant execute on function public.cabinet_vitrine(text) to anon, authenticated;


-- ============================================================================
-- 6. Ce que la thérapeute lit de son contrat
-- ============================================================================
--
-- Reprise de la définition en production (0035), trois clés de plus :
--   - `fin_essai` : la date de fin d'un essai, et seulement d'un essai. Un
--     contrat actif qui garde l'ancienne date d'essai ne doit pas annoncer
--     « il vous reste trois jours ».
--   - `revendeur` et `revendeur_courriel` : l'écran disait « demandez à votre
--     revendeur » sans dire qui il était, ni comment le joindre.

create or replace function public.cabinet_droits(p_cabinet uuid)
returns jsonb
language sql stable security definer set search_path = ''
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
        'offre',              p.label,
        'offre_code',         p.code,
        'en_regle',           r.ok,
        'statut',             s.status::text,
        'echeance',           coalesce(s.current_period_end, s.trial_ends_at),
        'fin_essai',          case when s.status = 'essai' then s.trial_ends_at end,
        'revendeur',          rv.name,
        'revendeur_courriel', rv.support_email
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

revoke execute on function public.cabinet_droits(uuid) from public, anon;
grant execute on function public.cabinet_droits(uuid) to authenticated;


-- ============================================================================
-- 7. Le journal des offres et des contrats
-- ============================================================================
--
-- Une offre réglée vaut pour tous ses cabinets, un statut posé ferme ou
-- rouvre les leviers d'un cabinet : ces gestes-là doivent se relire —
-- « qui a passé ce cabinet en résilié, et quand ? ». Ils s'écrivent dans
-- `audit_log`, par déclencheur : aucun chemin d'écriture ne peut les oublier,
-- ni le formulaire, ni le serveur, ni une correction à la main.
--
-- Le revendeur NE LIT PAS `audit_log` : on y trouve aussi les gestes internes
-- des cabinets (un compte rattaché à une fiche, une clé posée), qui ne le
-- regardent pas. Il passe par `journal_des_contrats()`, qui ne rend que les
-- lignes d'offre et de contrat de ses cabinets et de ses offres.

create or replace function public.journaliser_le_contrat()
returns trigger
language plpgsql security definer set search_path = ''
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
  if v_exceptions <> '{}'::jsonb then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.exception', 'subscriptions', new.cabinet_id, v_exceptions);
  end if;

  return new;
end;
$$;

revoke execute on function public.journaliser_le_contrat() from public, anon, authenticated;

drop trigger if exists subscriptions_journal on public.subscriptions;
create trigger subscriptions_journal
  after insert or update on public.subscriptions
  for each row execute function public.journaliser_le_contrat();

-- Une offre n'a pas de cabinet : la ligne porte son revendeur dans `meta`,
-- c'est ce qui la rend lisible au sien et à nul autre.
create or replace function public.journaliser_l_offre()
returns trigger
language plpgsql security definer set search_path = ''
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

  if v_champs <> '{}'::jsonb then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (null, auth.uid(), 'offre.reglee', 'plans', null,
            jsonb_build_object('code', new.code, 'reseller_id', new.reseller_id, 'champs', v_champs));
  end if;
  return new;
end;
$$;

revoke execute on function public.journaliser_l_offre() from public, anon, authenticated;

drop trigger if exists plans_journal on public.plans;
create trigger plans_journal
  after update on public.plans
  for each row execute function public.journaliser_l_offre();

-- Ce que le revendeur relit : les lignes d'offre et de contrat de SES cabinets
-- et de SES offres, les plus récentes d'abord. Qui a fait le geste est dit
-- sans nommer personne — « vous », « votre équipe » ou « la plateforme » —
-- parce que l'adresse d'un collègue n'a rien à faire dans cet écran.
create or replace function public.journal_des_contrats(p_limite integer default 50)
returns table (
  quand     timestamptz,
  action    text,
  cabinet_id uuid,
  cabinet   text,
  meta      jsonb,
  auteur    text
)
language sql stable security definer set search_path = ''
as $$
  with mes_revendeurs as (
    select m.reseller_id from public.reseller_members m where m.user_id = auth.uid()
  )
  select l.created_at,
         l.action,
         l.cabinet_id,
         c.name,
         l.meta - 'reseller_id',
         case
           when l.actor_user_id is null then 'plateforme'
           when l.actor_user_id = auth.uid() then 'vous'
           else 'equipe'
         end
    from public.audit_log l
    left join public.cabinets c on c.id = l.cabinet_id
   where (l.target_table = 'subscriptions' and l.action like 'contrat.%'
          and c.reseller_id in (select reseller_id from mes_revendeurs))
      or (l.target_table = 'plans' and l.action like 'offre.%'
          and l.meta->>'reseller_id' in (select reseller_id::text from mes_revendeurs))
   order by l.created_at desc, l.id desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

comment on function public.journal_des_contrats(integer) is
  'Les changements d''offre et de contrat des cabinets et des offres du revendeur appelant. Rien d''autre du journal.';

revoke execute on function public.journal_des_contrats(integer) from public, anon;
grant execute on function public.journal_des_contrats(integer) to authenticated;
