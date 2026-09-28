-- 0041 éprouvée contre la vraie base : vérifier le mot de passe actuel.
--
-- Le bloc fabrique deux comptes — l'un avec un mot de passe, l'autre entré
-- par lien et sans mot de passe — puis ANNULE tout par l'exception finale :
-- rien ne subsiste, même en cas de réussite.
do $$
declare
  v_avec uuid := gen_random_uuid();
  v_sans uuid := gen_random_uuid();
  v_r text;
  i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    (v_avec, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'avec-mot-de-passe@exemple.test',
     extensions.crypt('cheval agrafe batterie', extensions.gen_salt('bf', 10)), now(), now(), now()),
    (v_sans, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'sans-mot-de-passe@exemple.test', '', now(), now(), now());

  -- 1. Le navigateur n'y touche pas : ni la fonction, ni la table.
  if has_function_privilege('authenticated', 'public.verifier_mot_de_passe(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.verifier_mot_de_passe(uuid, text)', 'execute') then
    raise exception 'FUITE : le navigateur peut éprouver des mots de passe';
  end if;
  if has_table_privilege('authenticated', 'public.essais_mot_de_passe', 'select')
     or has_table_privilege('authenticated', 'public.essais_mot_de_passe', 'insert')
     or has_table_privilege('authenticated', 'public.essais_mot_de_passe', 'delete') then
    raise exception 'FUITE : le navigateur atteint la table des essais';
  end if;
  if not has_function_privilege('service_role', 'public.verifier_mot_de_passe(uuid, text)', 'execute') then
    raise exception 'ÉCHEC : le serveur ne peut pas vérifier';
  end if;

  -- 2. Le bon mot de passe passe ; un mauvais non.
  v_r := public.verifier_mot_de_passe(v_avec, 'cheval agrafe batterie');
  if v_r <> 'ok' then raise exception 'ÉCHEC : bon mot de passe refusé (%)', v_r; end if;
  v_r := public.verifier_mot_de_passe(v_avec, 'cheval agrafe batterie ');
  if v_r <> 'faux' then raise exception 'ÉCHEC : mauvais mot de passe accepté (%)', v_r; end if;

  -- 3. Un compte sans mot de passe n'en a aucun de bon — pas même le vide.
  if public.verifier_mot_de_passe(v_sans, '') <> 'faux'
     or public.verifier_mot_de_passe(v_sans, 'nimporte quoi du tout') <> 'faux' then
    raise exception 'ÉCHEC : un compte sans mot de passe en accepte un';
  end if;

  -- 4. Au-delà de 72 octets : jamais bon, même si les 72 premiers le sont.
  if public.verifier_mot_de_passe(v_avec, rpad('cheval agrafe batterie', 80, 'x')) <> 'faux' then
    raise exception 'ÉCHEC : un mot de passe tronqué passe';
  end if;

  -- 5. Cinq échecs en quinze minutes : on n'essaie plus, même le bon.
  --    (Déjà deux échecs ci-dessus pour v_avec ; trois de plus.)
  for i in 1..3 loop
    perform public.verifier_mot_de_passe(v_avec, 'essai ' || i || ' qui rate');
  end loop;
  v_r := public.verifier_mot_de_passe(v_avec, 'cheval agrafe batterie');
  if v_r <> 'trop' then raise exception 'ÉCHEC : la sixième tentative est éprouvée (%)', v_r; end if;

  -- 6. Les échecs d'un compte ne bloquent pas l'autre.
  delete from public.essais_mot_de_passe where user_id = v_sans;
  update auth.users set encrypted_password = extensions.crypt('un autre mot de passe', extensions.gen_salt('bf', 10))
   where id = v_sans;
  if public.verifier_mot_de_passe(v_sans, 'un autre mot de passe') <> 'ok' then
    raise exception 'ÉCHEC : le blocage déborde sur un autre compte';
  end if;

  -- 7. Passé quinze minutes, les échecs ne comptent plus.
  update public.essais_mot_de_passe set essaye_le = now() - interval '16 minutes' where user_id = v_avec;
  if public.verifier_mot_de_passe(v_avec, 'cheval agrafe batterie') <> 'ok' then
    raise exception 'ÉCHEC : le blocage ne se lève pas';
  end if;
  -- … et une réussite efface le compte des échecs.
  select count(*) into i from public.essais_mot_de_passe where user_id = v_avec;
  if i <> 0 then raise exception 'ÉCHEC : la réussite laisse % échec(s)', i; end if;

  raise exception 'REUSSITE : le navigateur n''y touche pas, bon et mauvais distingués, sans mot de passe rien ne passe, 72 octets tenus, blocage à cinq, par compte, levé après quinze minutes';
end $$;
