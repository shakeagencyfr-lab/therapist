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
  /* La liste ne se tient plus à la main : elle se déduit.
     Toute table portant une colonne `patient_id` est une table de santé, par
     construction — c'est ainsi que les tables d'hypnose et les commandes ont
     échappé à cette épreuve pendant deux migrations. Restent les quelques
     tables qui portent du contenu de soin sans désigner de patiente : elles
     sont nommées ici, et elles seules. */
  sante text[];
  sans_patient text[] := array[
    'patients', 'module_quiz_answers', 'audio_categories', 'audio_library',
    'custom_modules', 'push_notifications', 'hypnose_mouvements'
  ];
  t text;
  n integer;
  fuite text;
begin
  select array_agg(distinct c.relname::text order by c.relname::text)
    into sante
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where ns.nspname = 'public' and c.relkind = 'r' and a.attname = 'patient_id';

  sante := sante || sans_patient;

  -- Une table nommée à la main qui n'existe plus est un oubli, pas un succès.
  foreach t in array sans_patient loop
    if to_regclass('public.' || quote_ident(t)) is null then
      raise exception 'La table de santé public.% est nommée dans l''épreuve mais n''existe pas', t;
    end if;
  end loop;

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

  raise exception 'REUSSITE : % tables de santé, RLS partout, aucun chemin revendeur, aucun droit anonyme.', array_length(sante, 1);
end $$;
