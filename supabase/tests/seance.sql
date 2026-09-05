-- ============================================================================
-- La séance, jouée sous les droits réels de chaque acteur.
--
--   praticienne → signe le consentement (la séance s'ouvre, horodatée),
--                 conserve le brouillon, envoie deux modules, clôt, versionne
--                 le profil
--   patient    → voit ses deux modules ; ne voit ni séance ni profil
--   revendeur   → ne voit ni séance ni module
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : la
-- levée annule tout ce que le bloc a écrit, comptes compris. Rien ne
-- persiste, et le message dit ce qui a été vérifié. Un ECHEC ou une FUITE
-- lève avant, avec la raison.
--
--   psql "$DATABASE_URL" -f supabase/tests/seance.sql
-- ============================================================================

do $$
declare
  v_plan text;
  v_org uuid; v_rev uuid; v_cab uuid; v_pat uuid; v_seance uuid;
  n integer; v_pos integer;
begin
  -- Tout ce que le scénario doit connaître se lit AVANT la première bascule.
  select user_id into v_rev from public.reseller_members limit 1;
  select id into v_org from public.resellers limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    ('bbbb0000-0000-4000-8000-00000000b002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-praticienne@exemple.fr','',now(),now(),now()),
    ('cccc0000-0000-4000-8000-00000000c003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-patient@exemple.fr','',now(),now(),now());

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org, 'Cabinet Test Séance', 'cabinet-test-seance', 'Espace thérapie') returning id into v_cab;
  /* Depuis 0035, une fiche ne s'ouvre pas dans un cabinet sans contrat. Le
     témoin en reçoit un actif : ce n'est pas ce qu'on éprouve ici. */
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');

  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at) values (v_cab, 'test-praticienne@exemple.fr', 'owner', now() + interval '1 day');

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000b002","role":"authenticated"}',true);
  perform public.claim_access();

  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, 'Test P.', 'TP', '', '', '', '', '', 'test-patient@exemple.fr') returning id into v_pat;

  -- 1. Consentement : la séance s'ouvre.
  insert into public.therapy_sessions (cabinet_id, patient_id, status, consent_given_at)
  values (v_cab, v_pat, 'captation', now()) returning id into v_seance;

  -- 2. Brouillon.
  update public.therapy_sessions
     set transcript = 'comment ça va\nmieux mais jeudi', notes = 'mot du patient : la porte',
         duration_seconds = 1200, draft = '{"synthese":"x","mots":[]}'::jsonb, status = 'brouillon'
   where id = v_seance;
  if not found then raise exception 'ECHEC : le brouillon ne s''enregistre pas sous la RLS de la praticienne'; end if;

  -- 3. Envoi.
  select coalesce(max(position), -1) + 1 into v_pos from public.patient_modules where patient_id = v_pat;
  insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, source, position)
  values (v_cab, v_pat, 'Repérer le seuil', 'Ajouté depuis la séance', 'Journal', 'seance', v_pos),
         (v_cab, v_pat, 'Ancrage court du soir', 'Ajouté depuis la séance', 'Exercice', 'seance', v_pos + 1);
  update public.therapy_sessions set sent_at = now(), status = 'envoye' where id = v_seance;
  update public.patients set sessions_done = sessions_done + 1 where id = v_pat;
  insert into public.psych_profiles (cabinet_id, patient_id, version, sessions_count, portrait, axes, levers, care, resume, source_session_id)
  values (v_cab, v_pat, 1, 1, 'portrait', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'résumé', v_seance);

  select count(*) into n from public.therapy_sessions where patient_id = v_pat and status = 'envoye' and consent_given_at is not null and sent_at is not null;
  if n <> 1 then raise exception 'ECHEC : la séance envoyée est introuvable pour la praticienne (%)', n; end if;

  -- 4. Le patient : ses modules oui, la séance non.
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"cccc0000-0000-4000-8000-00000000c003","role":"authenticated"}',true);
  perform public.claim_access();
  select count(*) into n from public.patient_modules where source = 'seance';
  if n <> 2 then raise exception 'ECHEC : le patient devrait voir ses 2 modules de séance, il en voit %', n; end if;
  select count(*) into n from public.therapy_sessions;
  if n <> 0 then raise exception 'FUITE : le patient voit % séance(s) de thérapie', n; end if;
  select count(*) into n from public.psych_profiles;
  if n <> 0 then raise exception 'FUITE : le patient voit % profil(s)', n; end if;

  -- 5. Le revendeur : rien de tout cela.
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  select count(*) into n from public.therapy_sessions;
  if n <> 0 then raise exception 'FUITE : le revendeur voit % séance(s)', n; end if;
  select count(*) into n from public.patient_modules;
  if n <> 0 then raise exception 'FUITE : le revendeur voit % module(s)', n; end if;

  raise exception 'REUSSITE : séance ouverte au consentement, brouillon conservé, 2 modules livrés au patient, profil versionné ; patient et revendeur ne voient aucune séance. (Rien ne persiste.)';
end $$;
