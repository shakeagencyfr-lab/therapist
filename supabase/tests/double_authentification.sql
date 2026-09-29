-- ============================================================================
-- 0056 éprouvée contre la vraie base : le second facteur garde le dossier.
--
--   structure     is_cabinet_member() et est_titulaire_du_cabinet() lisent
--                 le niveau du jeton et les facteurs du compte — une
--                 migration qui les réécrirait sans cette condition
--                 rouvrirait le dossier en « aal1 » ; le rôle authentifié
--                 garde le droit de les appeler (les politiques en ont
--                 besoin)
--   facteur vérifié, aal1   la praticienne n'est plus membre : aucune fiche,
--                 aucune séance, aucune écriture, ni équipe, ni invitation,
--                 ni changement d'adresse d'un patient
--   facteur vérifié, aal2   tout revient
--   jeton sans aal          vaut aal1
--   facteur non vérifié     (inscription abandonnée) ne ferme rien
--   sans facteur            une consœur en aal1 voit tout, comme avant
--   côté patient            inchangé : un patient — même muni d'un facteur —
--                 lit sa fiche en aal1 ; l'espace patient ne demande pas de
--                 code
--
-- Le bloc fabrique son revendeur, son cabinet (abonnement actif), ses comptes
-- @exemple.test et leurs facteurs, puis ANNULE tout par l'exception finale :
-- rien ne subsiste, même en cas de réussite.
--
--   psql "$DATABASE_URL" -f supabase/tests/double_authentification.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_plan text; v_cab uuid;
  v_titulaire uuid := gen_random_uuid();
  v_consoeur uuid := gen_random_uuid();
  v_uid_pat uuid := gen_random_uuid();
  v_pat uuid; v_seance uuid;
  n int; v_ok boolean; v_def text;
begin
  -- ── 0. Structure ────────────────────────────────────────────────────────
  v_def := pg_get_functiondef('public.is_cabinet_member(uuid)'::regprocedure);
  if v_def !~ 'auth\.mfa_factors' or v_def !~ 'aal2' then
    raise exception 'ECHEC 0a : is_cabinet_member() n''exige plus le second facteur';
  end if;
  v_def := pg_get_functiondef('public.est_titulaire_du_cabinet(uuid)'::regprocedure);
  if v_def !~ 'auth\.mfa_factors' or v_def !~ 'aal2' then
    raise exception 'ECHEC 0b : est_titulaire_du_cabinet() n''exige plus le second facteur';
  end if;
  if not has_function_privilege('authenticated', 'public.is_cabinet_member(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.est_titulaire_du_cabinet(uuid)', 'execute') then
    raise exception 'ECHEC 0c : le rôle authentifié a perdu le droit d''appeler les fonctions d''appartenance';
  end if;

  -- ── Ce qu'il faut pour éprouver ─────────────────────────────────────────
  insert into public.resellers (name, slug) values ('Revendeur 0056', 'revendeur-0056-t') returning id into v_rev;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet 0056', 'cabinet-0056-t', 'x') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at) values
    (v_titulaire, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'titulaire-0056@exemple.test', '', now(), now(), now()),
    (v_consoeur, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'consoeur-0056@exemple.test', '', now(), now(), now()),
    (v_uid_pat, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patient-0056@exemple.test', '', now(), now(), now());
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
    (v_cab, v_titulaire, 'owner', 'Titulaire 0056'),
    (v_cab, v_consoeur, 'therapist', 'Consœur 0056');

  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_uid_pat, 'patient-0056@exemple.test', 'Camille', 'C', '', '', '', '', '')
  returning id into v_pat;
  insert into public.therapy_sessions (cabinet_id, patient_id) values (v_cab, v_pat) returning id into v_seance;

  -- La titulaire a activé la double authentification ; le patient aussi
  -- (un compte de patient n'a pas d'écran pour le faire, mais rien ne
  -- l'interdit au service : la base ne doit pas pour autant lui fermer sa
  -- fiche).
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret) values
    (gen_random_uuid(), v_titulaire, 'Klaro 0056', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP'),
    (gen_random_uuid(), v_uid_pat, 'Klaro 0056 patient', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
  -- La consœur a commencé une inscription sans jamais donner le premier code.
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret) values
    (gen_random_uuid(), v_consoeur, 'Klaro 0056 abandon', 'totp', 'unverified', now(), now(), 'JBSWY3DPEHPK3PXP');

  -- ── 1. Facteur vérifié, session aal1 : la porte est fermée ──────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_titulaire, 'role', 'authenticated', 'aal', 'aal1')::text, true);

  if public.is_cabinet_member(v_cab) then
    raise exception 'ECHEC 1a : membre du cabinet en aal1 malgré un facteur vérifié';
  end if;
  select count(*) into n from public.patients where cabinet_id = v_cab;
  if n <> 0 then raise exception 'ECHEC 1b : % fiche(s) lue(s) en aal1', n; end if;
  select count(*) into n from public.therapy_sessions where cabinet_id = v_cab;
  if n <> 0 then raise exception 'ECHEC 1c : % séance(s) lue(s) en aal1', n; end if;
  select count(*) into n from public.equipe_du_cabinet(v_cab);
  if n <> 0 then raise exception 'ECHEC 1d : l''équipe se lit en aal1 (% ligne(s))', n; end if;

  v_ok := false;
  begin
    insert into public.therapy_sessions (cabinet_id, patient_id) values (v_cab, v_pat);
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'ECHEC 1e : une séance s''écrit en aal1'; end if;

  v_ok := false;
  begin
    insert into public.cabinet_invitations (cabinet_id, email, role)
    values (v_cab, 'complice-0056@exemple.test', 'therapist');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'ECHEC 1f : une invitation d''équipe se pose en aal1'; end if;

  v_ok := false;
  begin
    perform public.cabinet_changer_adresse(v_pat, 'ailleurs-0056@exemple.test');
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then raise exception 'ECHEC 1g : l''adresse d''un patient se change en aal1'; end if;

  if public.retirer_du_cabinet(v_cab, v_consoeur) <> 'pas_titulaire' then
    raise exception 'ECHEC 1h : une consœur se retire en aal1';
  end if;

  -- ── 2. Jeton sans aal : c'est de l'aal1 ─────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_titulaire, 'role', 'authenticated')::text, true);
  if public.is_cabinet_member(v_cab) then
    raise exception 'ECHEC 2 : un jeton sans aal vaut aal2';
  end if;

  -- ── 3. Le code donné (aal2) : tout revient ──────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_titulaire, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  if not public.is_cabinet_member(v_cab) then
    raise exception 'ECHEC 3a : la titulaire n''est pas membre en aal2';
  end if;
  select count(*) into n from public.patients where cabinet_id = v_cab;
  if n <> 1 then raise exception 'ECHEC 3b : % fiche(s) en aal2 au lieu d''une', n; end if;
  select count(*) into n from public.equipe_du_cabinet(v_cab);
  if n <> 2 then raise exception 'ECHEC 3c : % membre(s) d''équipe en aal2 au lieu de deux', n; end if;
  insert into public.cabinet_invitations (cabinet_id, email, role)
  values (v_cab, 'consoeur-bis-0056@exemple.test', 'therapist');
  insert into public.therapy_sessions (cabinet_id, patient_id) values (v_cab, v_pat);

  -- ── 4. Facteur non vérifié : rien ne change ─────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_consoeur, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if not public.is_cabinet_member(v_cab) then
    raise exception 'ECHEC 4a : une inscription abandonnée ferme le cabinet';
  end if;
  select count(*) into n from public.patients where cabinet_id = v_cab;
  if n <> 1 then raise exception 'ECHEC 4b : la consœur sans facteur vérifié lit % fiche(s)', n; end if;
  select count(*) into n from public.therapy_sessions where cabinet_id = v_cab;
  if n <> 2 then raise exception 'ECHEC 4c : la consœur lit % séance(s) au lieu de deux', n; end if;

  -- ── 5. Côté patient : inchangé, facteur ou non ──────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid_pat, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.patients where id = v_pat;
  if n <> 1 then raise exception 'ECHEC 5a : le patient ne lit plus sa fiche en aal1'; end if;
  if not public.is_patient_record(v_pat) then
    raise exception 'ECHEC 5b : is_patient_record() ferme la fiche en aal1';
  end if;
  if public.is_cabinet_member(v_cab) then
    raise exception 'ECHEC 5c : le patient passe pour membre du cabinet';
  end if;

  perform set_config('role', 'postgres', true);
  raise exception 'REUSSITE : un facteur vérifié ferme le cabinet en aal1 — fiches, séances, équipe, invitations, adresses — et le rouvre en aal2 ; sans facteur, ou côté patient, rien ne change';
end;
$$;
