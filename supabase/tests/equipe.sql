-- ============================================================================
-- Épreuve de l'équipe d'un cabinet (0042), contre la vraie base.
--
-- Le bloc fabrique un revendeur, deux cabinets et six comptes, joue les
-- gestes de l'écran « Équipe » sous les droits réels de chacun, puis ANNULE
-- tout par l'exception finale : rien ne subsiste, même en cas de réussite.
--
--   1. L'amorçage : le revendeur invite la titulaire, avec son nom ; elle se
--      connecte et entre, sous ce nom.
--   2. La titulaire invite une consœur ; la base signe l'invitation à sa
--      place — impossible d'en forger l'autrice.
--   3. La consœur se connecte : elle est rattachée, sous son nom.
--   4. Une inconnue n'est pas rattachée — ni sans invitation, ni par une
--      invitation dormante du revendeur (la porte de 0030), ni par une
--      invitation de titulaire dans un cabinet déjà tenu.
--   5. La consœur ne retire pas la titulaire, ne se promeut pas, n'invite pas.
--   6. Un autre cabinet ne voit rien et ne touche à rien.
--   7. Relancer une invitation expirée : l'index unique refuse d'en poser une
--      seconde, la relance, elle, passe — sans pouvoir dépasser soixante jours.
--   8. La titulaire retire la consœur, jamais elle-même.
--
--   psql "$DATABASE_URL" -f supabase/tests/equipe.sql
-- ============================================================================

do $$
declare
  v_plan text;
  v_res uuid;
  v_rev uuid := gen_random_uuid();   -- le revendeur
  v_tit uuid := gen_random_uuid();   -- la titulaire du cabinet K
  v_con uuid := gen_random_uuid();   -- la consœur invitée dans K
  v_inc uuid := gen_random_uuid();   -- une inconnue
  v_aut uuid := gen_random_uuid();   -- la titulaire d'un autre cabinet
  v_ret uuid := gen_random_uuid();   -- une invitée dont l'invitation a expiré
  v_k uuid; v_l uuid;
  v_inv uuid;
  v_nom text; v_role text; v_par uuid; v_cree timestamptz; v_expire timestamptz;
  v_mot text;
  n integer;
  v_refus boolean;
begin
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  if v_plan is null then raise exception 'RIEN À ÉPROUVER : aucune offre au catalogue'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, '', now(), now(), now()
    from (values
      (v_rev, 'revendeur-equipe@exemple.test'),
      (v_tit, 'titulaire-equipe@exemple.test'),
      (v_con, 'consoeur-equipe@exemple.test'),
      (v_inc, 'inconnue-equipe@exemple.test'),
      (v_aut, 'autre-titulaire-equipe@exemple.test'),
      (v_ret, 'relance-equipe@exemple.test')
    ) as u(id, email);

  insert into public.resellers (name, slug)
  values ('Revendeur équipe', 'revendeur-equipe-' || substr(md5(random()::text), 1, 6))
  returning id into v_res;
  insert into public.reseller_members (reseller_id, user_id, role) values (v_res, v_rev, 'owner');

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_res, 'Cabinet équipe', 'cab-equipe-' || substr(md5(random()::text), 1, 6), 'x')
  returning id into v_k;
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_res, 'Cabinet voisin', 'cab-voisin-' || substr(md5(random()::text), 1, 6), 'x')
  returning id into v_l;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_k, v_plan, 'actif');
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_l, v_plan, 'actif');
  -- L'autre cabinet a déjà sa titulaire : ce n'est pas ce qu'on éprouve ici.
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
  values (v_l, v_aut, 'owner', 'Autre titulaire');

  ------------------------------------------------------------ 1. amorçage
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role', 'authenticated')::text, true);

  -- Le revendeur ne pose qu'une invitation de titulaire.
  v_refus := false;
  begin
    insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
    values (v_k, 'dormante@exemple.test', 'therapist', now() + interval '30 days');
  exception when others then v_refus := true;
  end;
  if not v_refus then
    raise exception 'ECHEC 1a : le revendeur pose une invitation de membre dans un cabinet vide';
  end if;

  insert into public.cabinet_invitations (cabinet_id, email, role, display_name, expires_at)
  values (v_k, 'Titulaire-Equipe@exemple.test', 'owner', 'Claire Fontaine', now() + interval '30 days');

  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role', 'postgres', true);
  select display_name, role::text into v_nom, v_role
    from public.cabinet_members where cabinet_id = v_k and user_id = v_tit;
  if v_role is distinct from 'owner' then
    raise exception 'ECHEC 1b : la titulaire n''est pas entrée dans son cabinet (%)', v_role;
  end if;
  if v_nom is distinct from 'Claire Fontaine' then
    raise exception 'ECHEC 1c : le nom saisi par le revendeur est perdu (« % »)', v_nom;
  end if;

  ------------------------------------------------ 2. la titulaire invite
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);

  -- L'autrice est posée par la base, quoi qu'écrive le navigateur.
  insert into public.cabinet_invitations (cabinet_id, email, role, display_name, expires_at, invited_by, created_at)
  values (v_k, 'consoeur-equipe@exemple.test', 'therapist', 'Chloé Martin',
          now() + interval '30 days', v_aut, now() + interval '5 years')
  returning id into v_inv;

  -- Jamais une seconde titulaire.
  v_refus := false;
  begin
    insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
    values (v_k, 'co-titulaire@exemple.test', 'owner', now() + interval '30 days');
  exception when others then v_refus := true;
  end;
  if not v_refus then
    raise exception 'ECHEC 2a : une titulaire invite une seconde titulaire';
  end if;

  perform set_config('role', 'postgres', true);
  select invited_by, created_at into v_par, v_cree from public.cabinet_invitations where id = v_inv;
  if v_par is distinct from v_tit then
    raise exception 'ECHEC 2b : l''autrice de l''invitation est forgeable (%)', v_par;
  end if;
  if v_cree > now() + interval '1 minute' then
    raise exception 'ECHEC 2c : la date de création vient du navigateur (%)', v_cree;
  end if;

  --------------------------------------------- 3. la consœur est rattachée
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_con, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role', 'postgres', true);
  select display_name, role::text into v_nom, v_role
    from public.cabinet_members where cabinet_id = v_k and user_id = v_con;
  if v_role is distinct from 'therapist' then
    raise exception 'ECHEC 3a : la consœur invitée n''est pas rattachée (%)', v_role;
  end if;
  if v_nom is distinct from 'Chloé Martin' then
    raise exception 'ECHEC 3b : le nom saisi par la titulaire est perdu (« % »)', v_nom;
  end if;
  if exists (select 1 from public.cabinet_invitations where id = v_inv and accepted_at is null) then
    raise exception 'ECHEC 3c : l''invitation acceptée reste en attente';
  end if;
  if (select invited_by from public.cabinet_invitations where id = v_inv) is distinct from v_tit then
    raise exception 'ECHEC 3d : accepter une invitation en a changé l''autrice';
  end if;

  ---------------------------------------- 4. une inconnue n'entre pas
  -- Sans invitation.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_inc, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.cabinet_members where user_id = v_inc) then
    raise exception 'ECHEC 4a : une inconnue sans invitation est rattachée';
  end if;

  -- Une invitation de membre dormante, signée du revendeur (écrite ici en
  -- superutilisateur, puisque la politique la refuse désormais) : c'est la
  -- porte que 0030 a fermée, elle doit le rester. Sans jeton, la base garde
  -- l'autrice fournie : c'est ce qu'on veut ici.
  perform set_config('request.jwt.claims', '', true);
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at, invited_by)
  values (v_k, 'inconnue-equipe@exemple.test', 'therapist', now() + interval '30 days', v_rev);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_inc, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.cabinet_members where user_id = v_inc) then
    raise exception 'ECHEC 4b : une invitation dormante du revendeur rattache encore quelqu''un';
  end if;

  -- Une invitation de titulaire dans un cabinet déjà tenu.
  delete from public.cabinet_invitations where cabinet_id = v_k and lower(email) = 'inconnue-equipe@exemple.test';
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
  values (v_k, 'inconnue-equipe@exemple.test', 'owner', now() + interval '30 days');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_inc, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.cabinet_members where user_id = v_inc) then
    raise exception 'ECHEC 4c : une invitation de titulaire ouvre un cabinet déjà tenu';
  end if;

  ------------------------------------ 5. la consœur ne gère pas l'équipe
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_con, 'role', 'authenticated')::text, true);

  v_mot := public.retirer_du_cabinet(v_k, v_tit);
  if v_mot is distinct from 'pas_titulaire' then
    raise exception 'ECHEC 5a : la consœur retire la titulaire (%)', v_mot;
  end if;

  v_refus := false;
  begin
    delete from public.cabinet_members where cabinet_id = v_k and user_id = v_tit;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then
    raise exception 'ECHEC 5b : la table des membres s''écrit encore depuis le navigateur';
  end if;

  v_refus := false;
  begin
    update public.cabinet_members set role = 'owner' where cabinet_id = v_k and user_id = v_con;
  exception when insufficient_privilege then v_refus := true;
  end;
  if not v_refus then
    raise exception 'ECHEC 5c : la consœur peut se déclarer titulaire';
  end if;

  v_refus := false;
  begin
    insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
    values (v_k, 'amie-de-la-consoeur@exemple.test', 'therapist', now() + interval '30 days');
  exception when others then v_refus := true;
  end;
  if not v_refus then
    raise exception 'ECHEC 5d : une consœur invite à la place de la titulaire';
  end if;

  -- Elle voit l'équipe, adresses comprises : ce sont ses collègues.
  select count(*) into n from public.equipe_du_cabinet(v_k) e where e.email is not null;
  if n <> 2 then
    raise exception 'ECHEC 5e : la consœur voit % membre(s) avec adresse au lieu de 2', n;
  end if;

  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.cabinet_members where cabinet_id = v_k and user_id = v_tit and role = 'owner') then
    raise exception 'ECHEC 5f : la titulaire a perdu sa place';
  end if;

  -------------------------------------------- 6. un autre cabinet, rien
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_aut, 'role', 'authenticated')::text, true);

  select count(*) into n from public.equipe_du_cabinet(v_k);
  if n <> 0 then raise exception 'FUITE 6a : un autre cabinet lit % membre(s) de l''équipe', n; end if;
  select count(*) into n from public.cabinet_members where cabinet_id = v_k;
  if n <> 0 then raise exception 'FUITE 6b : un autre cabinet lit % ligne(s) de membres', n; end if;
  select count(*) into n from public.cabinet_invitations where cabinet_id = v_k;
  if n <> 0 then raise exception 'FUITE 6c : un autre cabinet lit % invitation(s)', n; end if;

  v_mot := public.retirer_du_cabinet(v_k, v_con);
  if v_mot is distinct from 'pas_titulaire' then
    raise exception 'ECHEC 6d : un autre cabinet retire une consœur (%)', v_mot;
  end if;

  v_refus := false;
  begin
    insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
    values (v_k, 'intruse@exemple.test', 'therapist', now() + interval '30 days');
  exception when others then v_refus := true;
  end;
  if not v_refus then
    raise exception 'ECHEC 6e : un autre cabinet invite dans celui-ci';
  end if;

  update public.cabinet_invitations set expires_at = now() + interval '30 days' where cabinet_id = v_k;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC 6f : un autre cabinet relance % invitation(s) d''ici', n; end if;

  -------------------------------------- 7. relancer une invitation expirée
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  insert into public.cabinet_invitations (cabinet_id, email, role, display_name, expires_at, invited_by)
  values (v_k, 'relance-equipe@exemple.test', 'therapist', 'Rose Lambert', now() - interval '1 day', v_tit)
  returning id into v_inv;

  -- Expirée : elle ne rattache personne.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ret, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.cabinet_members where user_id = v_ret) then
    raise exception 'ECHEC 7a : une invitation expirée rattache encore';
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);

  -- En poser une seconde bute sur l'index unique : c'est la relance qu'il faut.
  v_refus := false;
  begin
    insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
    values (v_k, 'relance-equipe@exemple.test', 'therapist', now() + interval '30 days');
  exception when unique_violation then v_refus := true;
  end;
  if not v_refus then
    raise exception 'ECHEC 7b : deux invitations en attente pour la même adresse';
  end if;

  -- Pas au-delà de soixante jours, même en relançant.
  v_refus := false;
  begin
    update public.cabinet_invitations set expires_at = now() + interval '90 days' where id = v_inv;
  exception when check_violation then v_refus := true;
  end;
  if not v_refus then
    raise exception 'ECHEC 7c : une relance pose une échéance à quatre-vingt-dix jours';
  end if;

  update public.cabinet_invitations set expires_at = now() + interval '30 days' where id = v_inv;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC 7d : la titulaire ne peut pas relancer (% ligne)', n; end if;

  perform set_config('role', 'postgres', true);
  select created_at, expires_at into v_cree, v_expire from public.cabinet_invitations where id = v_inv;
  if v_expire <= now() or v_cree < now() - interval '1 minute' then
    raise exception 'ECHEC 7e : la relance n''a pas repris la date (% → %)', v_cree, v_expire;
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ret, 'role', 'authenticated')::text, true);
  perform public.claim_access();
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.cabinet_members where cabinet_id = v_k and user_id = v_ret and display_name = 'Rose Lambert') then
    raise exception 'ECHEC 7f : l''invitation relancée ne rattache pas';
  end if;

  ------------------------------------------------- 8. retirer une consœur
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);

  v_mot := public.retirer_du_cabinet(v_k, v_tit);
  if v_mot is distinct from 'soi_meme' then
    raise exception 'ECHEC 8a : la titulaire peut se retirer elle-même (%)', v_mot;
  end if;

  v_mot := public.retirer_du_cabinet(v_k, v_aut);
  if v_mot is distinct from 'inconnue' then
    raise exception 'ECHEC 8b : retirer quelqu''un d''un autre cabinet répond « % »', v_mot;
  end if;

  v_mot := public.retirer_du_cabinet(v_k, v_con);
  if v_mot is distinct from 'ok' then
    raise exception 'ECHEC 8c : la titulaire ne retire pas sa consœur (%)', v_mot;
  end if;

  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.cabinet_members where cabinet_id = v_k and user_id = v_con) then
    raise exception 'ECHEC 8d : la consœur retirée est encore membre';
  end if;
  if not exists (select 1 from public.cabinet_members where cabinet_id = v_l and user_id = v_aut) then
    raise exception 'ECHEC 8e : retirer dans un cabinet a touché l''autre';
  end if;
  if not exists (select 1 from public.audit_log where cabinet_id = v_k and action = 'cabinet.membre_retire' and target_id = v_con) then
    raise exception 'ECHEC 8f : le retrait ne laisse pas de trace';
  end if;

  raise exception 'REUSSITE : amorçage nommé, consœur invitée puis rattachée sous son nom, autrice non forgeable, inconnue et invitation dormante refusées, consœur sans pouvoir sur l''équipe, cabinet voisin aveugle, relance bornée, retrait de la consœur mais jamais de soi.';
end $$;
