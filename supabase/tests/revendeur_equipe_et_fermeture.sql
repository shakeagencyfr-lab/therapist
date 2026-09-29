-- ============================================================================
-- Épreuve de 0057 contre la vraie base : fermer un cabinet, tenir l'équipe du
-- revendeur, régler ses coordonnées de support.
--
-- Le bloc fabrique deux revendeurs, deux cabinets et neuf comptes, joue les
-- gestes sous les droits réels de chacun, puis ANNULE tout par l'exception
-- finale : rien ne subsiste, même en cas de réussite.
--
--   A. Fermer un cabinet
--      1. un membre de l'équipe du revendeur ne ferme pas ; la praticienne
--         non plus ;
--      2. le propriétaire ferme ; la date est celle de la base, et une
--         seconde fermeture ne la réécrit pas ;
--      3. le patient perd son espace (fiche, journal, contexte, note du soir),
--         la page publique se tait, le contrat n'est plus en règle ;
--      4. la praticienne garde ses dossiers, et lit pourquoi ;
--      5. personne n'entre dans un cabinet fermé ;
--      6. le journal le dit, au seul revendeur du cabinet ;
--      7. rouvrir rend tout.
--   B. L'équipe du revendeur
--      1. un membre de l'équipe n'invite pas, ne relance pas, n'annule pas ;
--      2. le propriétaire invite ; la base signe l'invitation à sa place ;
--      3. une seule invitation en attente par adresse, casse comprise ;
--      4. l'invitée se connecte et entre ; l'équipe la voit, adresse comprise ;
--      5. une invitation posée par qui n'est pas propriétaire ne rattache
--         personne ; celle de la plateforme, si ;
--      6. retirer : jamais soi-même, jamais par un membre, et les invitations
--         de la personne retirée partent avec elle ;
--      7. une personne retirée peut être réinvitée ;
--      8. aucun membre ne s'écrit depuis le navigateur.
--   C. Les coordonnées de support
--      1. le propriétaire règle le nom et l'adresse, et la praticienne les lit ;
--      2. ni un membre de l'équipe, ni un autre revendeur ;
--      3. ni l'identifiant, ni l'accueil des demandes ;
--      4. une adresse mal formée est refusée.
--
--   psql "$DATABASE_URL" -f supabase/tests/revendeur_equipe_et_fermeture.sql
-- ============================================================================

do $$
declare
  v_suf  text := substr(md5(random()::text), 1, 6);
  v_plan text;
  v_res  uuid; v_res2 uuid;
  v_own  uuid := gen_random_uuid();   -- propriétaire du revendeur
  v_stf  uuid := gen_random_uuid();   -- membre de son équipe
  v_nou  uuid := gen_random_uuid();   -- invitée dans l'équipe
  v_dor  uuid := gen_random_uuid();   -- invitée par un membre sans droit
  v_pla  uuid := gen_random_uuid();   -- invitée par la plateforme
  v_x    uuid := gen_random_uuid();   -- propriétaire d'un autre revendeur
  v_tit  uuid := gen_random_uuid();   -- titulaire du cabinet K
  v_con  uuid := gen_random_uuid();   -- consœur invitée dans K fermé
  v_pat  uuid := gen_random_uuid();   -- compte du patient de K
  v_k uuid; v_slug text; v_p uuid; v_inv uuid;
  v_mot text; v_n integer; v_refus boolean; v_code text;
  v_ctx jsonb; v_date timestamptz; v_date2 timestamptz; v_par uuid; v_cree timestamptz;
begin
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  if v_plan is null then raise exception 'RIEN À ÉPROUVER : aucune offre au catalogue'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, '', now(), now(), now()
    from (values
      (v_own, 'proprietaire-0057-' || v_suf || '@exemple.test'),
      (v_stf, 'equipier-0057-' || v_suf || '@exemple.test'),
      (v_nou, 'nouvelle-0057-' || v_suf || '@exemple.test'),
      (v_dor, 'dormante-0057-' || v_suf || '@exemple.test'),
      (v_pla, 'plateforme-0057-' || v_suf || '@exemple.test'),
      (v_x,   'autre-revendeur-0057-' || v_suf || '@exemple.test'),
      (v_tit, 'titulaire-0057-' || v_suf || '@exemple.test'),
      (v_con, 'consoeur-0057-' || v_suf || '@exemple.test'),
      (v_pat, 'patient-0057-' || v_suf || '@exemple.test')
    ) as u(id, email);

  insert into public.resellers (name, slug, support_email)
  values ('Revendeur 0057', 'revendeur-0057-' || v_suf, 'support@exemple.test')
  returning id into v_res;
  insert into public.resellers (name, slug) values ('Autre 0057', 'autre-0057-' || v_suf)
  returning id into v_res2;
  insert into public.reseller_members (reseller_id, user_id, role)
  values (v_res, v_own, 'owner'), (v_res, v_stf, 'staff'), (v_res2, v_x, 'owner');

  v_slug := 'cab-0057-' || v_suf;
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_res, 'Cabinet 0057', v_slug, 'x') returning id into v_k;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_k, v_plan, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
  values (v_k, v_tit, 'owner', 'Titulaire 0057');
  insert into public.patients (cabinet_id, auth_user_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question, email)
  values (v_k, v_pat, 'Patient 0057', 'P', 'p', 's', 'w', 'l', 'q', 'patient-0057-' || v_suf || '@exemple.test')
  returning id into v_p;
  insert into public.journal_pages (cabinet_id, patient_id, title, body, shared)
  values (v_k, v_p, 'Une page', 'Un texte de l''épreuve.', true);

  -- Avant la fermeture : le patient est chez lui.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_pat, 'role', 'authenticated')::text, true);
  v_ctx := public.my_context();
  if v_ctx->'patient' = 'null'::jsonb then
    raise exception 'ECHEC 0 : le patient n''a pas d''espace avant toute fermeture (%)', v_ctx;
  end if;
  perform set_config('role', 'anon', true);
  if public.cabinet_vitrine(v_slug) is null then
    raise exception 'ECHEC 0b : la page publique ne répond pas avant la fermeture';
  end if;

  ------------------------------------------------ A1. qui ne ferme pas
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stf, 'role', 'authenticated')::text, true);
  v_code := public.revendeur_fermer_cabinet(v_k, true);
  if v_code is distinct from 'pas_proprietaire' then
    raise exception 'ECHEC A1a : un membre de l''équipe ferme un cabinet (%)', v_code;
  end if;
  v_refus := false;
  begin
    update public.cabinets set archived_at = now() where id = v_k;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then
    raise exception 'ECHEC A1b : un membre de l''équipe ferme un cabinet par écriture directe';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
  v_refus := false;
  begin
    update public.cabinets set archived_at = now() where id = v_k;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC A1c : la praticienne ferme son cabinet'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  v_code := public.revendeur_fermer_cabinet(v_k, true);
  if v_code is distinct from 'inconnu' then
    raise exception 'ECHEC A1d : un autre revendeur agit sur ce cabinet (%)', v_code;
  end if;

  ------------------------------------------------ A2. le propriétaire ferme
  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  v_code := public.revendeur_fermer_cabinet(v_k, true);
  if v_code is distinct from 'ok' then
    raise exception 'ECHEC A2a : le propriétaire ne ferme pas (%)', v_code;
  end if;
  v_code := public.revendeur_fermer_cabinet(v_k, true);
  if v_code is distinct from 'deja_ferme' then
    raise exception 'ECHEC A2b : une seconde fermeture n''est pas dite (%)', v_code;
  end if;
  -- Une date choisie par le navigateur ne passe pas.
  update public.cabinets set archived_at = now() - interval '1 year' where id = v_k;
  perform set_config('role', 'postgres', true);
  select archived_at into v_date from public.cabinets where id = v_k;
  if v_date is null or v_date < now() - interval '1 minute' then
    raise exception 'ECHEC A2c : la date de fermeture vient du navigateur (%)', v_date;
  end if;

  ------------------------------------------------ A3. ce qui se ferme
  if public.abonnement_en_regle(v_k) then
    raise exception 'ECHEC A3a : un cabinet fermé reste en règle';
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_pat, 'role', 'authenticated')::text, true);
  v_ctx := public.my_context();
  if v_ctx->'patient' <> 'null'::jsonb then
    raise exception 'ECHEC A3b : my_context rend la fiche d''un cabinet fermé (%)', v_ctx->'patient';
  end if;
  select count(*) into v_n from public.patients where id = v_p;
  if v_n <> 0 then raise exception 'ECHEC A3c : le patient lit encore sa fiche'; end if;
  select count(*) into v_n from public.journal_pages where patient_id = v_p;
  if v_n <> 0 then raise exception 'ECHEC A3d : le patient lit encore son journal'; end if;
  if public.is_patient_record(v_p) then
    raise exception 'ECHEC A3e : is_patient_record ouvre encore la fiche';
  end if;
  if public.patient_cabinet_settings() is not null then
    raise exception 'ECHEC A3f : les réglages du cabinet se lisent encore';
  end if;
  v_refus := false;
  begin
    perform public.patient_note_echelle(5);
  exception when others then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC A3g : une note d''échelle s''écrit dans un cabinet fermé'; end if;

  perform set_config('role', 'anon', true);
  if public.cabinet_vitrine(v_slug) is not null then
    raise exception 'ECHEC A3h : la page publique d''un cabinet fermé répond encore';
  end if;

  ------------------------------------------------ A4. la praticienne garde ses dossiers
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.patients where cabinet_id = v_k;
  if v_n <> 1 then raise exception 'ECHEC A4a : la praticienne ne lit plus ses dossiers (%)', v_n; end if;
  select count(*) into v_n from public.journal_pages where patient_id = v_p;
  if v_n <> 1 then raise exception 'ECHEC A4b : la praticienne ne lit plus le journal partagé (%)', v_n; end if;
  v_ctx := public.my_context();
  if (v_ctx->'cabinet'->>'id')::uuid is distinct from v_k then
    raise exception 'ECHEC A4c : la praticienne n''a plus son espace (%)', v_ctx;
  end if;
  v_ctx := public.cabinet_droits(v_k);
  if (v_ctx->>'ferme')::boolean is distinct from true or (v_ctx->>'en_regle')::boolean is distinct from false then
    raise exception 'ECHEC A4d : les droits ne disent pas la fermeture (%)', v_ctx;
  end if;
  if (v_ctx->>'ferme_le') is null then
    raise exception 'ECHEC A4e : les droits ne datent pas la fermeture';
  end if;

  ------------------------------------------------ A5. personne n'entre
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
  values (v_k, 'consoeur-0057-' || v_suf || '@exemple.test', 'therapist', now() + interval '30 days');
  perform set_config('request.jwt.claims', json_build_object('sub', v_con, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.cabinet_members where cabinet_id = v_k and user_id = v_con;
  if v_n <> 0 then raise exception 'ECHEC A5a : une consœur entre dans un cabinet fermé'; end if;
  select count(*) into v_n from public.cabinet_invitations
   where cabinet_id = v_k and lower(email) = 'consoeur-0057-' || v_suf || '@exemple.test' and accepted_at is null;
  if v_n <> 1 then raise exception 'ECHEC A5b : l''invitation vers un cabinet fermé a été close'; end if;

  ------------------------------------------------ A6. le journal
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.journal_des_contrats(200) j
   where j.cabinet_id = v_k and j.action = 'cabinet.ferme' and j.auteur = 'vous';
  if v_n <> 1 then raise exception 'ECHEC A6a : la fermeture manque au journal des contrats (%)', v_n; end if;
  select count(*) into v_n from public.journal_du_cabinet(v_k, 100) j where j.action = 'cabinet.ferme';
  if v_n <> 1 then raise exception 'ECHEC A6b : la fermeture manque au journal du cabinet (%)', v_n; end if;
  select count(*) into v_n from public.journal_du_cabinet(v_k, 100) j where j.meta ? 'reseller_id';
  if v_n <> 0 then raise exception 'ECHEC A6c : le journal du cabinet laisse passer l''identifiant du revendeur'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.journal_du_cabinet(v_k, 100);
  if v_n <> 0 then raise exception 'ECHEC A6d : un autre revendeur lit le journal de ce cabinet'; end if;

  ------------------------------------------------ A7. rouvrir rend tout
  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  v_code := public.revendeur_fermer_cabinet(v_k, false);
  if v_code is distinct from 'ok' then raise exception 'ECHEC A7a : le propriétaire ne rouvre pas (%)', v_code; end if;
  v_code := public.revendeur_fermer_cabinet(v_k, false);
  if v_code is distinct from 'deja_ouvert' then raise exception 'ECHEC A7b : une seconde réouverture n''est pas dite (%)', v_code; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_pat, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.journal_pages where patient_id = v_p;
  if v_n <> 1 then raise exception 'ECHEC A7c : le patient ne retrouve pas son journal'; end if;
  if public.my_context()->'patient' = 'null'::jsonb then
    raise exception 'ECHEC A7d : le patient ne retrouve pas son espace';
  end if;
  perform set_config('role', 'anon', true);
  if public.cabinet_vitrine(v_slug) is null then
    raise exception 'ECHEC A7e : la page publique ne revient pas';
  end if;
  perform set_config('role', 'postgres', true);
  if not public.abonnement_en_regle(v_k) then
    raise exception 'ECHEC A7f : le contrat ne redevient pas en règle';
  end if;
  select count(*) into v_n from public.audit_log where cabinet_id = v_k and action = 'cabinet.rouvert';
  if v_n <> 1 then raise exception 'ECHEC A7g : la réouverture manque au journal (%)', v_n; end if;

  ------------------------------------------------ B1. l'équipe n'invite pas
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stf, 'role', 'authenticated')::text, true);
  v_refus := false;
  begin
    insert into public.reseller_invitations (reseller_id, email, role)
    values (v_res, 'moi-proprietaire-0057-' || v_suf || '@exemple.test', 'owner');
  exception when others then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC B1a : un membre de l''équipe s''invite propriétaire'; end if;

  ------------------------------------------------ B2. le propriétaire invite, la base signe
  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  insert into public.reseller_invitations (reseller_id, email, role, invited_by, created_at, expires_at)
  values (v_res, 'nouvelle-0057-' || v_suf || '@exemple.test', 'staff', v_x,
          now() + interval '5 years', now() + interval '30 days')
  returning id into v_inv;
  perform set_config('role', 'postgres', true);
  select invited_by, created_at into v_par, v_cree from public.reseller_invitations where id = v_inv;
  if v_par is distinct from v_own then raise exception 'ECHEC B2a : l''autrice de l''invitation est forgeable (%)', v_par; end if;
  if v_cree > now() + interval '1 minute' then raise exception 'ECHEC B2b : la date de création vient du navigateur'; end if;

  -- Le membre de l'équipe la voit, mais n'y touche pas.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stf, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.reseller_invitations where id = v_inv;
  if v_n <> 1 then raise exception 'ECHEC B2c : l''équipe ne voit pas les invitations en attente'; end if;
  update public.reseller_invitations set expires_at = now() + interval '40 days' where id = v_inv;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ECHEC B2d : un membre de l''équipe relance une invitation'; end if;
  delete from public.reseller_invitations where id = v_inv;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ECHEC B2e : un membre de l''équipe annule une invitation'; end if;

  ------------------------------------------------ B3. une seule en attente par adresse
  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  v_refus := false;
  begin
    insert into public.reseller_invitations (reseller_id, email, role)
    values (v_res, upper('nouvelle-0057-' || v_suf || '@exemple.test'), 'staff');
  exception when unique_violation then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC B3 : deux invitations attendent la même adresse'; end if;

  ------------------------------------------------ B4. l'invitée entre, l'équipe la voit
  perform set_config('request.jwt.claims', json_build_object('sub', v_nou, 'role', 'authenticated')::text, true);
  v_ctx := public.claim_access();
  if (v_ctx->>'reseller')::uuid is distinct from v_res then
    raise exception 'ECHEC B4a : l''invitée n''entre pas dans l''équipe (%)', v_ctx;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_stf, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.equipe_du_revendeur() e
   where e.reseller_id = v_res and e.email like '%-0057-' || v_suf || '@exemple.test';
  if v_n <> 3 then raise exception 'ECHEC B4b : l''équipe ne se voit pas entière (%)', v_n; end if;
  select count(*) into v_n from public.equipe_du_revendeur() e where e.moi and e.user_id = v_stf;
  if v_n <> 1 then raise exception 'ECHEC B4c : la ligne de l''appelant n''est pas marquée'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.equipe_du_revendeur() e where e.reseller_id = v_res;
  if v_n <> 0 then raise exception 'ECHEC B4d : un autre revendeur voit cette équipe'; end if;

  ------------------------------------------------ B5. qui peut rattacher
  -- Une invitation dont l'autrice n'est pas propriétaire, comme l'ancienne
  -- politique laissait un membre de l'équipe en poser. Sans jeton, la base
  -- garde l'autrice fournie : c'est ainsi qu'on la fabrique ici.
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  insert into public.reseller_invitations (reseller_id, email, role, invited_by)
  values (v_res, 'dormante-0057-' || v_suf || '@exemple.test', 'owner', v_stf);
  -- Celle de la plateforme : sans autrice.
  insert into public.reseller_invitations (reseller_id, email, role)
  values (v_res, 'plateforme-0057-' || v_suf || '@exemple.test', 'staff');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dor, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('request.jwt.claims', json_build_object('sub', v_pla, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.reseller_members where user_id = v_dor;
  if v_n <> 0 then raise exception 'ECHEC B5a : une invitation d''un membre sans droit rattache'; end if;
  select count(*) into v_n from public.reseller_members where user_id = v_pla and reseller_id = v_res;
  if v_n <> 1 then raise exception 'ECHEC B5b : l''invitation de la plateforme ne rattache plus'; end if;

  ------------------------------------------------ B6. retirer
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stf, 'role', 'authenticated')::text, true);
  v_code := public.retirer_du_revendeur(v_res, v_nou);
  if v_code is distinct from 'pas_proprietaire' then raise exception 'ECHEC B6a : un membre retire (%)', v_code; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  v_code := public.retirer_du_revendeur(v_res, v_own);
  if v_code is distinct from 'soi_meme' then raise exception 'ECHEC B6b : le propriétaire se retire lui-même (%)', v_code; end if;

  -- La nouvelle venue, promue, invite ; puis elle est retirée : son
  -- invitation part avec elle.
  perform set_config('role', 'postgres', true);
  update public.reseller_members set role = 'owner' where reseller_id = v_res and user_id = v_nou;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_nou, 'role', 'authenticated')::text, true);
  insert into public.reseller_invitations (reseller_id, email, role)
  values (v_res, 'laissee-0057-' || v_suf || '@exemple.test', 'staff');
  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  v_code := public.retirer_du_revendeur(v_res, v_nou);
  if v_code is distinct from 'ok' then raise exception 'ECHEC B6c : le propriétaire ne retire pas (%)', v_code; end if;
  v_code := public.retirer_du_revendeur(v_res, v_nou);
  if v_code is distinct from 'inconnu' then raise exception 'ECHEC B6d : un second retrait n''est pas dit (%)', v_code; end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_n from public.reseller_invitations
   where reseller_id = v_res and email = 'laissee-0057-' || v_suf || '@exemple.test';
  if v_n <> 0 then raise exception 'ECHEC B6e : l''invitation de la personne retirée lui survit'; end if;
  select count(*) into v_n from public.audit_log
   where action = 'revendeur.membre_retire' and target_id = v_nou and meta->>'reseller_id' = v_res::text;
  if v_n <> 1 then raise exception 'ECHEC B6f : le retrait manque au journal (%)', v_n; end if;

  ------------------------------------------------ B7. réinviter une personne retirée
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  insert into public.reseller_invitations (reseller_id, email, role)
  values (v_res, 'nouvelle-0057-' || v_suf || '@exemple.test', 'staff');
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC B7 : une personne retirée ne peut plus être réinvitée'; end if;

  ------------------------------------------------ B8. aucun membre ne s'écrit à la main
  v_refus := false;
  begin
    insert into public.reseller_members (reseller_id, user_id, role) values (v_res, v_con, 'owner');
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC B8 : un membre s''écrit depuis le navigateur'; end if;

  ------------------------------------------------ C1. le propriétaire règle ses coordonnées
  update public.resellers
     set name = 'Enseigne 0057', support_email = 'aide-0057@exemple.test'
   where id = v_res;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC C1a : le propriétaire ne règle pas ses coordonnées'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
  v_ctx := public.cabinet_droits(v_k);
  if v_ctx->>'revendeur' is distinct from 'Enseigne 0057'
     or v_ctx->>'revendeur_courriel' is distinct from 'aide-0057@exemple.test' then
    raise exception 'ECHEC C1b : la praticienne ne lit pas les nouvelles coordonnées (%)', v_ctx;
  end if;

  ------------------------------------------------ C2. ni l'équipe, ni un autre revendeur
  perform set_config('request.jwt.claims', json_build_object('sub', v_stf, 'role', 'authenticated')::text, true);
  update public.resellers set support_email = 'detourne@exemple.test' where id = v_res;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ECHEC C2a : un membre de l''équipe règle les coordonnées'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  update public.resellers set name = 'Détourné' where id = v_res;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ECHEC C2b : un autre revendeur règle ces coordonnées'; end if;

  ------------------------------------------------ C3. ni l'identifiant, ni l'accueil
  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
  v_refus := false;
  begin
    update public.resellers set slug = 'vole-0057-' || v_suf where id = v_res;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC C3a : le propriétaire change l''identifiant du revendeur'; end if;
  v_refus := false;
  begin
    update public.resellers set accueille_demandes = true where id = v_res;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC C3b : un revendeur s''attribue les demandes d''essai'; end if;

  ------------------------------------------------ C4. une adresse mal formée
  v_refus := false;
  begin
    update public.resellers set support_email = 'pas une adresse' where id = v_res;
  exception when check_violation then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC C4a : une adresse de support mal formée passe'; end if;
  v_refus := false;
  begin
    update public.resellers set name = ' ' where id = v_res;
  exception when check_violation then v_refus := true;
  end;
  if not v_refus then raise exception 'ECHEC C4b : un nom vide passe'; end if;
  -- Vider l'adresse reste permis : la praticienne lit alors le nom seul.
  update public.resellers set support_email = null where id = v_res;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC C4c : l''adresse de support ne se vide pas'; end if;

  perform set_config('role', 'postgres', true);
  raise exception 'REUSSITE : 0057 tient — fermeture (qui, quoi, journal, réouverture), équipe du revendeur (invitation signée, rattachement, retrait), coordonnées de support (propriétaire seul, deux colonnes)';
end;
$$;
