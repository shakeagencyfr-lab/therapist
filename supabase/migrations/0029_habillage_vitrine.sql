-- L'habillage de la vitrine : polices, fond, matière des cartes, angles.
--
-- CE QUI N'EST PAS ICI : LES COULEURS. Elles vivent dans `cabinets.branding`,
-- qui habille déjà l'application des patients. Les redoubler ici garantirait
-- qu'un jour la page publique et l'espace vers lequel elle mène ne se
-- ressemblent plus.
--
-- UNE SEULE COLONNE JSONB, PAS SIX COLONNES. Ces réglages n'ont aucun sens
-- séparément : on ne cherche jamais « les cabinets aux angles vifs », on lit
-- toujours le thème entier pour rendre la page. Six colonnes coûteraient six
-- migrations à la première option ajoutée.
--
-- RIEN N'EST VALIDÉ ICI, ET C'EST DÉLIBÉRÉ. La contrainte utile n'est pas
-- « le JSON a telle forme » mais « la valeur est un code connu » — et cette
-- liste évolue à chaque police ajoutée. Elle est donc tenue dans le code, en
-- liste blanche (resoudreTheme, src/lib/themeVitrine.ts), appliquée aussi
-- bien à l'écriture qu'à la lecture. Un thème illisible rend le thème
-- d'origine ; il ne casse jamais une page publique.

alter table public.cabinet_sites
  add column if not exists theme jsonb not null default '{}'::jsonb;

comment on column public.cabinet_sites.theme is
  'Habillage de la vitrine (polices, fond, cartes, angles). Les codes sont validés en liste blanche côté application — voir resoudreTheme dans src/lib/themeVitrine.ts. Les couleurs, elles, viennent de cabinets.branding.';

-- La page publique doit rendre le thème : sans cela il est réglable et
-- invisible.
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
    'google_avis', s.google_avis
  )
  from public.cabinet_sites s
  join public.cabinets c on c.id = s.cabinet_id
  left join public.subscriptions ab on ab.cabinet_id = c.id
  left join public.plans pl on pl.code = ab.plan_code
  where lower(c.slug) = lower(trim(p_slug))
    and s.publie
    and coalesce(ab.site_override, pl.site, false)
  limit 1;
$$;

revoke execute on function public.site_vitrine(text) from public;
grant execute on function public.site_vitrine(text) to anon, authenticated;
