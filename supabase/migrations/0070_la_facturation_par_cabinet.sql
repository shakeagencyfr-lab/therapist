-- ============================================================================
-- 0070 — La facturation par cabinet : la clé du cabinet, ou les jetons
-- ============================================================================
--
-- Jusqu'ici le revendeur décidait pour TOUS ses cabinets d'un coup (0065) :
-- jetons activés ET sa clé posée, chacun payait en jetons ; sinon, chacun
-- branchait sa clé Anthropic. Un revendeur qui voulait garder un cabinet
-- historique sur sa propre clé, ou essayer les jetons sur un seul cabinet
-- avant d'y passer tout le monde, ne le pouvait pas.
--
-- UNE EXCEPTION DE PLUS AU CONTRAT, comme le plafond, les leviers ou le
-- forfait : `subscriptions.facturation_ia_override`.
--
--   null          le réglage du revendeur, c'est-à-dire la règle d'avant :
--                 jetons s'il les a activés ET posé sa clé, clé du cabinet
--                 sinon. Tous les contrats en place sont à null : ce
--                 déploiement ne change le mode d'aucun cabinet.
--   'cle_cabinet' le cabinet paie avec sa clé, même si le revendeur est en
--                 jetons (BYOK).
--   'jetons'      le cabinet paie en jetons avec la clé du revendeur, même
--                 si celui-ci n'a pas activé les jetons — ce qui permet
--                 d'essayer les jetons sur un cabinet avant d'y passer
--                 tout le monde.
--
-- Le mode effectif : override ?? (actif ET clé ? 'jetons' : 'cle_cabinet').
-- Une seule fonction le calcule (`facturation_ia_du_cabinet`) ; toutes celles
-- qui décidaient du mode la lisent désormais, et le serveur applique la même
-- règle (server/jetons.ts, `modeEffectif`).
--
-- LES JETONS FORCÉS DEMANDENT LA CLÉ DU REVENDEUR. Sans elle, rien ne paie
-- l'analyse : la base refuse de poser l'exception (déclencheur plus bas). Si
-- la clé est retirée ensuite, le cabinet RESTE en jetons — il ne retombe pas
-- en silence sur sa propre clé, ce qui lui ferait payer ce que son revendeur
-- a promis de payer : le serveur refuse l'analyse avec un 503 qui le dit, et
-- aucun forfait n'est versé (`jetons_actifs_pour_cabinet`).
--
-- Additive : une colonne nullable, deux fonctions nouvelles, un déclencheur
-- nouveau. `jetons_assurer_periode`, `cabinet_jetons`, `revendeur_jetons_apercu`,
-- `journaliser_le_contrat` et `declencher_affirmations` sont réécrites à
-- l'identique de leur définition en place (lue par pg_get_functiondef), aux
-- changements dits près. La politique d'insertion de l'équipe est reposée
-- avec une condition de plus. `jetons_mode_actif` ne change pas : c'est le
-- réglage du REVENDEUR, et le serveur d'avant ce déploiement la lit encore.

-- ============================================================================
-- 1. La colonne
-- ============================================================================

alter table public.subscriptions
  add column if not exists facturation_ia_override text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_facturation_ia_override_valeurs') then
    alter table public.subscriptions
      add constraint subscriptions_facturation_ia_override_valeurs
      check (facturation_ia_override is null or facturation_ia_override in ('cle_cabinet', 'jetons'));
  end if;
end $$;

comment on column public.subscriptions.facturation_ia_override is
  'Qui paie l''analyse pour ce cabinet : ''cle_cabinet'' (sa propre clé Anthropic) ou ''jetons'' (la clé du revendeur, décomptée en jetons). Null : le réglage du revendeur.';

/* Le propriétaire du revendeur la règle comme les autres exceptions, sous
   « le proprietaire regle les contrats » (0063). Le droit de table couvre
   déjà la colonne ; on le dit colonne par colonne pour qu'un resserrement
   futur des droits de table ne la ferme pas en silence. */
grant update (facturation_ia_override) on public.subscriptions to authenticated;

-- ============================================================================
-- 2. Le mode effectif d'un cabinet
-- ============================================================================

/*
 * Le mode effectif : l'exception du contrat, sinon le réglage du revendeur
 * (`jetons_mode_actif`, 0065). Null pour un cabinet inconnu.
 *
 * 'jetons' par exception est rendu MÊME SANS la clé du revendeur : c'est ce
 * qui empêche de retomber en silence sur la clé du cabinet. Qu'il y ait de
 * quoi payer, `jetons_actifs_pour_cabinet` le dit.
 */
create or replace function public.facturation_ia_du_cabinet(p_cabinet uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select s.facturation_ia_override from public.subscriptions s where s.cabinet_id = c.id),
           case when public.jetons_mode_actif(c.reseller_id) then 'jetons' else 'cle_cabinet' end
         )
    from public.cabinets c
   where c.id = p_cabinet;
$$;

/*
 * Les jetons valent-ils VRAIMENT pour ce cabinet ? En jetons (par le
 * revendeur ou par exception) ET la clé du revendeur posée. C'est la
 * condition pour verser un forfait : un cabinet placé en jetons sans clé
 * pour les dépenser ne reçoit rien tant qu'elle manque — le forfait du mois
 * se verse paresseusement dès qu'elle revient.
 */
create or replace function public.jetons_actifs_pour_cabinet(p_cabinet uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.facturation_ia_du_cabinet(p_cabinet) = 'jetons', false)
     and exists (
       select 1
         from public.cabinets c
         join public.reseller_secrets s on s.reseller_id = c.reseller_id
        where c.id = p_cabinet and s.anthropic_key_enc is not null
     );
$$;

revoke execute on function public.facturation_ia_du_cabinet(uuid) from public, anon, authenticated;
revoke execute on function public.jetons_actifs_pour_cabinet(uuid) from public, anon, authenticated;
grant execute on function public.facturation_ia_du_cabinet(uuid) to service_role;
grant execute on function public.jetons_actifs_pour_cabinet(uuid) to service_role;

-- ============================================================================
-- 3. Les jetons forcés demandent la clé du revendeur
-- ============================================================================

/*
 * Poser 'jetons' sur un cabinet dont le revendeur n'a pas de clé ne ferait
 * que couper son analyse : on refuse, en disant quoi faire d'abord.
 *
 * Seulement quand la valeur DEVIENT 'jetons' : un contrat déjà forcé dont la
 * clé a été retirée depuis reste réglable pour le reste (son statut, son
 * offre, ses autres exceptions) — et le retour au réglage du revendeur ou à
 * la clé du cabinet passe toujours.
 *
 * SECURITY DEFINER pour lire `reseller_secrets`, qu'aucun rôle authentifié
 * ne lit (0016) ; il n'en sort qu'un refus, jamais un caractère de la clé.
 */
create or replace function public.facturation_ia_exige_la_cle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.facturation_ia_override = 'jetons'
     and (tg_op = 'INSERT' or old.facturation_ia_override is distinct from 'jetons')
     and not exists (
       select 1
         from public.cabinets c
         join public.reseller_secrets s on s.reseller_id = c.reseller_id
        where c.id = new.cabinet_id and s.anthropic_key_enc is not null
     ) then
    raise exception 'Posez d''abord votre clé Anthropic (onglet Jetons IA) : sans elle, les jetons de ce cabinet n''auraient rien pour payer l''analyse.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.facturation_ia_exige_la_cle() from public, anon, authenticated;

drop trigger if exists subscriptions_facturation_ia_exige_la_cle on public.subscriptions;
create trigger subscriptions_facturation_ia_exige_la_cle
  before insert or update of facturation_ia_override on public.subscriptions
  for each row execute function public.facturation_ia_exige_la_cle();

-- ============================================================================
-- 4. L'équipe n'ouvre qu'un essai ordinaire — sans exception de facturation
-- ============================================================================

-- Politique de 0065, une condition de plus : la facturation par défaut.
drop policy if exists "l equipe ouvre un essai, le proprietaire tout contrat" on public.subscriptions;
create policy "l equipe ouvre un essai, le proprietaire tout contrat" on public.subscriptions
  for insert to authenticated
  with check (
    public.is_reseller_of_cabinet(cabinet_id)
    and (
      public.is_reseller_owner_of_cabinet(cabinet_id)
      or (
        status = 'essai'
        and (trial_ends_at is null or trial_ends_at <= now() + interval '15 days')
        and current_period_end is null
        and ai_cap_override_cents is null
        and ai_billing = 'cle_cabinet'
        and max_patients_override is null
        and shop_override is null
        and marque_blanche_override is null
        and site_override is null
        and jetons_mois_override is null
        and hypnose_override is null
        and hypnose_jusqu_au is null
        and facturation_ia_override is null
      )
    )
  );

-- ============================================================================
-- 5. Le journal du contrat dit l'exception de facturation
-- ============================================================================

-- Définition en place (0065), une exception de plus : `facturation_ia`, avant
-- et après (null, 'cle_cabinet' ou 'jetons'), que l'écran dit en toutes
-- lettres (src/lib/contrat.ts).
create or replace function public.journaliser_le_contrat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exceptions jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.pose', 'subscriptions', new.cabinet_id,
            jsonb_build_object('offre', new.plan_code, 'statut', new.status,
                               'fin_essai', new.trial_ends_at, 'echeance', new.current_period_end));
    return new;
  end if;

  if new.plan_code is distinct from old.plan_code then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.offre', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.plan_code, 'apres', new.plan_code));
  end if;

  if new.status is distinct from old.status then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.statut', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.status, 'apres', new.status));
  end if;

  if new.trial_ends_at is distinct from old.trial_ends_at then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.fin_essai', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.trial_ends_at, 'apres', new.trial_ends_at));
  end if;

  if new.current_period_end is distinct from old.current_period_end then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.echeance', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.current_period_end, 'apres', new.current_period_end));
  end if;

  if new.hypnose_jusqu_au is distinct from old.hypnose_jusqu_au then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.option_hypnose', 'subscriptions', new.cabinet_id,
            jsonb_build_object('avant', old.hypnose_jusqu_au, 'apres', new.hypnose_jusqu_au));
  end if;

  if new.max_patients_override is distinct from old.max_patients_override then
    v_exceptions := v_exceptions || jsonb_build_object('max_patients',
      jsonb_build_object('avant', old.max_patients_override, 'apres', new.max_patients_override));
  end if;
  if new.shop_override is distinct from old.shop_override then
    v_exceptions := v_exceptions || jsonb_build_object('shop',
      jsonb_build_object('avant', old.shop_override, 'apres', new.shop_override));
  end if;
  if new.marque_blanche_override is distinct from old.marque_blanche_override then
    v_exceptions := v_exceptions || jsonb_build_object('marque_blanche',
      jsonb_build_object('avant', old.marque_blanche_override, 'apres', new.marque_blanche_override));
  end if;
  if new.site_override is distinct from old.site_override then
    v_exceptions := v_exceptions || jsonb_build_object('site',
      jsonb_build_object('avant', old.site_override, 'apres', new.site_override));
  end if;
  if new.jetons_mois_override is distinct from old.jetons_mois_override then
    v_exceptions := v_exceptions || jsonb_build_object('jetons_mois',
      jsonb_build_object('avant', old.jetons_mois_override, 'apres', new.jetons_mois_override));
  end if;
  if new.hypnose_override is distinct from old.hypnose_override then
    v_exceptions := v_exceptions || jsonb_build_object('hypnose',
      jsonb_build_object('avant', old.hypnose_override, 'apres', new.hypnose_override));
  end if;
  if new.facturation_ia_override is distinct from old.facturation_ia_override then
    v_exceptions := v_exceptions || jsonb_build_object('facturation_ia',
      jsonb_build_object('avant', old.facturation_ia_override, 'apres', new.facturation_ia_override));
  end if;
  if v_exceptions <> '{}'::jsonb then
    insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
    values (new.cabinet_id, auth.uid(), 'contrat.exception', 'subscriptions', new.cabinet_id, v_exceptions);
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 6. Les fonctions qui décidaient du mode lisent le mode du cabinet
-- ============================================================================

/*
 * Le forfait du mois, ou le lot d'essai. Définition de 0068, un changement :
 * la condition « le revendeur est en jetons » devient « CE CABINET est en
 * jetons, et la clé du revendeur est posée ». Un cabinet gardé sur sa clé ne
 * reçoit plus de forfait qu'il ne dépenserait jamais ; un cabinet passé en
 * jetons avant les autres reçoit le sien.
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
  if not public.jetons_actifs_pour_cabinet(p_cabinet) then return; end if;
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

/*
 * L'état des jetons du cabinet. Définition de 0065, deux changements :
 *
 *   'mode'  le mode effectif DE CE CABINET (`facturation_ia_du_cabinet`) :
 *           l'écran montre la clé Anthropic ou les jetons selon lui, et le
 *           compteur de l'en-tête et les phrases de coût le suivent.
 *   'pret'  les jetons ont-ils de quoi payer (la clé du revendeur posée) ?
 *           Faux pour un cabinet placé en jetons dont le revendeur a retiré
 *           sa clé : l'écran le dit, plutôt qu'un solde qui ne sert à rien.
 *           Un booléen, jamais un caractère de la clé.
 */
create or replace function public.cabinet_jetons(p_cabinet uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reseller uuid;
  v_reg      public.reseller_jetons;
  v_sub      public.subscriptions;
  v_plan     public.plans;
  v_mois     date := date_trunc('month', now() at time zone 'Europe/Paris')::date;
begin
  if p_cabinet is null or not public.is_cabinet_member(p_cabinet) then
    return null;
  end if;
  select c.reseller_id into v_reseller from public.cabinets c where c.id = p_cabinet;
  if v_reseller is null then return null; end if;

  perform public.jetons_assurer_periode(p_cabinet);
  v_reg := public.jetons_reglages(v_reseller);
  select * into v_sub from public.subscriptions s where s.cabinet_id = p_cabinet;
  select * into v_plan from public.plans p where p.code = v_sub.plan_code;

  return jsonb_build_object(
    'mode', coalesce(public.facturation_ia_du_cabinet(p_cabinet), 'cle_cabinet'),
    'pret', public.jetons_actifs_pour_cabinet(p_cabinet),
    'en_regle', public.abonnement_en_regle(p_cabinet),
    'solde', (
      select coalesce(sum(l.restants), 0)::integer from public.jetons_lots l
       where l.cabinet_id = p_cabinet and l.expire_le > now()
    ),
    'mensuel', case when v_sub.status = 'actif' then (
      select jsonb_build_object(
               'total', coalesce(l.jetons_initiaux, v_sub.jetons_mois_override, v_plan.jetons_mois, 0),
               'restant', coalesce(l.restants, 0),
               'renouvellement', (v_mois + interval '1 month')::date
             )
        from (select 1) x
        left join public.jetons_lots l
          on l.cabinet_id = p_cabinet and l.origine = 'mensuel' and l.periode = v_mois
    ) end,
    'essai', (
      select jsonb_build_object('total', l.jetons_initiaux, 'restant', l.restants, 'fin', l.expire_le)
        from public.jetons_lots l
       where l.cabinet_id = p_cabinet and l.origine = 'essai' and l.expire_le > now()
    ),
    'achete_restant', (
      select coalesce(sum(l.restants), 0)::integer from public.jetons_lots l
       where l.cabinet_id = p_cabinet and l.expire_le > now()
         and l.origine in ('achat', 'option_hypnose', 'geste')
    ),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'origine', l.origine, 'jetons_initiaux', l.jetons_initiaux,
               'restants', l.restants, 'expire_le', l.expire_le
             ) order by l.expire_le, l.cree_le)
        from public.jetons_lots l
       where l.cabinet_id = p_cabinet and l.expire_le > now() and l.restants > 0
    ), '[]'::jsonb),
    'hypnose', jsonb_build_object(
      'droit', public.hypnose_ouverte(p_cabinet),
      'incluse', coalesce(v_sub.hypnose_override, v_plan.hypnose_incluse, false),
      'jusqu_au', v_sub.hypnose_jusqu_au
    ),
    'bareme', jsonb_build_object(
      'seance', v_reg.bareme_seance,
      'module', v_reg.bareme_module,
      'profil', v_reg.bareme_profil,
      'affirmations', v_reg.bareme_affirmations,
      'hypnose', v_reg.bareme_hypnose,
      'retouche', v_reg.bareme_retouche,
      'retouche_hypnose', v_reg.bareme_retouche_hypnose
    ),
    'recharges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'libelle', r.libelle, 'jetons', r.jetons, 'prix_cents', r.prix_cents
             ) order by r.position, r.prix_cents)
        from public.jetons_recharges r
       where r.reseller_id = v_reseller and r.actif and r.archivee_le is null
    ), '[]'::jsonb),
    'option_hypnose', jsonb_build_object(
      'prix_cents', v_reg.option_hypnose_prix_cents,
      'jours', v_reg.option_hypnose_jours,
      'jetons', v_reg.option_hypnose_jetons
    ),
    'paiement_possible', exists (
      select 1 from public.reseller_secrets s
       where s.reseller_id = v_reseller and s.stripe_secret_enc is not null
    ),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object('le', h.le, 'action', h.action, 'jetons', h.jetons, 'statut', h.statut)
                       order by h.le desc)
        from (
          select j.le, j.action, j.jetons, j.statut
            from public.jetons_consommations j
           where j.cabinet_id = p_cabinet
           order by j.le desc
           limit 30
        ) h
    ), '[]'::jsonb)
  );
end;
$$;

/*
 * Ce que le revendeur voit de ses cabinets. Définition de 0065, deux clés de
 * plus par cabinet : 'mode_effectif' (ce qui paie vraiment son analyse) et
 * 'override' (l'exception posée, ou null quand le réglage du revendeur
 * décide) — l'onglet Jetons IA les montre dans la consommation du mois.
 */
create or replace function public.revendeur_jetons_apercu(p_reseller uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cab   record;
  v_debut timestamptz := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
begin
  -- Le solde affiché doit compter le forfait du mois, même s'il n'a pas encore servi.
  for v_cab in select c.id from public.cabinets c where c.reseller_id = p_reseller and c.archived_at is null loop
    perform public.jetons_assurer_periode(v_cab.id);
  end loop;

  return jsonb_build_object(
    'couts', coalesce((
      select jsonb_agg(jsonb_build_object('kind', k.kind, 'appels', k.n, 'moyen_cents', k.moyen) order by k.kind)
        from (
          select u.kind::text as kind, count(*)::integer as n, round(avg(u.cost_cents), 4) as moyen
            from public.ai_usage u
            join public.cabinets c on c.id = u.cabinet_id
           where c.reseller_id = p_reseller
             and u.occurred_at >= now() - interval '90 days'
           group by u.kind
        ) k
    ), '[]'::jsonb),
    'cabinets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cabinet_id', c.id,
               'nom', c.name,
               'consommes_mois', coalesce(cm.n, 0),
               'solde', coalesce(sl.n, 0),
               'mode_effectif', coalesce(public.facturation_ia_du_cabinet(c.id), 'cle_cabinet'),
               'override', sub.facturation_ia_override
             ) order by c.name)
        from public.cabinets c
        left join public.subscriptions sub on sub.cabinet_id = c.id
        left join lateral (
          select sum(j.jetons)::integer as n
            from public.jetons_consommations j
           where j.cabinet_id = c.id and j.statut <> 'rembourse' and j.le >= v_debut
        ) cm on true
        left join lateral (
          select sum(l.restants)::integer as n
            from public.jetons_lots l
           where l.cabinet_id = c.id and l.expire_le > now()
        ) sl on true
       where c.reseller_id = p_reseller and c.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

/*
 * Réveiller la tâche du lundi. Définition de 0057, un changement : un
 * cabinet est « armé » selon SON mode — sa clé en mode clé du cabinet, la
 * clé du revendeur en jetons. Seule la clé du cabinet comptait : un cabinet
 * en jetons sans clé à lui n'était jamais repris, et un cabinet gardé sur sa
 * clé l'était, lui, à raison.
 */
create or replace function public.declencher_affirmations()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if not exists (
    select 1
      from public.patient_settings s
      join public.patients p        on p.id = s.patient_id
     where s.affirmations_auto
       and p.archived_at is null
       and public.abonnement_en_regle(p.cabinet_id)
       and (
         case public.facturation_ia_du_cabinet(p.cabinet_id)
           when 'jetons' then public.jetons_actifs_pour_cabinet(p.cabinet_id)
           else exists (
             select 1 from public.cabinet_secrets k
              where k.cabinet_id = p.cabinet_id and k.anthropic_key_enc is not null
           )
         end
       )
       and not exists (
         select 1 from public.affirmations a
          where a.patient_id = p.id
            and a.published_at >= now() - interval '4 days'
       )
  ) then
    return;
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'klaro_cron_secret';

  if v_secret is null then
    raise warning '[affirmations] le secret du planificateur manque dans le coffre : aucune reprise.';
    return;
  end if;

  -- La tâche s'accorde 48 secondes : la réponse arrive avant la minute.
  perform net.http_post(
    url := 'https://klaroweb.site/api/cron/affirmations',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Réécrites : leurs droits tiennent, on les redit.
revoke execute on function public.jetons_assurer_periode(uuid) from public, anon, authenticated;
revoke execute on function public.revendeur_jetons_apercu(uuid) from public, anon, authenticated;
revoke execute on function public.journaliser_le_contrat() from public, anon, authenticated;
revoke execute on function public.declencher_affirmations() from public, anon, authenticated;
revoke execute on function public.cabinet_jetons(uuid) from public, anon;
grant execute on function public.jetons_assurer_periode(uuid) to service_role;
grant execute on function public.revendeur_jetons_apercu(uuid) to service_role;
grant execute on function public.journaliser_le_contrat() to service_role;
grant execute on function public.declencher_affirmations() to service_role;
grant execute on function public.cabinet_jetons(uuid) to authenticated, service_role;
