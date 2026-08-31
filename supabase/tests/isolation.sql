-- ============================================================================
-- Vérification du cloisonnement. À exécuter après chaque migration.
--
-- Trois invariants :
--   1. Toute table de santé a la RLS active.
--   2. Aucune politique d'une table de santé ne mentionne l'appartenance à un
--      revendeur : le niveau revendeur n'a aucun chemin de lecture.
--   3. Aucune table de santé n'est lisible par le rôle anonyme.
-- ============================================================================

do $$
declare
  sante text[] := array[
    'patients', 'patient_modules', 'module_quiz_answers', 'audio_categories',
    'audio_library', 'patient_audios', 'scale_entries', 'journal_pages',
    'therapy_sessions', 'psych_profiles', 'affirmations', 'patient_settings',
    'custom_modules', 'push_notifications', 'push_recipients'
  ];
  t text;
  n integer;
  fuite text;
begin
  -- 1. RLS active partout.
  foreach t in array sante loop
    select count(*) into n
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = t and c.relrowsecurity;
    if n <> 1 then
      raise exception 'RLS absente sur la table de santé public.%', t;
    end if;
  end loop;

  -- 2. Aucune politique de santé ne passe par le revendeur.
  select string_agg(format('%s → %s', tablename, policyname), ', ')
    into fuite
  from pg_policies
  where schemaname = 'public'
    and tablename = any (sante)
    and (
      coalesce(qual, '') like '%reseller%'
      or coalesce(with_check, '') like '%reseller%'
    );
  if fuite is not null then
    raise exception 'Une politique de table de santé mentionne le revendeur : %', fuite;
  end if;

  -- 3. Rien pour le rôle anonyme.
  select string_agg(table_name, ', ') into fuite
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any (sante)
    and grantee = 'anon';
  if fuite is not null then
    raise exception 'Le rôle anonyme a des droits sur : %', fuite;
  end if;

  raise notice 'Cloisonnement vérifié : % tables de santé, aucun accès revendeur, aucun accès anonyme.', array_length(sante, 1);
end $$;
