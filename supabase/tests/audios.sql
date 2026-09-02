-- ============================================================================
-- Les audios, sous les droits réels des patientes (migration 0012).
--
--   praticienne → catalogue un audio, l'envoie à une patiente
--   cette patiente → lit le titre et la durée de son audio
--   une autre patiente du même cabinet → ne voit rien de la bibliothèque
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : rien
-- ne persiste. Un ECHEC ou une FUITE lève avant, avec la raison.
--
--   psql "$DATABASE_URL" -f supabase/tests/audios.sql
-- ============================================================================

do $$
declare
  v_org uuid; v_rev uuid; v_cab uuid; v_pat uuid; v_autre uuid; v_audio uuid;
  n integer; t text;
begin
  select user_id into v_rev from public.reseller_members limit 1;
  select id into v_org from public.resellers limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    ('bbbb0000-0000-4000-8000-00000000b012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test12-praticienne@exemple.fr','',now(),now(),now()),
    ('cccc0000-0000-4000-8000-00000000c012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test12-patiente@exemple.fr','',now(),now(),now()),
    ('dddd0000-0000-4000-8000-00000000d012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test12-autre@exemple.fr','',now(),now(),now());

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org, 'Cabinet Test Audio', 'cabinet-test-audio', 'Espace thérapie') returning id into v_cab;
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at) values (v_cab, 'test12-praticienne@exemple.fr', 'owner', now() + interval '1 day');

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000b012","role":"authenticated"}',true);
  perform public.claim_access();
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, 'Test P.', 'TP', '', '', '', '', '', 'test12-patiente@exemple.fr') returning id into v_pat;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question, email)
  values (v_cab, 'Autre A.', 'AA', '', '', '', '', '', 'test12-autre@exemple.fr') returning id into v_autre;
  insert into public.audio_library (cabinet_id, title, duration_seconds, storage_path)
  values (v_cab, 'Ancrage du soir', 600, v_cab || '/test.mp3') returning id into v_audio;
  insert into public.patient_audios (cabinet_id, patient_id, audio_id) values (v_cab, v_pat, v_audio);

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"cccc0000-0000-4000-8000-00000000c012","role":"authenticated"}',true);
  perform public.claim_access();
  select al.title into t from public.patient_audios pa join public.audio_library al on al.id = pa.audio_id;
  if t is distinct from 'Ancrage du soir' then raise exception 'ECHEC : la patiente ne lit pas le titre de son audio (%)', t; end if;

  perform set_config('role','none',true);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"dddd0000-0000-4000-8000-00000000d012","role":"authenticated"}',true);
  perform public.claim_access();
  select count(*) into n from public.audio_library;
  if n <> 0 then raise exception 'FUITE : une patiente sans cet audio voit % ligne(s) de la bibliothèque', n; end if;

  raise exception 'REUSSITE : la patiente lit le titre de l''audio qui lui est envoyé ; une autre patiente du même cabinet ne voit rien de la bibliothèque. (Rien ne persiste.)';
end $$;
