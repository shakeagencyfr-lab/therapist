-- 0065 éprouvée contre la vraie base : les jetons.
--
--   mode clé du cabinet → rien ne se verse, tant que le revendeur n'a pas
--                          activé les jetons ET posé sa clé
--   forfait du mois     → versé une fois, et le mois passé ne compte plus
--   essai               → un lot unique, qui expire (et se prolonge) avec l'essai
--   dépense             → le mois d'abord, l'achat ensuite ; solde insuffisant
--                          refusé en KL402, solde et besoin dits ; zéro permis
--   rendre              → chaque lot retrouve sa part, une seule fois
--   encaisser           → une recharge versée une fois, un pass prolongé une fois
--   hypnose             → l'offre, l'exception, le pass, le contrat ; et les
--                          cabinets qui en écrivaient déjà la gardent
--   navigateur          → chacun lit les siens, personne n'écrit rien ; ni
--                          voisin, ni patient, ni anonyme ; l'équipe du
--                          revendeur n'ouvre pas d'essai d'exception
--   fonctions           → au rôle de service seul
--
-- Un bloc, ANNULÉ par l'exception finale : rien ne subsiste.
do $$
declare
  v_suf     text := substr(md5(random()::text), 1, 8);
  v_owner   uuid := gen_random_uuid();
  v_staff   uuid := gen_random_uuid();
  v_ther    uuid := gen_random_uuid();
  v_voisine uuid := gen_random_uuid();
  v_compte  uuid := gen_random_uuid();
  v_res     uuid;
  v_plan    text := 'essai-0065-' || v_suf;
  v_plan_h  text := 'essai-0065h-' || v_suf;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid;
  v_mois    date := date_trunc('month', now() at time zone 'Europe/Paris')::date;
  v_conso   uuid; v_conso2 uuid; v_cmd uuid; v_cmd2 uuid; v_cmd3 uuid;
  v_n int; v_m int; v_etat jsonb; v_r jsonb; v_fin timestamptz; v_fin2 timestamptz; v_detail text;
  v_fn text; v_tab text;
begin
  -- ══ Le décor ═══════════════════════════════════════════════════════════
  insert into public.resellers (name, slug) values ('Revendeur 0065', 'revendeur-0065-' || v_suf) returning id into v_res;

  -- Un revendeur neuf naît avec ses réglages et ses trois recharges.
  select count(*) into v_n from public.jetons_recharges where reseller_id = v_res and actif and archivee_le is null;
  if v_n <> 3 then raise exception 'ECHEC 0 : % recharge(s) par défaut au lieu de 3', v_n; end if;
  if not exists (select 1 from public.reseller_jetons r
                  where r.reseller_id = v_res and not r.actif and r.bareme_seance = 12 and r.bareme_module = 5
                    and r.bareme_profil = 5 and r.bareme_affirmations = 1 and r.bareme_hypnose = 50
                    and r.bareme_retouche = 3 and r.bareme_retouche_hypnose = 8 and r.essai_jetons = 100
                    and r.option_hypnose_prix_cents = 1900 and r.option_hypnose_jours = 30
                    and r.option_hypnose_jetons = 200) then
    raise exception 'ECHEC 0b : les réglages par défaut du revendeur ne sont pas ceux attendus';
  end if;

  insert into public.plans (code, label, price_cents, max_patients, position, reseller_id, shop, marque_blanche, site, jetons_mois, hypnose_incluse)
  values (v_plan, 'Essai 0065', 3900, null, 90, v_res, false, false, false, 300, false),
         (v_plan_h, 'Essai 0065 H', 14900, null, 91, v_res, false, false, false, 2000, true);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, '', now(), now(), now()
    from (values
      (v_owner, 'revendeur-0065-' || v_suf || '@exemple.test'),
      (v_staff, 'equipe-0065-' || v_suf || '@exemple.test'),
      (v_ther, 'praticienne-0065-' || v_suf || '@exemple.test'),
      (v_voisine, 'voisine-0065-' || v_suf || '@exemple.test'),
      (v_compte, 'patient-0065-' || v_suf || '@exemple.test')
    ) as u(id, email);
  insert into public.reseller_members (reseller_id, user_id, role) values (v_res, v_owner, 'owner'), (v_res, v_staff, 'staff');

  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet A 0065', 'cab-0065a-' || v_suf, 'x') returning id into v_a;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet B 0065', 'cab-0065b-' || v_suf, 'x') returning id into v_b;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet C 0065', 'cab-0065c-' || v_suf, 'x') returning id into v_c;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet D 0065', 'cab-0065d-' || v_suf, 'x') returning id into v_d;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_res, 'Cabinet E 0065', 'cab-0065e-' || v_suf, 'x') returning id into v_e;
  insert into public.subscriptions (cabinet_id, plan_code, status) values
    (v_a, v_plan, 'actif'), (v_b, v_plan, 'actif'), (v_d, v_plan, 'actif');
  insert into public.subscriptions (cabinet_id, plan_code, status, trial_ends_at) values
    (v_c, v_plan, 'essai', now() + interval '7 days');
  insert into public.cabinet_members (cabinet_id, user_id, role, display_name) values
    (v_a, v_ther, 'owner', 'Praticienne 0065'), (v_b, v_voisine, 'owner', 'Voisine 0065');
  insert into public.patients (cabinet_id, auth_user_id, email, display_name, initials, program, subtitle, week_label, scale_label, scale_question)
  values (v_a, v_compte, 'patient-0065-' || v_suf || '@exemple.test', 'Anna 0065', 'A', '', '', '', '', '');

  -- ══ Mode clé du cabinet : rien ne se verse ════════════════════════════
  perform public.jetons_assurer_periode(v_a);
  if exists (select 1 from public.jetons_lots where cabinet_id = v_a) then
    raise exception 'ECHEC 1 : un lot est versé hors du mode jetons';
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  v_etat := public.cabinet_jetons(v_a);
  if v_etat ->> 'mode' <> 'cle_cabinet' or (v_etat ->> 'solde')::int <> 0 then
    raise exception 'ECHEC 1b : un cabinet sans jetons se lit en mode % avec % jeton(s)', v_etat ->> 'mode', v_etat ->> 'solde';
  end if;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  -- Activés sans clé : toujours rien.
  update public.reseller_jetons set actif = true where reseller_id = v_res;
  perform public.jetons_assurer_periode(v_a);
  if public.jetons_mode_actif(v_res) or exists (select 1 from public.jetons_lots where cabinet_id = v_a) then
    raise exception 'ECHEC 1c : les jetons valent sans clé du revendeur';
  end if;
  insert into public.reseller_secrets (reseller_id, anthropic_key_enc) values (v_res, 'v1:essai:essai:essai')
  on conflict (reseller_id) do update set anthropic_key_enc = excluded.anthropic_key_enc;
  if not public.jetons_mode_actif(v_res) then
    raise exception 'ECHEC 1d : activés, clé posée, les jetons ne valent toujours pas';
  end if;

  -- ══ Le forfait du mois : une fois, et le mois passé ne compte plus ════
  insert into public.jetons_lots (cabinet_id, origine, jetons_initiaux, restants, expire_le, periode)
  values (v_a, 'mensuel', 300, 250, v_mois::timestamp at time zone 'Europe/Paris', (v_mois - interval '1 month')::date);
  perform public.jetons_assurer_periode(v_a);
  perform public.jetons_assurer_periode(v_a);
  select count(*) into v_n from public.jetons_lots where cabinet_id = v_a and origine = 'mensuel' and periode = v_mois;
  if v_n <> 1 then raise exception 'ECHEC 2 : % forfait(s) ce mois au lieu d''un', v_n; end if;
  select coalesce(sum(restants), 0) into v_n from public.jetons_lots where cabinet_id = v_a and expire_le > now();
  if v_n <> 300 then raise exception 'ECHEC 2b : solde de % au lieu de 300 — le mois passé se cumule', v_n; end if;
  if not exists (select 1 from public.jetons_lots
                  where cabinet_id = v_a and periode = v_mois
                    and expire_le = (v_mois + interval '1 month')::timestamp at time zone 'Europe/Paris') then
    raise exception 'ECHEC 2c : le forfait n''expire pas au premier du mois suivant';
  end if;

  -- ══ L'essai : un lot unique, qui expire avec l'essai ══════════════════
  perform public.jetons_assurer_periode(v_c);
  perform public.jetons_assurer_periode(v_c);
  select count(*) into v_n from public.jetons_lots where cabinet_id = v_c;
  select count(*) into v_m from public.jetons_lots l join public.subscriptions s on s.cabinet_id = l.cabinet_id
   where l.cabinet_id = v_c and l.origine = 'essai' and l.jetons_initiaux = 100 and l.expire_le = s.trial_ends_at;
  if v_n <> 1 or v_m <> 1 then raise exception 'ECHEC 3 : l''essai porte % lot(s), dont % juste(s)', v_n, v_m; end if;
  update public.subscriptions set trial_ends_at = trial_ends_at + interval '3 days' where cabinet_id = v_c;
  perform public.jetons_assurer_periode(v_c);
  if not exists (select 1 from public.jetons_lots l join public.subscriptions s on s.cabinet_id = l.cabinet_id
                  where l.cabinet_id = v_c and l.origine = 'essai' and l.expire_le = s.trial_ends_at) then
    raise exception 'ECHEC 3b : l''essai prolongé laisse son lot expirer à l''ancienne date';
  end if;

  -- ══ La dépense : le mois d'abord, l'achat ensuite ═════════════════════
  perform public.jetons_crediter(v_a, 'achat', 50, now() + interval '12 months', null);
  v_conso := public.jetons_debiter(v_a, 'seance', 320, 'seance-0065');
  if (select restants from public.jetons_lots where cabinet_id = v_a and periode = v_mois) <> 0
     or (select restants from public.jetons_lots where cabinet_id = v_a and origine = 'achat') <> 30 then
    raise exception 'ECHEC 4 : la dépense ne puise pas le mois avant l''achat';
  end if;
  select count(*) into v_n from public.jetons_consommation_lots where consommation_id = v_conso;
  if v_n <> 2 or (select statut from public.jetons_consommations where id = v_conso) <> 'reserve' then
    raise exception 'ECHEC 4b : la réservation n''est pas inscrite lot par lot';
  end if;

  begin
    perform public.jetons_debiter(v_a, 'hypnose', 50, null);
    raise exception 'ECHEC 5 : une hypnose passe sur un solde de 30';
  exception when sqlstate 'KL402' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm !~ '30' or sqlerrm !~ '50' then raise exception 'ECHEC 5b : le refus ne dit pas le solde et le besoin (%)', sqlerrm; end if;
    if (v_detail::jsonb ->> 'solde')::int <> 30 or (v_detail::jsonb ->> 'besoin')::int <> 50 then
      raise exception 'ECHEC 5c : le détail du refus est faux (%)', v_detail;
    end if;
  end;
  select coalesce(sum(restants), 0) into v_n from public.jetons_lots where cabinet_id = v_a and expire_le > now();
  if v_n <> 30 then raise exception 'ECHEC 5d : un refus a touché au solde (%)', v_n; end if;

  -- Zéro jeton : une action comprise, inscrite pour être comptée.
  v_conso2 := public.jetons_debiter(v_a, 'module', 0, 'seance-0065');
  if (select jetons from public.jetons_consommations where id = v_conso2) <> 0 then
    raise exception 'ECHEC 6 : une action comprise n''est pas inscrite à zéro';
  end if;

  -- ══ Rendre : chaque lot retrouve sa part, une fois ═════════════════════
  perform public.jetons_rembourser(v_conso);
  perform public.jetons_rembourser(v_conso);
  if (select restants from public.jetons_lots where cabinet_id = v_a and periode = v_mois) <> 300
     or (select restants from public.jetons_lots where cabinet_id = v_a and origine = 'achat') <> 50
     or (select statut from public.jetons_consommations where id = v_conso) <> 'rembourse' then
    raise exception 'ECHEC 7 : le remboursement ne rend pas exactement, ou rend deux fois';
  end if;
  perform public.jetons_confirmer(v_conso2);
  perform public.jetons_confirmer(v_conso);
  if (select statut from public.jetons_consommations where id = v_conso2) <> 'confirme'
     or (select statut from public.jetons_consommations where id = v_conso) <> 'rembourse' then
    raise exception 'ECHEC 7b : confirmer ne suit pas la réservation, ou ressuscite un remboursement';
  end if;

  -- ══ Encaisser : une recharge une fois, un pass une fois ═══════════════
  insert into public.jetons_commandes (cabinet_id, reseller_id, objet, libelle, jetons, prix_cents)
  values (v_a, v_res, 'recharge', '100 jetons', 100, 1200) returning id into v_cmd;
  v_r := public.jetons_encaisser(v_cmd);
  if (v_r ->> 'deja')::boolean or (select statut from public.jetons_commandes where id = v_cmd) <> 'payee' then
    raise exception 'ECHEC 8 : la commande n''est pas passée payée';
  end if;
  v_r := public.jetons_encaisser(v_cmd);
  select count(*) into v_n from public.jetons_lots where commande_id = v_cmd and origine = 'achat' and jetons_initiaux = 100;
  if not (v_r ->> 'deja')::boolean or v_n <> 1 then
    raise exception 'ECHEC 8b : une seconde vérification verse encore (% lot(s))', v_n;
  end if;

  insert into public.jetons_commandes (cabinet_id, reseller_id, objet, libelle, jetons, jours, prix_cents)
  values (v_d, v_res, 'option_hypnose', 'Option Hypnose', 200, 30, 1900) returning id into v_cmd2;
  perform public.jetons_encaisser(v_cmd2);
  select hypnose_jusqu_au into v_fin from public.subscriptions where cabinet_id = v_d;
  if v_fin is null or v_fin < now() + interval '29 days' or v_fin > now() + interval '31 days' then
    raise exception 'ECHEC 9 : le pass ne court pas trente jours (%)', v_fin;
  end if;
  if not exists (select 1 from public.jetons_lots where cabinet_id = v_d and origine = 'option_hypnose'
                    and jetons_initiaux = 200 and expire_le = v_fin and commande_id = v_cmd2) then
    raise exception 'ECHEC 9b : les jetons du pass ne sont pas versés, ou n''expirent pas avec lui';
  end if;
  perform public.jetons_encaisser(v_cmd2);
  select hypnose_jusqu_au into v_fin2 from public.subscriptions where cabinet_id = v_d;
  if v_fin2 <> v_fin then raise exception 'ECHEC 9c : une seconde vérification prolonge encore le pass'; end if;

  insert into public.jetons_commandes (cabinet_id, reseller_id, objet, libelle, jetons, prix_cents, statut)
  values (v_a, v_res, 'recharge', '100 jetons', 100, 1200, 'annulee') returning id into v_cmd3;
  begin
    perform public.jetons_encaisser(v_cmd3);
    raise exception 'ECHEC 9d : une commande annulée s''encaisse';
  exception when check_violation then null;
  end;

  -- ══ Le droit à l'hypnose ═══════════════════════════════════════════════
  if public.hypnose_ouverte(v_a) then raise exception 'ECHEC 10 : l''hypnose est ouverte hors offre'; end if;
  update public.subscriptions set plan_code = v_plan_h where cabinet_id = v_a;
  if not public.hypnose_ouverte(v_a) then raise exception 'ECHEC 10b : l''offre qui la comprend ne l''ouvre pas'; end if;
  update public.subscriptions set hypnose_override = false where cabinet_id = v_a;
  if public.hypnose_ouverte(v_a) then raise exception 'ECHEC 10c : l''exception fermée ne ferme pas'; end if;
  update public.subscriptions set plan_code = v_plan, hypnose_override = true where cabinet_id = v_a;
  if not public.hypnose_ouverte(v_a) then raise exception 'ECHEC 10d : l''exception ouverte n''ouvre pas'; end if;
  update public.subscriptions set hypnose_override = false, hypnose_jusqu_au = now() + interval '1 day' where cabinet_id = v_a;
  if not public.hypnose_ouverte(v_a) then raise exception 'ECHEC 10e : un pass en cours n''ouvre pas'; end if;
  if not public.hypnose_ouverte(v_d) then raise exception 'ECHEC 10f : le pass acheté n''ouvre pas'; end if;
  update public.subscriptions set status = 'impaye' where cabinet_id = v_d;
  if public.hypnose_ouverte(v_d) then raise exception 'ECHEC 10g : l''hypnose reste ouverte hors contrat'; end if;
  update public.subscriptions set hypnose_override = null, hypnose_jusqu_au = null where cabinet_id = v_a;

  -- Personne ne perd l'hypnose qu'il utilisait avant 0065.
  select count(*) into v_n
    from public.subscriptions s
   where s.hypnose_override is null
     and exists (select 1 from public.hypnoses h where h.cabinet_id = s.cabinet_id and h.created_at < '2026-10-01');
  if v_n <> 0 then raise exception 'ECHEC 11 : % cabinet(s) qui écrivaient des hypnoses ont perdu l''option', v_n; end if;

  -- ══ Le navigateur : chacun lit les siens ══════════════════════════════
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ther, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  v_etat := public.cabinet_jetons(v_a);
  if v_etat ->> 'mode' <> 'jetons'
     or (v_etat ->> 'solde')::int <> 450
     or (v_etat -> 'mensuel' ->> 'total')::int <> 300
     or (v_etat -> 'mensuel' ->> 'restant')::int <> 300
     or (v_etat -> 'mensuel' ->> 'renouvellement')::date <> (v_mois + interval '1 month')::date
     or (v_etat ->> 'achete_restant')::int <> 150
     or jsonb_array_length(v_etat -> 'recharges') <> 3
     or (v_etat -> 'bareme' ->> 'seance')::int <> 12
     or (v_etat -> 'option_hypnose' ->> 'prix_cents')::int <> 1900
     or (v_etat ->> 'paiement_possible')::boolean
     or (v_etat -> 'hypnose' ->> 'droit')::boolean
     or jsonb_array_length(v_etat -> 'historique') <> 2 then
    raise exception 'ECHEC 12 : l''état du cabinet est faux : %', v_etat;
  end if;
  if (public.cabinet_droits(v_a) ->> 'hypnose')::boolean is distinct from false
     or (public.mes_droits() ->> 'hypnose') is null then
    raise exception 'ECHEC 12b : les droits du cabinet ne disent pas l''hypnose';
  end if;
  if public.cabinet_jetons(v_b) is not null then raise exception 'ECHEC 13 : la praticienne lit les jetons d''un voisin'; end if;
  select count(*) into v_n from public.jetons_lots where cabinet_id <> v_a;
  select count(*) into v_m from public.jetons_lots where cabinet_id = v_a;
  if v_n <> 0 or v_m = 0 then raise exception 'ECHEC 13b : la lecture des lots n''est pas bornée à son cabinet'; end if;

  -- Personne n'écrit depuis le navigateur.
  begin
    insert into public.jetons_lots (cabinet_id, origine, jetons_initiaux, restants, expire_le) values (v_a, 'geste', 999, 999, now() + interval '1 day');
    raise exception 'ECHEC 14 : la praticienne se verse des jetons';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.jetons_lots set restants = jetons_initiaux where cabinet_id = v_a;
    raise exception 'ECHEC 14b : la praticienne remplit ses lots';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.jetons_consommations where cabinet_id = v_a;
    raise exception 'ECHEC 14c : la praticienne efface ses consommations';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.jetons_commandes (cabinet_id, reseller_id, objet, jetons, prix_cents, statut) values (v_a, v_res, 'recharge', 1000, 100, 'payee');
    raise exception 'ECHEC 14d : la praticienne se déclare une commande payée';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.jetons_consommation_lots;
    raise exception 'ECHEC 14e : le détail par lot se lit du navigateur';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.jetons_debiter(v_a, 'seance', 0, null);
    raise exception 'ECHEC 14f : la praticienne appelle une fonction du serveur';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.jetons_crediter(v_a, 'geste', 1000, now() + interval '1 day', null);
    raise exception 'ECHEC 14g : la praticienne se crédite';
  exception when insufficient_privilege then null;
  end;

  -- La voisine, le patient : rien.
  perform set_config('request.jwt.claims', json_build_object('sub', v_voisine, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if public.cabinet_jetons(v_a) is not null then raise exception 'ECHEC 15 : une voisine lit l''état des jetons'; end if;
  select (select count(*) from public.jetons_lots where cabinet_id = v_a)
       + (select count(*) from public.jetons_consommations where cabinet_id = v_a)
       + (select count(*) from public.jetons_commandes where cabinet_id = v_a) into v_n;
  if v_n <> 0 then raise exception 'ECHEC 15b : une voisine lit % ligne(s) de jetons', v_n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_compte, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if public.cabinet_jetons(v_a) is not null then raise exception 'ECHEC 16 : le patient lit les jetons de son cabinet'; end if;
  select (select count(*) from public.jetons_lots) + (select count(*) from public.jetons_consommations)
       + (select count(*) from public.jetons_commandes) + (select count(*) from public.reseller_jetons)
       + (select count(*) from public.jetons_recharges) into v_n;
  if v_n <> 0 then raise exception 'ECHEC 16b : le patient lit % ligne(s) de jetons', v_n; end if;

  -- Le revendeur lit ses réglages et ses commandes ; il ne les écrit pas du navigateur.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into v_n from public.reseller_jetons where reseller_id = v_res;
  select count(*) into v_m from public.jetons_commandes where reseller_id = v_res;
  if v_n <> 1 or v_m < 2 then raise exception 'ECHEC 17 : le revendeur ne lit pas ses réglages (%) ou ses commandes (%)', v_n, v_m; end if;
  if public.cabinet_jetons(v_a) is not null then raise exception 'ECHEC 17b : le revendeur lit l''état d''un cabinet par la fonction du cabinet'; end if;
  begin
    update public.reseller_jetons set bareme_seance = 0 where reseller_id = v_res;
    raise exception 'ECHEC 17c : le barème se règle depuis le navigateur';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.jetons_recharges (reseller_id, libelle, jetons, prix_cents) values (v_res, 'x', 1, 100);
    raise exception 'ECHEC 17d : une recharge se crée depuis le navigateur';
  exception when insufficient_privilege then null;
  end;
  -- Il règle le forfait et l'hypnose de ses offres, comme le reste (0049).
  update public.plans set jetons_mois = 400, hypnose_incluse = true where code = v_plan;
  if (select jetons_mois from public.plans where code = v_plan) <> 400 then
    raise exception 'ECHEC 17e : le propriétaire ne règle pas le forfait de son offre';
  end if;

  -- L'équipe n'ouvre qu'un essai ordinaire.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin
    insert into public.subscriptions (cabinet_id, plan_code, status, hypnose_override) values (v_e, v_plan, 'essai', true);
    raise exception 'ECHEC 18 : l''équipe ouvre un essai avec l''hypnose en exception';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.subscriptions (cabinet_id, plan_code, status, jetons_mois_override) values (v_e, v_plan, 'essai', 5000);
    raise exception 'ECHEC 18b : l''équipe ouvre un essai avec un forfait d''exception';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.subscriptions (cabinet_id, plan_code, status, hypnose_jusqu_au) values (v_e, v_plan, 'essai', now() + interval '1 year');
    raise exception 'ECHEC 18c : l''équipe offre un pass Hypnose';
  exception when insufficient_privilege then null;
  end;
  insert into public.subscriptions (cabinet_id, plan_code, status) values (v_e, v_plan, 'essai');

  -- L'anonyme : rien.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform count(*) from public.jetons_lots;
    raise exception 'ECHEC 19 : un visiteur anonyme lit des lots';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cabinet_jetons(v_a);
    raise exception 'ECHEC 19b : un visiteur anonyme appelle cabinet_jetons';
  exception when insufficient_privilege then null;
  end;

  -- ══ Les droits, relus depuis le catalogue ══════════════════════════════
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  foreach v_fn in array array[
    'public.jetons_reglages(uuid)', 'public.jetons_mode_actif(uuid)', 'public.hypnose_ouverte(uuid)',
    'public.jetons_assurer_periode(uuid)', 'public.jetons_debiter(uuid,text,integer,text)',
    'public.jetons_confirmer(uuid)', 'public.jetons_rembourser(uuid)',
    'public.jetons_crediter(uuid,text,integer,timestamptz,uuid)', 'public.jetons_encaisser(uuid)',
    'public.revendeur_jetons_apercu(uuid)', 'public.jetons_revendeur_neuf()'
  ] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'ECHEC 20 : % s''exécute hors du serveur', v_fn;
    end if;
    if v_fn <> 'public.jetons_revendeur_neuf()' and not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'ECHEC 20b : le serveur ne peut pas appeler %', v_fn;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.cabinet_jetons(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.cabinet_jetons(uuid)', 'execute') then
    raise exception 'ECHEC 20c : cabinet_jetons est ouverte au mauvais rôle';
  end if;
  foreach v_tab in array array[
    'public.reseller_jetons', 'public.jetons_recharges', 'public.jetons_commandes',
    'public.jetons_lots', 'public.jetons_consommations', 'public.jetons_consommation_lots'
  ] loop
    if has_table_privilege('authenticated', v_tab, 'insert') or has_table_privilege('authenticated', v_tab, 'update')
       or has_table_privilege('authenticated', v_tab, 'delete') or has_table_privilege('anon', v_tab, 'select')
       or has_table_privilege('anon', v_tab, 'insert') then
      raise exception 'ECHEC 21 : un droit d''écriture, ou de lecture anonyme, reste sur %', v_tab;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = v_tab::regclass) then
      raise exception 'ECHEC 21b : % n''a pas la sécurité par ligne', v_tab;
    end if;
  end loop;
  -- Le journal de l'offre dit le forfait et l'hypnose réglés plus haut.
  if not exists (select 1 from public.audit_log where action = 'offre.reglee' and meta ->> 'code' = v_plan
                    and actor_user_id = v_owner
                    and meta -> 'champs' ? 'jetons_mois' and meta -> 'champs' ? 'hypnose_incluse') then
    raise exception 'ECHEC 17f : le journal de l''offre ne dit pas le forfait ni l''hypnose';
  end if;
  if has_column_privilege('authenticated', 'public.plans', 'jetons_mois', 'update') is not true then
    raise exception 'ECHEC 21c : le forfait de l''offre ne se règle pas';
  end if;

  raise exception 'REUSSITE : rien hors du mode jetons ; forfait versé une fois, sans cumul ; essai unique qui suit l''essai ; le mois avant l''achat ; KL402 dit solde et besoin ; zéro inscrit ; remboursement exact et unique ; recharge et pass encaissés une fois ; hypnose selon offre, exception, pass et contrat, et gardée par qui l''utilisait ; chacun lit les siens, personne n''écrit ; l''équipe n''ouvre pas d''essai d''exception ; fonctions au serveur seul';
end $$;
