-- ============================================================================
-- 0014 — La vitrine d'un cabinet, lisible avant toute connexion.
--
-- Une thérapeute donne à ses patients l'adresse klaroweb.site/c/son-slug.
-- La page doit s'ouvrir à SES couleurs et à SON nom, avant de savoir qui
-- arrive — sinon l'adresse ne sert à rien.
--
-- Or personne n'est connecté à ce moment-là : aucune politique de `cabinets`
-- ne rend la ligne. D'où cette fonction, et rien de plus qu'elle : le nom,
-- le sur-titre et les couleurs. Ce sont les trois choses qu'un cabinet
-- affiche déjà sur sa devanture. Ni identifiant, ni revendeur, ni réglage,
-- ni le moindre compteur.
--
-- Elle est ouverte au rôle anonyme parce que c'est le rôle d'un visiteur non
-- connecté. Elle permet de savoir qu'un slug existe : c'est le propre d'une
-- adresse publique qu'on imprime sur une carte de visite.
-- ============================================================================

create or replace function public.cabinet_vitrine(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'name', c.name,
    'tagline', c.tagline,
    'branding', c.branding
  )
  from public.cabinets c
  where lower(c.slug) = lower(trim(p_slug))
  limit 1;
$$;

revoke execute on function public.cabinet_vitrine(text) from public;
grant execute on function public.cabinet_vitrine(text) to anon, authenticated;
