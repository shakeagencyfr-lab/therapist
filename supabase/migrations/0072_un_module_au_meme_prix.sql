-- ============================================================================
-- 0072 — Un module au même prix partout
-- ============================================================================
--
-- La séance coûtait 12 jetons et COMPRENAIT les consignes de ses modules
-- (jusqu'à huit) ; un module écrit dans l'atelier en coûtait 5. Quatre
-- modules nés d'une séance ne coûtaient donc rien, un seul écrit à part en
-- coûtait cinq : incohérent (décision du 2 octobre 2026).
--
-- Désormais :
--   séance    6  la note de séance (et l'actualisation du profil qui la suit,
--                toujours comprise une fois — règle « seance » de 0068) ;
--   module    3  chaque module, en séance comme dans l'atelier ;
--   retouche  2  moins qu'un module : reprendre ne coûte pas plus qu'écrire.
-- Une séance avec quatre modules retenus : 6 + 4 × 3 = 18 jetons.
--
-- Le serveur ne rattache plus les modules au forfait de la séance
-- (server/jetons.ts, `coutDeLAppel`) : la règle « seance » de
-- `jetons_prix_du_forfait` ne sert plus qu'au profil. Elle n'est pas
-- retouchée ici — rien ne l'appelle plus pour un module.
--
-- ADDITIF. Les valeurs par défaut changent pour les revendeurs à venir ; un
-- revendeur existant n'est aligné QUE s'il gardait les anciennes valeurs par
-- défaut — un prix qu'il a choisi lui-même n'est jamais écrasé.
-- ============================================================================

alter table public.reseller_jetons
  alter column bareme_seance set default 6,
  alter column bareme_module set default 3,
  alter column bareme_retouche set default 2;

update public.reseller_jetons set bareme_seance = 6, updated_at = now() where bareme_seance = 12;
update public.reseller_jetons set bareme_module = 3, updated_at = now() where bareme_module = 5;
update public.reseller_jetons set bareme_retouche = 2, updated_at = now() where bareme_retouche = 3;
