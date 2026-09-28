-- ============================================================================
-- Le dossier se relit, s'annote, s'exporte et se facture (migration 0053),
-- joué sous les droits réels de chaque acteur.
--
--   praticienne   → écrit l'anamnèse et des notes datées, signées par la
--                   base ; renseigne son identité de facturation ; émet des
--                   notes d'honoraires numérotées sans trou, depuis une séance
--                   envoyée ou sans séance ; ne peut ni écrire, ni réécrire,
--                   ni effacer une note elle-même ; annule sans trouer ;
--                   trace un export sans qu'aucun contenu n'entre au journal
--   patient       → ne lit rien de tout cela, n'écrit rien, n'émet rien
--   revendeur     → ne lit rien, n'émet rien, n'annule rien
--   autre cabinet → ne lit rien, ne modifie rien, n'émet rien sur ces fiches
--   anonyme       → aucun droit sur ces tables
--   fiche supprimée → l'anamnèse et les notes partent avec elle ; les notes
--                   d'honoraires restent, détachées, avec le nom imprimé
--
-- Un seul bloc DO qui se termine par RAISE EXCEPTION 'REUSSITE …' : la levée
-- annule tout ce que le bloc a écrit, comptes compris. Un ECHEC ou une FUITE
-- lève avant, avec la raison.
--
--   psql "$DATABASE_URL" -f supabase/tests/dossier.sql
-- ============================================================================

do $$
declare
  v_praticienne uuid := 'bbbb0000-0000-4000-8000-0000000053a1';
  v_voisine     uuid := 'bbbb0000-0000-4000-8000-0000000053b1';
  v_compte      uuid := 'cccc0000-0000-4000-8000-0000000053c1';
  v_vendeur     uuid := 'dddd0000-0000-4000-8000-0000000053d1';
  v_plan text; v_org uuid; v_cab uuid; v_voisin uuid;
  v_fiche uuid; v_fiche_voisine uuid;
  v_envoyee uuid; v_ouverte uuid;
  v_note_datee uuid;
  v_n1 public.notes_honoraires; v_n2 public.notes_honoraires; v_n3 public.notes_honoraires;
  v_annulee public.notes_honoraires;
  v_auteur uuid; v_liste text; v_etat text;
  n integer;
  refuse boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
    (v_praticienne,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','test53-praticienne@exemple.test','',now(),now(),now()),
    (v_voisine,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated','test53-voisine@exemple.test','',now(),now(),now()),
    (v_compte,     '00000000-0000-0000-0000-000000000000','authenticated','authenticated','test53-patient@exemple.test','',now(),now(),now()),
    (v_vendeur,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated','test53-revendeur@exemple.test','',now(),now(),now());

  insert into public.resellers (name, slug) values ('Revendeur 0053', 'revendeur-0053') returning id into v_org;
  insert into public.reseller_members (reseller_id, user_id, role) values (v_org, v_vendeur, 'owner');
  insert into public.cabinets (reseller_id, name, slug) values (v_org, 'Cabinet 0053', 'cabinet-0053') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug) values (v_org, 'Cabinet voisin 0053', 'cabinet-voisin-0053') returning id into v_voisin;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif'), (v_voisin, v_plan, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
    (v_cab, v_praticienne, 'owner', 'Praticienne 0053'),
    (v_voisin, v_voisine, 'owner', 'Voisine 0053');

  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_compte, 'test53-patient@exemple.test', 'Camille Test', 'CT', '', '', '', '', '')
  returning id into v_fiche;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_voisin, 'Fiche voisine', 'FV', '', '', '', '', '')
  returning id into v_fiche_voisine;

  -- Une séance envoyée, une séance ouverte et jamais envoyée.
  insert into public.therapy_sessions (cabinet_id, patient_id, status, consent_given_at, occurred_at, sent_at, draft)
  values (v_cab, v_fiche, 'envoye', now() - interval '3 days', now() - interval '3 days', now() - interval '3 days',
          '{"synthese":"relue","mots":["la porte"]}'::jsonb)
  returning id into v_envoyee;
  insert into public.therapy_sessions (cabinet_id, patient_id, status, consent_given_at)
  values (v_cab, v_fiche, 'captation', now())
  returning id into v_ouverte;

  ------------------------------------------------------------ 1. praticienne
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_praticienne, 'role','authenticated')::text, true);

  -- 1a. L'anamnèse s'écrit, signée par la base — le cabinet déclaré ne compte pas.
  insert into public.dossier_anamneses (patient_id, cabinet_id, motif, contre_indications, modifiee_par)
  values (v_fiche, v_voisin, 'Arrêt du tabac', 'Épilepsie évoquée par sa mère : à vérifier', v_voisine);
  select modifiee_par into v_auteur from public.dossier_anamneses where patient_id = v_fiche and cabinet_id = v_cab;
  if v_auteur is distinct from v_praticienne then
    raise exception 'ECHEC 1a : l''anamnèse n''est pas signée par qui l''écrit (% au lieu de %)', v_auteur, v_praticienne;
  end if;
  update public.dossier_anamneses set traitements = 'Aucun' where patient_id = v_fiche;
  if not found then raise exception 'ECHEC 1a : l''anamnèse ne se met pas à jour'; end if;

  -- 1b. Une note datée : l'auteur se pose, ne se choisit pas, ne se réécrit pas.
  insert into public.dossier_notes (patient_id, cabinet_id, le, texte, auteur)
  values (v_fiche, v_cab, current_date - 1, 'Appel de la patiente : séance déplacée.', v_voisine)
  returning id into v_note_datee;
  update public.dossier_notes set texte = 'Appel : séance déplacée au jeudi.', auteur = v_voisine where id = v_note_datee;
  select auteur into v_auteur from public.dossier_notes where id = v_note_datee;
  if v_auteur is distinct from v_praticienne then
    raise exception 'ECHEC 1b : l''auteur d''une note datée se choisit ou se réécrit (%)', v_auteur;
  end if;

  -- 1c. Rien ne s'écrit pour la fiche d'un autre cabinet.
  refuse := false;
  begin
    insert into public.dossier_notes (patient_id, cabinet_id, texte) values (v_fiche_voisine, v_cab, 'intrusion');
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 1c : une note s''écrit dans la fiche d''un autre cabinet'; end if;
  refuse := false;
  begin
    insert into public.dossier_anamneses (patient_id, cabinet_id, motif) values (v_fiche_voisine, v_cab, 'intrusion');
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 1c : une anamnèse s''écrit dans la fiche d''un autre cabinet'; end if;

  -- 1d. Pas d'identité, pas de note.
  refuse := false;
  begin
    perform public.cabinet_emettre_note_honoraires(v_fiche, v_envoyee, null, 'Séance d''hypnose', 6000, 'art-261-4-1');
  exception when invalid_parameter_value then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC 1d : une note part sans identité de facturation'; end if;

  insert into public.cabinet_facturation (cabinet_id, praticien, adresse, numero_pro)
  values (v_cab, 'Camille Praticienne', '3 rue des Lilas, 75011 Paris', 'SIRET 123 456 789 00012');

  -- 1e. Une séance non envoyée ne se facture pas depuis l'historique.
  refuse := false;
  begin
    perform public.cabinet_emettre_note_honoraires(v_fiche, v_ouverte, null, 'Séance d''hypnose', 6000, 'art-261-4-1');
  exception when object_not_in_prerequisite_state then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC 1e : une séance non envoyée reçoit une note'; end if;

  -- 1f. La séance envoyée : n° 1, à sa date, identité figée ; pas de seconde note.
  select * into v_n1 from public.cabinet_emettre_note_honoraires(v_fiche, v_envoyee, null, 'Séance d''hypnose', 6000, 'art-261-4-1');
  if v_n1.numero <> 1 or v_n1.cabinet_id <> v_cab or v_n1.beneficiaire <> 'Camille Test'
     or v_n1.praticien <> 'Camille Praticienne' or v_n1.emise_par <> v_praticienne
     or v_n1.date_prestation <> ((now() - interval '3 days') at time zone 'Europe/Paris')::date then
    raise exception 'ECHEC 1f : première note mal formée (n° %, date %)', v_n1.numero, v_n1.date_prestation;
  end if;
  refuse := false;
  begin
    perform public.cabinet_emettre_note_honoraires(v_fiche, v_envoyee, null, 'Séance d''hypnose', 6000, null);
  exception when unique_violation then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC 1f : une séance reçoit deux notes en cours'; end if;

  -- 1g. Sans séance : à une date passée, n° 2 ; jamais dans le futur ; montant borné.
  select * into v_n2 from public.cabinet_emettre_note_honoraires(v_fiche, null, current_date - 7, 'Séance d''hypnose', 5500, null);
  if v_n2.numero <> 2 or v_n2.session_id is not null or v_n2.mention_tva is not null then
    raise exception 'ECHEC 1g : note sans séance mal formée (n° %)', v_n2.numero;
  end if;
  refuse := false;
  begin
    perform public.cabinet_emettre_note_honoraires(v_fiche, null, current_date + 30, 'Séance d''hypnose', 5500, null);
  exception when invalid_parameter_value then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC 1g : une note se date dans le futur'; end if;
  refuse := false;
  begin
    perform public.cabinet_emettre_note_honoraires(v_fiche, null, current_date, 'Séance d''hypnose', 0, null);
  exception when invalid_parameter_value then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC 1g : une note à zéro euro s''émet'; end if;

  -- 1h. Le navigateur n'écrit, ne réécrit ni n'efface aucune note.
  refuse := false;
  begin
    insert into public.notes_honoraires (cabinet_id, numero, date_prestation, prestation, montant_cents,
                                         praticien, praticien_adresse, praticien_numero, beneficiaire)
    values (v_cab, 99, current_date, 'x', 100, 'x', 'x', 'x', 'x');
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 1h : une note d''honoraires s''insère à la main'; end if;
  refuse := false;
  begin
    update public.notes_honoraires set montant_cents = 1 where id = v_n1.id;
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 1h : le montant d''une note émise se réécrit'; end if;
  refuse := false;
  begin
    delete from public.notes_honoraires where id = v_n2.id;
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 1h : une note émise s''efface'; end if;

  -- 1i. Annuler garde le numéro ; la séance peut recevoir une nouvelle note, n° 3.
  select * into v_annulee from public.cabinet_annuler_note_honoraires(v_n1.id);
  if v_annulee.annulee_le is null or v_annulee.numero <> 1 then
    raise exception 'ECHEC 1i : l''annulation n''est pas posée';
  end if;
  select * into v_n3 from public.cabinet_emettre_note_honoraires(v_fiche, v_envoyee, null, 'Séance d''hypnose', 6500, 'art-293-b');
  if v_n3.numero <> 3 then raise exception 'ECHEC 1i : la numérotation se troue ou recule (n° %)', v_n3.numero; end if;
  select string_agg(numero::text, ',' order by numero) into v_liste from public.notes_honoraires where cabinet_id = v_cab;
  if v_liste <> '1,2,3' then raise exception 'ECHEC 1i : la suite des numéros est %', v_liste; end if;

  -- 1j. L'export se trace ; le journal ne garde que des faits.
  perform public.cabinet_tracer_export(v_fiche);
  select count(*) into n from public.audit_log
   where cabinet_id = v_cab and action = 'dossier.exporte' and target_id = v_fiche and meta = '{}'::jsonb;
  if n <> 1 then raise exception 'ECHEC 1j : l''export n''est pas tracé (%)', n; end if;
  select string_agg(distinct k, ',') into v_liste
    from public.audit_log l, jsonb_object_keys(l.meta) k
   where l.cabinet_id = v_cab and l.action like 'honoraires.%';
  if v_liste is distinct from 'numero' then
    raise exception 'FUITE 1j : le journal garde autre chose que le numéro d''une note (%)', v_liste;
  end if;
  select count(*) into n from public.audit_log where cabinet_id = v_cab and action like 'honoraires.%';
  if n <> 4 then raise exception 'ECHEC 1j : % lignes de journal pour 3 émissions et 1 annulation', n; end if;

  -- 1k. Elle relit tout ce qu'elle a écrit.
  select count(*) into n from public.dossier_anamneses; if n <> 1 then raise exception 'ECHEC 1k : anamnèses lues : %', n; end if;
  select count(*) into n from public.dossier_notes;     if n <> 1 then raise exception 'ECHEC 1k : notes lues : %', n; end if;
  select count(*) into n from public.notes_honoraires;  if n <> 3 then raise exception 'ECHEC 1k : notes d''honoraires lues : %', n; end if;
  select count(*) into n from public.cabinet_facturation; if n <> 1 then raise exception 'ECHEC 1k : identité lue : %', n; end if;

  --------------------------------------------------------------- 2. patient
  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role','authenticated')::text, true);
  select count(*) into n from public.patients where id = v_fiche;
  if n <> 1 then raise exception 'ECHEC 2 : le patient ne lit plus sa propre fiche'; end if;
  select (select count(*) from public.dossier_anamneses) + (select count(*) from public.dossier_notes)
       + (select count(*) from public.notes_honoraires) + (select count(*) from public.cabinet_facturation)
    into n;
  if n <> 0 then raise exception 'FUITE 2 : le patient lit % lignes du dossier de sa praticienne', n; end if;
  refuse := false;
  begin
    insert into public.dossier_notes (patient_id, cabinet_id, texte) values (v_fiche, v_cab, 'écrit par le patient');
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 2 : le patient écrit dans les notes de sa praticienne'; end if;
  refuse := false;
  begin
    perform public.cabinet_emettre_note_honoraires(v_fiche, null, current_date, 'x', 100, null);
  exception when no_data_found then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 2 : le patient émet une note d''honoraires'; end if;
  refuse := false;
  begin
    perform public.cabinet_tracer_export(v_fiche);
  exception when no_data_found then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 2 : le patient écrit au journal d''accès de sa praticienne'; end if;

  ------------------------------------------------------------- 3. revendeur
  perform set_config('request.jwt.claims', json_build_object('sub', v_vendeur, 'role','authenticated')::text, true);
  select count(*) into n from public.cabinets where id = v_cab;
  if n <> 1 then raise exception 'ECHEC 3 : le revendeur ne voit plus son cabinet (l''épreuve ne prouverait rien)'; end if;
  select (select count(*) from public.dossier_anamneses) + (select count(*) from public.dossier_notes)
       + (select count(*) from public.notes_honoraires) + (select count(*) from public.cabinet_facturation)
    into n;
  if n <> 0 then raise exception 'FUITE 3 : le revendeur lit % lignes du dossier', n; end if;
  refuse := false;
  begin
    perform public.cabinet_annuler_note_honoraires(v_n3.id);
  exception when no_data_found then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 3 : le revendeur annule une note d''honoraires'; end if;
  refuse := false;
  begin
    perform public.cabinet_emettre_note_honoraires(v_fiche, null, current_date, 'x', 100, null);
  exception when no_data_found then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 3 : le revendeur émet une note d''honoraires'; end if;

  --------------------------------------------------------- 4. autre cabinet
  perform set_config('request.jwt.claims', json_build_object('sub', v_voisine, 'role','authenticated')::text, true);
  select (select count(*) from public.dossier_anamneses) + (select count(*) from public.dossier_notes)
       + (select count(*) from public.notes_honoraires) + (select count(*) from public.cabinet_facturation)
    into n;
  if n <> 0 then raise exception 'FUITE 4 : un autre cabinet lit % lignes de ce dossier', n; end if;
  update public.dossier_anamneses set motif = 'réécrit ailleurs' where patient_id = v_fiche;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FUITE 4 : un autre cabinet réécrit l''anamnèse'; end if;
  delete from public.dossier_notes where id = v_note_datee;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FUITE 4 : un autre cabinet efface une note datée'; end if;
  update public.cabinet_facturation set praticien = 'Usurpation' where cabinet_id = v_cab;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FUITE 4 : un autre cabinet réécrit l''identité de facturation'; end if;
  refuse := false;
  begin
    perform public.cabinet_annuler_note_honoraires(v_n3.id);
  exception when no_data_found then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 4 : un autre cabinet annule une note'; end if;
  refuse := false;
  begin
    perform public.cabinet_emettre_note_honoraires(v_fiche, v_envoyee, null, 'x', 100, null);
  exception when no_data_found then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 4 : un autre cabinet émet une note sur cette fiche'; end if;
  refuse := false;
  begin
    perform public.cabinet_tracer_export(v_fiche);
  exception when no_data_found then refuse := true;
  end;
  if not refuse then raise exception 'FUITE 4 : un autre cabinet trace un export de cette fiche'; end if;

  --------------------------------------------------------------- 5. anonyme
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  foreach v_etat in array array['dossier_anamneses', 'dossier_notes', 'notes_honoraires', 'cabinet_facturation'] loop
    refuse := false;
    begin
      execute format('select count(*) from public.%I', v_etat) into n;
    exception when insufficient_privilege then refuse := true;
    end;
    if not refuse then raise exception 'FUITE 5 : le rôle anonyme lit public.%', v_etat; end if;
  end loop;

  ------------------------------------------------------ 6. fiche supprimée
  perform set_config('role','none',true);
  delete from public.patients where id = v_fiche;
  select (select count(*) from public.dossier_anamneses where patient_id = v_fiche)
       + (select count(*) from public.dossier_notes where patient_id = v_fiche)
    into n;
  if n <> 0 then raise exception 'ECHEC 6 : l''anamnèse ou les notes survivent à la fiche (%)', n; end if;
  select count(*) into n from public.notes_honoraires
   where cabinet_id = v_cab and patient_id is null and session_id is null and beneficiaire = 'Camille Test';
  if n <> 3 then raise exception 'ECHEC 6 : les notes d''honoraires ne survivent pas détachées (%)', n; end if;

  ------------------------------------------ 7. structure : index et droits
  select string_agg(format('%s (%s)', c.conrelid::regclass, c.conname), ', ')
    into v_liste
    from pg_constraint c
   where c.contype = 'f'
     and c.conrelid in ('public.dossier_anamneses'::regclass, 'public.dossier_notes'::regclass,
                        'public.cabinet_facturation'::regclass, 'public.notes_honoraires'::regclass)
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (select array_agg(k order by k)
                 from unnest((string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)]) k)
            = (select array_agg(k order by k) from unnest(c.conkey) k)
     );
  if v_liste is not null then raise exception 'ECHEC 7 : clés étrangères sans index : %', v_liste; end if;

  select string_agg(format('%s.%s', table_name, privilege_type), ', ')
    into v_liste
    from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name = 'notes_honoraires' and privilege_type <> 'SELECT';
  if v_liste is not null then raise exception 'FUITE 7 : droits d''écriture sur les notes d''honoraires : %', v_liste; end if;

  raise exception 'REUSSITE : l''anamnèse et les notes datées ne se lisent qu''au cabinet, signées par la base ; les notes d''honoraires se numérotent sans trou, ne s''écrivent que par la base, s''annulent sans s''effacer et survivent à la fiche ; l''export se trace sans contenu ; patient, revendeur, autre cabinet et anonyme n''obtiennent rien';
end $$;
