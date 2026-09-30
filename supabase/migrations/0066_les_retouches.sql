-- ============================================================================
-- 0066 — Les retouches : l'avis de la praticienne, et ce que l'IA en retient
-- ============================================================================
--
-- Sous chaque texte que l'IA écrit — un mouvement d'hypnose, une synthèse,
-- un module, une consigne, un profil… —, deux pouces. Le pouce levé compte
-- un avis ; le pouce baissé en compte un aussi, et ouvre une fenêtre où la
-- praticienne dit ce qui ne va pas et ce qu'elle attendait : l'IA réécrit le
-- texte (route `revision`, server/ai.ts). Si elle coche « Retenir cette
-- préférence », ce qu'elle attendait rejoint les consignes que l'IA relit à
-- chaque génération du même type, pour ce cabinet.
--
-- TROIS CHOSES, ICI.
--
--   1. `ai_call_kind` reçoit 'revision' : la consommation d'une retouche
--      s'inscrit comme les autres (0018 raconte ce qu'il en coûte d'oublier).
--      Aucune ligne n'emploie la nouvelle valeur dans cette migration : une
--      valeur ajoutée à une énumération ne s'emploie pas dans la transaction
--      qui l'ajoute.
--
--   2. `retours_ia` compte les avis. SANS patient ni contenu, comme
--      `ai_usage` (0003) : un avis dit qu'un texte d'un type donné a plu ou
--      déplu à ce cabinet, jamais sur qui il portait ni ce qu'il disait. Le
--      texte, lui, reste dans le dossier, là où il est déjà.
--
--   3. `preferences_ia` garde ce que la praticienne a demandé de retenir.
--      Une consigne de style (« des phrases plus longues, avec des pauses »),
--      écrite par elle, que le serveur relit avec sa clé de service et pose
--      dans la demande — jamais dans les règles du système. Vingt au plus
--      par cabinet et par type : la vingt et unième retire la plus ancienne.
--
-- PERSONNE N'ÉCRIT CES TABLES DU NAVIGATEUR. Le cabinet les lit ; il y écrit
-- par trois fonctions qui vérifient qu'il en est membre (second facteur
-- compris, 0056) et bornent ce qui entre. Ni le revendeur, ni le patient, ni
-- un visiteur anonyme n'y lisent quoi que ce soit.

alter type public.ai_call_kind add value if not exists 'revision';

-- ---------------------------------------------------------------------------
-- 1. Les préférences retenues
-- ---------------------------------------------------------------------------

create table if not exists public.preferences_ia (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  cible       text not null check (cible in (
                'hypnose', 'module', 'consigne', 'synthese', 'message', 'proposition', 'profil', 'affirmations'
              )),
  consigne    text not null check (char_length(btrim(consigne)) between 1 and 400),
  cree_par    uuid references auth.users (id) on delete set null,
  cree_le     timestamptz not null default now(),
  actif       boolean not null default true
);

-- Le serveur lit les actives d'un cabinet et d'un type, les plus récentes d'abord.
create index if not exists preferences_ia_actives_idx
  on public.preferences_ia (cabinet_id, cible, cree_le desc) where actif;
create index if not exists preferences_ia_cree_par_idx on public.preferences_ia (cree_par);

alter table public.preferences_ia enable row level security;
revoke all on public.preferences_ia from anon, authenticated;
grant select on public.preferences_ia to authenticated;

drop policy if exists "le cabinet relit ses préférences d'IA" on public.preferences_ia;
create policy "le cabinet relit ses préférences d'IA"
  on public.preferences_ia for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

comment on table public.preferences_ia is
  'Ce que la praticienne a demandé à l''IA de retenir, par type de contenu. Relu par le serveur à chaque génération du même type, posé dans la demande et non dans les règles. Écrite par cabinet_retenir_preference et cabinet_oublier_preference seulement.';

-- ---------------------------------------------------------------------------
-- 2. Les avis
-- ---------------------------------------------------------------------------

-- Les types qui se retouchent, et trois qui se notent sans se réécrire : les
-- mots, les points de vigilance et les questions du brouillon sont relevés
-- dans la séance, pas rédigés — un avis y a un sens, une retouche non.
create table if not exists public.retours_ia (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  cible       text not null check (cible in (
                'hypnose', 'module', 'consigne', 'synthese', 'message', 'proposition', 'profil', 'affirmations',
                'mots', 'vigilance', 'questions'
              )),
  vote        text not null check (vote in ('haut', 'bas')),
  cree_par    uuid references auth.users (id) on delete set null,
  cree_le     timestamptz not null default now()
);

create index if not exists retours_ia_cabinet_idx on public.retours_ia (cabinet_id, cree_le desc);
create index if not exists retours_ia_cree_par_idx on public.retours_ia (cree_par);

alter table public.retours_ia enable row level security;
revoke all on public.retours_ia from anon, authenticated;
grant select on public.retours_ia to authenticated;

drop policy if exists "le cabinet relit ses avis sur l'IA" on public.retours_ia;
create policy "le cabinet relit ses avis sur l'IA"
  on public.retours_ia for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

comment on table public.retours_ia is
  'Les pouces levés ou baissés sous les textes de l''IA, par type de contenu. Sans patient ni contenu, comme ai_usage (0003). Écrite par cabinet_voter_ia seulement.';

-- ---------------------------------------------------------------------------
-- 3. Voter
-- ---------------------------------------------------------------------------

create or replace function public.cabinet_voter_ia(p_cabinet uuid, p_cible text, p_vote text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_n integer;
begin
  if p_cabinet is null or not public.is_cabinet_member(p_cabinet) then
    raise exception 'Ce cabinet n''est pas le vôtre.' using errcode = 'P0002';
  end if;
  if p_cible is null or p_cible not in (
    'hypnose', 'module', 'consigne', 'synthese', 'message', 'proposition', 'profil', 'affirmations',
    'mots', 'vigilance', 'questions'
  ) then
    raise exception 'Ce contenu ne se note pas.' using errcode = 'check_violation';
  end if;
  if p_vote is null or p_vote not in ('haut', 'bas') then
    raise exception 'Un avis est un pouce levé ou baissé.' using errcode = 'check_violation';
  end if;

  /* Deux cents avis par heure et par cabinet : bien au-delà d'une journée de
     relecture, bien en deçà de ce qu'une boucle écrirait. */
  perform pg_advisory_xact_lock(hashtext('klaro.retours-ia:' || p_cabinet::text));
  select count(*) into v_n
    from public.retours_ia r
   where r.cabinet_id = p_cabinet
     and r.cree_le > now() - interval '1 hour';
  if v_n >= 200 then
    raise exception 'Deux cents avis en une heure : les suivants attendront un peu.' using errcode = 'check_violation';
  end if;

  insert into public.retours_ia (cabinet_id, cible, vote, cree_par)
  values (p_cabinet, p_cible, p_vote, auth.uid());
end;
$fn$;

revoke execute on function public.cabinet_voter_ia(uuid, text, text) from public, anon;
grant execute on function public.cabinet_voter_ia(uuid, text, text) to authenticated;

comment on function public.cabinet_voter_ia(uuid, text, text) is
  'Compte un avis (pouce levé ou baissé) sur un type de texte écrit par l''IA, pour un cabinet dont l''appelant est membre. Deux cents par heure et par cabinet.';

-- ---------------------------------------------------------------------------
-- 4. Retenir, oublier
-- ---------------------------------------------------------------------------

create or replace function public.cabinet_retenir_preference(p_cabinet uuid, p_cible text, p_consigne text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_consigne text := btrim(coalesce(p_consigne, ''));
  v_id       uuid;
begin
  if p_cabinet is null or not public.is_cabinet_member(p_cabinet) then
    raise exception 'Ce cabinet n''est pas le vôtre.' using errcode = 'P0002';
  end if;
  if p_cible is null or p_cible not in (
    'hypnose', 'module', 'consigne', 'synthese', 'message', 'proposition', 'profil', 'affirmations'
  ) then
    raise exception 'Ce contenu ne retient pas de préférence.' using errcode = 'check_violation';
  end if;
  if v_consigne = '' then
    raise exception 'Une préférence vide ne se retient pas.' using errcode = 'check_violation';
  end if;
  if char_length(v_consigne) > 400 then
    raise exception 'Une préférence tient en 400 caractères au plus : raccourcissez-la.' using errcode = 'check_violation';
  end if;

  -- Deux retouches retenues au même instant se rangent l'une après l'autre.
  perform pg_advisory_xact_lock(hashtext('klaro.preferences-ia:' || p_cabinet::text || ':' || p_cible));

  -- La même consigne, déjà active : on ne la double pas.
  select p.id into v_id
    from public.preferences_ia p
   where p.cabinet_id = p_cabinet
     and p.cible = p_cible
     and p.actif
     and lower(p.consigne) = lower(v_consigne)
   limit 1;
  if found then
    return v_id;
  end if;

  /* L'horloge, et non l'heure de la transaction : deux préférences retenues
     dans la même transaction gardent leur ordre, et c'est lui qui désigne la
     plus ancienne. */
  insert into public.preferences_ia (cabinet_id, cible, consigne, cree_par, cree_le)
  values (p_cabinet, p_cible, v_consigne, auth.uid(), clock_timestamp())
  returning id into v_id;

  -- Vingt actives au plus : au-delà, les plus anciennes se retirent.
  update public.preferences_ia q
     set actif = false
   where q.id in (
     select p.id
       from public.preferences_ia p
      where p.cabinet_id = p_cabinet
        and p.cible = p_cible
        and p.actif
      order by p.cree_le desc, p.id desc
     offset 20
   );

  -- Le fait et le type : ni la consigne, ni sur quoi elle portait.
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
  values (p_cabinet, auth.uid(), 'ia.preference_retenue', 'preferences_ia', v_id, jsonb_build_object('cible', p_cible));

  return v_id;
end;
$fn$;

revoke execute on function public.cabinet_retenir_preference(uuid, text, text) from public, anon;
grant execute on function public.cabinet_retenir_preference(uuid, text, text) to authenticated;

comment on function public.cabinet_retenir_preference(uuid, text, text) is
  'Retient une consigne de la praticienne pour un type de texte (1 à 400 caractères), sans doublon, vingt actives au plus par cabinet et par type — la plus ancienne se retire.';

create or replace function public.cabinet_oublier_preference(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cabinet uuid;
  v_cible   text;
begin
  select p.cabinet_id, p.cible into v_cabinet, v_cible from public.preferences_ia p where p.id = p_id;
  if v_cabinet is null or not public.is_cabinet_member(v_cabinet) then
    raise exception 'Cette préférence n''existe pas.' using errcode = 'P0002';
  end if;

  update public.preferences_ia set actif = false where id = p_id and actif;
  if found then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (v_cabinet, auth.uid(), 'ia.preference_oubliee', 'preferences_ia', p_id, jsonb_build_object('cible', v_cible));
  end if;
end;
$fn$;

revoke execute on function public.cabinet_oublier_preference(uuid) from public, anon;
grant execute on function public.cabinet_oublier_preference(uuid) to authenticated;

comment on function public.cabinet_oublier_preference(uuid) is
  'Retire une préférence retenue : l''IA ne la relit plus. La ligne reste, inactive.';
