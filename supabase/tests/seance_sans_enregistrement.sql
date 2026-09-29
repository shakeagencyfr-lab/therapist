-- Une séance ouverte SANS enregistrement, éprouvée contre la vraie base :
-- aucune date de consentement, des notes qui s'enregistrent, une
-- transcription refusée (therapy_sessions_transcript_needs_consent, 0002),
-- et un envoi au dossier comme les autres (cabinet_envoyer_seance, 0043).
--
-- Un bloc, ANNULÉ par l'exception finale : rien ne subsiste.
do $$
declare
  v_suf text := substr(md5(random()::text), 1, 8);
  v_ther uuid := gen_random_uuid();
  v_res uuid; v_plan text; v_cab uuid; v_fiche uuid; v_seance uuid; v_n int; v_sent timestamptz;
begin
  select code, reseller_id into v_plan, v_res from public.plans where max_patients is null limit 1;
  if v_plan is null then select code, reseller_id into v_plan, v_res from public.plans order by position desc limit 1; end if;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (v_ther, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sans-enr-' || v_suf || '@exemple.test', '', now(), now(), now());
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet sans enr', 'cab-sans-' || v_suf, 'x') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values (v_cab, v_ther, 'owner', 'P');
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Anna', 'A', '', '', '', '', '') returning id into v_fiche;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated', 'aal', 'aal1')::text, true);

  insert into public.therapy_sessions (cabinet_id, patient_id, status, consent_given_at)
  values (v_cab, v_fiche, 'captation', null) returning id into v_seance;

  update public.therapy_sessions set notes = 'Notes seules', duration_seconds = 0 where id = v_seance;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC 1 : les notes ne s''enregistrent pas'; end if;

  begin
    update public.therapy_sessions set transcript = 'parole' where id = v_seance;
    raise exception 'ECHEC 2 : une transcription entre dans une séance sans consentement';
  exception when check_violation then null;
  end;

  update public.therapy_sessions set draft = '{"synthese":"S","mots":[],"themes":[],"propositions":[],"questions":[],"vigilance":[],"categories_audio":[],"message":"M"}'::jsonb, status = 'brouillon' where id = v_seance;
  perform public.cabinet_envoyer_seance(v_seance, v_fiche, '{"synthese":"S","mots":[],"themes":[],"propositions":[],"questions":[],"vigilance":[],"categories_audio":[],"message":"M"}'::jsonb, '[]'::jsonb, '{}'::uuid[]);
  select sent_at into v_sent from public.therapy_sessions where id = v_seance;
  if v_sent is null then raise exception 'ECHEC 3 : la séance sans enregistrement ne s''envoie pas'; end if;

  raise exception 'REUSSITE : ouverte sans consentement, notes enregistrées, transcription refusée, séance envoyée';
end $$;
