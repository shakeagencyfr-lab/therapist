-- ============================================================================
-- 0058 éprouvée contre la vraie base : la vente se rembourse, et se compte.
--
--   écriture     personne, sous son propre compte, n'écrit une commande :
--                ni le patient ni la praticienne ne se déclarent payés ou
--                remboursés (seul le serveur, après Stripe)
--   lecture      le cabinet lit ses ventes, colonnes nouvelles comprises, et
--                pas celles du voisin ; le patient lit les siennes, pas
--                celles d'une autre fiche du même cabinet
--   cohérence    « remboursee » ⇔ un instant de remboursement ; on ne
--                rembourse que ce qui a été payé ; un état inconnu, un
--                identifiant Stripe mal formé sont refusés
--   définitif    une vente remboursée ne redevient pas payée, et son
--                remboursement ne se réécrit pas
--   livre        la période se lit par dates d'encaissement ET de
--                remboursement, sur des index partiels
--   titulaire    le serveur réserve le remboursement à la personne
--                titulaire : `est_titulaire_du_cabinet` le dit, pour une
--                assistante il dit non
--   audio        rembourser ne retire rien au patient ; cela lève la garde
--                de 0045 (« un audio acheté reste à son compte ») : la
--                praticienne peut alors le retirer, si c'est sa décision
--   trace        l'export du livre s'inscrit au journal d'accès — période et
--                choix des noms, aucune ligne du livre — par un membre du
--                cabinet seulement
--
-- Le bloc fabrique son revendeur, ses deux cabinets (abonnement actif), ses
-- comptes @exemple.test et leurs commandes, puis ANNULE tout par l'exception
-- finale : rien ne subsiste, même en cas de réussite.
--
--   psql "$DATABASE_URL" -f supabase/tests/ventes.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_plan text; v_cab uuid; v_voisin uuid;
  v_titulaire uuid := gen_random_uuid();
  v_assistante uuid := gen_random_uuid();
  v_voisine uuid := gen_random_uuid();
  v_uid_a uuid := gen_random_uuid();
  v_uid_b uuid := gen_random_uuid();
  v_a uuid; v_b uuid; v_c uuid;
  v_payee uuid; v_attente uuid; v_ancienne uuid; v_de_b uuid; v_du_voisin uuid;
  v_debut timestamptz := '2026-09-01 00:00:00+02';
  v_fin   timestamptz := '2026-10-01 00:00:00+02';
  v_audio uuid; v_produit uuid; v_achat uuid; v_envoi uuid;
  v_ok boolean;
  n int; v_liste text;
begin
  -- ── Ce qu'il faut pour éprouver ─────────────────────────────────────────
  insert into public.resellers (name, slug) values ('Revendeur 0058', 'revendeur-0058-t') returning id into v_rev;
  select code into v_plan from public.plans where max_patients is null limit 1;
  if v_plan is null then select code into v_plan from public.plans order by position desc limit 1; end if;

  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Cabinet 0058', 'cabinet-0058-t', 'x') returning id into v_cab;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_cab, v_plan, 'actif');
  insert into public.cabinets (reseller_id, name, slug, tagline)
  values (v_rev, 'Voisin 0058', 'voisin-0058-t', 'x') returning id into v_voisin;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_voisin, v_plan, 'actif');

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at) values
    (v_titulaire, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'titulaire-0058@exemple.test', '', now(), now(), now()),
    (v_assistante, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'assistante-0058@exemple.test', '', now(), now(), now()),
    (v_voisine, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'voisine-0058@exemple.test', '', now(), now(), now()),
    (v_uid_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patient-a-0058@exemple.test', '', now(), now(), now()),
    (v_uid_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'patient-b-0058@exemple.test', '', now(), now(), now());
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
    (v_cab, v_titulaire, 'owner', 'Titulaire 0058'),
    (v_cab, v_assistante, 'assistant', 'Assistante 0058'),
    (v_voisin, v_voisine, 'owner', 'Voisine 0058');

  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_uid_a, 'patient-a-0058@exemple.test', 'Camille Martin', 'CM', '', '', '', '', '')
  returning id into v_a;
  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_cab, v_uid_b, 'patient-b-0058@exemple.test', 'Dominique Roy', 'DR', '', '', '', '', '')
  returning id into v_b;
  insert into public.patients (cabinet_id, display_name, initials, program,
                               subtitle, week_label, scale_label, scale_question)
  values (v_voisin, 'Fiche du voisin', 'FV', '', '', '', '', '')
  returning id into v_c;

  -- Les commandes, écrites comme le serveur les écrit (clé de service).
  insert into public.orders (cabinet_id, patient_id, title, amount_cents, stripe_session_id,
                             status, paid_at, stripe_payment_intent, stripe_livemode)
  values (v_cab, v_a, 'Ancrage du soir', 2990, 'cs_test_0058_payee',
          'payee', '2026-09-12 10:00:00+02', 'pi_0058Payee', false)
  returning id into v_payee;
  insert into public.orders (cabinet_id, patient_id, title, amount_cents, stripe_session_id)
  values (v_cab, v_a, 'Séance', 6000, 'cs_test_0058_attente')
  returning id into v_attente;
  -- Payée en août, remboursée en septembre : n'entre au livre de septembre
  -- que par son remboursement.
  insert into public.orders (cabinet_id, patient_id, title, amount_cents, stripe_session_id,
                             status, paid_at)
  values (v_cab, v_b, 'Sommeil profond', 1500, 'cs_test_0058_ancienne',
          'payee', '2026-08-20 18:00:00+02')
  returning id into v_ancienne;
  insert into public.orders (cabinet_id, patient_id, title, amount_cents, stripe_session_id,
                             status, paid_at)
  values (v_cab, v_b, 'Programme', 9000, 'cs_test_0058_de_b',
          'payee', '2026-09-15 09:00:00+02')
  returning id into v_de_b;
  insert into public.orders (cabinet_id, patient_id, title, amount_cents, stripe_session_id,
                             status, paid_at)
  values (v_voisin, v_c, 'Chez le voisin', 4000, 'cs_test_0058_voisin',
          'payee', '2026-09-10 09:00:00+02')
  returning id into v_du_voisin;

  -- ── 0. Structure ────────────────────────────────────────────────────────
  select string_agg(i, ', ') into v_liste
    from unnest(array['orders_encaissements', 'orders_remboursements']) i
   where not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = i);
  if v_liste is not null then raise exception 'ECHEC 0 : index du livre manquants : %', v_liste; end if;

  if has_function_privilege('authenticated', 'public.orders_remboursement_definitif()', 'execute') then
    raise exception 'ECHEC 0b : la garde du remboursement s''appelle comme une fonction';
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'orders' and cmd <> 'SELECT';
  if n <> 0 then raise exception 'ECHEC 0c : % politique(s) d''écriture sur orders', n; end if;

  -- ── 1. Cohérence, sous la clé de service ────────────────────────────────
  begin
    update public.orders set status = 'remboursee' where id = v_payee;
    raise exception 'ECHEC 1 : remboursée sans instant de remboursement';
  exception when check_violation then null;
  end;
  begin
    update public.orders set status = 'remboursee', rembourse_at = now() where id = v_attente;
    raise exception 'ECHEC 2 : une commande jamais payée se dit remboursée';
  exception when check_violation then null;
  end;
  begin
    update public.orders set rembourse_at = now() where id = v_payee;
    raise exception 'ECHEC 3 : un instant de remboursement sur une vente payée';
  exception when check_violation then null;
  end;
  begin
    update public.orders set status = 'rembourse' where id = v_payee;
    raise exception 'ECHEC 4 : un état inconnu passe';
  exception when check_violation then null;
  end;
  begin
    update public.orders set stripe_payment_intent = 'pi_x/../y' where id = v_payee;
    raise exception 'ECHEC 5 : un identifiant de paiement mal formé passe';
  exception when check_violation then null;
  end;
  begin
    update public.orders set stripe_refund_id = 'rien' where id = v_payee;
    raise exception 'ECHEC 6 : un identifiant de remboursement mal formé passe';
  exception when check_violation then null;
  end;

  -- Le remboursement, tel que le serveur l'écrit : conditionnel, une fois.
  update public.orders
     set status = 'remboursee', rembourse_at = '2026-09-20 11:00:00+02', stripe_refund_id = 're_0058Rendu'
   where id = v_payee and status = 'payee';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC 7 : le remboursement ne s''écrit pas'; end if;
  update public.orders
     set status = 'remboursee', rembourse_at = now(), stripe_refund_id = 're_0058Double'
   where id = v_payee and status = 'payee';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC 8 : le même remboursement s''écrit deux fois'; end if;
  -- Constaté depuis Stripe (remboursé dans le tableau de bord) : sans référence.
  update public.orders set status = 'remboursee', rembourse_at = '2026-09-05 08:00:00+02'
   where id = v_ancienne and status = 'payee';

  -- ── 2. Définitif ────────────────────────────────────────────────────────
  begin
    update public.orders set status = 'payee', rembourse_at = null where id = v_payee;
    raise exception 'ECHEC 9 : une vente remboursée redevient payée';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.orders set rembourse_at = now() where id = v_payee;
    raise exception 'ECHEC 10 : l''instant du remboursement se réécrit';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.orders set amount_cents = 1 where id = v_payee;
    raise exception 'ECHEC 11 : le montant d''une vente remboursée se réécrit';
  exception when sqlstate '55000' then null;
  end;
  -- Ce qui reste permis : noter la livraison, qui ne touche pas au livre.
  update public.orders set livree_at = now() where id = v_payee;

  -- ── 3. Le patient : il lit ses commandes, il n'en écrit aucune ─────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_a, 'role', 'authenticated')::text, true);

  select count(*) into n from public.orders;
  if n <> 2 then raise exception 'ECHEC 12 : le patient lit % commande(s) au lieu de ses 2', n; end if;
  select count(*) into n from public.orders where patient_id = v_b;
  if n <> 0 then raise exception 'FUITE 13 : le patient lit les achats d''une autre fiche'; end if;
  select count(*) into n from public.orders
   where id = v_payee and status = 'remboursee' and rembourse_at is not null and stripe_refund_id = 're_0058Rendu';
  if n <> 1 then raise exception 'ECHEC 14 : le patient ne voit pas que son achat est remboursé'; end if;

  begin
    update public.orders set status = 'remboursee', rembourse_at = now() where id = v_attente;
    raise exception 'ECHEC 15 : le patient écrit l''état d''une commande';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.orders (cabinet_id, patient_id, title, amount_cents, stripe_session_id, status, paid_at)
    values (v_cab, v_a, 'Offert à moi-même', 100, 'cs_test_0058_faux', 'payee', now());
    raise exception 'ECHEC 16 : le patient crée une commande payée';
  exception when insufficient_privilege then null;
  end;

  -- ── 4. Le cabinet : son livre, pas celui du voisin ; aucune écriture ───
  perform set_config('request.jwt.claims', json_build_object('sub', v_titulaire, 'role', 'authenticated')::text, true);

  -- La requête de l'export : encaissées OU remboursées dans la période.
  select count(*) into n from public.orders
   where cabinet_id = v_cab
     and status in ('payee', 'remboursee')
     and ((paid_at >= v_debut and paid_at < v_fin) or (rembourse_at >= v_debut and rembourse_at < v_fin));
  if n <> 3 then raise exception 'ECHEC 17 : le livre de septembre lit % vente(s) au lieu de 3', n; end if;

  -- Encaissé net de septembre : 29,90 + 90,00 − 29,90 − 15,00 = 75,00 €.
  select coalesce(sum(amount_cents) filter (where paid_at >= v_debut and paid_at < v_fin), 0)
       - coalesce(sum(amount_cents) filter (where rembourse_at >= v_debut and rembourse_at < v_fin), 0)
    into n
    from public.orders
   where cabinet_id = v_cab and status in ('payee', 'remboursee');
  if n <> 7500 then raise exception 'ECHEC 18 : le net de septembre vaut % centimes au lieu de 7500', n; end if;

  select count(*) into n from public.orders where id = v_du_voisin;
  if n <> 0 then raise exception 'FUITE 19 : le cabinet lit la vente du voisin'; end if;

  begin
    update public.orders set status = 'remboursee', rembourse_at = now() where id = v_de_b;
    raise exception 'ECHEC 20 : la praticienne se déclare remboursée sans Stripe';
  exception when insufficient_privilege then null;
  end;

  -- ── 5. Titulaire, et elle seule ─────────────────────────────────────────
  select public.est_titulaire_du_cabinet(v_cab) into v_ok;
  if not v_ok then raise exception 'ECHEC 21 : la titulaire n''est pas reconnue'; end if;
  select public.est_titulaire_du_cabinet(v_voisin) into v_ok;
  if v_ok then raise exception 'FUITE 22 : titulaire du cabinet voisin'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_assistante, 'role', 'authenticated')::text, true);
  select public.est_titulaire_du_cabinet(v_cab) into v_ok;
  if v_ok then raise exception 'ECHEC 23 : une assistante passe pour titulaire'; end if;
  select count(*) into n from public.orders where cabinet_id = v_cab;
  if n <> 4 then raise exception 'ECHEC 24 : l''assistante lit % vente(s) au lieu des 4 du cabinet', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_voisine, 'role', 'authenticated')::text, true);
  select count(*) into n from public.orders where cabinet_id = v_cab;
  if n <> 0 then raise exception 'FUITE 25 : le cabinet voisin lit % vente(s)', n; end if;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  -- ── 6. Rembourser ne retire rien ; cela rend la main à la praticienne ──
  insert into public.audio_library (cabinet_id, title, duration_seconds, storage_path)
  values (v_cab, 'Ancrage 0058', 600, v_cab::text || '/ancrage-0058.mp3') returning id into v_audio;
  insert into public.products (cabinet_id, title, kind, audio_id, price_cents)
  values (v_cab, 'Ancrage 0058', 'audio', v_audio, 990) returning id into v_produit;
  insert into public.orders (cabinet_id, patient_id, product_id, title, amount_cents, stripe_session_id,
                             status, paid_at, livree_at)
  values (v_cab, v_a, v_produit, 'Ancrage 0058', 990, 'cs_test_0058_audio', 'payee', now(), now())
  returning id into v_achat;
  insert into public.patient_audios (cabinet_id, patient_id, audio_id)
  values (v_cab, v_a, v_audio) returning id into v_envoi;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_titulaire, 'role', 'authenticated')::text, true);
  begin
    delete from public.patient_audios where id = v_envoi;
    raise exception 'ECHEC 26 : un audio payé se retire de la bibliothèque du patient';
  exception when check_violation then null;
  end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.orders
     set status = 'remboursee', rembourse_at = now(), stripe_refund_id = 're_0058Audio'
   where id = v_achat and status = 'payee';
  select count(*) into n from public.patient_audios where id = v_envoi;
  if n <> 1 then raise exception 'ECHEC 27 : rembourser a retiré l''audio de la bibliothèque du patient'; end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_titulaire, 'role', 'authenticated')::text, true);
  delete from public.patient_audios where id = v_envoi;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ECHEC 28 : la vente remboursée, la praticienne ne peut toujours pas retirer l''audio'; end if;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  -- ── 7. L'export du livre laisse une trace, et rien d'autre ─────────────
  if has_function_privilege('anon', 'public.cabinet_tracer_export_ventes(uuid, date, date, boolean)', 'execute') then
    raise exception 'ECHEC 29 : un anonyme peut écrire au journal du cabinet';
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_assistante, 'role', 'authenticated')::text, true);
  perform public.cabinet_tracer_export_ventes(v_cab, '2026-09-01', '2026-09-30', true);
  begin
    perform public.cabinet_tracer_export_ventes(v_cab, '2026-09-30', '2026-09-01', false);
    raise exception 'ECHEC 30 : une période à l''envers s''inscrit au journal';
  exception when sqlstate '22023' then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_voisine, 'role', 'authenticated')::text, true);
  begin
    perform public.cabinet_tracer_export_ventes(v_cab, '2026-09-01', '2026-09-30', false);
    raise exception 'FUITE 31 : le cabinet voisin écrit au journal du cabinet';
  exception when sqlstate 'P0002' then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid_a, 'role', 'authenticated')::text, true);
  begin
    perform public.cabinet_tracer_export_ventes(v_cab, '2026-09-01', '2026-09-30', false);
    raise exception 'FUITE 32 : un patient écrit au journal du cabinet';
  exception when sqlstate 'P0002' then null;
  end;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.audit_log
   where cabinet_id = v_cab and action = 'boutique.livre_exporte' and actor_user_id = v_assistante
     and meta = jsonb_build_object('du', '2026-09-01'::date, 'au', '2026-09-30'::date, 'noms_complets', true);
  if n <> 1 then raise exception 'ECHEC 33 : l''export ne laisse pas sa trace, ou en dit trop (% ligne(s))', n; end if;
  select count(*) into n from public.audit_log where cabinet_id = v_cab and action = 'boutique.livre_exporte';
  if n <> 1 then raise exception 'ECHEC 34 : % trace(s) d''export au lieu d''une', n; end if;

  raise exception 'REUSSITE : remboursement écrit par le serveur seul, une fois et pour de bon ; livre de la période compté juste ; chacun ne lit que ses ventes ; titulaire seule reconnue ; rembourser ne retire rien, et rend la main sur l''audio ; l''export du livre laisse sa trace, sans une ligne du livre.';
end $$;
