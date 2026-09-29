-- 0060 éprouvée contre la vraie base : les demandes d'essai de la page
-- d'accueil.
--
--   - le visiteur anonyme ne touche à rien directement : ni dépôt, ni lecture ;
--     sa demande passe par le serveur, qui appelle la fonction de dépôt avec
--     la clé de service (après le CAPTCHA, quand il est réglé) ;
--   - la fonction de dépôt valide chaque champ et exige le consentement ;
--   - les bornes tiennent : trois par adresse et par jour, trente par heure ;
--   - le revendeur qui accueille lit et traite ses demandes, et seulement le
--     statut et la note ; un autre revendeur n'en voit aucune.
--
-- Le bloc fabrique ce dont il a besoin et ANNULE tout par l'exception finale.
do $$
declare
  v_rev uuid; v_rev2 uuid;
  v_rm uuid := gen_random_uuid(); v_rx uuid := gen_random_uuid();
  v_r jsonb; v_n int; v_total int; v_id uuid; v_quand timestamptz;
  v_sig constant text := 'public.deposer_demande_essai(text, text, text, text, text, text, text, text, boolean)';
begin
  -- ── 0. Les droits, tels qu'ils sont posés ──────────────────────────────
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception 'ECHEC 0a : l''anonyme peut appeler la fonction de dépôt sans passer par le serveur';
  end if;
  if has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'ECHEC 0b : un compte connecté peut déposer sans passer par le serveur';
  end if;
  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'ECHEC 0c : le serveur ne peut pas déposer';
  end if;
  if has_table_privilege('anon', 'public.demandes_essai', 'select')
     or has_table_privilege('anon', 'public.demandes_essai', 'insert') then
    raise exception 'ECHEC 0d : l''anonyme a un droit sur la table des demandes';
  end if;
  if has_table_privilege('authenticated', 'public.demandes_essai', 'insert') then
    raise exception 'ECHEC 0e : un compte connecté peut écrire une demande directement';
  end if;
  if has_column_privilege('authenticated', 'public.demandes_essai', 'email', 'update')
     or has_column_privilege('authenticated', 'public.demandes_essai', 'reseller_id', 'update') then
    raise exception 'ECHEC 0f : un revendeur peut réécrire une demande au-delà du statut et de la note';
  end if;

  select id into v_rev from public.resellers where accueille_demandes;
  if v_rev is null then raise exception 'ECHEC 0g : aucun revendeur n''accueille les demandes'; end if;

  -- On repart d'une file vide : les bornes se comptent juste. Tout est annulé.
  delete from public.demandes_essai;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    (v_rm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'membre-demandes@exemple.test', '', now(), now(), now()),
    (v_rx, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'autre-demandes@exemple.test', '', now(), now(), now());
  insert into public.resellers (name, slug) values ('Autre enseigne', 'autre-enseigne-demandes-t')
  returning id into v_rev2;
  insert into public.reseller_members (reseller_id, user_id, role) values (v_rev, v_rm, 'staff');
  insert into public.reseller_members (reseller_id, user_id, role) values (v_rev2, v_rx, 'owner');

  -- ── 1. L'anonyme ne dépose pas directement, et ne lit rien ─────────────
  set local role anon;
  begin
    perform public.deposer_demande_essai('Claire Fontaine', 'claire@exemple.test', null,
      'Cabinet Fontaine', 'Nantes', '10-25', 'cabinet', null, true);
    raise exception 'ECHEC 1 : l''anonyme dépose sans passer par le serveur';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into v_n from public.demandes_essai;
    raise exception 'ECHEC 2 : l''anonyme lit la table des demandes (% lignes)', v_n;
  exception when insufficient_privilege then null;
  end;

  -- ── 3. Le serveur dépose pour le visiteur ──────────────────────────────
  set local role service_role;
  v_r := public.deposer_demande_essai('  Claire Fontaine ', 'Claire@Exemple.TEST', '06 12 34 56 78',
    'Cabinet Fontaine', 'Nantes', '10-25', 'cabinet', 'Bonjour', true);
  if coalesce(v_r->>'ok', '') <> 'true' then raise exception 'ECHEC 3 : dépôt refusé (%)', v_r; end if;

  set local role postgres;
  select count(*) into v_n from public.demandes_essai
   where email = 'claire@exemple.test' and nom = 'Claire Fontaine' and reseller_id = v_rev
     and statut = 'nouvelle' and consentement_le is not null and note_interne = '';
  if v_n <> 1 then raise exception 'ECHEC 3b : la demande n''est pas rangée comme attendu (%)', v_n; end if;

  -- ── 4. Chaque champ est relu, le consentement exigé ────────────────────
  set local role service_role;
  v_r := public.deposer_demande_essai('Anne Bel', 'anne@exemple.test', null, 'Cab', 'Lyon', '10-25', 'cabinet', null, false);
  if v_r->>'champ' is distinct from 'consentement' then raise exception 'ECHEC 4a : sans consentement (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Anne Bel', 'anne@exemple.test', null, 'Cab', 'Lyon', '10-25', 'cabinet', null, null);
  if v_r->>'champ' is distinct from 'consentement' then raise exception 'ECHEC 4b : consentement nul (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Anne Bel', 'anne', null, 'Cab', 'Lyon', '10-25', 'cabinet', null, true);
  if v_r->>'champ' is distinct from 'email' then raise exception 'ECHEC 4c : adresse incomplète (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Anne Bel', 'anne@exemple.test', 'appelez-moi', 'Cab', 'Lyon', '10-25', 'cabinet', null, true);
  if v_r->>'champ' is distinct from 'telephone' then raise exception 'ECHEC 4d : téléphone illisible (%)', v_r; end if;
  v_r := public.deposer_demande_essai('A', 'anne@exemple.test', null, 'Cab', 'Lyon', '10-25', 'cabinet', null, true);
  if v_r->>'champ' is distinct from 'nom' then raise exception 'ECHEC 4e : nom trop court (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Anne' || chr(10) || 'Bel', 'anne@exemple.test', null, 'Cab', 'Lyon', '10-25', 'cabinet', null, true);
  if v_r->>'champ' is distinct from 'nom' then raise exception 'ECHEC 4f : caractère de contrôle (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Anne Bel', 'anne@exemple.test', null, 'Cab', 'Lyon', '1000', 'cabinet', null, true);
  if v_r->>'champ' is distinct from 'patients' then raise exception 'ECHEC 4g : fourchette inconnue (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Anne Bel', 'anne@exemple.test', null, 'Cab', 'Lyon', '10-25', 'premium', null, true);
  if v_r->>'champ' is distinct from 'offre' then raise exception 'ECHEC 4h : offre inconnue (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Anne Bel', 'anne@exemple.test', null, 'Cab', 'Lyon', '10-25', 'cabinet', repeat('m', 2001), true);
  if v_r->>'champ' is distinct from 'message' then raise exception 'ECHEC 4i : message trop long (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Anne Bel', 'anne@exemple.test', null, 'Cab', 'V' || repeat('i', 80), '10-25', 'cabinet', null, true);
  if v_r->>'champ' is distinct from 'ville' then raise exception 'ECHEC 4j : ville trop longue (%)', v_r; end if;

  set local role postgres;
  select count(*) into v_n from public.demandes_essai where email = 'anne@exemple.test';
  if v_n <> 0 then raise exception 'ECHEC 4k : un dépôt refusé a quand même écrit'; end if;

  -- ── 5. Trois par adresse et par jour ───────────────────────────────────
  set local role service_role;
  v_r := public.deposer_demande_essai('Claire Fontaine', 'claire@exemple.test', null, 'Cabinet Fontaine', 'Nantes', '10-25', 'reseau', null, true);
  if coalesce(v_r->>'ok', '') <> 'true' then raise exception 'ECHEC 5a : la deuxième demande est refusée (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Claire Fontaine', 'CLAIRE@exemple.test', null, 'Cabinet Fontaine', 'Nantes', '10-25', 'a-voir', null, true);
  if coalesce(v_r->>'ok', '') <> 'true' then raise exception 'ECHEC 5b : la troisième demande est refusée (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Claire Fontaine', 'claire@exemple.test', null, 'Cabinet Fontaine', 'Nantes', '10-25', 'cabinet', null, true);
  if v_r->>'motif' is distinct from 'adresse' then raise exception 'ECHEC 5c : la quatrième demande passe (%)', v_r; end if;
  v_r := public.deposer_demande_essai('Paul Roche', 'paul@exemple.test', null, 'Cabinet Roche', 'Brest', 'moins-10', 'essentiel', null, true);
  if coalesce(v_r->>'ok', '') <> 'true' then raise exception 'ECHEC 5d : la borne déborde sur une autre adresse (%)', v_r; end if;

  -- ── 6. Trente par heure, sur toute la plateforme ───────────────────────
  set local role postgres;
  select count(*) into v_n from public.demandes_essai where created_at > now() - interval '1 hour';
  insert into public.demandes_essai (reseller_id, nom, email, cabinet, ville, patients, offre, consentement_le)
  select v_rev, 'Rafale', format('rafale%s@exemple.test', g), 'Cabinet', 'Ville', '10-25', 'a-voir', now()
    from generate_series(1, 30 - v_n) g;

  set local role service_role;
  v_r := public.deposer_demande_essai('Lise Marin', 'lise@exemple.test', null, 'Cabinet Marin', 'Caen', '26-80', 'cabinet', null, true);
  if v_r->>'motif' is distinct from 'heure' then raise exception 'ECHEC 6a : la trente et unième de l''heure passe (%)', v_r; end if;

  -- Une heure plus tard, la file se rouvre.
  set local role postgres;
  update public.demandes_essai set created_at = now() - interval '2 hours';
  set local role service_role;
  v_r := public.deposer_demande_essai('Lise Marin', 'lise@exemple.test', null, 'Cabinet Marin', 'Caen', '26-80', 'cabinet', null, true);
  if coalesce(v_r->>'ok', '') <> 'true' then raise exception 'ECHEC 6b : la file ne se rouvre pas (%)', v_r; end if;

  set local role postgres;
  select count(*) into v_total from public.demandes_essai;

  -- ── 7. Le revendeur qui accueille lit et traite ────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rm::text, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.demandes_essai;
  if v_n <> v_total then raise exception 'ECHEC 7a : le membre voit % demandes sur %', v_n, v_total; end if;

  select id into v_id from public.demandes_essai where email = 'lise@exemple.test';
  update public.demandes_essai set statut = 'contactee', note_interne = 'Rappelée mardi' where id = v_id;
  select statut_le into v_quand from public.demandes_essai where id = v_id and statut = 'contactee';
  if v_quand is null then raise exception 'ECHEC 7b : le statut ne s''écrit pas, ou sa date manque'; end if;

  begin
    update public.demandes_essai set email = 'autre@exemple.test' where id = v_id;
    raise exception 'ECHEC 7c : le revendeur réécrit l''adresse d''une demande';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.demandes_essai (reseller_id, nom, email, cabinet, ville, patients, offre, consentement_le)
    values (v_rev, 'Forgée', 'forgee@exemple.test', 'Cab', 'Ville', '10-25', 'a-voir', now());
    raise exception 'ECHEC 7d : le revendeur écrit une demande directement';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.demandes_essai set statut = 'perdue' where id = v_id;
    raise exception 'ECHEC 7e : un statut inconnu est accepté';
  exception when check_violation then null;
  end;

  -- ── 8. Un autre revendeur ne voit rien, ne touche à rien ───────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rx::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.demandes_essai;
  if v_n <> 0 then raise exception 'ECHEC 8a : un autre revendeur voit % demandes', v_n; end if;
  update public.demandes_essai set statut = 'sans-suite' where id = v_id;
  delete from public.demandes_essai where id = v_id;

  set local role postgres;
  select count(*) into v_n from public.demandes_essai where id = v_id and statut = 'contactee';
  if v_n <> 1 then raise exception 'ECHEC 8b : un autre revendeur a changé ou effacé la demande'; end if;

  -- ── 9. Le membre efface une demande ─────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rm::text, 'role', 'authenticated')::text, true);
  delete from public.demandes_essai where id = v_id;
  set local role postgres;
  select count(*) into v_n from public.demandes_essai where id = v_id;
  if v_n <> 0 then raise exception 'ECHEC 9 : le revendeur ne peut pas effacer une demande'; end if;

  -- ── 10. Un seul revendeur accueille, et sans lui la porte est fermée ───
  begin
    update public.resellers set accueille_demandes = true where id = v_rev2;
    raise exception 'ECHEC 10a : deux revendeurs accueillent les demandes';
  exception when unique_violation then null;
  end;
  update public.resellers set accueille_demandes = false;
  set local role service_role;
  v_r := public.deposer_demande_essai('Marc Vidal', 'marc@exemple.test', null, 'Cabinet Vidal', 'Pau', '10-25', 'cabinet', null, true);
  if v_r->>'motif' is distinct from 'fermee' then raise exception 'ECHEC 10b : sans revendeur, le dépôt passe (%)', v_r; end if;
  set local role postgres;

  raise exception 'REUSSITE : l''anonyme ne dépose ni ne lit rien directement, le serveur dépose, chaque champ et le consentement relus, trois par adresse et trente par heure tenus, le revendeur qui accueille lit, traite le statut et la note, efface — et un autre revendeur ne voit rien';
end;
$$;
