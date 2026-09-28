-- ============================================================================
-- La séance se referme (0043), jouée sous les droits réels de chaque acteur.
--
--   praticienne → enregistre la captation au fil de l'eau, envoie la séance
--                 en une transaction ; un second envoi est refusé, sans module
--                 en double ni séance comptée deux fois ; une séance envoyée
--                 ne redevient pas un brouillon et ne reprend pas de verbatim ;
--                 retirer le consentement efface ce qui a été pris, et plus
--                 rien ne s'y écrit ; la purge lui est interdite
--   patient     → ne peut pas envoyer la séance de sa praticienne
--   planificateur (propriétaire) → la purge efface le verbatim des séances
--                 non envoyées de plus de sept jours, et d'elles seules ;
--                 la tâche de nuit est inscrite
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : la levée
-- annule tout ce que le bloc a écrit, comptes compris. Un ECHEC ou une FUITE
-- lève avant, avec la raison.
--
--   psql "$DATABASE_URL" -f supabase/tests/seance_refermee.sql
-- ============================================================================

do $$
declare
  v_plan text;
  v_org uuid; v_rev uuid; v_cab uuid; v_pat uuid;
  v_envoyee uuid; v_retiree uuid; v_vieille uuid; v_recente uuid;
  v_etat text;
  n integer;
  v_purgees integer;
  r record;
begin
  select user_id into v_rev from public.reseller_members limit 1;
  select id into v_org from public.resellers limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    ('bbbb0000-0000-4000-8000-00000000b043','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-praticienne-0043@exemple.fr','',now(),now(),now()),
    ('cccc0000-0000-4000-8000-00000000c043','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-patient-0043@exemple.fr','',now(),now(),now());

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_org, 'Cabinet Test 0043', 'cabinet-test-0043', 'Espace thérapie') returning id into v_cab;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at)
  values (v_cab, 'test-praticienne-0043@exemple.fr', 'owner', now() + interval '1 day');

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000b043","role":"authenticated"}',true);
  perform public.claim_access();

  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, 'Test Q.', 'TQ', '', '', '', '', '', 'test-patient-0043@exemple.fr') returning id into v_pat;

  -- 1. La captation s'enregistre au fil de la séance, avant tout brouillon.
  insert into public.therapy_sessions (cabinet_id, patient_id, status, consent_given_at)
  values (v_cab, v_pat, 'captation', now()) returning id into v_envoyee;
  update public.therapy_sessions
     set transcript = 'comment ça va', notes = 'mot du patient : la porte', duration_seconds = 60
   where id = v_envoyee;
  if not found then raise exception 'ECHEC : la captation ne s''enregistre pas sous la RLS de la praticienne'; end if;
  update public.therapy_sessions
     set draft = '{"synthese":"x","mots":[]}'::jsonb, status = 'brouillon'
   where id = v_envoyee;

  -- 2. L'envoi : deux modules, la séance close, le verbatim effacé, un de plus au compteur.
  select count(*) into n
    from public.cabinet_envoyer_seance(
      v_envoyee, v_pat, '{"synthese":"relue","mots":[]}'::jsonb,
      '[{"title":"Repérer le seuil","meta":"Ajouté depuis la séance","kind":"Journal","pourquoi":"Voir venir la vague."},
        {"title":"Ancrage court du soir","meta":"Ajouté depuis la séance","kind":"Exercice","pourquoi":""}]'::jsonb,
      '{}'::uuid[]);
  if n <> 2 then raise exception 'ECHEC : l''envoi devait créer 2 modules, il en rend %', n; end if;

  select status::text into v_etat from public.therapy_sessions
   where id = v_envoyee and sent_at is not null and transcript is null and transcript_deleted_at is not null
     and draft->>'synthese' = 'relue';
  if v_etat is distinct from 'envoye' then
    raise exception 'ECHEC : la séance envoyée devrait être close, relue et sans verbatim (état : %)', v_etat;
  end if;
  select count(*) into n from public.patient_modules where patient_id = v_pat and consigne->>'why' = 'Voir venir la vague.';
  if n <> 1 then raise exception 'ECHEC : le « pourquoi » du module devait devenir sa consigne'; end if;
  select sessions_done into n from public.patients where id = v_pat;
  if n <> 1 then raise exception 'ECHEC : la séance devait être comptée une fois, le compteur dit %', n; end if;

  -- 3. Un second envoi est refusé, et ne laisse rien derrière lui.
  begin
    perform * from public.cabinet_envoyer_seance(
      v_envoyee, v_pat, null, '[{"title":"Doublon","meta":"","kind":"Journal"}]'::jsonb, '{}'::uuid[]);
    raise exception 'ECHEC : une séance envoyée a pu être renvoyée';
  exception when sqlstate '55000' then null;
  end;
  select count(*) into n from public.patient_modules where patient_id = v_pat;
  if n <> 2 then raise exception 'ECHEC : le second envoi a laissé % module(s) au lieu de 2', n; end if;
  select sessions_done into n from public.patients where id = v_pat;
  if n <> 1 then raise exception 'ECHEC : le second envoi a compté la séance une nouvelle fois (%)', n; end if;

  -- 4. Une séance envoyée ne redevient pas un brouillon, ne reprend pas de verbatim…
  begin
    update public.therapy_sessions set status = 'brouillon', draft = '{"synthese":"y"}'::jsonb where id = v_envoyee;
    raise exception 'ECHEC : une séance envoyée est redevenue un brouillon';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.therapy_sessions set transcript = 'le verbatim revient' where id = v_envoyee;
    raise exception 'ECHEC : un verbatim a été remis dans une séance envoyée';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.therapy_sessions set sent_at = now() + interval '1 minute' where id = v_envoyee;
    raise exception 'ECHEC : une séance envoyée a pu être renvoyée par une écriture directe';
  exception when sqlstate '55000' then null;
  end;
  -- … mais sa note se corrige encore.
  update public.therapy_sessions set draft = '{"synthese":"relue deux fois","mots":[]}'::jsonb where id = v_envoyee;
  if not found then raise exception 'ECHEC : la note d''une séance envoyée ne se corrige plus'; end if;

  -- 5. Retirer le consentement efface ce qui a été pris ; plus rien ne s'y écrit.
  insert into public.therapy_sessions (cabinet_id, patient_id, status, consent_given_at, transcript, notes, draft)
  values (v_cab, v_pat, 'brouillon', now(), 'je ne veux plus', 'vigilance : fatigue', '{"synthese":"z"}'::jsonb)
  returning id into v_retiree;
  update public.therapy_sessions set consent_revoked_at = now() where id = v_retiree;
  select * into r from public.therapy_sessions where id = v_retiree;
  if r.transcript is not null or r.notes is not null or r.draft is not null
     or r.transcript_deleted_at is null or r.status <> 'archive' or r.consent_given_at is null then
    raise exception 'ECHEC : le retrait du consentement n''a pas tout effacé (ou a effacé le consentement lui-même)';
  end if;
  begin
    update public.therapy_sessions set transcript = 'reprise' where id = v_retiree;
    raise exception 'ECHEC : une séance au consentement retiré a repris une transcription';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.therapy_sessions set consent_revoked_at = null where id = v_retiree;
    raise exception 'ECHEC : un retrait de consentement a pu être annulé';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform * from public.cabinet_envoyer_seance(v_retiree, v_pat, null, '[]'::jsonb, '{}'::uuid[]);
    raise exception 'ECHEC : une séance au consentement retiré a pu être envoyée';
  exception when sqlstate '55000' then null;
  end;

  -- 6. Deux séances abandonnées, l'une de huit jours, l'autre de deux.
  insert into public.therapy_sessions (cabinet_id, patient_id, status, consent_given_at, transcript, notes, draft, created_at)
  values (v_cab, v_pat, 'captation', now() - interval '8 days', 'ancien verbatim', 'ma note', null, now() - interval '8 days')
  returning id into v_vieille;
  insert into public.therapy_sessions (cabinet_id, patient_id, status, consent_given_at, transcript, draft, created_at)
  values (v_cab, v_pat, 'brouillon', now() - interval '2 days', 'verbatim récent', '{"synthese":"à relire"}'::jsonb, now() - interval '2 days')
  returning id into v_recente;

  -- La purge n'est pas à portée de la praticienne.
  begin
    perform public.purger_transcriptions_abandonnees();
    raise exception 'FUITE : la praticienne peut déclencher la purge';
  exception when insufficient_privilege then null;
  end;

  -- 7. Le patient ne peut pas envoyer la séance de sa praticienne.
  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"cccc0000-0000-4000-8000-00000000c043","role":"authenticated"}',true);
  perform public.claim_access();
  begin
    perform * from public.cabinet_envoyer_seance(v_recente, v_pat, null, '[]'::jsonb, '{}'::uuid[]);
    raise exception 'FUITE : le patient a pu envoyer une séance';
  exception when sqlstate 'P0002' then null;
  end;

  -- 8. Le planificateur : la vieille séance perd son verbatim, la récente le garde.
  perform set_config('role','none',true);
  perform set_config('request.jwt.claims','',true);
  v_purgees := public.purger_transcriptions_abandonnees();
  if v_purgees < 1 then raise exception 'ECHEC : la purge n''a rien effacé'; end if;
  select * into r from public.therapy_sessions where id = v_vieille;
  if r.transcript is not null or r.transcript_deleted_at is null then
    raise exception 'ECHEC : le verbatim d''une séance abandonnée depuis huit jours a survécu à la purge';
  end if;
  if r.notes is distinct from 'ma note' then
    raise exception 'ECHEC : la purge a effacé les notes de la thérapeute, elle ne devait prendre que le verbatim';
  end if;
  select * into r from public.therapy_sessions where id = v_recente;
  if r.transcript is null or r.draft is null then
    raise exception 'ECHEC : la purge a pris une séance de deux jours, encore en cours de rédaction';
  end if;

  select count(*) into n from cron.job
   where jobname = 'klaro-purge-transcriptions' and command like '%purger_transcriptions_abandonnees%';
  if n <> 1 then raise exception 'ECHEC : la purge de nuit n''est pas inscrite au planificateur'; end if;

  raise exception 'REUSSITE : captation enregistrée au fil de l''eau ; envoi en une transaction (2 modules, verbatim effacé, séance comptée une fois) ; second envoi, retour en brouillon et verbatim remis refusés ; retrait du consentement : tout effacé, rien ne se réécrit, envoi refusé ; purge interdite à la praticienne et au patient refusé l''envoi ; la purge de nuit prend le verbatim de plus de sept jours et lui seul (%). (Rien ne persiste.)', v_purgees;
end $$;
