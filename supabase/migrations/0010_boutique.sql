-- ============================================================================
-- 0010 — Boutique du cabinet : ce qu'une thérapeute vend, ce qu'une patiente
-- achète.
--
-- Le cabinet gère ses produits sous la RLS ordinaire (politique « cabinet »).
-- La patiente ne voit que les produits actifs de SON cabinet, et seulement
-- si la thérapeute a ouvert sa boutique (cabinet_settings.shop_enabled).
--
-- Les commandes ne s'écrivent que côté serveur : c'est lui qui parle à
-- Stripe avec la clé du cabinet, crée la session de paiement, puis vérifie
-- le paiement au retour. Aucun rôle authentifié n'insère ni ne modifie une
-- commande — une patiente ne peut donc pas se déclarer payée.
-- ============================================================================

create type public.product_kind as enum ('audio', 'seance', 'programme', 'autre');

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  cabinet_id   uuid not null references public.cabinets (id) on delete cascade,
  title        text not null,
  description  text not null default '',
  kind         public.product_kind not null default 'autre',
  -- Un audio de la bibliothèque, livré dans l'espace de la patiente au paiement.
  audio_id     uuid references public.audio_library (id) on delete set null,
  -- Stripe refuse sous 0,50 € ; on ne vend rien à moins.
  price_cents  integer not null check (price_cents >= 50),
  currency     text not null default 'eur',
  is_active    boolean not null default true,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,
  constraint products_title_not_blank check (length(trim(title)) > 0)
);

create index products_cabinet_idx on public.products (cabinet_id, position) where archived_at is null;

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  cabinet_id         uuid not null references public.cabinets (id) on delete cascade,
  patient_id         uuid not null references public.patients (id) on delete cascade,
  product_id         uuid references public.products (id) on delete set null,
  -- Ce qui a été vendu, figé : le produit peut changer de prix ensuite.
  title              text not null,
  amount_cents       integer not null check (amount_cents > 0),
  currency           text not null default 'eur',
  -- La session Stripe : c'est elle qui rend la vérification idempotente.
  stripe_session_id  text not null unique,
  status             text not null default 'en_attente'
                     check (status in ('en_attente', 'payee', 'annulee')),
  paid_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index orders_patient_idx on public.orders (patient_id, created_at desc);
create index orders_cabinet_idx on public.orders (cabinet_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------

alter table public.products enable row level security;
alter table public.orders   enable row level security;

revoke all on public.products from anon;
revoke all on public.orders   from anon;

-- Le cabinet : tout sur ses produits.
create policy "cabinet"
  on public.products for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));

-- La patiente : les produits actifs de son cabinet, boutique ouverte.
create policy "la patiente voit la vitrine de son cabinet"
  on public.products for select to authenticated
  using (
    is_active
    and archived_at is null
    and exists (
      select 1
      from public.patients p
      join public.cabinet_settings s on s.cabinet_id = p.cabinet_id
      where p.cabinet_id = products.cabinet_id
        and p.auth_user_id = auth.uid()
        and p.archived_at is null
        and s.shop_enabled
    )
  );

-- Les commandes se lisent ; elles ne s'écrivent que par le serveur.
create policy "le cabinet lit ses commandes"
  on public.orders for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

create policy "la patiente lit ses commandes"
  on public.orders for select to authenticated
  using (public.is_patient_record(patient_id));

revoke insert, update, delete on public.orders from authenticated;
