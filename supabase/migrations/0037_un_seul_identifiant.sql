-- Une seule règle pour l'identifiant d'un cabinet, et un refus qui se lit.
--
-- DEUX CONTRAINTES COEXISTAIENT. `cabinets_slug_format`, héritée de 0001,
-- exigeait de trois à cinquante caractères. `cabinets_slug_forme`, posée par
-- 0028 quand l'adresse est remontée à la racine du domaine, en accepte un à
-- soixante-trois et écarte une centaine de mots réservés. Un identifiant de
-- deux lettres passait donc la seconde et butait sur la première ; les deux
-- rendaient le même code 23514, et l'écran du revendeur affichait « La marque
-- n'a pas pu être publiée. Réessayez. » — la même phrase à chaque essai, sans
-- jamais nommer la cause. On réessayait en boucle.
--
-- On garde UNE règle : celle de 0028, à laquelle on rend le plancher de trois
-- caractères de l'ancienne. Trois, parce qu'un identifiant d'une lettre à la
-- racine du domaine est une collision qui attend une future page du produit,
-- et que la liste des mots réservés ne protège que ce qui existe déjà.

alter table public.cabinets drop constraint if exists cabinets_slug_format;

alter table public.cabinets drop constraint if exists cabinets_slug_forme;
alter table public.cabinets add constraint cabinets_slug_forme check (
  slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
  and slug <> all (array[
    'mon','api','c','e','assets','auth','admin','static','public','index','patient','embed',
    'favicon','robots','sitemap','manifest','accueil','home','a-propos','apropos','about','aide',
    'help','faq','support','contact','tarifs','prix','pricing','blog','actualites','presse',
    'equipe','partenaires','demo','essai','docs','doc','guide','nouveautes','statut','status',
    'cgv','cgu','legal','mentions','confidentialite','cookies','rgpd','klaro','cabinet','cabinets',
    'therapeute','therapeutes','patients','revendeur','revendeurs','compte','connexion','login',
    'logout','deconnexion','inscription','signup','app','espace','boutique','www','cdn','media',
    'img','images','files','fichiers','css','js','fonts','webhook','webhooks','health','stripe',
    'supabase','well-known'
  ])
);

comment on constraint cabinets_slug_forme on public.cabinets is
  'Trois caractères au moins, sans tiret aux extrémités, et pas un mot que la plateforme sert déjà. Seule règle : l''ancienne cabinets_slug_format la contredisait sur la longueur.';
