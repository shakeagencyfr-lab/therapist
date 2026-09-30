-- 0068 éprouvée contre la vraie base : les jetons sous verrou.
--
--   ordre de dépense   → le forfait du mois, puis les jetons du pass Hypnose,
--                         puis achats et gestes par expiration — même quand
--                         une recharge expire avant le forfait
--   orphelines         → une réservation de plus de dix minutes est rendue à
--                         la lecture du cabinet, lot par lot, une seule fois ;
--                         une réservation récente ne bouge pas ; une
--                         confirmation tardive ne ressuscite rien
--   forfait de séance  → compté DANS la fonction : deux appels à la suite ne
--                         passent pas tous deux « compris » quand la séance
--                         n'en comprend qu'un, même si le premier n'est encore
--                         que réservé ; rien sans brouillon payé
--   hypnose            → une série paie une fois ses quatre mouvements ; un
--                         mouvement redemandé, ou un cinquième appel, ouvre
--                         une nouvelle série payée ; un appel rendu ne compte
--                         pas
--   refus              → règle, action, mouvement ou identifiant inconnus ;
--                         KL402 quand le solde manque, rien d'inscrit
--   droits             → les nouvelles fonctions au rôle de service seul
--
-- Un bloc, ANNULÉ par l'exception finale : rien ne subsiste.
do $$
declare
  v_suf    text := substr(md5(random()::text), 1, 8);
  v_ther   uuid := gen_random_uuid();
  v_res    uuid;
  v_plan   text := 'essai-0068-' || v_suf;
  v_plan0  text := 'essai-0068z-' || v_suf;
  v_a uuid; v_b uuid; v_c uuid;
  v_mois   date := date_trunc('month', now() at time zone 'Europe/Paris')::date;
  v_fin_mois timestamptz;
  v_seance text := gen_random_uuid()::text;
  v_h1 text := gen_random_uuid()::text;
  v_h2 text := gen_random_uuid()::text;
  v_h3 text := gen_random_uuid()::text;
  v_h4 text := gen_random_uuid()::text;
  v_r jsonb; v_r2 jsonb; v_old uuid; v_new uuid; v_etat jsonb;
  v_n int; v_i int; v_fn text; v_le1 timestamptz; v_le2 timestamptz;
  v_attendu int[]; v_mvts text[];
begin
  -- ══ Le décor : un revendeur en mode jetons ════════════════════════════
  insert into public.resellers (name, slug) values ('Revendeur 0068', 'revendeur-0068-' || v_suf) returning id into v_res;
  update public.reseller_jetons set actif = true where reseller_id = v_res;
  insert into public.reseller_secrets (reseller_id, anthropic_key_enc) values (v_res, 'v1:essai:essai:essai')
  on conflict (reseller_id) do update set anthropic_key_enc = excluded.anthropic_key_enc;

  insert into public.plans (code, label, price_cents, max_patients, position, reseller_id, shop, marque_blanche, site, jetons_mois, hypnose_incluse)
  values (v_plan, 'Essai 0068', 3900, null, 90, v_res, false, false, false, 300, true),
         (v_plan0, 'Essai 0068 zéro', 1900, null, 91, v_res, false, false, false, 0, true);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (v_ther, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'praticienne-0068-' || v_suf || '@exemple.test', '', now(), now(), now());

  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet A 0068', 'cab-0068a-' || v_suf, 'x') returning id into v_a;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet B 0068', 'cab-0068b-' || v_suf, 'x') returning id into v_b;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet C 0068', 'cab-0068c-' || v_suf, 'x') returning id into v_c;
  insert into public.subscriptions (cabinet_id, plan_code, status) values
    (v_a, v_plan, 'actif'), (v_b, v_plan0, 'actif'), (v_c, v_plan0, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values (v_a, v_ther, 'owner', 'Praticienne 0068');

  -- ══ L'ordre du contrat ════════════════════════════════════════════════
  perform public.jetons_assurer_periode(v_a);
  select expire_le into v_fin_mois from public.jetons_lots where cabinet_id = v_a and origine = 'mensuel' and periode = v_mois;
  if v_fin_mois is null then raise exception 'ECHEC 0 : le forfait du mois n''est pas versé'; end if;
  -- Une recharge qui expire AVANT le forfait : le cas où l'ancien ordre la prenait d'abord.
  perform public.jetons_crediter(v_a, 'achat', 50, now() + (v_fin_mois - now()) / 2, null);
  perform public.jetons_crediter(v_a, 'option_hypnose', 40, now() + interval '20 days', null);
  perform public.jetons_crediter(v_a, 'geste', 30, now() + interval '1 year', null);

  perform public.jetons_debiter(v_a, 'seance', 320, null);
  if (select restants from public.jetons_lots where cabinet_id = v_a and origine = 'mensuel' and periode = v_mois) <> 0
     or (select restants from public.jetons_lots where cabinet_id = v_a and origine = 'option_hypnose') <> 20
     or (select restants from public.jetons_lots where cabinet_id = v_a and origine = 'achat') <> 50
     or (select restants from public.jetons_lots where cabinet_id = v_a and origine = 'geste') <> 30 then
    raise exception 'ECHEC 1 : la dépense ne prend pas le forfait, puis le pass, avant les achats';
  end if;
  perform public.jetons_debiter(v_a, 'seance', 40, null);
  if (select restants from public.jetons_lots where cabinet_id = v_a and origine = 'option_hypnose') <> 0
     or (select restants from public.jetons_lots where cabinet_id = v_a and origine = 'achat') <> 30
     or (select restants from public.jetons_lots where cabinet_id = v_a and origine = 'geste') <> 30 then
    raise exception 'ECHEC 1b : après le pass, la recharge la plus ancienne ne passe pas avant le geste';
  end if;

  -- ══ Les réservations orphelines ═══════════════════════════════════════
  perform public.jetons_crediter(v_a, 'geste', 100, now() + interval '1 year', null);
  v_old := public.jetons_debiter(v_a, 'seance', 12, null);
  v_new := public.jetons_debiter(v_a, 'module', 5, null);
  select sum(restants) into v_n from public.jetons_lots where cabinet_id = v_a and expire_le > now();
  if v_n <> 143 then raise exception 'ECHEC 2 : solde de % avant l''orpheline au lieu de 143', v_n; end if;
  -- Une fonction tuée il y a onze minutes : sa réservation n'a jamais été ni confirmée ni rendue.
  update public.jetons_consommations set le = now() - interval '11 minutes' where id = v_old;

  -- La lecture du cabinet, sous le jeton de la praticienne, la rend.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  v_etat := public.cabinet_jetons(v_a);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  if (select statut from public.jetons_consommations where id = v_old) <> 'rembourse'
     or (v_etat ->> 'solde')::int <> 155 then
    raise exception 'ECHEC 2b : l''orpheline n''est pas rendue à la lecture (solde lu %)', v_etat ->> 'solde';
  end if;
  if (select statut from public.jetons_consommations where id = v_new) <> 'reserve' then
    raise exception 'ECHEC 2c : une réservation récente, peut-être en cours, a été rendue';
  end if;
  if public.jetons_liberer_reservations(v_a) <> 0 then
    raise exception 'ECHEC 2d : une seconde libération rend encore';
  end if;
  perform public.jetons_confirmer(v_old);
  select sum(restants) into v_n from public.jetons_lots where cabinet_id = v_a and expire_le > now();
  if (select statut from public.jetons_consommations where id = v_old) <> 'rembourse' or v_n <> 155 then
    raise exception 'ECHEC 2e : une confirmation tardive ressuscite l''orpheline, ou le solde bouge (%)', v_n;
  end if;
  -- La dépense aussi la rend, sous son verrou.
  update public.jetons_consommations set le = now() - interval '11 minutes' where id = v_new;
  perform public.jetons_debiter_forfait(v_a, 'affirmations', 1, null, 'prix', null);
  if (select statut from public.jetons_consommations where id = v_new) <> 'rembourse' then
    raise exception 'ECHEC 2f : la dépense ne rend pas l''orpheline qu''elle trouve';
  end if;

  -- ══ Le forfait d'une séance, compté dans la fonction ══════════════════
  perform public.jetons_crediter(v_b, 'geste', 5000, now() + interval '1 year', null);

  -- Sans brouillon payé, un module et un profil se paient.
  v_r := public.jetons_debiter_forfait(v_b, 'module', 5, v_seance, 'seance', null);
  if (v_r ->> 'jetons')::int <> 5 or (v_r ->> 'compris')::boolean then
    raise exception 'ECHEC 3 : un module est compris sans séance payée (%)', v_r;
  end if;
  -- Un brouillon réservé mais pas encore livré n'ouvre rien.
  v_r := public.jetons_debiter_forfait(v_b, 'seance', 12, v_seance, 'prix', null);
  if (v_r ->> 'jetons')::int <> 12 or (select ref from public.jetons_consommations where id = (v_r ->> 'consommation')::uuid) <> v_seance then
    raise exception 'ECHEC 3b : la séance ne se paie pas au barème, ou ne retient pas sa référence (%)', v_r;
  end if;
  v_r2 := public.jetons_debiter_forfait(v_b, 'profil', 5, v_seance, 'seance', null);
  if (v_r2 ->> 'jetons')::int <> 5 then raise exception 'ECHEC 3c : un brouillon non livré ouvre déjà le forfait'; end if;
  perform public.jetons_rembourser((v_r2 ->> 'consommation')::uuid);
  perform public.jetons_confirmer((v_r ->> 'consommation')::uuid);

  -- Le profil : un seul compris. Le premier n'est encore que réservé quand le
  -- second arrive — c'est le cas de deux requêtes lancées ensemble.
  v_r := public.jetons_debiter_forfait(v_b, 'profil', 5, v_seance, 'seance', null);
  v_r2 := public.jetons_debiter_forfait(v_b, 'profil', 5, v_seance, 'seance', null);
  if (v_r ->> 'jetons')::int <> 0 or not (v_r ->> 'compris')::boolean
     or (v_r2 ->> 'jetons')::int <> 5 or (v_r2 ->> 'compris')::boolean then
    raise exception 'ECHEC 4 : deux actualisations à la suite passent comprises (% puis %)', v_r, v_r2;
  end if;
  -- Le devis dit la même chose, sans rien écrire.
  select count(*) into v_n from public.jetons_consommations where cabinet_id = v_b;
  v_r := public.jetons_prix_du_forfait(v_b, 'profil', 5, v_seance, 'seance', null);
  if (v_r ->> 'compris')::boolean or (select count(*) from public.jetons_consommations where cabinet_id = v_b) <> v_n then
    raise exception 'ECHEC 4b : le devis dit l''actualisation encore comprise, ou écrit (%)', v_r;
  end if;

  -- Les consignes : huit comprises, la neuvième se paie ; une rendue libère sa place.
  for v_i in 1..8 loop
    v_r := public.jetons_debiter_forfait(v_b, 'module', 5, v_seance, 'seance', null);
    if (v_r ->> 'jetons')::int <> 0 then raise exception 'ECHEC 5 : la consigne % n''est pas comprise', v_i; end if;
  end loop;
  v_r2 := public.jetons_debiter_forfait(v_b, 'module', 5, v_seance, 'seance', null);
  if (v_r2 ->> 'jetons')::int <> 5 then raise exception 'ECHEC 5b : une neuvième consigne passe comprise'; end if;
  perform public.jetons_rembourser((v_r ->> 'consommation')::uuid);
  v_r := public.jetons_debiter_forfait(v_b, 'module', 5, v_seance, 'seance', null);
  if (v_r ->> 'jetons')::int <> 0 then raise exception 'ECHEC 5c : une consigne rendue compte encore dans le forfait'; end if;

  -- ══ L'hypnose : quatre mouvements par série ═══════════════════════════
  v_mvts := array['induction', 'approfondissement', 'travail', 'retour', 'induction', 'approfondissement'];
  v_attendu := array[50, 0, 0, 0, 50, 0];
  for v_i in 1..6 loop
    v_r := public.jetons_debiter_forfait(v_b, 'hypnose', 50, v_h1, 'hypnose', v_mvts[v_i]);
    if (v_r ->> 'jetons')::int <> v_attendu[v_i] then
      raise exception 'ECHEC 6 : appel % (%) de l''hypnose pris à % au lieu de %', v_i, v_mvts[v_i], v_r ->> 'jetons', v_attendu[v_i];
    end if;
  end loop;
  if (select ref from public.jetons_consommations where id = (v_r ->> 'consommation')::uuid) <> v_h1 || ':approfondissement' then
    raise exception 'ECHEC 6b : la consommation ne dit pas son mouvement';
  end if;
  select le into v_le1 from public.jetons_consommations where ref = v_h1 || ':induction' order by le limit 1;
  select le into v_le2 from public.jetons_consommations where ref = v_h1 || ':induction' order by le desc limit 1;
  if v_le1 >= v_le2 then raise exception 'ECHEC 6c : deux consommations d''une même transaction portent la même heure'; end if;

  -- Un mouvement redemandé avant la fin ouvre une nouvelle hypnose.
  v_r := public.jetons_debiter_forfait(v_b, 'hypnose', 50, v_h2, 'hypnose', 'induction');
  v_r2 := public.jetons_debiter_forfait(v_b, 'hypnose', 50, v_h2, 'hypnose', 'induction');
  if (v_r ->> 'jetons')::int <> 50 or (v_r2 ->> 'jetons')::int <> 50 then
    raise exception 'ECHEC 7 : une induction réécrite sur la même hypnose passe comprise';
  end if;

  -- Un mouvement raté se reprend sans rien payer.
  v_r := public.jetons_debiter_forfait(v_b, 'hypnose', 50, v_h3, 'hypnose', 'induction');
  perform public.jetons_confirmer((v_r ->> 'consommation')::uuid);
  v_r := public.jetons_debiter_forfait(v_b, 'hypnose', 50, v_h3, 'hypnose', 'approfondissement');
  perform public.jetons_rembourser((v_r ->> 'consommation')::uuid);
  v_r := public.jetons_debiter_forfait(v_b, 'hypnose', 50, v_h3, 'hypnose', 'approfondissement');
  if (v_r ->> 'jetons')::int <> 0 then raise exception 'ECHEC 8 : la reprise d''un mouvement raté se paie'; end if;

  -- Une induction rendue n'ouvre pas la série : l'appel suivant se paie.
  v_r := public.jetons_debiter_forfait(v_b, 'hypnose', 50, v_h4, 'hypnose', 'induction');
  perform public.jetons_rembourser((v_r ->> 'consommation')::uuid);
  v_r := public.jetons_debiter_forfait(v_b, 'hypnose', 50, v_h4, 'hypnose', 'approfondissement');
  if (v_r ->> 'jetons')::int <> 50 then raise exception 'ECHEC 8b : une série ouverte par un appel rendu reste ouverte'; end if;

  -- ══ Les refus ═════════════════════════════════════════════════════════
  begin
    perform public.jetons_debiter_forfait(v_b, 'hypnose', 50, v_h1, 'hypnose', 'finale');
    raise exception 'ECHEC 9 : un mouvement inconnu passe';
  exception when check_violation then null;
  end;
  begin
    perform public.jetons_debiter_forfait(v_b, 'hypnose', 50, '%', 'hypnose', 'induction');
    raise exception 'ECHEC 9b : un motif passe pour une hypnose';
  exception when check_violation then null;
  end;
  begin
    perform public.jetons_debiter_forfait(v_b, 'affirmations', 1, v_seance, 'seance', null);
    raise exception 'ECHEC 9c : des affirmations se rattachent au forfait d''une séance';
  exception when check_violation then null;
  end;
  begin
    perform public.jetons_debiter_forfait(v_b, 'module', 5, v_seance, 'gratuit', null);
    raise exception 'ECHEC 9d : une règle inventée passe';
  exception when check_violation then null;
  end;
  begin
    perform public.jetons_debiter_forfait(v_c, 'hypnose', 50, v_h1, 'hypnose', 'induction');
    raise exception 'ECHEC 9e : une hypnose passe sur un solde nul';
  exception when sqlstate 'KL402' then null;
  end;
  if exists (select 1 from public.jetons_consommations where cabinet_id = v_c) then
    raise exception 'ECHEC 9f : un refus faute de jetons inscrit une consommation';
  end if;

  -- ══ Les droits ════════════════════════════════════════════════════════
  foreach v_fn in array array[
    'public.jetons_liberer_reservations(uuid)',
    'public.jetons_prix_du_forfait(uuid,text,integer,text,text,text)',
    'public.jetons_debiter_forfait(uuid,text,integer,text,text,text)',
    'public.jetons_assurer_periode(uuid)',
    'public.jetons_debiter(uuid,text,integer,text)'
  ] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'ECHEC 10 : % s''exécute hors du serveur', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'ECHEC 10b : le serveur ne peut pas appeler %', v_fn;
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('jetons_liberer_reservations', 'jetons_prix_du_forfait', 'jetons_debiter_forfait')
                and (not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false))) then
    raise exception 'ECHEC 10c : une fonction nouvelle n''est pas en security definer avec un search_path vide';
  end if;

  raise exception 'REUSSITE : le forfait, puis le pass, puis les achats par ancienneté ; orphelines rendues à la lecture et à la dépense, une fois, sans toucher aux récentes ; forfait de séance compté sous verrou, réservé compris ; quatre mouvements par hypnose, un mouvement redemandé se paie, un appel rendu ne compte pas ; refus et KL402 sans trace ; fonctions au serveur seul';
end $$;
