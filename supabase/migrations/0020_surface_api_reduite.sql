-- ============================================================================
-- Réduire la surface exposée par l'API
--
-- Deux choses que l'audit de la base signale, et qui sont justes.
--
-- 1. `verifier_plafond_patientes()` est une fonction de DÉCLENCHEUR. Elle
--    était pourtant appelable en RPC par n'importe qui, connecté ou non.
--    L'appeler hors déclencheur ne fait rien d'utile — Postgres refuse — mais
--    une fonction de plomberie n'a rien à faire dans une API publique : c'est
--    du gréement laissé sur le pont.
--
-- 2. Les trois fonctions de la revente de crédits ne sont plus appelées par
--    aucun code depuis que le modèle est revenu à l'abonnement seul, chaque
--    cabinet branchant sa propre clé. Leur schéma reste en place — le mode
--    crédits peut revenir — mais il n'y a aucune raison de continuer à les
--    servir. LE JOUR OÙ CE MODE REVIENT, il faudra rendre le droit
--    d'exécution ici même : c'est la seule chose à défaire.
-- ============================================================================

revoke execute on function public.verifier_plafond_patientes() from public, anon, authenticated;

comment on function public.verifier_plafond_patientes() is
  'Déclencheur du plafond de fiches actives. Jamais appelée directement : aucun droit d''exécution n''est accordé.';

do $$
begin
  if to_regprocedure('public.cabinet_credit_balance(uuid)') is not null then
    revoke execute on function public.cabinet_credit_balance(uuid) from public, anon, authenticated;
    comment on function public.cabinet_credit_balance(uuid) is
      'Dormant : la revente de crédits n''est plus servie. Rendre le droit d''exécution le jour où elle revient.';
  end if;
  if to_regprocedure('public.cabinet_ai_billing()') is not null then
    revoke execute on function public.cabinet_ai_billing() from public, anon, authenticated;
    comment on function public.cabinet_ai_billing() is
      'Dormant : la revente de crédits n''est plus servie. Rendre le droit d''exécution le jour où elle revient.';
  end if;
  if to_regprocedure('public.cabinet_ai_spend_this_month(uuid)') is not null then
    revoke execute on function public.cabinet_ai_spend_this_month(uuid) from public, anon, authenticated;
    comment on function public.cabinet_ai_spend_this_month(uuid) is
      'Dormant : la consommation n''est plus facturée par le revendeur. Rendre le droit d''exécution si elle le redevient.';
  end if;
end $$;
