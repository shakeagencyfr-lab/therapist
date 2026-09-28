-- ============================================================================
-- 0048 — La vitrine suit le contrat, dit qui la publie, et mène au rendez-vous
-- ============================================================================
--
-- Six choses, qui tiennent toutes à ce qu'un cabinet montre au public.
--
--   1. HORS CONTRAT, LA PAGE PUBLIQUE ET LE DOMAINE SE TAISENT. 0035 annonçait
--      qu'un cabinet hors contrat « perd les leviers : boutique, marque
--      blanche, site vitrine ». `cabinet_droits()` le disait à l'écran, mais
--      `site_vitrine()` et `cabinet_par_domaine()` ne lisaient que l'offre :
--      un essai expiré, une facture impayée, et la page publique continuait
--      de répondre, domaine compris — pendant que la thérapeute, elle, ne
--      pouvait plus la corriger ni la dépublier (le serveur exigeait le
--      droit). Les deux fonctions lisent désormais la même règle que tout le
--      reste, `abonnement_en_regle()`. Ce qui n'est PAS fermé : la porte des
--      patients par l'identifiant du cabinet (`cabinet_vitrine`), et leurs
--      espaces — « les leviers, pas les dossiers ». Dépublier, côté serveur,
--      ne demande plus le droit (server/sites.ts, `depublierSite`).
--
--   2. LE BOUTON « PRENDRE RENDEZ-VOUS ». Le modèle « Clinique » promet la
--      prise de rendez-vous en tête ; la page n'avait aucun lien. La fonction
--      rend désormais l'ADRESSE de l'agenda réglé dans Intégrations — jamais
--      le code d'intégration, qui n'est d'ailleurs pas conservé : le script
--      d'un agenda tiers ne s'exécute pas sur une page qui mène à l'espace
--      des patients. En https seulement.
--
--   3. LES MENTIONS LÉGALES. Le site d'une professionnelle doit dire qui le
--      publie, et sous quel numéro (SIRET, ADELI ou RPPS). Deux colonnes, que
--      la thérapeute remplit dans l'éditeur ; la fonction les rend, la page
--      les affiche avec l'adresse et l'hébergeur.
--
--   4. LES AVIS RETIRÉS NE REVIENNENT PAS. L'import de la fiche Google
--      remplaçait les avis choisis par ceux de Google : un avis retiré
--      revenait au premier réimport. La colonne retient leurs clés (auteur
--      et début du texte, rien d'autre) ; l'éditeur ne les réajoute plus.
--      Elle n'est rendue par aucune fonction publique.
--
--   5. LES COULEURS DE LA MARQUE ONT UNE FORME. `branding` s'écrit en jsonb
--      brut depuis le navigateur (thérapeute comme revendeur), et rien ne le
--      bornait : « #A17A4 » partait en base et rendait transparents les
--      boutons de l'espace, de l'application des patients et du widget. Une
--      contrainte exige #RRGGBB pour les quatre couleurs, et un nom lisible —
--      vérifiée sur les données en place avant d'être posée.
--
--   6. (Le ménage du stockage.) Retirer une photo ou remplacer un logo ne
--      faisait que les ôter de la page : le fichier restait public. Les
--      politiques de suppression existaient, mais l'API de stockage ne peut
--      supprimer qu'un fichier que l'appelant peut aussi LIRE — et aucune
--      politique de lecture ne couvrait `logos` ni `sites`. Les deux
--      compartiments restent publics en lecture par adresse ; la politique
--      ajoutée ne donne à un membre que le dossier de SON cabinet.
-- ============================================================================


-- ============================================================================
-- 1-3. Les colonnes du site
-- ============================================================================

alter table public.cabinet_sites
  add column if not exists responsable  text,
  add column if not exists numero_pro   text,
  add column if not exists avis_retires jsonb not null default '[]'::jsonb;

alter table public.cabinet_sites
  drop constraint if exists cabinet_sites_responsable_longueur,
  add constraint cabinet_sites_responsable_longueur
    check (responsable is null or char_length(responsable) <= 120),
  drop constraint if exists cabinet_sites_numero_pro_longueur,
  add constraint cabinet_sites_numero_pro_longueur
    check (numero_pro is null or char_length(numero_pro) <= 60),
  drop constraint if exists cabinet_sites_avis_retires_forme,
  add constraint cabinet_sites_avis_retires_forme
    check (jsonb_typeof(avis_retires) = 'array' and jsonb_array_length(avis_retires) <= 100);

comment on column public.cabinet_sites.responsable is
  'Mentions légales : qui publie la page (nom et prénom, ou raison sociale). Vide : le nom du cabinet.';
comment on column public.cabinet_sites.numero_pro is
  'Mentions légales : SIRET, ADELI ou RPPS, tel que la thérapeute l''a saisi.';
comment on column public.cabinet_sites.avis_retires is
  'Clés des avis Google retirés par la thérapeute : un réimport ne les ramène pas. Jamais rendu au public.';


-- ============================================================================
-- 1-3. site_vitrine : le contrat, l'agenda, les mentions
-- ============================================================================
--
-- Repris de la définition en production (0029, habillage) : mêmes clés, même
-- filtre sur l'offre. S'ajoutent le contrat, `reservation`, `responsable` et
-- `numero_pro`.

create or replace function public.site_vitrine(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'slug', c.slug,
    'name', c.name,
    'tagline', c.tagline,
    'branding', c.branding,
    'modele', s.modele,
    'theme', s.theme,
    'titre', s.titre,
    'sous_titre', s.sous_titre,
    'presentation', s.presentation,
    'adresse', s.adresse,
    'telephone', s.telephone,
    'site_web', s.site_web,
    'horaires', s.horaires,
    'photos', s.photos,
    'services', s.services,
    'avis', s.avis,
    'google_note', s.google_note,
    'google_avis', s.google_avis,
    -- L'adresse de l'agenda, jamais son code ; en https, ou rien.
    'reservation', case when cs.booking_url ~* '^https://' then cs.booking_url end,
    'responsable', s.responsable,
    'numero_pro', s.numero_pro
  )
  from public.cabinet_sites s
  join public.cabinets c on c.id = s.cabinet_id
  left join public.subscriptions ab on ab.cabinet_id = c.id
  left join public.plans pl on pl.code = ab.plan_code
  left join public.cabinet_settings cs on cs.cabinet_id = c.id
  where lower(c.slug) = lower(trim(p_slug))
    and s.publie
    and coalesce(ab.site_override, pl.site, false)
    -- Le contrat d'abord : hors contrat, aucun levier n'est ouvert (0035).
    and public.abonnement_en_regle(c.id)
  limit 1;
$$;

comment on function public.site_vitrine(text) is
  'La page publique d''un cabinet : ce que la thérapeute a publié, si l''offre comprend le site ET si le contrat court. L''adresse de l''agenda (jamais son code), les mentions légales. Ni avis retirés, ni réglage, ni clé.';


-- ============================================================================
-- 1. cabinet_par_domaine : le domaine se tait hors contrat
-- ============================================================================
--
-- Repris de la définition en production (0023). Hors contrat, le domaine du
-- cabinet ne désigne plus personne : il retombe sur la porte commune. Les
-- patients entrent toujours — c'est la session qui ouvre leur espace, pas
-- l'adresse — et `/son-identifiant/mon` garde la marque du cabinet.

create or replace function public.cabinet_par_domaine(p_domaine text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'slug', c.slug,
    'name', c.name,
    'tagline', c.tagline,
    'branding', c.branding
  )
  from public.cabinet_domains d
  join public.cabinets c on c.id = d.cabinet_id
  left join public.subscriptions ab on ab.cabinet_id = c.id
  left join public.plans pl on pl.code = ab.plan_code
  where lower(d.domaine) = lower(trim(p_domaine))
    and d.verifie
    and coalesce(ab.marque_blanche_override, pl.marque_blanche, false)
    and public.abonnement_en_regle(c.id)
  limit 1;
$$;

comment on function public.cabinet_par_domaine(text) is
  'Le cabinet qui répond à ce domaine : vérifié, marque blanche comprise dans l''offre, contrat en cours. Sinon rien.';


-- ============================================================================
-- 5. La marque a une forme
-- ============================================================================
--
-- Une couleur absente est permise (la page prend alors celle du produit) ;
-- une couleur PRÉSENTE doit être #RRGGBB. Le même format que src/lib/couleurs.ts.

alter table public.cabinets
  drop constraint if exists cabinets_branding_couleurs,
  add constraint cabinets_branding_couleurs check (
    jsonb_typeof(branding) = 'object'
    and coalesce(branding->>'accent',      '#000000') ~ '^#[0-9A-Fa-f]{6}$'
    and coalesce(branding->>'accentHover', '#000000') ~ '^#[0-9A-Fa-f]{6}$'
    and coalesce(branding->>'accentDeep',  '#000000') ~ '^#[0-9A-Fa-f]{6}$'
    and coalesce(branding->>'dark',        '#000000') ~ '^#[0-9A-Fa-f]{6}$'
  ),
  drop constraint if exists cabinets_nom_lisible,
  add constraint cabinets_nom_lisible check (char_length(btrim(name)) >= 2);


-- ============================================================================
-- 6. Le ménage du stockage : lire son propre dossier
-- ============================================================================

drop policy if exists "le cabinet lit ses photos de site" on storage.objects;
create policy "le cabinet lit ses photos de site"
  on storage.objects for select to authenticated
  using (bucket_id = 'sites' and public.is_cabinet_member(public.cabinet_of_path(name)));

drop policy if exists "le cabinet lit ses logos" on storage.objects;
create policy "le cabinet lit ses logos"
  on storage.objects for select to authenticated
  using (bucket_id = 'logos' and public.is_cabinet_member(public.cabinet_of_path(name)));
