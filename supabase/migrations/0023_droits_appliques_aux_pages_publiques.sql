-- ============================================================================
-- Fermer un levier ferme aussi ce qui est déjà en ligne
--
-- Le site vitrine et le domaine personnalisé sont servis à des visiteurs non
-- connectés, par deux fonctions ouvertes à `anon`. Elles ne regardaient que
-- l'intention de la thérapeute — « publié », « vérifié » — jamais l'offre.
--
-- Conséquence : un revendeur qui ferme le levier « site » voyait la page
-- rester en ligne, et le levier « marque blanche » retiré laissait le domaine
-- continuer de répondre. L'écran du cabinet, lui, annonçait la fonction comme
-- fermée. C'est le genre d'écart qui se découvre le jour d'un impayé.
--
-- Les deux fonctions lisent maintenant le droit effectif — l'offre corrigée
-- de l'exception négociée — comme partout ailleurs.
-- ============================================================================

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
  limit 1;
$$;

revoke execute on function public.cabinet_par_domaine(text) from public;
grant execute on function public.cabinet_par_domaine(text) to anon, authenticated;
