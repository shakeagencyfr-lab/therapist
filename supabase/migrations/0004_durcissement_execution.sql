-- ============================================================================
-- 0004 — Durcissement : qui a le droit d'appeler quoi.
--
-- Supabase expose toute fonction du schéma public en RPC, et EXECUTE est
-- accordé à PUBLIC par défaut — donc au rôle anonyme. Pour des fonctions
-- SECURITY DEFINER, cela mérite d'être explicite plutôt que subi.
-- (Signalé par le linter Supabase : 0028 et 0029.)
-- ============================================================================

-- Fonction de déclencheur : elle n'a rien à faire dans l'API.
revoke execute on function public.forbid_cabinet_transfer() from public, anon, authenticated;

-- Fonctions d'appartenance : nécessaires au rôle authentifié, puisque les
-- politiques RLS les appellent. Inutiles au rôle anonyme, qui n'a de droit sur
-- aucune table.
revoke execute on function public.is_cabinet_member(uuid)      from public, anon;
revoke execute on function public.is_reseller_member(uuid)     from public, anon;
revoke execute on function public.is_reseller_of_cabinet(uuid) from public, anon;
revoke execute on function public.is_patient_record(uuid)      from public, anon;
revoke execute on function public.my_cabinet_ids()             from public, anon;
revoke execute on function public.my_reseller_ids()            from public, anon;

grant execute on function public.is_cabinet_member(uuid)      to authenticated;
grant execute on function public.is_reseller_member(uuid)     to authenticated;
grant execute on function public.is_reseller_of_cabinet(uuid) to authenticated;
grant execute on function public.is_patient_record(uuid)      to authenticated;
grant execute on function public.my_cabinet_ids()             to authenticated;
grant execute on function public.my_reseller_ids()            to authenticated;

-- Et pour la suite : toute nouvelle fonction du schéma public n'est plus
-- exécutable par défaut par le rôle anonyme.
alter default privileges in schema public revoke execute on functions from anon;
