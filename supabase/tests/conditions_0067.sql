-- 0067 éprouvée contre la vraie base : l'acceptation des conditions générales
-- de vente et d'utilisation, et la version gardée avec la demande d'essai.
--
--   compte connecté → accepte les deux documents d'un coup, pour lui seul ;
--                     deux fois la même version ne fait rien de plus ;
--                     une version sans forme de date est refusée ;
--                     au-delà de deux cents lignes, plus rien ne s'écrit
--   lecture         → chacun ne lit que ses acceptations
--   écriture        → personne n'écrit, ne modifie ni n'efface la table
--                     depuis le navigateur ; l'anonyme n'accepte rien
--   demande d'essai → la forme à dix arguments exige la version et la garde ;
--                     réservée au serveur, comme celle à neuf, qui reste
--   compte supprimé → ses acceptations partent avec lui
--
-- Un bloc, ANNULÉ par l'exception finale : rien ne subsiste.
do $$
declare
  v_suf text := substr(md5(random()::text), 1, 8);
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
  v_version constant text := '30 septembre 2026';
  v_sig9  constant text := 'public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean)';
  v_sig10 constant text := 'public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean, text)';
  v_n int; v_r jsonb; v_mauvaise text;
begin
  -- ══ 0. Les droits, tels qu'ils sont posés ═══════════════════════════════
  if has_function_privilege('anon', 'public.accepter_conditions(text)', 'execute') then
    raise exception 'ECHEC 0a : l''anonyme peut accepter des conditions';
  end if;
  if not has_function_privilege('authenticated', 'public.accepter_conditions(text)', 'execute') then
    raise exception 'ECHEC 0b : un compte connecté ne peut pas accepter les conditions';
  end if;
  if has_table_privilege('anon', 'public.conditions_acceptees', 'select')
     or has_table_privilege('anon', 'public.conditions_acceptees', 'insert') then
    raise exception 'ECHEC 0c : l''anonyme a un droit sur les acceptations';
  end if;
  if has_table_privilege('authenticated', 'public.conditions_acceptees', 'insert')
     or has_table_privilege('authenticated', 'public.conditions_acceptees', 'update')
     or has_table_privilege('authenticated', 'public.conditions_acceptees', 'delete') then
    raise exception 'ECHEC 0d : un compte connecté écrit les acceptations sans passer par la fonction';
  end if;
  if has_function_privilege('anon', v_sig10, 'execute') or has_function_privilege('authenticated', v_sig10, 'execute') then
    raise exception 'ECHEC 0e : la demande d''essai se dépose sans passer par le serveur';
  end if;
  if not has_function_privilege('service_role', v_sig10, 'execute') then
    raise exception 'ECHEC 0f : le serveur ne peut pas déposer avec la version';
  end if;
  if not has_function_privilege('service_role', v_sig9, 'execute') then
    raise exception 'ECHEC 0g : le serveur en production a perdu sa porte de dépôt';
  end if;
  if has_function_privilege('anon', v_sig9, 'execute') or has_function_privilege('authenticated', v_sig9, 'execute') then
    raise exception 'ECHEC 0h : l''ancienne forme s''est ouverte';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.accepter_conditions(text)'::regprocedure
                  and prosecdef and proconfig @> array['search_path=""']) then
    raise exception 'ECHEC 0i : accepter_conditions sans security definer ni search_path vide';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), now(), now()
    from (values
      (v_a, 'praticienne-0067-' || v_suf || '@exemple.test'),
      (v_b, 'voisine-0067-' || v_suf || '@exemple.test')
    ) as u(id, email);

  -- ══ 1. Accepter : les deux documents, pour soi ══════════════════════════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated', 'aal', 'aal1')::text, true);

  perform public.accepter_conditions(v_version);
  select count(*) into v_n from public.conditions_acceptees where version = v_version;
  if v_n <> 2 then raise exception 'ECHEC 1a : % acceptation(s) au lieu de 2', v_n; end if;
  select count(*) into v_n from public.conditions_acceptees
   where user_id = v_a and version = v_version and document in ('cgv', 'cgu') and accepte_le is not null;
  if v_n <> 2 then raise exception 'ECHEC 1b : les deux documents ne sont pas acceptés pour le compte appelant'; end if;

  -- Deux fois la même version : rien de plus.
  perform public.accepter_conditions('  ' || v_version || ' ');
  select count(*) into v_n from public.conditions_acceptees;
  if v_n <> 2 then raise exception 'ECHEC 1c : accepter deux fois écrit deux fois (% lignes)', v_n; end if;

  -- ══ 2. Une version sans forme de date est refusée ═══════════════════════
  foreach v_mauvaise in array array['', '   ', 'v2', '32 mars 2026', '30 Septembre 2026', '30 septembre 26',
                                     repeat('x', 41), '30 septembre 2026' || chr(10)] loop
    begin
      perform public.accepter_conditions(v_mauvaise);
      raise exception 'ECHEC 2a : la version « % » est acceptée', v_mauvaise;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.accepter_conditions(null);
    raise exception 'ECHEC 2b : une version nulle est acceptée';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into v_n from public.conditions_acceptees;
  if v_n <> 2 then raise exception 'ECHEC 2c : un refus a quand même écrit (% lignes)', v_n; end if;

  -- ══ 3. Personne n'écrit la table directement ════════════════════════════
  begin
    insert into public.conditions_acceptees (user_id, document, version) values (v_b, 'cgv', v_version);
    raise exception 'ECHEC 3a : un compte écrit une acceptation pour un autre';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.conditions_acceptees set accepte_le = now() - interval '1 year';
    raise exception 'ECHEC 3b : un compte antidate son acceptation';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.conditions_acceptees;
    raise exception 'ECHEC 3c : un compte efface la preuve de son accord';
  exception when insufficient_privilege then null;
  end;

  -- ══ 4. Chacun ne lit que les siennes ════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into v_n from public.conditions_acceptees;
  if v_n <> 0 then raise exception 'ECHEC 4a : un autre compte lit % acceptation(s) qui ne sont pas les siennes', v_n; end if;
  perform public.accepter_conditions('1er octobre 2026');
  select count(*) into v_n from public.conditions_acceptees;
  if v_n <> 2 then raise exception 'ECHEC 4b : le second compte ne lit pas exactement ses deux acceptations (%)', v_n; end if;

  -- ══ 5. Sans compte, rien ══════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  begin
    perform public.accepter_conditions(v_version);
    raise exception 'ECHEC 5a : une session sans compte accepte des conditions';
  exception when insufficient_privilege then null;
  end;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform public.accepter_conditions(v_version);
    raise exception 'ECHEC 5b : l''anonyme accepte des conditions';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into v_n from public.conditions_acceptees;
    raise exception 'ECHEC 5c : l''anonyme lit les acceptations (%)', v_n;
  exception when insufficient_privilege then null;
  end;

  -- ══ 6. Deux cents lignes au plus par compte ═════════════════════════════
  perform set_config('role', 'postgres', true);
  insert into public.conditions_acceptees (user_id, document, version)
  select v_a, d, format('%s janvier %s', 1 + (g % 28), 2030 + g / 28)
    from generate_series(1, 99) g, (values ('cgv'), ('cgu')) as t(d);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin
    perform public.accepter_conditions('9 mars 2027');
    raise exception 'ECHEC 6a : un compte accepte au-delà de deux cents lignes';
  exception when program_limit_exceeded then null;
  end;

  -- ══ 7. La demande d'essai garde la version, et l'exige ══════════════════
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  v_r := public.deposer_demande_essai('Claire Essai', 'claire-0067-' || v_suf || '@exemple.test', null,
    'Cabinet Essai', 'Nantes', '10-25', 'cabinet', null, true, v_version);
  if coalesce(v_r ->> 'ok', '') <> 'true' then raise exception 'ECHEC 7a : dépôt avec la version refusé (%)', v_r; end if;

  foreach v_mauvaise in array array['', 'v2', repeat('x', 41)] loop
    v_r := public.deposer_demande_essai('Anne Essai', 'anne-0067-' || v_suf || '@exemple.test', null,
      'Cabinet Essai', 'Lyon', '10-25', 'cabinet', null, true, v_mauvaise);
    if v_r ->> 'champ' is distinct from 'conditions' then
      raise exception 'ECHEC 7b : la version « % » passe (%)', v_mauvaise, v_r;
    end if;
  end loop;
  v_r := public.deposer_demande_essai('Anne Essai', 'anne-0067-' || v_suf || '@exemple.test', null,
    'Cabinet Essai', 'Lyon', '10-25', 'cabinet', null, true, null);
  if v_r ->> 'champ' is distinct from 'conditions' then raise exception 'ECHEC 7c : une demande sans version passe (%)', v_r; end if;
  -- Le recontact reste exigé en premier, comme avant.
  v_r := public.deposer_demande_essai('Anne Essai', 'anne-0067-' || v_suf || '@exemple.test', null,
    'Cabinet Essai', 'Lyon', '10-25', 'cabinet', null, false, v_version);
  if v_r ->> 'champ' is distinct from 'consentement' then raise exception 'ECHEC 7d : sans consentement (%)', v_r; end if;

  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.demandes_essai
   where email = 'claire-0067-' || v_suf || '@exemple.test' and conditions_version = v_version and consentement_le is not null;
  if v_n <> 1 then raise exception 'ECHEC 7e : la demande ne garde pas la version acceptée'; end if;
  select count(*) into v_n from public.demandes_essai where email = 'anne-0067-' || v_suf || '@exemple.test';
  if v_n <> 0 then raise exception 'ECHEC 7f : un dépôt refusé a quand même écrit'; end if;

  -- ══ 8. Un compte supprimé emporte ses acceptations ══════════════════════
  delete from auth.users where id = v_b;
  select count(*) into v_n from public.conditions_acceptees where user_id = v_b;
  if v_n <> 0 then raise exception 'ECHEC 8 : les acceptations survivent au compte'; end if;

  raise exception 'REUSSITE : un compte accepte les deux documents pour lui seul, une fois par version, sous une version en forme de date et deux cents lignes au plus ; chacun ne lit que les siennes ; personne n''écrit, n''antidate ni n''efface la table, l''anonyme n''accepte rien ; la demande d''essai exige et garde la version, réservée au serveur, l''ancienne porte intacte ; un compte supprimé emporte ses acceptations';
end $$;
