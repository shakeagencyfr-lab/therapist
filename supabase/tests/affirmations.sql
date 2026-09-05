-- 0033 éprouvée contre la vraie base : la frontière, puis la transaction.
--
-- Deux cabinets et un compte témoins, fabriqués ici et ANNULÉS par
-- l'exception finale — rien ne subsiste, même en cas de réussite.
--
-- L'attaquante est une PRATICIENNE, pas une patiente : c'est le seul rôle qui
-- passe la politique « cabinet » en écriture, donc le seul depuis lequel la
-- faille de 0033 était atteignable.
do $$
declare
  v_rev uuid; v_cab_att uuid; v_cab_vise uuid;
  v_uid uuid := gen_random_uuid();
  v_fiche_att uuid; v_fiche_vise uuid;
  v_n int; v_textes text[];
begin
  select id into v_rev from public.resellers limit 1;
  if v_rev is null then raise exception 'RIEN À ÉPROUVER : aucun revendeur en base'; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet attaquant', 'cab-att-aff-t', 'x') returning id into v_cab_att;
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet visé', 'cab-vise-aff-t', 'x') returning id into v_cab_vise;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'mallory-praticienne@exemple.test', '', now(), now(), now());
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name)
  values (v_cab_att, v_uid, 'owner', 'Mallory');

  insert into public.patients (cabinet_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab_att, 'Sa patiente', 'SP', 'p', 's', 'w', 'l', 'q') returning id into v_fiche_att;
  insert into public.patients (cabinet_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab_vise, 'Une inconnue', 'UI', 'p', 's', 'w', 'l', 'q') returning id into v_fiche_vise;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  -- 1. Déposer dans l'espace d'une patiente d'un autre cabinet : refusé.
  --    Le déclencheur remplace le cabinet déclaré par celui de la fiche, et
  --    la politique, évaluée après lui, ne reconnaît plus l'écrivante.
  begin
    insert into public.affirmations (cabinet_id, patient_id, text, position, published_at)
    values (v_cab_att, v_fiche_vise, 'Vous allez très mal.', 0, now());
    raise exception 'ECHEC 1 : une praticienne a écrit dans l espace d une patiente étrangère';
  exception when insufficient_privilege then null;
  end;

  -- 2. L'exercice, lu lui aussi par le patient : même frontière.
  begin
    insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind)
    values (v_cab_att, v_fiche_vise, 'm', '{}'::jsonb, 'Exercice');
    raise exception 'ECHEC 2 : un exercice a été posé chez une patiente étrangère';
  exception when insufficient_privilege then null;
  end;
  -- 3. Et la règle vaut pour les neuf tables qui portent les deux clés, pas
  --    seulement pour celles qu'un audit a nommées. C'est la leçon de 0030 :
  --    une règle appliquée là où l'on a regardé n'est pas une règle.
  select count(*) into v_n
    from unnest(array['affirmations','patient_audios','patient_modules','push_recipients',
                      'hypnoses','patient_settings','psych_profiles','therapy_sessions','orders']) t(nom)
   where not exists (
     select 1 from pg_trigger g
      where g.tgrelid = ('public.' || t.nom)::regclass
        and g.tgname = t.nom || '_rangement' and not g.tgisinternal);
  if v_n <> 0 then raise exception 'ECHEC 3 : % tables sans déclencheur de rangement', v_n; end if;

  -- 4. Chez SA patiente, la publication passe — et remplace.
  insert into public.affirmations (cabinet_id, patient_id, text, position, published_at)
  values (v_cab_att, v_fiche_att, 'Ancienne', 0, now());

  v_n := public.cabinet_publier_affirmations(v_fiche_att, array['  Je respire  ', '', 'Je tiens']);
  if v_n <> 2 then raise exception 'ECHEC 4 : % affirmations posées au lieu de 2', v_n; end if;

  select array_agg(text order by position) into v_textes
    from public.affirmations where patient_id = v_fiche_att;
  if v_textes <> array['Je respire', 'Je tiens'] then
    raise exception 'ECHEC 5 : la liste vaut % — ni remplacée, ni rognée, ni ordonnée', v_textes;
  end if;

  -- 6. Sur une fiche qui n'est pas la sienne, elle refuse AVANT d'effacer.
  begin
    perform public.cabinet_publier_affirmations(v_fiche_vise, array['x']);
    raise exception 'ECHEC 6 : la publication a accepté une fiche étrangère';
  exception when raise_exception then
    if sqlerrm like 'ECHEC%' then raise; end if;
  end;

  select count(*) into v_n from public.affirmations where patient_id = v_fiche_att;
  if v_n <> 2 then raise exception 'ECHEC 7 : le refus a emporté les % affirmations en place', v_n; end if;

  raise exception 'REUSSITE : frontière tenue sur les neuf tables, publication atomique et remplaçante';
end $$;
