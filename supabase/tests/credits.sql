-- ============================================================================
-- Le grand livre des crédits fait foi, et personne ne s'y écrit une ligne.
--
--   la thérapeute → lit son solde, voit les paquets de SON revendeur
--                 → ne peut ni se créditer, ni effacer une consommation
--                 → ne voit pas le grand livre d'un autre cabinet
--   le revendeur  → lit le grand livre de ses cabinets
--                 → ne voit jamais une clé, même la sienne
--
-- Un seul bloc DO terminé par RAISE EXCEPTION 'REUSSITE …' : rien ne persiste.
--
--   psql "$DATABASE_URL" -f supabase/tests/credits.sql
-- ============================================================================

do $$
declare
  v_rev uuid; v_org uuid; v_a uuid; v_b uuid; v_pack uuid; n integer; solde integer; etat jsonb;
begin
  select m.user_id, m.reseller_id into v_rev, v_org from public.reseller_members m limit 1;
  if v_rev is null then raise exception 'Aucun compte revendeur.'; end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('bbbb0000-0000-4000-8000-00000000cc01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','test-credits-a@exemple.fr','',now(),now(),now());

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org,'Cabinet Credit A','cabinet-credit-a','Espace thérapie') returning id into v_a;
  insert into public.cabinets (reseller_id, name, slug, tagline) values (v_org,'Cabinet Credit B','cabinet-credit-b','Espace thérapie') returning id into v_b;
  insert into public.cabinet_invitations (cabinet_id, email, role, expires_at) values (v_a,'test-credits-a@exemple.fr','owner', now() + interval '1 day');

  -- Le revendeur compose son offre : les paquets ne sont pas des secrets,
  -- il les écrit lui-même.
  insert into public.credit_packs (reseller_id, label, credits, price_cents) values (v_org,'Recharge 50',50,2500) returning id into v_pack;
  insert into public.credit_packs (reseller_id, label, credits, price_cents, is_active) values (v_org,'Ancienne offre',10,900,false);

  -- 1. Le mode se règle par abonnement, et vaut « clé du cabinet » par défaut.
  perform set_config('role','none',true);

  -- Ses réglages de revente, en revanche, il ne les écrit PAS lui-même : la
  -- table n'a qu'une politique de lecture, et tout passe par le serveur, qui
  -- éprouve chaque clé avant de l'enregistrer. On les pose donc hors RLS.
  insert into public.reseller_ai_settings (reseller_id, marge_pct, decouvert_credits) values (v_org, 120, 3)
    on conflict (reseller_id) do update set marge_pct = 120, decouvert_credits = 3;
  insert into public.subscriptions (cabinet_id, plan_code) values (v_a, 'essentiel')
    on conflict (cabinet_id) do nothing;
  select to_jsonb(s.ai_billing::text) into etat from public.subscriptions s where s.cabinet_id = v_a;
  if etat #>> '{}' is distinct from 'cle_cabinet' then raise exception 'ECHEC : le mode par défaut vaut % au lieu de cle_cabinet', etat; end if;
  update public.subscriptions set ai_billing = 'credits' where cabinet_id = v_a;

  -- Le serveur inscrit : un achat, puis deux analyses consommées.
  insert into public.credit_ledger (cabinet_id, reseller_id, delta, reason, note)
    values (v_a, v_org, 50, 'achat', 'Recharge 50');
  insert into public.credit_ledger (cabinet_id, reseller_id, delta, reason, kind)
    values (v_a, v_org, -1, 'consommation', 'brouillon_seance'),
           (v_a, v_org, -1, 'consommation', 'module');
  -- Le voisin a le sien : il ne doit jamais paraître dans le solde de A.
  insert into public.credit_ledger (cabinet_id, reseller_id, delta, reason) values (v_b, v_org, 999, 'geste');

  -- 2. Un mouvement nul n'a pas de sens : la base le refuse.
  begin
    insert into public.credit_ledger (cabinet_id, reseller_id, delta, reason) values (v_a, v_org, 0, 'ajustement');
    raise exception 'ECHEC : un mouvement de zéro crédit a été accepté';
  exception
    when check_violation then null;
  end;

  -- La praticienne prend son poste.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"bbbb0000-0000-4000-8000-00000000cc01","role":"authenticated"}',true);
  perform public.claim_access();

  -- 3. Son solde est une somme, et ne compte que ses lignes.
  select public.cabinet_credit_balance(v_a) into solde;
  if solde <> 48 then raise exception 'ECHEC : solde de % au lieu de 48', solde; end if;

  select count(*) into n from public.credit_ledger;
  if n <> 3 then raise exception 'FUITE : % lignes de grand livre visibles au lieu de 3', n; end if;

  -- 4. Elle ne peut pas s'écrire une ligne. C'est tout l'intérêt du livre.
  begin
    insert into public.credit_ledger (cabinet_id, reseller_id, delta, reason) values (v_a, v_org, 500, 'geste');
    raise exception 'ECHEC : une thérapeute a pu se créditer';
  exception
    when insufficient_privilege then null;
  end;

  -- 5. Ni effacer une consommation.
  begin
    delete from public.credit_ledger where cabinet_id = v_a and reason = 'consommation';
    raise exception 'ECHEC : une consommation a pu être effacée';
  exception
    when insufficient_privilege then null;
  end;

  -- 6. Elle voit les paquets actifs de son revendeur, et eux seuls.
  select count(*) into n from public.credit_packs;
  if n <> 1 then raise exception 'ECHEC : % paquet(s) visible(s) au lieu de 1 (l''offre retirée doit rester masquée)', n; end if;

  -- 7. Une seule requête lui dit tout ce qu'elle a le droit de savoir — et
  --    rien du revendeur : ni sa marge, ni son coût, ni l'ombre d'une clé.
  select public.cabinet_ai_billing() into etat;
  if etat->>'mode' is distinct from 'credits' then raise exception 'ECHEC : mode annoncé %', etat->>'mode'; end if;
  if (etat->>'solde')::integer <> 48 then raise exception 'ECHEC : solde annoncé %', etat->>'solde'; end if;
  if (etat->>'decouvert')::integer <> 3 then raise exception 'ECHEC : découvert annoncé %', etat->>'decouvert'; end if;
  if etat ? 'marge_pct' or etat ? 'anthropic_hint' then raise exception 'FUITE : un réglage du revendeur est remonté à la thérapeute'; end if;

  -- 8. Les secrets du revendeur n'existent pas pour un compte authentifié.
  begin
    select count(*) into n from public.reseller_secrets;
    raise exception 'FUITE : les secrets du revendeur sont lisibles (% ligne(s))', n;
  exception
    when insufficient_privilege then null;
  end;

  -- 9. Elle ne lit pas les réglages de revente de son revendeur.
  select count(*) into n from public.reseller_ai_settings;
  if n <> 0 then raise exception 'FUITE : % réglage(s) de revente visible(s) par la thérapeute', n; end if;

  -- 10. Le revendeur, lui, lit le grand livre de ses deux cabinets.
  perform set_config('request.jwt.claims', json_build_object('sub', v_rev, 'role','authenticated')::text, true);
  select count(*) into n from public.credit_ledger;
  if n <> 4 then raise exception 'ECHEC : le revendeur voit % ligne(s) au lieu de 4', n; end if;

  select count(*) into n from public.reseller_ai_settings;
  if n <> 1 then raise exception 'ECHEC : le revendeur ne lit pas ses propres réglages (% ligne)', n; end if;

  raise exception 'REUSSITE : le solde se somme depuis un livre en ajout seul, la thérapeute ne s''y écrit ni ne l''efface, ne voit que les paquets actifs de son revendeur, et aucune clé ni marge ne lui remonte.';
end $$;
