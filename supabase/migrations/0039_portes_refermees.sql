-- Trois fonctions internes qui répondaient à l'API publique.
--
-- PostgreSQL accorde EXECUTE à `public` par défaut sur toute fonction créée :
-- exposée par PostgREST, elle devient une adresse que n'importe qui peut
-- appeler. Ce n'est pas grave pour les fonctions FAITES pour ça —
-- `cabinet_vitrine`, `site_vitrine`, qui servent la page publique et ne
-- rendent que ce qu'elle affiche — mais les trois ci-dessous n'ont aucune
-- raison de figurer dans l'API.
--
--   `abonnement_en_regle` : elle dit si un cabinet paie. Appelée depuis les
--     politiques et le déclencheur, elle tourne sous le propriétaire de la
--     fonction et n'a besoin d'aucun droit du côté de l'appelant ; le serveur,
--     lui, la lit avec la clé de service. Sans ce verrou, un visiteur
--     anonyme muni d'un identifiant de cabinet pouvait sonder l'état de son
--     contrat, un booléen à la fois.
--
--   `ranger_selon_la_fiche` et `ranger_le_quiz` : des fonctions de
--     déclencheur, sans contexte de déclencheur hors de leur table. L'appel
--     échouerait — mais une adresse qui échoue reste une adresse, et une
--     fonction SECURITY DEFINER n'a rien à faire à portée de tout le monde.

revoke execute on function public.abonnement_en_regle(uuid) from public, anon, authenticated;
grant execute on function public.abonnement_en_regle(uuid) to service_role;

revoke execute on function public.ranger_selon_la_fiche() from public, anon, authenticated;
revoke execute on function public.ranger_le_quiz() from public, anon, authenticated;
