-- ============================================================================
-- 0058 — La vente se rembourse, et se compte
--
-- Trois gestes qui manquaient à la boutique, une fois l'argent encaissé : le
-- livre des recettes exporté, le reçu du patient, le remboursement. Les deux
-- premiers se contentent de lire ; seul le troisième demande de la base.
--
-- 1. UNE VENTE PEUT ÊTRE REMBOURSÉE, ET LE RESTE. Le serveur rembourse avec
--    la clé Stripe du cabinet (api/shop.ts, geste « rembourser ») puis note
--    la commande « remboursee », avec l'instant et la référence Stripe du
--    remboursement. Comme avant, AUCUNE politique d'écriture sur `orders` :
--    ni une praticienne ni un patient ne se déclarent remboursés, seul le
--    serveur l'écrit après la réponse de Stripe.
--
--    Un remboursement ne se défait pas — Stripe ne reprend pas l'argent
--    rendu. La base le tient aussi : une commande remboursée ne redevient ni
--    payée ni en attente, et son instant de remboursement ne bouge plus.
--    Sans cette garde, une reprise mal placée aurait pu la « repayer » et la
--    remettre dans le livre des recettes comme un encaissement.
--
--    Rembourser NE RETIRE RIEN au patient : un audio acheté reste dans sa
--    bibliothèque. C'est un geste d'argent, pas une décision de soin. Mais la
--    garde de 0045 (« un audio acheté appartient à son compte, et y reste »)
--    ne tient que les ventes PAYÉES : une fois la vente remboursée, la
--    praticienne peut retirer l'audio depuis la fiche, si c'est sa décision.
--    Rien à changer ici pour cela — l'épreuve (supabase/tests/ventes.sql) le
--    constate.
--
-- 2. LE PAIEMENT EST NOTÉ. `stripe_payment_intent` et `stripe_livemode`
--    sont écrits quand Stripe confirme le paiement. Ils servent à rembourser
--    sans relire la session, et à ouvrir LE paiement dans le tableau de bord
--    Stripe quand la clé du cabinet n'a pas le droit de rembourser (mode test
--    ou réel : l'adresse n'est pas la même). Rien de secret : un identifiant
--    Stripe n'ouvre rien sans la clé.
--
-- 3. LE LIVRE DES RECETTES SE LIT PAR PÉRIODE. Il compte les encaissements
--    à leur date, et les remboursements à la leur — deux index partiels, un
--    par date, pour que l'export d'une année ne parcoure pas tout le carnet.
--
-- 4. L'EXPORT DU LIVRE LAISSE UNE TRACE. Comme le dossier (0053) : un
--    fichier qui nomme des personnes et ce qu'elles ont acheté peut sortir
--    du cabinet ; le journal d'accès dit qui l'a fait, quand, pour quelle
--    période et si les noms y étaient — jamais une ligne du livre. Si la
--    trace ne s'écrit pas, l'écran ne fabrique pas le fichier.
--
-- Aucune clé étrangère nouvelle ; aucune politique nouvelle. Les lectures
-- restent celles de 0010 : le cabinet lit ses commandes, le patient les
-- siennes — colonnes nouvelles comprises, qui ne disent rien de plus que
-- ce que Stripe envoie déjà au patient par courriel.
-- ============================================================================


-- ============================================================================
-- 1. Les colonnes
-- ============================================================================

alter table public.orders
  add column if not exists stripe_payment_intent text,
  add column if not exists stripe_livemode boolean,
  add column if not exists rembourse_at timestamptz,
  add column if not exists stripe_refund_id text;

comment on column public.orders.stripe_payment_intent is
  'Le paiement Stripe (pi_…) derrière la session, noté quand Stripe confirme le paiement. Écrit par le serveur seul.';
comment on column public.orders.stripe_livemode is
  'Vrai pour un paiement réel, faux en mode test : le tableau de bord Stripe n''a pas la même adresse. Écrit par le serveur seul.';
comment on column public.orders.rembourse_at is
  'Quand le serveur a remboursé la vente chez Stripe. Non nul si et seulement si la commande est « remboursee ».';
comment on column public.orders.stripe_refund_id is
  'Le remboursement Stripe (re_…). Nul si le remboursement a été constaté plutôt que fait ici — fait depuis le tableau de bord Stripe.';

/* Un identifiant Stripe n'a que des lettres et des chiffres après son
   préfixe. Le tenir ici, c'est pouvoir l'écrire dans une adresse du tableau
   de bord sans rien échapper. */
alter table public.orders drop constraint if exists orders_paiement_stripe_forme;
alter table public.orders add constraint orders_paiement_stripe_forme
  check (stripe_payment_intent is null or stripe_payment_intent ~ '^pi_[A-Za-z0-9]+$');

alter table public.orders drop constraint if exists orders_remboursement_stripe_forme;
alter table public.orders add constraint orders_remboursement_stripe_forme
  check (stripe_refund_id is null or stripe_refund_id ~ '^(re|pyr)_[A-Za-z0-9]+$');


-- ============================================================================
-- 2. L'état « remboursee »
-- ============================================================================

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status = any (array['en_attente', 'payee', 'annulee', 'remboursee']));

/* Remboursée ⇔ un instant de remboursement ; et on ne rembourse que ce qui
   a été payé. Les commandes existantes passent toutes : aucune n'est
   remboursée, aucune n'a d'instant de remboursement. */
alter table public.orders drop constraint if exists orders_remboursement_coherent;
alter table public.orders add constraint orders_remboursement_coherent
  check ((status = 'remboursee') = (rembourse_at is not null)
         and (status <> 'remboursee' or paid_at is not null));

create or replace function public.orders_remboursement_definitif()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'remboursee' then
    if new.status is distinct from 'remboursee' then
      raise exception 'Une vente remboursée le reste : Stripe ne reprend pas l''argent rendu.'
        using errcode = '55000';
    end if;
    if new.rembourse_at is distinct from old.rembourse_at
       or new.amount_cents is distinct from old.amount_cents
       or new.paid_at is distinct from old.paid_at then
      raise exception 'Le remboursement d''une vente ne se réécrit pas.'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.orders_remboursement_definitif() is
  'Garde de 0058 : une commande remboursée ne redevient pas payée, et son montant, son encaissement et son remboursement ne bougent plus.';

drop trigger if exists orders_remboursement_definitif on public.orders;
create trigger orders_remboursement_definitif
  before update on public.orders
  for each row execute function public.orders_remboursement_definitif();

-- Une fonction de déclencheur ne s'appelle pas : personne n'a à l'exécuter.
revoke execute on function public.orders_remboursement_definitif() from public, anon, authenticated;


-- ============================================================================
-- 3. Le livre des recettes, par période
-- ============================================================================

create index if not exists orders_encaissements
  on public.orders (cabinet_id, paid_at)
  where paid_at is not null;

create index if not exists orders_remboursements
  on public.orders (cabinet_id, rembourse_at)
  where rembourse_at is not null;


-- ============================================================================
-- 4. La trace de l'export
-- ============================================================================

create or replace function public.cabinet_tracer_export_ventes(
  p_cabinet uuid,
  p_du date,
  p_au date,
  p_noms_complets boolean
)
returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_cabinet is null or not public.is_cabinet_member(p_cabinet) then
    raise exception 'Cabinet introuvable.' using errcode = 'P0002';
  end if;
  if p_du is null or p_au is null or p_du > p_au then
    raise exception 'La période exportée n''est pas lisible.' using errcode = '22023';
  end if;
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, meta)
  values (
    p_cabinet, auth.uid(), 'boutique.livre_exporte', 'orders',
    jsonb_build_object('du', p_du, 'au', p_au, 'noms_complets', coalesce(p_noms_complets, false))
  );
end;
$fn$;

revoke execute on function public.cabinet_tracer_export_ventes(uuid, date, date, boolean) from public, anon;
grant execute on function public.cabinet_tracer_export_ventes(uuid, date, date, boolean) to authenticated;

comment on function public.cabinet_tracer_export_ventes(uuid, date, date, boolean) is
  'Inscrit au journal d''accès l''export du livre des recettes : qui, quand, quelle période, noms complets ou initiales. Aucune ligne du livre n''y figure.';
