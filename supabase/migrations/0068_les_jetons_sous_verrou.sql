-- ============================================================================
-- 0068 — Les jetons sous verrou : le prix se décide où il se débite
-- ============================================================================
--
-- Trois défauts de 0065, tous trois de l'argent.
--
-- 1. LE FORFAIT SE DÉCIDAIT HORS DU VERROU. Le serveur comptait en Node ce
--    qu'une séance ou une hypnose avait déjà consommé, décidait « compris,
--    zéro jeton » ou « plein prix », puis seulement appelait
--    `jetons_debiter` — qui prend le verrou du cabinet. Cinquante requêtes
--    lancées ensemble lisaient toutes le même compte, et passaient toutes à
--    zéro jeton : autant d'hypnoses écrites sur la clé du revendeur, gratuites.
--    Désormais `jetons_debiter_forfait` prend le verrou D'ABORD, compte les
--    consommations vivantes ensuite, choisit le prix, et débite — dans la même
--    transaction. Le serveur ne passe que la règle, le plein prix et la
--    référence ; il lit en retour le prix réellement pris.
--
--    Et l'hypnose ne se paie plus par « série de huit appels » sur un
--    identifiant : huit appels suffisaient à écrire deux hypnoses complètes
--    pour le prix d'une, l'identifiant ne disant rien du texte produit. La
--    règle tient aux QUATRE MOUVEMENTS : une série s'ouvre au prix d'une
--    hypnose, et chacun des quatre mouvements y est compris UNE fois. Demander
--    un mouvement déjà écrit dans la série — ou quoi que ce soit après les
--    quatre — ouvre une nouvelle série, payée comme une nouvelle hypnose. Un
--    appel qui a échoué est rendu (`rembourse`) et ne compte pas : reprendre
--    un mouvement raté reste gratuit. L'interface n'écrit jamais deux fois le
--    même mouvement d'une hypnose (useEcritureHypnose reprend au premier
--    manquant, et la retouche est une action à part) : la règle ne coûte rien
--    à l'usage normal, et ferme le réemploi d'un identifiant payé.
--
-- 2. UNE RÉSERVATION ORPHELINE MANGEAIT SES JETONS POUR TOUJOURS. Une fonction
--    tuée à sa limite de durée (300 s pour l'analyse, 60 s pour la tâche du
--    lundi), un plantage, un redéploiement : la consommation restait
--    « reserve », le lot amputé, et rien ne la rendait.
--    `jetons_liberer_reservations` rend, sous le verrou du cabinet, toute
--    réservation de plus de dix minutes — bien au-delà de toute durée
--    d'exécution, jamais un appel en cours. `jetons_assurer_periode` l'appelle
--    en premier : la dépense, la lecture du cabinet (`cabinet_jetons`) et
--    l'aperçu du revendeur la font donc passer. Une confirmation très tardive
--    ne ressuscite rien : `jetons_confirmer` ne touche que ce qui est encore
--    « reserve ».
--
-- 3. L'ORDRE DE DÉPENSE CONTREDISAIT LE CONTRAT. Les CGV et la page de vente
--    disent : les jetons du mois d'abord, puis les recharges, la plus ancienne
--    d'abord. Le débit prenait « ce qui expire d'abord » : dans son dernier
--    mois, une recharge passait devant le forfait. Désormais : le forfait du
--    mois (ou le lot d'essai), puis les jetons offerts avec le pass Hypnose
--    (ils expirent avec lui), puis les achats et les gestes du revendeur, par
--    date d'expiration.
--
-- L'HORODATAGE D'UNE CONSOMMATION EST CELUI DE SON INSCRIPTION. `now()` est
-- l'heure du DÉBUT de la transaction : une requête partie la première, mais
-- arrivée au verrou la seconde, s'inscrivait AVANT celle qui l'avait
-- précédée. La série d'une hypnose se lit dans l'ordre des consommations :
-- elles prennent donc `clock_timestamp()`, l'heure où elles s'écrivent, sous
-- le verrou.
--
-- Additive : trois fonctions nouvelles ; `jetons_assurer_periode` et
-- `jetons_debiter` réécrites à l'identique de leur définition en place (lue
-- par pg_get_functiondef), aux deux changements dits près. L'ancien
-- `jetons_debiter` reste appelable : un serveur d'avant ce déploiement
-- continue de fonctionner.

-- ============================================================================
-- 1. Rendre les réservations orphelines
-- ============================================================================

/*
 * Rend, lot par lot, chaque réservation de ce cabinet restée « reserve »
 * plus de dix minutes. Idempotente : une réservation rendue n'est plus
 * « reserve », et le verrou de ligne empêche une confirmation tardive de
 * passer entre la lecture et le remboursement. Rend le nombre de
 * réservations rendues.
 *
 * Sans rien d'orphelin — le cas de presque toutes les lectures —, elle ne
 * prend aucun verrou : la lecture du solde ne fait pas la queue derrière une
 * dépense.
 */
create or replace function public.jetons_liberer_reservations(p_cabinet uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conso record;
  v_part  record;
  v_n     integer := 0;
begin
  if p_cabinet is null then return 0; end if;
  if not exists (
    select 1 from public.jetons_consommations c
     where c.cabinet_id = p_cabinet and c.statut = 'reserve' and c.le < now() - interval '10 minutes'
  ) then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtext('klaro.jetons:' || p_cabinet::text));

  for v_conso in
    select c.id
      from public.jetons_consommations c
     where c.cabinet_id = p_cabinet and c.statut = 'reserve' and c.le < now() - interval '10 minutes'
     order by c.le
       for update
  loop
    for v_part in
      select cl.lot_id, cl.jetons from public.jetons_consommation_lots cl where cl.consommation_id = v_conso.id
    loop
      update public.jetons_lots l
         set restants = least(l.jetons_initiaux, l.restants + v_part.jetons)
       where l.id = v_part.lot_id;
    end loop;
    update public.jetons_consommations set statut = 'rembourse' where id = v_conso.id and statut = 'reserve';
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

/*
 * Le forfait du mois, ou le lot d'essai — versés la première fois qu'on en a
 * besoin, et une seule fois. Définition de 0065, et en tête, les
 * réservations orphelines rendues (0068) : AVANT les retours anticipés, pour
 * qu'un cabinet passé hors contrat ou hors du mode jetons retrouve quand même
 * ses jetons pris par un appel mort.
 */
create or replace function public.jetons_assurer_periode(p_cabinet uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reseller uuid;
  v_sub      public.subscriptions;
  v_reg      public.reseller_jetons;
  v_n        integer;
  v_mois     date;
begin
  perform public.jetons_liberer_reservations(p_cabinet);

  select c.reseller_id into v_reseller
    from public.cabinets c
   where c.id = p_cabinet and c.archived_at is null;
  if v_reseller is null then return; end if;
  if not public.jetons_mode_actif(v_reseller) then return; end if;
  if not public.abonnement_en_regle(p_cabinet) then return; end if;

  select * into v_sub from public.subscriptions s where s.cabinet_id = p_cabinet;
  if not found then return; end if;
  v_reg := public.jetons_reglages(v_reseller);

  if v_sub.status = 'essai' then
    if v_reg.essai_jetons > 0 then
      insert into public.jetons_lots (cabinet_id, origine, jetons_initiaux, restants, expire_le)
      values (p_cabinet, 'essai', v_reg.essai_jetons, v_reg.essai_jetons,
              coalesce(v_sub.trial_ends_at, now() + interval '14 days'))
      on conflict (cabinet_id) where origine = 'essai' do nothing;
    end if;
    -- Un essai prolongé prolonge son lot : il expire avec l'essai.
    if v_sub.trial_ends_at is not null then
      update public.jetons_lots l
         set expire_le = v_sub.trial_ends_at
       where l.cabinet_id = p_cabinet
         and l.origine = 'essai'
         and l.expire_le < v_sub.trial_ends_at;
    end if;
    return;
  end if;

  if v_sub.status <> 'actif' then return; end if;

  select coalesce(v_sub.jetons_mois_override, p.jetons_mois) into v_n
    from public.plans p where p.code = v_sub.plan_code;
  v_n := coalesce(v_n, v_sub.jetons_mois_override, 0);
  if v_n <= 0 then return; end if;

  v_mois := date_trunc('month', now() at time zone 'Europe/Paris')::date;
  insert into public.jetons_lots (cabinet_id, origine, jetons_initiaux, restants, expire_le, periode)
  values (p_cabinet, 'mensuel', v_n, v_n,
          (v_mois + interval '1 month')::timestamp at time zone 'Europe/Paris', v_mois)
  on conflict (cabinet_id, origine, periode) where periode is not null do nothing;
end;
$$;

-- ============================================================================
-- 2. Débiter dans l'ordre du contrat
-- ============================================================================

/*
 * Réserver des jetons pour une action — définition de 0065, deux changements :
 *
 *   L'ORDRE DU CONTRAT : le forfait du mois ou l'essai, puis les jetons du
 *   pass Hypnose, puis les achats et les gestes, le plus ancien d'abord (par
 *   expiration : douze mois pour tous).
 *
 *   L'HEURE D'INSCRIPTION : `clock_timestamp()`, prise sous le verrou —
 *   l'ordre des consommations est celui où elles ont été écrites.
 *
 * Le verrou se reprend sans attendre quand `jetons_debiter_forfait` le tient
 * déjà : un verrou consultatif se cumule dans la même session.
 */
create or replace function public.jetons_debiter(p_cabinet uuid, p_action text, p_jetons integer, p_ref text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solde integer;
  v_id    uuid;
  v_reste integer;
  v_pris  integer;
  v_lot   record;
begin
  if p_action is null or p_action not in ('seance', 'module', 'profil', 'affirmations', 'hypnose', 'retouche', 'retouche_hypnose') then
    raise exception 'Action inconnue : %.', coalesce(p_action, '(aucune)') using errcode = 'check_violation';
  end if;
  if p_jetons is null or p_jetons < 0 or p_jetons > 1000000 then
    raise exception 'Nombre de jetons invalide.' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('klaro.jetons:' || p_cabinet::text));
  perform public.jetons_assurer_periode(p_cabinet);

  select coalesce(sum(l.restants), 0)::integer into v_solde
    from public.jetons_lots l
   where l.cabinet_id = p_cabinet and l.expire_le > now() and l.restants > 0;
  if v_solde < p_jetons then
    raise exception 'Solde de jetons insuffisant : % restant(s), % nécessaire(s).', v_solde, p_jetons
      using errcode = 'KL402',
            detail = json_build_object('solde', v_solde, 'besoin', p_jetons)::text;
  end if;

  insert into public.jetons_consommations (cabinet_id, action, jetons, ref, le)
  values (p_cabinet, p_action, p_jetons, nullif(btrim(coalesce(p_ref, '')), ''), clock_timestamp())
  returning id into v_id;

  v_reste := p_jetons;
  for v_lot in
    select l.id, l.restants
      from public.jetons_lots l
     where l.cabinet_id = p_cabinet and l.expire_le > now() and l.restants > 0
     order by case l.origine
                when 'mensuel' then 0
                when 'essai' then 0
                when 'option_hypnose' then 1
                else 2
              end,
              l.expire_le, l.cree_le, l.id
       for update
  loop
    exit when v_reste <= 0;
    v_pris := least(v_lot.restants, v_reste);
    update public.jetons_lots set restants = restants - v_pris where id = v_lot.id;
    insert into public.jetons_consommation_lots (consommation_id, lot_id, jetons) values (v_id, v_lot.id, v_pris);
    v_reste := v_reste - v_pris;
  end loop;

  return v_id;
end;
$$;

-- ============================================================================
-- 3. Le prix d'un appel, décidé par la base
-- ============================================================================

/*
 * Ce qu'un appel coûtera, selon sa règle — sans rien écrire.
 *
 *   'prix'     le plein prix, toujours : séance, affirmations, retouches,
 *              module d'atelier, et toute action sans séance reconnue.
 *   'seance'   un module ou un profil tiré d'une séance (`p_ref`) : compris
 *              quand le brouillon de cette séance a été payé (consommation
 *              « seance » confirmée) et que la séance n'a pas épuisé ce
 *              qu'elle comprend — huit consignes, une actualisation du
 *              profil. Les plafonds sont ici, pas chez l'appelant.
 *   'hypnose'  un mouvement (`p_mouvement`) de l'hypnose `p_ref` : voir
 *              l'en-tête. La consommation s'inscrit sous `<hypnose>:<mouvement>`.
 *
 * Seules les consommations VIVANTES comptent (réservées ou confirmées) : un
 * appel rendu n'a rien consommé du forfait.
 *
 * Rend { jetons, compris, ref } — `ref`, ce qui s'inscrira avec la
 * consommation. Sous le verrou dans `jetons_debiter_forfait` ; seule, c'est
 * un devis (l'écran du brouillon demande si l'actualisation du profil est
 * encore comprise).
 */
create or replace function public.jetons_prix_du_forfait(
  p_cabinet uuid, p_action text, p_prix integer, p_ref text default null,
  p_regle text default 'prix', p_mouvement text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref     text := nullif(btrim(coalesce(p_ref, '')), '');
  v_plafond integer;
  v_serie   text[] := '{}';
  v_c       record;
begin
  if p_prix is null or p_prix < 0 or p_prix > 1000000 then
    raise exception 'Nombre de jetons invalide.' using errcode = 'check_violation';
  end if;

  if coalesce(p_regle, 'prix') = 'prix' then
    return jsonb_build_object('jetons', p_prix, 'compris', false, 'ref', v_ref);
  end if;

  if p_regle = 'seance' then
    if p_action is null or p_action not in ('module', 'profil') then
      raise exception 'Seuls un module ou un profil se rattachent au forfait d''une séance.' using errcode = 'check_violation';
    end if;
    if v_ref is null then
      raise exception 'Le forfait d''une séance demande sa séance.' using errcode = 'check_violation';
    end if;
    v_plafond := case p_action when 'module' then 8 else 1 end;
    if exists (
         select 1 from public.jetons_consommations c
          where c.cabinet_id = p_cabinet and c.action = 'seance' and c.ref = v_ref and c.statut = 'confirme'
       )
       and (
         select count(*) from public.jetons_consommations c
          where c.cabinet_id = p_cabinet and c.action = p_action and c.ref = v_ref
            and c.jetons = 0 and c.statut in ('reserve', 'confirme')
       ) < v_plafond then
      return jsonb_build_object('jetons', 0, 'compris', true, 'ref', v_ref);
    end if;
    return jsonb_build_object('jetons', p_prix, 'compris', false, 'ref', v_ref);
  end if;

  if p_regle = 'hypnose' then
    if p_action is distinct from 'hypnose' then
      raise exception 'La règle de l''hypnose ne vaut que pour l''hypnose.' using errcode = 'check_violation';
    end if;
    -- Un identifiant, jamais un motif : la série se lit par préfixe.
    if v_ref is null or v_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'L''hypnose d''un appel est un identifiant.' using errcode = 'check_violation';
    end if;
    if p_mouvement is null or p_mouvement not in ('induction', 'approfondissement', 'travail', 'retour') then
      raise exception 'Mouvement d''hypnose inconnu : %.', coalesce(p_mouvement, '(aucun)') using errcode = 'check_violation';
    end if;

    /* La série en cours, relue dans l'ordre : un mouvement déjà écrit dans
       la série en ouvre une nouvelle, qui repart de lui. */
    for v_c in
      select split_part(c.ref, ':', 2) as mouvement
        from public.jetons_consommations c
       where c.cabinet_id = p_cabinet and c.action = 'hypnose'
         and c.statut in ('reserve', 'confirme')
         and c.ref like v_ref || ':%'
       order by c.le, c.id
    loop
      if cardinality(v_serie) = 0 or v_c.mouvement = any(v_serie) then
        v_serie := array[v_c.mouvement];
      else
        v_serie := v_serie || v_c.mouvement;
      end if;
    end loop;

    if cardinality(v_serie) = 0 or p_mouvement = any(v_serie) then
      return jsonb_build_object('jetons', p_prix, 'compris', false, 'ref', v_ref || ':' || p_mouvement);
    end if;
    return jsonb_build_object('jetons', 0, 'compris', true, 'ref', v_ref || ':' || p_mouvement);
  end if;

  raise exception 'Règle de prix inconnue : %.', p_regle using errcode = 'check_violation';
end;
$$;

/*
 * Réserver au prix que la base décide : le verrou du cabinet D'ABORD, les
 * orphelines rendues, le forfait compté, puis le débit — une transaction.
 * Deux appels simultanés passent l'un après l'autre, et le second voit ce
 * que le premier a inscrit.
 *
 * Rend { consommation, jetons, compris } : le prix réellement pris, que le
 * serveur annonce à l'écran. Solde insuffisant : KL402, comme `jetons_debiter`.
 */
create or replace function public.jetons_debiter_forfait(
  p_cabinet uuid, p_action text, p_prix integer, p_ref text default null,
  p_regle text default 'prix', p_mouvement text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prix jsonb;
  v_n    integer;
  v_id   uuid;
begin
  if p_cabinet is null then
    raise exception 'Cabinet manquant.' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('klaro.jetons:' || p_cabinet::text));
  -- Une réservation morte compterait comme vivante dans le forfait.
  perform public.jetons_liberer_reservations(p_cabinet);

  v_prix := public.jetons_prix_du_forfait(p_cabinet, p_action, p_prix, p_ref, p_regle, p_mouvement);
  v_n := (v_prix ->> 'jetons')::integer;
  v_id := public.jetons_debiter(p_cabinet, p_action, v_n, v_prix ->> 'ref');
  return jsonb_build_object('consommation', v_id, 'jetons', v_n, 'compris', (v_prix ->> 'compris')::boolean);
end;
$$;

revoke execute on function public.jetons_liberer_reservations(uuid) from public, anon, authenticated;
revoke execute on function public.jetons_prix_du_forfait(uuid, text, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.jetons_debiter_forfait(uuid, text, integer, text, text, text) from public, anon, authenticated;
-- Réécrites : leurs droits de 0065 tiennent, on les redit.
revoke execute on function public.jetons_assurer_periode(uuid) from public, anon, authenticated;
revoke execute on function public.jetons_debiter(uuid, text, integer, text) from public, anon, authenticated;

grant execute on function public.jetons_liberer_reservations(uuid) to service_role;
grant execute on function public.jetons_prix_du_forfait(uuid, text, integer, text, text, text) to service_role;
grant execute on function public.jetons_debiter_forfait(uuid, text, integer, text, text, text) to service_role;
grant execute on function public.jetons_assurer_periode(uuid) to service_role;
grant execute on function public.jetons_debiter(uuid, text, integer, text) to service_role;
