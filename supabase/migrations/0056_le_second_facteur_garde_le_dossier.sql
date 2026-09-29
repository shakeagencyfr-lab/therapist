-- ============================================================================
-- 0056 — Le second facteur garde le dossier
-- ============================================================================
--
-- La praticienne et le revendeur peuvent désormais activer une double
-- authentification (application d'authentification, code à six chiffres :
-- l'API MFA de Supabase Auth, TOTP). L'écran demande le code à la connexion
-- (src/auth/DeuxiemeFacteur.tsx) ; le serveur l'exige pour les gestes
-- sensibles (server/auth.ts, exigerDeuxiemeFacteur). Reste la base : un
-- écran se contourne, et quiconque a le mot de passe — ou la boîte aux
-- lettres — obtient une session « aal1 » qui parle directement à l'API.
-- Il faut que CETTE session-là ne lise aucun dossier.
--
-- LA RÈGLE. Un compte qui a inscrit et vérifié un facteur n'est membre de son
-- cabinet, aux yeux de la base, que dans une session qui a donné son code
-- (jeton « aal2 »). Un compte sans facteur ne voit rien changer.
--
-- POURQUOI DANS is_cabinet_member() PLUTÔT QU'EN POLITIQUES RESTRICTIVES.
-- La documentation de Supabase propose une politique `as restrictive` par
-- table. Ici, elle laisserait trois trous et en ouvrirait un quatrième :
--
--   - les fonctions `security definer` du cabinet ne passent pas par la RLS.
--     `cabinet_changer_adresse()` (détacher le compte d'un patient),
--     `equipe_du_cabinet()` (les adresses de l'équipe),
--     `cabinet_repondre_a_la_page()`, `cabinet_emettre_note_honoraires()`,
--     `cabinet_appareils()`… s'ouvriraient encore à une session « aal1 » ;
--   - les compartiments de stockage (audios, logos, photos du site) ont leurs
--     propres politiques ;
--   - chaque table de santé ajoutée plus tard devrait penser à la sienne ;
--   - et une politique restrictive vaut pour TOUTES les lectures de la
--     table, celles du patient comprises : une praticienne qui essaie
--     l'espace patient avec sa propre adresse se verrait fermer sa propre
--     fiche, dans un espace qui ne sait pas demander de code.
--
-- Toutes les politiques et fonctions du CÔTÉ CABINET, stockage compris,
-- passent par `is_cabinet_member()` — ou, pour l'équipe, par
-- `est_titulaire_du_cabinet()`. Les deux reçoivent la condition : une seule
-- définition couvre tout, et le côté patient (`is_patient_record()`, la
-- politique « le patient lit sa fiche ») reste tel quel.
--
-- CE QUI RESTE HORS DE PORTÉE, VOLONTAIREMENT.
--   - `my_context()` et `claim_access()` répondent en « aal1 » : c'est ce qui
--     permet à l'écran de savoir qu'un code est à demander. Ils ne rendent ni
--     dossier ni patient.
--   - Le côté revendeur (`is_reseller_member()`…) ne touche aucune donnée de
--     santé (README, « Les trois niveaux ») ; il est gardé par l'écran et par
--     le serveur, pas ici.
--
-- À QUI REDÉFINIT CES FONCTIONS PLUS TARD. `is_cabinet_member()` et
-- `est_titulaire_du_cabinet()` sont centrales ; une migration qui les
-- réécrit doit garder l'appel à `second_facteur_satisfait()`.
-- supabase/tests/double_authentification.sql échoue sinon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Le jeton a-t-il le niveau que le compte demande ?
-- ----------------------------------------------------------------------------
--
-- `security definer` : le rôle authentifié ne lit pas auth.mfa_factors, et
-- n'a pas à le lire. La fonction ne rend qu'un booléen sur l'appelant
-- lui-même — jamais le facteur, jamais le secret.
--
-- Un jeton sans `aal` vaut « aal1 » (documentation de Supabase Auth). Un
-- facteur « unverified » ne compte pas : c'est une inscription abandonnée
-- avant le premier code, qui n'a jamais protégé quoi que ce soit.
--
-- Le niveau est lu d'abord : en « aal2 », aucune recherche de facteur.
create or replace function public.second_facteur_satisfait()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1
          from auth.mfa_factors f
         where f.user_id = auth.uid()
           and f.status = 'verified'
      );
$$;

comment on function public.second_facteur_satisfait() is
  'Vrai si le jeton est aal2, ou si le compte n''a aucun facteur vérifié. Appelée par is_cabinet_member() et est_titulaire_du_cabinet() (0056).';

-- Rien pour anon ; le rôle authentifié peut s'interroger sur lui-même —
-- une politique qui l'appellerait directement en aura besoin.
revoke all on function public.second_facteur_satisfait() from public, anon;
grant execute on function public.second_facteur_satisfait() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Membre du cabinet — en « aal2 » quand le compte a un facteur
-- ----------------------------------------------------------------------------
--
-- Définition de production (0001, relue par pg_get_functiondef) ; seule la
-- dernière ligne est nouvelle. L'appartenance est cherchée d'abord : pour
-- les lignes d'un autre cabinet, la seconde condition n'est pas évaluée.
create or replace function public.is_cabinet_member(p_cabinet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cabinet_members m
    where m.cabinet_id = p_cabinet and m.user_id = auth.uid()
  )
  and public.second_facteur_satisfait();
$$;

-- ----------------------------------------------------------------------------
-- 3. Titulaire du cabinet — l'équipe, gardée de même
-- ----------------------------------------------------------------------------
--
-- Inviter, relancer, annuler une invitation, retirer une consœur
-- (`retirer_du_cabinet()`) : tout passe par elle (0042). Sans la condition,
-- une session « aal1 » pouvait s'adjoindre une complice, qui aurait ensuite
-- lu les dossiers avec son propre compte.
create or replace function public.est_titulaire_du_cabinet(p_cabinet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cabinet_members m
     where m.cabinet_id = p_cabinet
       and m.user_id = auth.uid()
       and m.role = 'owner'
  )
  and public.second_facteur_satisfait();
$$;
