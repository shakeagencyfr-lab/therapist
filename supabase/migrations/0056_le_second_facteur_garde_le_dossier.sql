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
-- (jeton « aal2 »). Un compte sans facteur ne voit rien changer. Un facteur
-- « unverified » ne compte pas : c'est une inscription abandonnée avant le
-- premier code, qui n'a jamais protégé quoi que ce soit. Un jeton sans
-- `aal` vaut « aal1 » (documentation de Supabase Auth).
--
-- POURQUOI DANS is_cabinet_member() PLUTÔT QU'EN POLITIQUES RESTRICTIVES.
-- La documentation de Supabase propose une politique `as restrictive` par
-- table. Ici, elle laisserait trois trous et en ouvrirait un quatrième :
--
--   - les fonctions `security definer` du cabinet ne passent pas par la RLS.
--     `cabinet_changer_adresse()` resterait ouverte en « aal1 » : changer
--     l'adresse d'un patient pour la sienne, puis entrer dans SON espace —
--     journal compris. De même `equipe_du_cabinet()` (les adresses de
--     l'équipe), `cabinet_repondre_a_la_page()` (écrire à un patient au nom
--     de la praticienne), `cabinet_appareils()`, les notes d'honoraires… ;
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
-- `est_titulaire_du_cabinet()`. Les deux reçoivent la condition : deux
-- définitions couvrent tout, et le côté patient (`is_patient_record()`, la
-- politique « le patient lit sa fiche ») reste tel quel.
--
-- CE QUE CELA COÛTE, MESURÉ (production, bloc annulé, 20 000 lignes d'un
-- même cabinet comptées d'un coup sous la RLS) : 0,77 s avant ; 1,33 s en
-- « aal1 » sans facteur ; 1,13 s en « aal2 ». Soit 25 µs environ par ligne
-- examinée — une requête de l'application, bornée à 1 000 lignes, paie au
-- pire une vingtaine de millisecondes. La condition est ÉCRITE dans le
-- corps : l'appel d'une fonction `security definer` imbriquée, essayé
-- d'abord, coûtait huit fois plus (5,7 s), et une version PL/pgSQL, 1,6 s.
-- Le niveau du jeton est lu avant la recherche de facteur : en « aal2 »,
-- elle n'a pas lieu.
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
-- réécrit — pour fermer un cabinet, par exemple — doit repartir de CETTE
-- définition et garder sa seconde condition.
-- supabase/tests/double_authentification.sql échoue sinon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Membre du cabinet — en « aal2 » quand le compte a un facteur
-- ----------------------------------------------------------------------------
--
-- Définition de production (0001, relue par pg_get_functiondef) ; la seconde
-- condition est nouvelle. L'appartenance est cherchée d'abord : pour les
-- lignes d'un autre cabinet, la recherche de facteur n'a pas lieu.
--
-- `security definer` couvre aussi auth.mfa_factors, que le rôle authentifié
-- ne lit pas et n'a pas à lire : la fonction ne rend qu'un booléen.
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
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
       where f.user_id = auth.uid() and f.status = 'verified'
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Titulaire du cabinet — l'équipe, gardée de même
-- ----------------------------------------------------------------------------
--
-- Inviter, relancer, annuler une invitation, retirer une consœur
-- (`retirer_du_cabinet()`) : tout passe par elle (0042). Sans la condition,
-- une session « aal1 » pouvait s'adjoindre une complice, qui aurait ensuite
-- lu les dossiers avec son propre compte. Même condition, même ordre.
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
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
       where f.user_id = auth.uid() and f.status = 'verified'
    )
  );
$$;
