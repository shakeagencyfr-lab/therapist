-- ============================================================================
-- 0069 — L'ancienne porte des demandes d'essai se referme
-- ============================================================================
--
-- 0067 a ajouté une version de `deposer_demande_essai` qui exige la version
-- des conditions acceptées (dixième argument). L'ancienne, à neuf arguments,
-- était gardée le temps que le serveur en production passe à la nouvelle :
-- c'est fait (server/demandes.ts envoie `p_conditions_version`). Laissée en
-- place, elle permettrait de déposer une demande sans accord aux conditions.

revoke execute on function public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean)
  from public, anon, authenticated, service_role;
drop function if exists public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean);
