-- 0070 éprouvée contre la vraie base : la facturation cabinet par cabinet.
--
--   par défaut         → sans exception, la règle d'avant : jetons si le
--                         revendeur les a activés ET posé sa clé, clé du
--                         cabinet sinon ; un forfait n'est versé qu'en jetons
--   clé forcée (BYOK)  → un cabinet gardé sur sa clé chez un revendeur en
--                         jetons : aucun forfait, l'écran du cabinet et
--                         l'aperçu du revendeur disent « clé du cabinet »
--   jetons forcés      → sans que le revendeur ait activé les jetons, avec sa
--                         clé : le cabinet passe en jetons et reçoit son
--                         forfait, ses voisins restent sur leur clé
--   jetons sans clé    → refusés à la pose ; une clé retirée APRÈS laisse le
--                         cabinet en jetons (pas de repli silencieux), sans
--                         forfait, « pas prêt » à l'écran ; le reste du
--                         contrat reste réglable, et le retour aussi
--   équipe             → l'essai qu'elle ouvre ne porte aucune exception de
--                         facturation, et elle ne la règle pas ; le
--                         propriétaire, si
--   journal            → l'exception s'inscrit, avant et après
--   droits             → les fonctions nouvelles au rôle de service seul
--
-- Un bloc, ANNULÉ par l'exception finale : rien ne subsiste.
do $$
declare
  v_suf   text := substr(md5(random()::text), 1, 8);
  v_own   uuid := gen_random_uuid();
  v_stf   uuid := gen_random_uuid();
  v_ther  uuid := gen_random_uuid();
  v_r1 uuid; v_r2 uuid; v_r3 uuid;
  v_p1 text := 'essai-0070a-' || v_suf;
  v_p2 text := 'essai-0070b-' || v_suf;
  v_p3 text := 'essai-0070c-' || v_suf;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid; v_g uuid;
  v_mois date := date_trunc('month', now() at time zone 'Europe/Paris')::date;
  v_etat jsonb; v_cab jsonb; v_n int; v_fn text;
begin
  -- ══ Le décor ══════════════════════════════════════════════════════════
  -- R1 : jetons activés, clé posée. R2 : clé posée, jetons NON activés. R3 : ni l'un ni l'autre.
  insert into public.resellers (name, slug) values ('Revendeur 0070 a', 'revendeur-0070a-' || v_suf) returning id into v_r1;
  insert into public.resellers (name, slug) values ('Revendeur 0070 b', 'revendeur-0070b-' || v_suf) returning id into v_r2;
  insert into public.resellers (name, slug) values ('Revendeur 0070 c', 'revendeur-0070c-' || v_suf) returning id into v_r3;
  update public.reseller_jetons set actif = true where reseller_id = v_r1;
  insert into public.reseller_secrets (reseller_id, anthropic_key_enc) values
    (v_r1, 'v1:essai:essai:essai'), (v_r2, 'v1:essai:essai:essai')
  on conflict (reseller_id) do update set anthropic_key_enc = excluded.anthropic_key_enc;

  insert into public.plans (code, label, price_cents, max_patients, position, reseller_id, shop, marque_blanche, site, jetons_mois, hypnose_incluse)
  values (v_p1, 'Essai 0070 a', 3900, null, 90, v_r1, false, false, false, 300, false),
         (v_p2, 'Essai 0070 b', 3900, null, 91, v_r2, false, false, false, 200, false),
         (v_p3, 'Essai 0070 c', 3900, null, 92, v_r3, false, false, false, 100, false);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), now(), now()
    from (values
      (v_own,  'proprietaire-0070-' || v_suf || '@exemple.test'),
      (v_stf,  'equipier-0070-' || v_suf || '@exemple.test'),
      (v_ther, 'praticienne-0070-' || v_suf || '@exemple.test')
    ) as u(id, email);
  insert into public.reseller_members (reseller_id, user_id, role) values (v_r3, v_own, 'owner'), (v_r3, v_stf, 'staff');

  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_r1, 'A 0070', 'cab-0070a-' || v_suf, 'x') returning id into v_a;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_r1, 'B 0070', 'cab-0070b-' || v_suf, 'x') returning id into v_b;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_r2, 'C 0070', 'cab-0070c-' || v_suf, 'x') returning id into v_c;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_r2, 'D 0070', 'cab-0070d-' || v_suf, 'x') returning id into v_d;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_r3, 'E 0070', 'cab-0070e-' || v_suf, 'x') returning id into v_e;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_r3, 'F 0070', 'cab-0070f-' || v_suf, 'x') returning id into v_f;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_r3, 'G 0070', 'cab-0070g-' || v_suf, 'x') returning id into v_g;
  insert into public.subscriptions (cabinet_id, plan_code, status) values
    (v_a, v_p1, 'actif'), (v_b, v_p1, 'actif'), (v_c, v_p2, 'actif'), (v_d, v_p2, 'actif'), (v_e, v_p3, 'actif');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values (v_b, v_ther, 'owner', 'Praticienne 0070');

  -- ══ Par défaut : la règle d'avant ═════════════════════════════════════
  if public.facturation_ia_du_cabinet(v_a) <> 'jetons' or not public.jetons_actifs_pour_cabinet(v_a) then
    raise exception 'ECHEC 1 : un cabinet sans exception d''un revendeur en jetons n''est pas en jetons';
  end if;
  if public.facturation_ia_du_cabinet(v_d) <> 'cle_cabinet' or public.jetons_actifs_pour_cabinet(v_d) then
    raise exception 'ECHEC 1b : des jetons non activés valent quand même';
  end if;
  if public.facturation_ia_du_cabinet(v_e) <> 'cle_cabinet' then
    raise exception 'ECHEC 1c : un revendeur sans clé ni jetons ne laisse pas la clé au cabinet';
  end if;
  if public.facturation_ia_du_cabinet(gen_random_uuid()) is not null then
    raise exception 'ECHEC 1d : un cabinet inconnu a un mode';
  end if;
  perform public.jetons_assurer_periode(v_a);
  perform public.jetons_assurer_periode(v_d);
  if not exists (select 1 from public.jetons_lots where cabinet_id = v_a and origine = 'mensuel' and periode = v_mois) then
    raise exception 'ECHEC 1e : le forfait par défaut n''est plus versé';
  end if;
  if exists (select 1 from public.jetons_lots where cabinet_id = v_d) then
    raise exception 'ECHEC 1f : un forfait est versé hors du mode jetons';
  end if;

  -- ══ Clé forcée (BYOK) chez un revendeur en jetons ═════════════════════
  update public.subscriptions set facturation_ia_override = 'cle_cabinet' where cabinet_id = v_b;
  if public.facturation_ia_du_cabinet(v_b) <> 'cle_cabinet' or public.jetons_actifs_pour_cabinet(v_b) then
    raise exception 'ECHEC 2 : l''exception « clé du cabinet » ne l''emporte pas sur le revendeur';
  end if;
  perform public.jetons_assurer_periode(v_b);
  if exists (select 1 from public.jetons_lots where cabinet_id = v_b) then
    raise exception 'ECHEC 2b : un cabinet gardé sur sa clé reçoit un forfait';
  end if;
  -- Ce que la praticienne lit, sous son jeton.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  v_etat := public.cabinet_jetons(v_b);
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  if v_etat ->> 'mode' <> 'cle_cabinet' or (v_etat ->> 'pret')::boolean then
    raise exception 'ECHEC 2c : l''écran du cabinet ne suit pas son exception : %', v_etat ->> 'mode';
  end if;
  -- Ce que le revendeur lit : le mode effectif et l'exception, cabinet par cabinet.
  v_etat := public.revendeur_jetons_apercu(v_r1);
  select x into v_cab from jsonb_array_elements(v_etat -> 'cabinets') x where x ->> 'cabinet_id' = v_b::text;
  if v_cab ->> 'mode_effectif' <> 'cle_cabinet' or v_cab ->> 'override' <> 'cle_cabinet' then
    raise exception 'ECHEC 2d : l''aperçu ne dit pas l''exception du cabinet : %', v_cab;
  end if;
  select x into v_cab from jsonb_array_elements(v_etat -> 'cabinets') x where x ->> 'cabinet_id' = v_a::text;
  if v_cab ->> 'mode_effectif' <> 'jetons' or v_cab -> 'override' <> 'null'::jsonb then
    raise exception 'ECHEC 2e : l''aperçu ne dit pas le mode par défaut : %', v_cab;
  end if;

  -- ══ Jetons forcés, jetons non activés, clé posée ══════════════════════
  update public.subscriptions set facturation_ia_override = 'jetons' where cabinet_id = v_c;
  if public.facturation_ia_du_cabinet(v_c) <> 'jetons' or not public.jetons_actifs_pour_cabinet(v_c) then
    raise exception 'ECHEC 3 : un cabinet placé en jetons ne l''est pas sans l''activation du revendeur';
  end if;
  perform public.jetons_assurer_periode(v_c);
  if (select jetons_initiaux from public.jetons_lots where cabinet_id = v_c and origine = 'mensuel' and periode = v_mois) is distinct from 200 then
    raise exception 'ECHEC 3b : le cabinet pilote ne reçoit pas son forfait';
  end if;
  if public.facturation_ia_du_cabinet(v_d) <> 'cle_cabinet' then
    raise exception 'ECHEC 3c : le voisin du cabinet pilote a changé de mode';
  end if;

  -- ══ Jetons forcés sans clé ════════════════════════════════════════════
  begin
    update public.subscriptions set facturation_ia_override = 'jetons' where cabinet_id = v_e;
    raise exception 'ECHEC 4 : des jetons sans clé du revendeur sont acceptés';
  exception when check_violation then null;
  end;
  -- La clé posée, l'exception passe ; retirée ensuite, le cabinet reste en jetons.
  insert into public.reseller_secrets (reseller_id, anthropic_key_enc) values (v_r3, 'v1:essai:essai:essai')
  on conflict (reseller_id) do update set anthropic_key_enc = excluded.anthropic_key_enc;
  update public.subscriptions set facturation_ia_override = 'jetons' where cabinet_id = v_e;
  update public.reseller_secrets set anthropic_key_enc = null where reseller_id = v_r3;
  if public.facturation_ia_du_cabinet(v_e) <> 'jetons' then
    raise exception 'ECHEC 4b : un cabinet en jetons retombe en silence sur sa clé quand celle du revendeur manque';
  end if;
  if public.jetons_actifs_pour_cabinet(v_e) then
    raise exception 'ECHEC 4c : des jetons sans clé pour les payer sont dits actifs';
  end if;
  perform public.jetons_assurer_periode(v_e);
  if exists (select 1 from public.jetons_lots where cabinet_id = v_e) then
    raise exception 'ECHEC 4d : un forfait est versé sans clé pour le dépenser';
  end if;
  -- Le reste du contrat se règle toujours, et le retour aussi.
  update public.subscriptions set max_patients_override = 12 where cabinet_id = v_e;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC 4e : un contrat en jetons sans clé ne se règle plus'; end if;

  -- ══ L'équipe et le propriétaire ═══════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stf, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin
    insert into public.subscriptions (cabinet_id, plan_code, status, trial_ends_at, facturation_ia_override)
    values (v_f, v_p3, 'essai', now() + interval '14 days', 'cle_cabinet');
    raise exception 'ECHEC 5 : l''équipe ouvre un essai avec une exception de facturation';
  exception when insufficient_privilege then null;
  end;
  insert into public.subscriptions (cabinet_id, plan_code, status, trial_ends_at)
  values (v_f, v_p3, 'essai', now() + interval '14 days');
  update public.subscriptions set facturation_ia_override = 'cle_cabinet' where cabinet_id = v_e;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'ECHEC 5b : un membre de l''équipe règle la facturation d''un cabinet'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.subscriptions (cabinet_id, plan_code, status, facturation_ia_override)
  values (v_g, v_p3, 'actif', 'cle_cabinet');
  update public.subscriptions set facturation_ia_override = null where cabinet_id = v_e;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'ECHEC 5c : le propriétaire ne règle pas la facturation'; end if;
  -- Même au propriétaire, la base refuse des jetons sans clé.
  begin
    update public.subscriptions set facturation_ia_override = 'jetons' where cabinet_id = v_e;
    raise exception 'ECHEC 5d : le propriétaire force des jetons sans clé';
  exception when check_violation then null;
  end;
  begin
    update public.subscriptions set facturation_ia_override = 'credits' where cabinet_id = v_e;
    raise exception 'ECHEC 5e : une valeur inconnue est acceptée';
  exception when check_violation then null;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  if public.facturation_ia_du_cabinet(v_e) <> 'cle_cabinet' then
    raise exception 'ECHEC 5f : revenu au réglage du revendeur, le cabinet n''est pas sur sa clé';
  end if;

  -- ══ Le journal ════════════════════════════════════════════════════════
  if not exists (
    select 1 from public.audit_log
     where cabinet_id = v_b and action = 'contrat.exception'
       and meta -> 'facturation_ia' ->> 'apres' = 'cle_cabinet'
       and meta -> 'facturation_ia' -> 'avant' = 'null'::jsonb
  ) then
    raise exception 'ECHEC 6 : l''exception de facturation n''est pas au journal';
  end if;
  if not exists (
    select 1 from public.audit_log
     where cabinet_id = v_e and action = 'contrat.exception'
       and meta -> 'facturation_ia' ->> 'avant' = 'jetons'
       and meta -> 'facturation_ia' -> 'apres' = 'null'::jsonb
  ) then
    raise exception 'ECHEC 6b : le retour au réglage du revendeur n''est pas au journal';
  end if;

  -- ══ Les droits ════════════════════════════════════════════════════════
  foreach v_fn in array array[
    'public.facturation_ia_du_cabinet(uuid)',
    'public.jetons_actifs_pour_cabinet(uuid)',
    'public.facturation_ia_exige_la_cle()'
  ] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'ECHEC 7 : % est ouverte au navigateur', v_fn;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.cabinet_jetons(uuid)', 'execute') then
    raise exception 'ECHEC 7b : le cabinet ne lit plus ses jetons';
  end if;
  if has_table_privilege('authenticated', 'public.reseller_secrets', 'select') then
    raise exception 'ECHEC 7c : les secrets du revendeur se lisent du navigateur';
  end if;

  raise exception 'REUSSITE : par défaut la règle d''avant ; la clé forcée l''emporte sur les jetons du revendeur, sans forfait ; les jetons forcés valent sans activation, avec forfait, sans toucher aux voisins ; sans clé ils sont refusés à la pose, et une clé retirée ensuite laisse le cabinet en jetons sans forfait ni repli ; l''équipe n''ouvre ni ne règle d''exception de facturation, le propriétaire si ; le journal dit avant et après ; fonctions au serveur seul';
end $$;
