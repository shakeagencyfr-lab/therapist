-- ============================================================================
-- 0047 — La boutique rattrape ce qui a été payé, et se ferme vraiment
--
-- Trois choses, qui tiennent toutes à l'argent ou à un mot déjà promis.
--
-- 1. UNE COMMANDE SAIT SI ELLE A ÉTÉ LIVRÉE. Le serveur repasse désormais les
--    commandes restées « en attente » (paiement par prélèvement, onglet fermé
--    avant le retour, réseau coupé) et reprend les livraisons qui ont échoué.
--    Reprendre une livraison sans savoir qu'elle a déjà eu lieu, c'est
--    remettre dans la bibliothèque d'un patient l'audio que sa thérapeute
--    vient d'en retirer — à chaque passage dans la boutique. `livree_at` dit
--    que c'est fait ; seul le serveur l'écrit (aucune politique d'écriture
--    sur `orders`, comme avant).
--
-- 2. HORS CONTRAT, LA BOUTIQUE SE FERME AUSSI POUR LE PATIENT. Le serveur
--    refusait déjà d'encaisser (`levierDuCabinet` lit le contrat), mais
--    l'onglet restait ouvert et la vitrine lisible : `patient_cabinet_settings`
--    ignorait le contrat, et la politique « la patiente voit la vitrine de son
--    cabinet » ignorait même le levier de l'offre — elle ne lisait que
--    l'interrupteur de la thérapeute. Une seule règle désormais, écrite une
--    fois dans `boutique_ouverte_pour_moi`, et lue aux deux endroits : le
--    contrat court, l'offre ouvre le levier, la thérapeute l'allume.
--
--    Et la vitrine s'ouvre ENFIN quand elle doit : l'ancienne politique
--    joignait `cabinet_settings` sous les droits du patient, qui n'en lit
--    aucune ligne (seul le cabinet lit ses réglages). Éprouvé en production
--    avant cette migration : onglet ouvert, zéro produit visible — l'écran
--    disait « Rien en vente » d'une boutique pleine. La règle, SECURITY
--    DEFINER, lit ce qu'il faut sans rien ouvrir de plus.
--
-- 3. UN MOT PARTI RESTE TEL QU'IL EST PARTI. La thérapeute peut maintenant
--    modifier ou annuler un mot programmé. La politique « cabinet » lui
--    laissait déjà tout faire, y compris réécrire après coup ce qu'un patient
--    a lu sur son téléphone. La base s'y oppose : une fois l'heure venue, le
--    texte et l'heure sont figés, et le mot ne s'efface plus.
--
-- (Un produit ne peut plus livrer l'audio d'un autre cabinet depuis 0044 :
-- `products_audio_meme_cabinet` et `patient_audios_meme_cabinet`. Rien à
-- ajouter ici ; le serveur le revérifie en plus au moment de livrer.)
-- ============================================================================


-- ============================================================================
-- 1. La livraison, notée
-- ============================================================================

alter table public.orders add column if not exists livree_at timestamptz;

comment on column public.orders.livree_at is
  'Quand ce qui a été acheté est arrivé chez le patient. Null sur une commande payée : la livraison est à reprendre. Écrit par le serveur seul.';

/* Les commandes déjà payées avant cette migration : livrées si l'on peut le
   constater — un produit sans livraison automatique, ou l'audio déjà dans la
   bibliothèque du patient. Les autres restent à reprendre : c'est exactement
   le cas d'un paiement dont la livraison avait échoué sans rattrapage. */
update public.orders o
   set livree_at = coalesce(o.paid_at, now())
 where o.status = 'payee'
   and o.livree_at is null
   and (
     o.product_id is null
     or exists (
       select 1 from public.products pr
        where pr.id = o.product_id
          and (pr.kind <> 'audio' or pr.audio_id is null)
     )
     or exists (
       select 1
         from public.products pr
         join public.patient_audios pa
           on pa.audio_id = pr.audio_id and pa.patient_id = o.patient_id
        where pr.id = o.product_id
     )
   );

-- La reprise ne lit que ce qui reste à faire : en attente, ou payé non livré.
create index if not exists orders_a_reprendre
  on public.orders (cabinet_id, created_at desc)
  where status = 'en_attente' or (status = 'payee' and livree_at is null);


-- ============================================================================
-- 2. La boutique du patient : une règle, deux lecteurs
-- ============================================================================
--
-- SECURITY DEFINER parce que `abonnement_en_regle` n'est exécutable que par
-- son propriétaire et la clé de service (0039) — une politique qui
-- l'appellerait directement échouerait sous le rôle `authenticated`. Et la
-- fonction ne répond que pour SON cabinet : elle part de `auth.uid()`, si bien
-- qu'elle ne peut servir à sonder le contrat d'un cabinet quelconque, ce que
-- 0039 a précisément refermé.

create or replace function public.boutique_ouverte_pour_moi(p_cabinet uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.patients p
      join public.cabinet_settings s     on s.cabinet_id = p.cabinet_id
      left join public.subscriptions ab  on ab.cabinet_id = p.cabinet_id
      left join public.plans pl          on pl.code = ab.plan_code
     where p.cabinet_id = p_cabinet
       and p.auth_user_id = auth.uid()
       and p.archived_at is null
       -- Le contrat d'abord : hors contrat, aucun levier n'est ouvert.
       and public.abonnement_en_regle(p.cabinet_id)
       -- L'offre ensuite, corrigée de l'exception négociée.
       and coalesce(ab.shop_override, pl.shop, false)
       -- Et l'interrupteur de la thérapeute.
       and coalesce(s.shop_enabled, false)
  );
$$;

comment on function public.boutique_ouverte_pour_moi(uuid) is
  'La boutique de ce cabinet est-elle ouverte au patient connecté ? Contrat en règle, levier de l''offre ouvert, boutique allumée. Faux pour qui n''est pas patient de ce cabinet.';

revoke execute on function public.boutique_ouverte_pour_moi(uuid) from public, anon;
grant execute on function public.boutique_ouverte_pour_moi(uuid) to authenticated, service_role;

-- Repris de la définition en production (0026), seule la ligne de la
-- boutique change : elle lit la règle au lieu de la recalculer.
create or replace function public.patient_cabinet_settings()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'booking_url', s.booking_url,
    'booking_mode', coalesce(s.booking_mode, 'bouton'),
    'booking_widget_url', s.booking_widget_url,
    -- Contrat, offre, réglage du cabinet : la même règle que la vitrine.
    'shop_enabled', public.boutique_ouverte_pour_moi(p.cabinet_id)
  )
  from public.patients p
  left join public.cabinet_settings s on s.cabinet_id = p.cabinet_id
  where p.auth_user_id = auth.uid() and p.archived_at is null
  limit 1;
$$;

comment on function public.patient_cabinet_settings() is
  'Ce que le patient voit de son cabinet : agenda et boutique, jamais une clé. La boutique demande trois choses : un contrat en règle, une offre qui l''ouvre, et une thérapeute qui l''allume.';

-- La vitrine : un onglet fermé ne suffit pas, la liste des produits se lit
-- aussi en PostgREST avec la clé publiable.
drop policy if exists "la patiente voit la vitrine de son cabinet" on public.products;
create policy "la patiente voit la vitrine de son cabinet" on public.products
  for select to authenticated
  using (
    is_active
    and archived_at is null
    and public.boutique_ouverte_pour_moi(cabinet_id)
  );


-- ============================================================================
-- 3. Un mot parti ne se réécrit plus
-- ============================================================================
--
-- « Parti » se lit comme l'espace patient le lit (0036) : l'heure dite est
-- passée, ou, sans heure, dès l'enregistrement. Avant, tout reste modifiable
-- et annulable ; après, le mot est celui que le patient a pu lire.

create or replace function public.garder_les_mots_partis()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if coalesce(old.scheduled_at, old.created_at) <= now()
       and (new.title        is distinct from old.title
         or new.body         is distinct from old.body
         or new.scheduled_at is distinct from old.scheduled_at
         or new.scheduled_for is distinct from old.scheduled_for) then
      raise exception 'Ce mot est déjà parti : il ne peut plus être modifié.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- DELETE. Le cabinet qui disparaît emporte ses mots : on le laisse faire.
  if not exists (select 1 from public.cabinets c where c.id = old.cabinet_id) then
    return old;
  end if;
  /* Un mot sans destinataire n'a atteint personne : c'est la ligne orpheline
     que l'écran efface lui-même quand l'enregistrement des destinataires
     échoue. Celle-là s'efface toujours. */
  if coalesce(old.scheduled_at, old.created_at) <= now()
     and exists (select 1 from public.push_recipients r where r.push_id = old.id) then
    raise exception 'Ce mot est déjà parti : il ne peut plus être annulé.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

revoke execute on function public.garder_les_mots_partis() from public, anon, authenticated;

drop trigger if exists push_notifications_mots_partis on public.push_notifications;
create trigger push_notifications_mots_partis
  before update or delete on public.push_notifications
  for each row execute function public.garder_les_mots_partis();
