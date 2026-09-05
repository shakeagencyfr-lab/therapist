-- ============================================================================
-- Les programmes appartiennent au cabinet qui les nomme.
--
--   praticienne A → nomme ses programmes, les relit, en archive un
--                 → ne voit aucun programme du cabinet B
--   la fiche d'un patient garde son libellé après l'archivage : on ne
--   réécrit pas un dossier parce qu'un catalogue a changé.
--
-- Un seul bloc DO terminé par RAISE EXCEPTION 'REUSSITE …' : rien ne persiste.
--
--   psql "$DATABASE_URL" -f supabase/tests/programmes.sql
-- ============================================================================

do $$
declare
  v_plan text;
  v_rev uuid; v_org uuid; v_a uuid; v_b uuid; v_pat uuid; v_prog text; n integer;
begin
  select m.user_id, m.reseller_id into v_rev, v_org from public.reseller_members m limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('bbbb0000-0000-4000-8000-00000000bb01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-prog-a@exemple.fr','',now(),now(),now());

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org,'Cabinet Prog A','cabinet-prog-a','Espace thérapie') returning id into v_a;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org,'Cabinet Prog B','cabinet-prog-b','Espace thérapie') returning id into v_b;
  /* Depuis 0035, une fiche ne s'ouvre pas dans un cabinet sans contrat. Le
     témoin en reçoit un actif : ce n'est pas ce qu'on éprouve ici. */
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_a, v_plan, 'actif');
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_b, v_plan, 'actif');

  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at) values (v_a,'test-prog-a@exemple.fr','owner', now() + interval '1 day');

  -- Le cabinet voisin a déjà nommé le sien. Posé hors RLS, faute de
  -- praticienne à jouer chez lui : un revendeur ne peut pas nommer les
  -- programmes d'un cabinet, et c'est bien ce qu'on veut.
  perform set_config('role','none',true);
  insert into public.cabinet_programs (cabinet_id, label) values (v_b, 'Programme du voisin');

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000bb01","role":"authenticated"}',true);
  perform public.claim_access();

  -- 1. Elle nomme les siens.
  insert into public.cabinet_programs (cabinet_id, label, position) values (v_a,'Arrêt du tabac',0), (v_a,'Sommeil',1);

  -- 2. Elle ne voit que les siens.
  select count(*) into n from public.cabinet_programs;
  if n <> 2 then raise exception 'FUITE : % programmes visibles au lieu de 2', n; end if;

  -- 3. Deux fois le même nom, c'est refusé.
  begin
    insert into public.cabinet_programs (cabinet_id, label) values (v_a,'sommeil');
    raise exception 'ECHEC : un doublon de programme a été accepté';
  exception
    when unique_violation then null;
  end;

  -- 4. La fiche garde son libellé quand le programme quitte le catalogue.
  insert into public.patients (cabinet_id, display_name, initials, program, subtitle, week_label, scale_label, scale_question, email)
  values (v_a,'Test P.','TP','Arrêt du tabac','','','','','test-prog-patient@exemple.fr') returning id into v_pat;
  update public.cabinet_programs set archived_at = now() where cabinet_id = v_a and label = 'Arrêt du tabac';
  select program into v_prog from public.patients where id = v_pat;
  if v_prog is distinct from 'Arrêt du tabac' then raise exception 'ECHEC : la fiche a perdu son programme (%)', v_prog; end if;

  select count(*) into n from public.cabinet_programs where archived_at is null;
  if n <> 1 then raise exception 'ECHEC : le catalogue actif compte % programme(s) au lieu de 1', n; end if;

  raise exception 'REUSSITE : chaque cabinet nomme ses programmes, ne voit pas ceux du voisin, refuse les doublons, et l''archivage ne touche pas les fiches.';
end $$;
