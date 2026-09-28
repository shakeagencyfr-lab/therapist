-- ============================================================================
-- Ce qui se retire d'une fiche, et l'adresse qui ouvre son espace (0045).
--
--   un exercice retiré  → le patient ne le voit plus, ne le coche plus, n'en
--                         annote plus, n'en passe plus le quiz ; la
--                         praticienne le voit encore
--   l'adresse           → verrouillée tant qu'un compte est rattaché ; la
--                         fonction la change en détachant le compte, et le
--                         dit ; collisions, adresses mal formées et
--                         inconnus du cabinet refusés
--   les audios          → un audio acheté ne se retire pas du compte, un
--                         audio en vente ou acheté ne se supprime pas ; un
--                         audio libre, si ; supprimer la fiche emporte tout
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : rien
-- ne persiste. Un ECHEC ou une FUITE lève avant, avec la raison.
--
--   psql "$DATABASE_URL" -f supabase/tests/parcours_et_acces.sql
-- ============================================================================

do $$
declare
  v_plan text;
  v_org uuid; v_rev uuid; v_cab uuid; v_pat uuid; v_deux uuid;
  v_m1 uuid; v_m2 uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_pr1 uuid; v_pr2 uuid;
  r jsonb; n integer; refuse boolean; etat text;
begin
  select user_id into v_rev from public.reseller_members limit 1;
  select id into v_org from public.resellers limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    ('bbbb0000-0000-4000-8000-00000000b045','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test45-praticienne@exemple.fr','',now(),now(),now()),
    ('cccc0000-0000-4000-8000-00000000c045','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test45-patient@exemple.fr','',now(),now(),now()),
    ('dddd0000-0000-4000-8000-00000000d045','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test45-intrus@exemple.fr','',now(),now(),now());

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org, 'Cabinet Test Parcours', 'cabinet-test-parcours', 'Espace thérapie') returning id into v_cab;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at) values (v_cab, 'test45-praticienne@exemple.fr', 'owner', now() + interval '1 day');

  -- ---- La praticienne ouvre deux fiches, un parcours, trois audios -------
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000b045","role":"authenticated"}',true);
  perform public.claim_access();
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, 'Test P.', 'TP', '', '', '', '', '', 'test45-patient@exemple.fr') returning id into v_pat;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, 'Deux D.', 'DD', '', '', '', '', '', null) returning id into v_deux;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position, consigne)
  values (v_cab, v_pat, 'Ancien exercice', '', 'Exercice', 0,
          '{"why":"x","quiz":[{"question":"q","options":["a","b"],"correct":0,"feedback":"f"}]}'::jsonb)
  returning id into v_m1;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, position)
  values (v_cab, v_pat, 'Exercice en cours', '', 'Exercice', 1) returning id into v_m2;
  insert into public.audio_library (cabinet_id, title, duration_seconds, storage_path) values (v_cab, 'Acheté', 600, v_cab || '/a1.mp3') returning id into v_a1;
  insert into public.audio_library (cabinet_id, title, duration_seconds, storage_path) values (v_cab, 'En vente', 600, v_cab || '/a2.mp3') returning id into v_a2;
  insert into public.audio_library (cabinet_id, title, duration_seconds, storage_path) values (v_cab, 'Libre', 600, v_cab || '/a3.mp3') returning id into v_a3;
  insert into public.patient_audios (cabinet_id, patient_id, audio_id) values (v_cab, v_pat, v_a1), (v_cab, v_pat, v_a2), (v_cab, v_pat, v_a3);
  -- a1 a été vendu puis retiré de la boutique ; a2 y est encore.
  insert into public.products (cabinet_id, title, price_cents, kind, audio_id, archived_at, is_active)
  values (v_cab, 'Audio a1', 900, 'audio', v_a1, now(), false) returning id into v_pr1;
  insert into public.products (cabinet_id, title, price_cents, kind, audio_id)
  values (v_cab, 'Audio a2', 900, 'audio', v_a2) returning id into v_pr2;

  -- La commande payée s'écrit côté serveur, pas sous la RLS du cabinet.
  perform set_config('role','none',true);
  insert into public.orders (cabinet_id, patient_id, product_id, title, amount_cents, currency, stripe_session_id, status, paid_at)
  values (v_cab, v_pat, v_pr1, 'Audio a1', 900, 'eur', 'cs_test45', 'payee', now());

  -- ---- 1. Retirer un exercice du parcours ---------------------------------
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000b045","role":"authenticated"}',true);
  update public.patient_modules set archived_at = now() where id = v_m1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC : la praticienne ne retire pas l''exercice (% ligne)', n; end if;

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"cccc0000-0000-4000-8000-00000000c045","role":"authenticated"}',true);
  perform public.claim_access();
  select count(*) into n from public.patient_modules;
  if n <> 1 then raise exception 'FUITE : le patient voit % exercice(s), dont le retiré', n; end if;

  refuse := false;
  begin perform public.patient_set_module_done(v_m1, true); exception when others then refuse := true; end;
  if not refuse then raise exception 'FUITE : le patient coche un exercice retiré'; end if;
  refuse := false;
  begin perform public.patient_save_note(v_m1, 'mot'); exception when others then refuse := true; end;
  if not refuse then raise exception 'FUITE : le patient annote un exercice retiré'; end if;
  refuse := false;
  begin
    insert into public.module_quiz_answers (module_id, question_index, answer_index) values (v_m1, 0, 0);
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : le patient répond au quiz d''un exercice retiré'; end if;

  perform public.patient_set_module_done(v_m2, true);
  insert into public.module_quiz_answers (module_id, question_index, answer_index) values (v_m2, 0, 1);

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000b045","role":"authenticated"}',true);
  select count(*) into n from public.patient_modules where patient_id = v_pat;
  if n <> 2 then raise exception 'ECHEC : la praticienne ne voit plus l''exercice retiré (% ligne(s))', n; end if;

  -- ---- 2. L'adresse d'une fiche rattachée ---------------------------------
  refuse := false;
  begin
    update public.patients set email = 'test45-ailleurs@exemple.fr' where id = v_pat;
  exception when check_violation then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC : l''adresse d''une fiche rattachée change sans détacher le compte'; end if;

  -- Changer la casse n'est pas changer d'adresse.
  update public.patients set email = 'Test45-Patient@exemple.fr' where id = v_pat;

  refuse := false;
  begin perform public.cabinet_changer_adresse(v_deux, 'TEST45-patient@exemple.fr');
  exception when unique_violation then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC : deux fiches du cabinet portent la même adresse'; end if;

  refuse := false;
  begin perform public.cabinet_changer_adresse(v_pat, 'pas-une-adresse');
  exception when check_violation then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC : une adresse mal formée est acceptée'; end if;

  refuse := false;
  begin perform public.cabinet_changer_adresse(v_pat, '  ');
  exception when check_violation then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC : une fiche activée perd son adresse'; end if;

  r := public.cabinet_changer_adresse(v_pat, ' TEST45-patient@exemple.fr ');
  if (r->>'change')::boolean then raise exception 'ECHEC : la même adresse compte pour un changement (%)', r; end if;

  r := public.cabinet_changer_adresse(v_pat, 'Test45-Nouvelle@Exemple.fr');
  if not (r->>'change')::boolean or not (r->>'detache')::boolean then
    raise exception 'ECHEC : le changement ne dit pas qu''il détache le compte (%)', r;
  end if;
  select email into etat from public.patients where id = v_pat;
  if etat is distinct from 'test45-nouvelle@exemple.fr' then raise exception 'ECHEC : adresse écrite telle quelle (%)', etat; end if;
  select count(*) into n from public.patients where id = v_pat and auth_user_id is null;
  if n <> 1 then raise exception 'ECHEC : le compte reste rattaché après le changement d''adresse'; end if;

  r := public.cabinet_changer_adresse(v_deux, 'test45-deux@exemple.fr');
  if not (r->>'change')::boolean or (r->>'detache')::boolean then
    raise exception 'ECHEC : une fiche sans compte ne prend pas son adresse simplement (%)', r;
  end if;

  perform set_config('role','none',true);
  select count(*) into n from public.audit_log
   where target_id = v_pat and action = 'patient.compte_detache';
  if n <> 1 then raise exception 'ECHEC : le détachement n''est pas journalisé'; end if;

  -- Le patient détaché ne voit plus sa fiche ; l'ancienne adresse ne la reprend pas.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"cccc0000-0000-4000-8000-00000000c045","role":"authenticated"}',true);
  perform public.claim_access();
  select count(*) into n from public.patients;
  if n <> 0 then raise exception 'FUITE : le compte détaché lit encore % fiche(s)', n; end if;

  -- Un inconnu du cabinet ne change rien.
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"dddd0000-0000-4000-8000-00000000d045","role":"authenticated"}',true);
  refuse := false;
  begin perform public.cabinet_changer_adresse(v_deux, 'test45-intrus@exemple.fr');
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'FUITE : un compte hors du cabinet change l''adresse d''une fiche'; end if;

  -- ---- 3. Les audios ------------------------------------------------------
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000b045","role":"authenticated"}',true);

  refuse := false;
  begin delete from public.patient_audios where patient_id = v_pat and audio_id = v_a1;
  exception when check_violation then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC : un audio acheté se retire du compte du patient'; end if;

  refuse := false;
  begin delete from public.audio_library where id = v_a2;
  exception when check_violation then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC : un audio en vente se supprime de la bibliothèque'; end if;

  refuse := false;
  begin delete from public.audio_library where id = v_a1;
  exception when check_violation then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC : un audio acheté se supprime de la bibliothèque'; end if;

  delete from public.patient_audios where patient_id = v_pat and audio_id = v_a3;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC : un audio libre ne se retire pas du compte (% ligne)', n; end if;
  delete from public.audio_library where id = v_a3;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC : un audio libre ne se supprime pas (% ligne)', n; end if;

  -- Supprimer la fiche emporte tout, achat compris : le verrou ne tient
  -- qu'aussi longtemps que la fiche.
  delete from public.patients where id = v_pat;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC : la fiche d''un patient qui a acheté un audio ne se supprime plus'; end if;

  -- Et le cabinet, tout entier.
  perform set_config('role','none',true);
  delete from public.cabinets where id = v_cab;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC : le cabinet ne se supprime plus'; end if;

  raise exception 'REUSSITE : un exercice retiré sort de l''espace du patient et reste au dossier ; l''adresse d''une fiche rattachée ne change qu''en détachant le compte, et la fonction le dit ; un audio acheté ou en vente ne se retire ni ne se supprime, un audio libre si. (Rien ne persiste.)';
end $$;
