-- 0071 éprouvée contre la vraie base : la bibliothèque d'hypnoses du cabinet.
--
--   droits          → la table et ses fonctions comme annoncé : rien pour
--                     l'anonyme, ni provenance ni origine écrites du
--                     navigateur, fonctions en security definer à search_path vide
--   refermer        → une hypnose de fiche refermée rejoint la bibliothèque,
--                     une fois, avec ses quatre mouvements dans l'ordre, sa
--                     provenance, « seance » ; une hypnose à trois mouvements
--                     se referme sans y entrer
--   attribuer       → une copie complète par patient, quatre mouvements rangés,
--                     marquée de la bibliothèque, inscrite au journal sans texte
--   copies          → une copie refermée de nouveau ne revient pas dans la
--                     bibliothèque
--   refus           → un patient d'un autre cabinet ou d'un suivi clos refuse
--                     tout ; une ligne incomplète ne s'attribue pas ; une
--                     ligne « complète » sans ses quatre mouvements ne s'écrit pas
--   sans l'option   → la bibliothèque se lit, rien ne s'attribue
--   cloisonnement   → la voisine ne lit, ne modifie, ne supprime ni n'attribue
--                     rien ; elle n'écrit pas chez un autre cabinet
--   anonyme         → rien
--   fiche supprimée → la ligne de la bibliothèque reste, sans plus désigner
--                     ni le patient ni son hypnose ; la copie attribuée part
--                     avec la fiche
--
-- Un bloc, ANNULÉ par l'exception finale : rien ne subsiste.
do $$
declare
  v_suf     text := substr(md5(random()::text), 1, 8);
  v_ther    uuid := gen_random_uuid();
  v_voisine uuid := gen_random_uuid();
  v_fermee  uuid := gen_random_uuid();
  v_res     uuid;
  v_plan_h  text := 'biblio-0071h-' || v_suf;
  v_plan    text := 'biblio-0071-' || v_suf;
  v_cab     uuid; v_voisin uuid; v_cab_c uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_clos uuid; v_pv uuid; v_pc uuid;
  v_h uuid; v_h3 uuid; v_b uuid; v_atelier uuid; v_c uuid;
  v_ids uuid[];
  v_n int; v_m int; v_t text;
  v_sig constant text := 'public.cabinet_attribuer_hypnose(uuid, uuid[])';
  v_quatre constant jsonb := '[
    {"mouvement":"induction","titre":"Le quai","texte":"Installez-vous."},
    {"mouvement":"approfondissement","titre":"Le large","texte":"Plus loin."},
    {"mouvement":"travail","titre":"La barque","texte":"Ce qui porte."},
    {"mouvement":"retour","titre":"Le port","texte":"Revenez."}
  ]';
begin
  -- ══ 0. Les droits, tels qu'ils sont posés ═══════════════════════════════
  if has_table_privilege('anon', 'public.bibliotheque_hypnoses', 'select')
     or has_table_privilege('anon', 'public.bibliotheque_hypnoses', 'insert') then
    raise exception 'ECHEC 0a : l''anonyme a un droit sur la bibliothèque';
  end if;
  if not has_table_privilege('authenticated', 'public.bibliotheque_hypnoses', 'select')
     or not has_table_privilege('authenticated', 'public.bibliotheque_hypnoses', 'delete')
     or not has_column_privilege('authenticated', 'public.bibliotheque_hypnoses', 'mouvements', 'update') then
    raise exception 'ECHEC 0b : un membre ne peut ni lire, ni corriger, ni supprimer la bibliothèque';
  end if;
  foreach v_t in array array['source_hypnose_id', 'source_patient_id', 'origine', 'cree_par', 'cree_le', 'modifie_le'] loop
    if has_column_privilege('authenticated', 'public.bibliotheque_hypnoses', v_t, 'insert')
       or has_column_privilege('authenticated', 'public.bibliotheque_hypnoses', v_t, 'update') then
      raise exception 'ECHEC 0c : le navigateur écrit « % »', v_t;
    end if;
  end loop;
  if has_function_privilege('anon', v_sig, 'execute') or not has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'ECHEC 0d : l''attribution s''ouvre à l''anonyme, ou se ferme au cabinet';
  end if;
  if has_function_privilege('authenticated', 'public.verser_hypnose_a_la_bibliotheque(uuid)', 'execute')
     or has_function_privilege('anon', 'public.verser_hypnose_a_la_bibliotheque(uuid)', 'execute') then
    raise exception 'ECHEC 0e : le versement hors RLS s''appelle du navigateur';
  end if;
  select count(*) into v_n from pg_proc
   where oid in ('public.cabinet_attribuer_hypnose(uuid, uuid[])'::regprocedure,
                 'public.verser_hypnose_a_la_bibliotheque(uuid)'::regprocedure,
                 'public.hypnose_vers_la_bibliotheque()'::regprocedure,
                 'public.bibliotheque_hypnoses_modifiee()'::regprocedure)
     and prosecdef and proconfig @> array['search_path=""'];
  if v_n <> 4 then raise exception 'ECHEC 0f : % fonction(s) sur 4 en security definer à search_path vide', v_n; end if;
  if not exists (select 1 from pg_class where oid = 'public.bibliotheque_hypnoses'::regclass and relrowsecurity) then
    raise exception 'ECHEC 0g : la RLS n''est pas active sur la bibliothèque';
  end if;

  -- ══ Le décor ═══════════════════════════════════════════════════════════
  insert into public.resellers (name, slug) values ('Revendeur 0071', 'revendeur-0071-' || v_suf) returning id into v_res;
  insert into public.plans (code, label, price_cents, max_patients, position, reseller_id, shop, marque_blanche, site, jetons_mois, hypnose_incluse)
  values (v_plan_h, 'Avec hypnose 0071', 14900, null, 90, v_res, false, false, false, 0, true),
         (v_plan, 'Sans hypnose 0071', 3900, null, 91, v_res, false, false, false, 0, false);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), now(), now()
    from (values
      (v_ther, 'praticienne-0071-' || v_suf || '@exemple.test'),
      (v_voisine, 'voisine-0071-' || v_suf || '@exemple.test'),
      (v_fermee, 'sans-option-0071-' || v_suf || '@exemple.test')
    ) as u(id, email);

  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet 0071', 'cab-0071-' || v_suf, 'x') returning id into v_cab;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Voisin 0071', 'cab-0071v-' || v_suf, 'x') returning id into v_voisin;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Sans option 0071', 'cab-0071c-' || v_suf, 'x') returning id into v_cab_c;
  insert into public.subscriptions (cabinet_id, plan_code, status) values
    (v_cab, v_plan_h, 'actif'), (v_voisin, v_plan_h, 'actif'), (v_cab_c, v_plan, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
    (v_cab, v_ther, 'owner', 'Praticienne 0071'),
    (v_voisin, v_voisine, 'owner', 'Voisine 0071'),
    (v_cab_c, v_fermee, 'owner', 'Sans option 0071');

  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Anna 0071', 'A', '', '', '', '', '') returning id into v_p1;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Bruno 0071', 'B', '', '', '', '', '') returning id into v_p2;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab, 'Chloé 0071', 'C', '', '', '', '', '') returning id into v_p3;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question, archived_at)
  values (v_cab, 'Denis 0071', 'D', '', '', '', '', '', now()) returning id into v_clos;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_voisin, 'Voisin 0071', 'V', '', '', '', '', '') returning id into v_pv;
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_cab_c, 'Sans 0071', 'S', '', '', '', '', '') returning id into v_pc;

  -- ══ 1. Refermée en séance, elle rejoint la bibliothèque ══════════════════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated', 'aal', 'aal1')::text, true);

  insert into public.hypnoses (cabinet_id, patient_id, titre, intention)
  values (v_cab, v_p1, 'Séance en cours d’écriture', 'Retrouver le sommeil') returning id into v_h;
  -- Versés dans le désordre : la bibliothèque les range.
  insert into public.hypnose_mouvements (hypnose_id, cabinet_id, mouvement, rang, titre, texte) values
    (v_h, v_cab, 'travail', 3, 'La barque', 'Ce qui porte.'),
    (v_h, v_cab, 'induction', 1, 'Le quai', 'Installez-vous.'),
    (v_h, v_cab, 'retour', 4, 'Le port', 'Revenez.'),
    (v_h, v_cab, 'approfondissement', 2, 'Le large', 'Plus loin.');

  select count(*) into v_n from public.bibliotheque_hypnoses where cabinet_id = v_cab;
  if v_n <> 0 then raise exception 'ECHEC 1a : une hypnose en cours d''écriture est déjà dans la bibliothèque'; end if;

  update public.hypnoses set complete = true, titre = 'Le quai' where id = v_h;
  select id into v_b from public.bibliotheque_hypnoses where source_hypnose_id = v_h;
  if v_b is null then raise exception 'ECHEC 1b : l''hypnose refermée n''est pas dans la bibliothèque'; end if;
  if not exists (
    select 1 from public.bibliotheque_hypnoses b
     where b.id = v_b and b.cabinet_id = v_cab and b.origine = 'seance' and b.complete
       and b.source_patient_id = v_p1 and b.titre = 'Le quai' and b.intention = 'Retrouver le sommeil'
       and b.cree_par = v_ther
       and b.mouvements = v_quatre
  ) then
    raise exception 'ECHEC 1c : l''instantané ne dit pas ce qui a été écrit, ni d''où il vient, dans l''ordre';
  end if;

  -- Refermée deux fois : une seule ligne.
  update public.hypnoses set complete = false where id = v_h;
  update public.hypnoses set complete = true where id = v_h;
  select count(*) into v_n from public.bibliotheque_hypnoses where source_hypnose_id = v_h;
  if v_n <> 1 then raise exception 'ECHEC 1d : % lignes pour une seule hypnose', v_n; end if;

  -- Trois mouvements sur quatre : elle se referme, la bibliothèque ne la prend pas.
  insert into public.hypnoses (cabinet_id, patient_id, titre) values (v_cab, v_p1, 'Inachevée') returning id into v_h3;
  insert into public.hypnose_mouvements (hypnose_id, cabinet_id, mouvement, rang, titre, texte) values
    (v_h3, v_cab, 'induction', 1, 'a', 'a'), (v_h3, v_cab, 'approfondissement', 2, 'b', 'b'), (v_h3, v_cab, 'travail', 3, 'c', 'c');
  update public.hypnoses set complete = true where id = v_h3;
  if not exists (select 1 from public.hypnoses where id = v_h3 and complete) then
    raise exception 'ECHEC 1e : la bibliothèque a empêché l''hypnose du patient de se refermer';
  end if;
  if exists (select 1 from public.bibliotheque_hypnoses where source_hypnose_id = v_h3) then
    raise exception 'ECHEC 1f : une hypnose à trois mouvements entre dans la bibliothèque';
  end if;

  -- ══ 2. Attribuer : une copie entière par patient ══════════════════════════
  select count(*) into v_m from public.bibliotheque_hypnoses where cabinet_id = v_cab;
  v_ids := public.cabinet_attribuer_hypnose(v_b, array[v_p2, v_p3, v_p2]);
  if cardinality(v_ids) <> 2 then raise exception 'ECHEC 2a : % copie(s) pour deux patients (doublon compris)', cardinality(v_ids); end if;
  select count(*) into v_n from public.hypnoses h
   where h.id = any (v_ids) and h.complete and h.bibliotheque_id = v_b and h.session_id is null
     and h.titre = 'Le quai' and h.intention = 'Retrouver le sommeil' and h.cabinet_id = v_cab;
  if v_n <> 2 then raise exception 'ECHEC 2b : les copies ne sont pas complètes et marquées de la bibliothèque'; end if;
  select h.id into v_c from public.hypnoses h where h.id = any (v_ids) and h.patient_id = v_p2;
  if v_ids[1] is distinct from v_c then raise exception 'ECHEC 2c : les copies ne suivent pas l''ordre des patients'; end if;
  select string_agg(m.mouvement::text || ':' || m.rang || ':' || m.titre || ':' || m.texte, '|' order by m.rang) into v_t
    from public.hypnose_mouvements m where m.hypnose_id = v_c and m.cabinet_id = v_cab;
  if v_t is distinct from 'induction:1:Le quai:Installez-vous.|approfondissement:2:Le large:Plus loin.|travail:3:La barque:Ce qui porte.|retour:4:Le port:Revenez.' then
    raise exception 'ECHEC 2d : les mouvements de la copie ne sont pas rangés (%)', v_t;
  end if;
  select count(*) into v_n from public.bibliotheque_hypnoses where cabinet_id = v_cab;
  if v_n <> v_m then raise exception 'ECHEC 2e : attribuer a écrit dans la bibliothèque'; end if;
  select count(*) into v_n from public.audit_log
   where cabinet_id = v_cab and action = 'hypnose.attribuee' and target_id = v_b and actor_user_id = v_ther
     and meta = jsonb_build_object('patients', 2);
  if v_n <> 1 then raise exception 'ECHEC 2f : l''attribution n''est pas au journal, ou y dit autre chose que le compte'; end if;

  -- ══ 3. Une copie ne revient jamais dans la bibliothèque ═══════════════════
  update public.hypnoses set complete = false where id = v_c;
  update public.hypnoses set complete = true where id = v_c;
  select count(*) into v_n from public.bibliotheque_hypnoses where cabinet_id = v_cab;
  if v_n <> v_m or exists (select 1 from public.bibliotheque_hypnoses where source_hypnose_id = v_c) then
    raise exception 'ECHEC 3 : une copie attribuée revient dans la bibliothèque';
  end if;

  -- ══ 4. Les refus ══════════════════════════════════════════════════════════
  select count(*) into v_m from public.hypnoses where cabinet_id = v_cab;
  begin
    perform public.cabinet_attribuer_hypnose(v_b, array[v_p1, v_pv]);
    raise exception 'ECHEC 4a : un patient d''un autre cabinet reçoit une hypnose';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_attribuer_hypnose(v_b, array[v_clos]);
    raise exception 'ECHEC 4b : un suivi clos reçoit une hypnose';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_attribuer_hypnose(v_b, '{}'::uuid[]);
    raise exception 'ECHEC 4c : une attribution sans patient passe';
  exception when check_violation then null;
  end;
  select count(*) into v_n from public.hypnoses where cabinet_id = v_cab;
  if v_n <> v_m then raise exception 'ECHEC 4d : un refus a quand même écrit % copie(s)', v_n - v_m; end if;

  -- Une ligne d'atelier, ouverte du navigateur : « atelier », par lui, incomplète.
  insert into public.bibliotheque_hypnoses (cabinet_id, titre, intention)
  values (v_cab, 'Hypnose en cours d’écriture', 'Un script pour le sommeil, sans personne en tête.')
  returning id into v_atelier;
  if not exists (select 1 from public.bibliotheque_hypnoses
                  where id = v_atelier and origine = 'atelier' and not complete and cree_par = v_ther
                    and source_hypnose_id is null and source_patient_id is null) then
    raise exception 'ECHEC 4e : une ligne d''atelier ne naît pas « atelier », incomplète, de son autrice';
  end if;
  begin
    perform public.cabinet_attribuer_hypnose(v_atelier, array[v_p2]);
    raise exception 'ECHEC 4f : une hypnose incomplète s''attribue';
  exception when check_violation then null;
  end;
  begin
    update public.bibliotheque_hypnoses set complete = true where id = v_atelier;
    raise exception 'ECHEC 4g : une ligne sans ses quatre mouvements se dit complète';
  exception when check_violation then null;
  end;
  update public.bibliotheque_hypnoses
     set mouvements = v_quatre || '[]'::jsonb, complete = true, titre = 'Le quai, encore'
   where id = v_atelier;
  if not exists (select 1 from public.bibliotheque_hypnoses where id = v_atelier and complete) then
    raise exception 'ECHEC 4h : une ligne d''atelier entière ne se referme pas';
  end if;
  begin
    insert into public.bibliotheque_hypnoses (cabinet_id, titre, source_hypnose_id) values (v_cab, 'Forgée', v_h3);
    raise exception 'ECHEC 4i : le navigateur pose la provenance';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.bibliotheque_hypnoses (cabinet_id, titre, origine) values (v_cab, 'Forgée', 'seance');
    raise exception 'ECHEC 4j : le navigateur pose l''origine';
  exception when insufficient_privilege then null;
  end;

  -- ══ 5. Sans l'option, la bibliothèque se lit et ne s'attribue pas ═════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_fermee, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.bibliotheque_hypnoses (cabinet_id, titre, intention, mouvements, complete)
  values (v_cab_c, 'Sans option', '', v_quatre, true) returning id into v_c;
  select count(*) into v_n from public.bibliotheque_hypnoses where id = v_c;
  if v_n <> 1 then raise exception 'ECHEC 5a : sans l''option, sa bibliothèque ne se lit plus'; end if;
  begin
    perform public.cabinet_attribuer_hypnose(v_c, array[v_pc]);
    raise exception 'ECHEC 5b : sans l''option, une hypnose s''attribue';
  exception when insufficient_privilege then
    get stacked diagnostics v_t = message_text;
    if v_t not like '%n''est pas ouverte pour votre cabinet%' then
      raise exception 'ECHEC 5c : le refus sans l''option ne le dit pas (%)', v_t;
    end if;
  end;
  if exists (select 1 from public.hypnoses where patient_id = v_pc) then
    raise exception 'ECHEC 5d : un refus sans l''option a écrit';
  end if;

  -- ══ 6. Le cloisonnement ═══════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_voisine, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into v_n from public.bibliotheque_hypnoses where cabinet_id in (v_cab, v_cab_c);
  if v_n <> 0 then raise exception 'ECHEC 6a : la voisine lit % hypnose(s) d''autres cabinets', v_n; end if;
  update public.bibliotheque_hypnoses set titre = 'Volée' where id in (v_b, v_atelier);
  delete from public.bibliotheque_hypnoses where id in (v_b, v_atelier);
  begin
    insert into public.bibliotheque_hypnoses (cabinet_id, titre) values (v_cab, 'Déposée chez une autre');
    raise exception 'ECHEC 6b : la voisine écrit dans la bibliothèque d''un autre cabinet';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_attribuer_hypnose(v_b, array[v_pv]);
    raise exception 'ECHEC 6c : la voisine attribue une hypnose d''un autre cabinet';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.bibliotheque_hypnoses where id = v_b and titre = 'Le quai')
     or not exists (select 1 from public.bibliotheque_hypnoses where id = v_atelier) then
    raise exception 'ECHEC 6d : la voisine a modifié ou supprimé une hypnose d''un autre cabinet';
  end if;
  if exists (select 1 from public.hypnoses where patient_id = v_pv) then
    raise exception 'ECHEC 6e : un patient de la voisine a reçu une hypnose';
  end if;

  -- ══ 7. Rien pour l'anonyme ═════════════════════════════════════════════════
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    select count(*) into v_n from public.bibliotheque_hypnoses;
    raise exception 'ECHEC 7a : l''anonyme lit la bibliothèque (%)', v_n;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_attribuer_hypnose(v_b, array[v_p2]);
    raise exception 'ECHEC 7b : l''anonyme attribue une hypnose';
  exception when insufficient_privilege then null;
  end;

  -- ══ 8. La fiche supprimée, la bibliothèque garde l'hypnose sans le nom ═════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  delete from public.patients where id = v_p1;
  perform set_config('role', 'postgres', true);
  if exists (select 1 from public.patients where id = v_p1) then raise exception 'ECHEC 8a : la fiche n''est pas supprimée'; end if;
  if not exists (select 1 from public.bibliotheque_hypnoses
                  where id = v_b and source_patient_id is null and source_hypnose_id is null and complete
                    and mouvements = v_quatre) then
    raise exception 'ECHEC 8b : la fiche supprimée emporte ou laisse désigner l''hypnose de la bibliothèque';
  end if;
  -- La copie de Bruno est à lui : supprimer la ligne de la bibliothèque ne la lui retire pas.
  delete from public.bibliotheque_hypnoses where id = v_b;
  if not exists (select 1 from public.hypnoses where patient_id = v_p2 and complete and bibliotheque_id is null) then
    raise exception 'ECHEC 8c : retirer l''hypnose de la bibliothèque l''a retirée au patient qui l''avait reçue';
  end if;
  delete from public.patients where id = v_p2;
  if exists (select 1 from public.hypnoses where patient_id = v_p2) then
    raise exception 'ECHEC 8d : la copie attribuée survit à la fiche';
  end if;

  raise exception 'REUSSITE : une hypnose refermée en séance rejoint la bibliothèque une fois, entière et rangée, sans bloquer la fiche ; attribuer écrit une copie complète par patient, rangée, marquée et inscrite au journal, qui ne revient jamais ; un patient d''ailleurs ou clos, une ligne incomplète et l''option fermée refusent tout ; le navigateur n''écrit ni provenance ni origine ; la voisine et l''anonyme n''ont rien ; une fiche supprimée laisse l''hypnose à la bibliothèque, sans son nom';
end $$;
