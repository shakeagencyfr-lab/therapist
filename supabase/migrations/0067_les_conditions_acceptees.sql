-- ============================================================================
-- 0067 — Les conditions acceptées, et la preuve de l'accord
-- ============================================================================
--
-- Des conditions générales n'engagent que celui qui les a acceptées, et
-- l'acceptation se prouve (code civil, art. 1119 et 1127-1) : un lien en pied
-- de page ne suffit pas. Deux moments, deux traces.
--
-- À L'ENTRÉE DANS L'ESPACE. Chaque compte de cabinet ou de revendeur accepte
-- les conditions générales de vente ET d'utilisation, version par version,
-- en cochant une case (src/auth/GardeConditions.tsx). La version est la date
-- de mise à jour des documents (src/legal/version.ts). La trace va dans
-- `conditions_acceptees` : qui, quel document, quelle version, quand.
--
-- À LA DEMANDE D'ESSAI. Le formulaire de la page d'accueil porte la même
-- case, distincte de celle du recontact. La demande garde la version
-- acceptée (`demandes_essai.conditions_version`) ; une demande sans elle est
-- refusée par la base.
--
-- PERSONNE N'ÉCRIT LA TABLE DIRECTEMENT. Un compte lit ses propres lignes, et
-- n'en écrit que par `accepter_conditions()`, qui pose les deux documents
-- d'un coup pour `auth.uid()` — jamais pour un autre — et refuse une version
-- qui n'a pas la forme d'une date. Rien pour `anon`. Une acceptation ne se
-- modifie ni ne s'efface depuis le navigateur : c'est une preuve.
--
-- LA DEMANDE D'ESSAI A DEUX PORTES LE TEMPS D'UN DÉPLOIEMENT. La forme à
-- neuf arguments de `deposer_demande_essai` (0060) est celle qu'appelle le
-- serveur aujourd'hui en production ; la réécrire pour exiger la version
-- aurait refusé toutes les demandes d'essai jusqu'au déploiement du nouveau
-- serveur. Elle reste donc telle quelle, réservée à `service_role` comme
-- avant, et la forme à dix arguments — celle du nouveau serveur — exige la
-- version. Une fois ce serveur en ligne, une migration suivante retirera
-- l'ancienne forme (revoke execute from service_role, puis drop).
--
-- Tout est additif : une table, une colonne qui peut rester vide, deux
-- fonctions. Aucune ligne existante n'est touchée.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Les acceptations
-- ----------------------------------------------------------------------------

create table if not exists public.conditions_acceptees (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  document    text not null check (document in ('cgv', 'cgu')),
  version     text not null check (char_length(version) between 1 and 40),
  accepte_le  timestamptz not null default now(),
  constraint conditions_acceptees_une_fois unique (user_id, document, version)
);

comment on table public.conditions_acceptees is
  'Acceptation des conditions générales de vente (cgv) et d''utilisation (cgu), par compte et par version (0067). Écrite par accepter_conditions() seulement ; chaque compte lit les siennes.';

-- La clé étrangère est couverte par l'index de la contrainte d'unicité, qui
-- commence par user_id (tests/politiques_et_index.sql).

alter table public.conditions_acceptees enable row level security;

revoke all on table public.conditions_acceptees from public, anon, authenticated;
grant select on table public.conditions_acceptees to authenticated;

drop policy if exists "chacun lit ses acceptations" on public.conditions_acceptees;
create policy "chacun lit ses acceptations" on public.conditions_acceptees
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 2. Accepter
-- ----------------------------------------------------------------------------
--
-- Les deux documents d'un coup, pour l'appelant. Accepter deux fois la même
-- version ne fait rien de plus : la première date reste. La forme de la
-- version est celle de src/legal/version.ts (FORME_DE_VERSION) ; au-delà de
-- deux cents lignes, un compte n'accepte plus rien — dix ans de révisions
-- mensuelles n'y arriveraient pas, un robot qui inventerait des dates si.
create or replace function public.accepter_conditions(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_version text := btrim(coalesce(p_version, ''));
  v_n       int;
begin
  if v_user is null then
    raise exception 'Connectez-vous pour accepter les conditions.' using errcode = '42501';
  end if;
  if char_length(v_version) not between 1 and 40
     or v_version !~ '^(1er|[1-9]|[12][0-9]|3[01]) (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) 20[0-9]{2}$' then
    raise exception 'Cette version des conditions n''existe pas.' using errcode = '22023';
  end if;

  select count(*) into v_n from public.conditions_acceptees where user_id = v_user;
  if v_n >= 200 then
    raise exception 'Trop d''acceptations enregistrées pour ce compte.' using errcode = '54000';
  end if;

  insert into public.conditions_acceptees (user_id, document, version)
  values (v_user, 'cgv', v_version), (v_user, 'cgu', v_version)
  on conflict on constraint conditions_acceptees_une_fois do nothing;
end;
$$;

comment on function public.accepter_conditions(text) is
  'Enregistre l''acceptation des CGV et des CGU, dans la version donnée, pour le compte appelant (0067).';

revoke execute on function public.accepter_conditions(text) from public, anon;
grant execute on function public.accepter_conditions(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. La demande d'essai garde la version acceptée
-- ----------------------------------------------------------------------------

alter table public.demandes_essai
  add column if not exists conditions_version text;

alter table public.demandes_essai
  drop constraint if exists demandes_essai_conditions_version;
alter table public.demandes_essai
  add constraint demandes_essai_conditions_version
  check (conditions_version is null or char_length(conditions_version) between 1 and 40);

comment on column public.demandes_essai.conditions_version is
  'Version des conditions générales de vente et d''utilisation acceptée dans le formulaire (0067). Vide pour les demandes antérieures.';

-- La forme à dix arguments : celle de la forme à neuf (0060, relue en
-- production par pg_get_functiondef), plus la version acceptée — exigée, et
-- gardée avec la demande. Pas de valeur par défaut au dixième argument : les
-- deux formes ne se confondent jamais, ni pour la base, ni pour l'API.
create or replace function public.deposer_demande_essai(
  p_nom text,
  p_email text,
  p_telephone text,
  p_cabinet text,
  p_ville text,
  p_patients text,
  p_offre text,
  p_message text,
  p_consentement boolean,
  p_conditions_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom      text := btrim(coalesce(p_nom, ''));
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_tel      text := nullif(btrim(coalesce(p_telephone, '')), '');
  v_cabinet  text := btrim(coalesce(p_cabinet, ''));
  v_ville    text := btrim(coalesce(p_ville, ''));
  v_patients text := btrim(coalesce(p_patients, ''));
  v_offre    text := btrim(coalesce(p_offre, ''));
  v_message  text := nullif(btrim(coalesce(p_message, '')), '');
  v_version  text := btrim(coalesce(p_conditions_version, ''));
  v_revendeur uuid;
  v_n int;
begin
  if p_consentement is not true then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'consentement');
  end if;
  -- Les conditions générales acceptées : sans version, pas de demande. Même
  -- forme que pour accepter_conditions() — une date en toutes lettres.
  if char_length(v_version) not between 1 and 40
     or v_version !~ '^(1er|[1-9]|[12][0-9]|3[01]) (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) 20[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'conditions');
  end if;
  if char_length(v_nom) not between 2 and 120 or v_nom ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'nom');
  end if;
  if char_length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'email');
  end if;
  if v_tel is not null
     and (v_tel !~ '^[0-9 +().-]{6,30}$' or char_length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 6) then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'telephone');
  end if;
  if char_length(v_cabinet) not between 2 and 120 or v_cabinet ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'cabinet');
  end if;
  if char_length(v_ville) not between 2 and 80 or v_ville ~ '[[:cntrl:]]' then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'ville');
  end if;
  if v_patients not in ('moins-10', '10-25', '26-80', 'plus-80') then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'patients');
  end if;
  if v_offre not in ('essentiel', 'cabinet', 'reseau', 'a-voir') then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'offre');
  end if;
  if v_message is not null and char_length(v_message) > 2000 then
    return jsonb_build_object('ok', false, 'motif', 'champ', 'champ', 'message');
  end if;

  select id into v_revendeur from public.resellers where accueille_demandes limit 1;
  if v_revendeur is null then
    return jsonb_build_object('ok', false, 'motif', 'fermee');
  end if;

  -- Un dépôt à la fois : les deux comptes ci-dessous ne se croisent pas.
  perform pg_advisory_xact_lock(hashtext('klaro.demandes_essai'));

  select count(*) into v_n
    from public.demandes_essai
   where email = v_email and created_at > now() - interval '24 hours';
  if v_n >= 3 then
    return jsonb_build_object('ok', false, 'motif', 'adresse');
  end if;

  select count(*) into v_n
    from public.demandes_essai
   where created_at > now() - interval '1 hour';
  if v_n >= 30 then
    return jsonb_build_object('ok', false, 'motif', 'heure');
  end if;

  insert into public.demandes_essai
    (reseller_id, nom, email, telephone, cabinet, ville, patients, offre, message, consentement_le, conditions_version)
  values
    (v_revendeur, v_nom, v_email, v_tel, v_cabinet, v_ville, v_patients, v_offre, v_message, now(), v_version);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean, text) is
  'Dépose une demande d''essai de la page d''accueil avec la version des conditions acceptée (0067). Mêmes bornes que la forme à neuf arguments (0060). Réservée au serveur (service_role), qui vérifie le CAPTCHA avant.';

revoke execute on function public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean, text)
  to service_role;
