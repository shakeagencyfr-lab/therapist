-- ============================================================================
-- 0016 — Deux façons de vendre l'IA, au choix du revendeur, cabinet par
--        cabinet.
--
--   CLÉ DU CABINET  la thérapeute branche sa propre clé Anthropic (onglet
--                   Intégrations) et paie ses appels à Anthropic. Le
--                   revendeur ne lui vend qu'un abonnement. C'est le mode
--                   d'aujourd'hui, et il reste celui par défaut.
--
--   CRÉDITS         le revendeur branche SA clé, avance les appels, et
--                   revend des crédits à la thérapeute avec une marge. Un
--                   crédit vaut UNE action IA — un brouillon de séance, un
--                   module, un jeu d'affirmations, un profil.
--
-- Le mode se règle par abonnement : rien n'oblige un revendeur à traiter
-- toutes ses thérapeutes pareil, et c'est justement ce qu'on veut pouvoir
-- vendre.
--
-- Deux invariants tiennent tout le reste :
--
--   1. Les clés du revendeur ne se montrent jamais, comme celles des
--      cabinets (0009). Elles vivent chiffrées, dans une table sans aucune
--      politique ni droit pour le rôle authentifié.
--
--   2. Le solde de crédits ne s'écrit pas : il se CALCULE, en sommant un
--      grand livre en ajout seul. Une thérapeute ne peut donc pas se
--      créditer, et chaque mouvement garde sa raison. Personne d'autre que
--      le serveur n'y écrit une ligne.
-- ============================================================================

create type public.ai_billing_mode as enum ('cle_cabinet', 'credits');
create type public.credit_reason as enum ('achat', 'geste', 'consommation', 'ajustement');

-- ---------------------------------------------------------------------------
-- Le mode, par abonnement. Le revendeur le règle ; le cabinet le lit.
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column ai_billing public.ai_billing_mode not null default 'cle_cabinet';

-- ---------------------------------------------------------------------------
-- Ce que le revendeur règle pour sa revente
-- ---------------------------------------------------------------------------

create table public.reseller_ai_settings (
  reseller_id          uuid primary key references public.resellers (id) on delete cascade,
  -- Sa clé d'analyse : « …AB12 » et la date, jamais la clé.
  anthropic_hint       text,
  anthropic_set_at     timestamptz,
  -- Son compte Stripe, pour encaisser les crédits qu'il vend.
  stripe_hint          text,
  stripe_account_label text,
  stripe_set_at        timestamptz,
  -- Marge de référence, en pour cent du coût réel. 80 = « je revends 1,8× ».
  marge_pct            integer not null default 80 check (marge_pct >= 0 and marge_pct <= 1000),
  -- Jusqu'où un cabinet peut descendre sous zéro. En CRÉDITS : une séance
  -- commencée doit pouvoir s'achever, même si le solde tombe à zéro devant
  -- la patiente. C'est le revendeur qui décide du risque qu'il prend.
  decouvert_credits    integer not null default 3 check (decouvert_credits >= 0 and decouvert_credits <= 100),
  updated_at           timestamptz not null default now()
);

create table public.reseller_secrets (
  reseller_id       uuid primary key references public.resellers (id) on delete cascade,
  anthropic_key_enc text,
  stripe_secret_enc text,
  updated_at        timestamptz not null default now()
);

-- Les paquets qu'il vend. Prix ferme : la thérapeute doit savoir ce qu'elle
-- paie, et le revendeur voit à l'écran la marge que chaque paquet lui laisse.
create table public.credit_packs (
  id          uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers (id) on delete cascade,
  label       text not null,
  credits     integer not null check (credits > 0),
  price_cents integer not null check (price_cents >= 50),
  currency    text not null default 'eur',
  is_active   boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint credit_packs_label_not_blank check (length(trim(label)) > 0)
);

create index credit_packs_reseller_idx on public.credit_packs (reseller_id, position)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- Le grand livre. En ajout seul, jamais modifié : c'est lui qui fait foi.
-- ---------------------------------------------------------------------------

create table public.credit_ledger (
  id          bigint generated always as identity primary key,
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  reseller_id uuid not null references public.resellers (id) on delete cascade,
  -- Positif à l'achat ou au geste commercial, négatif à la consommation.
  delta       integer not null check (delta <> 0),
  reason      public.credit_reason not null,
  -- Ce que l'écriture doit à qui la lit : le type d'appel consommé, le
  -- paquet acheté, ou le mot du revendeur pour un geste.
  kind        public.ai_call_kind,
  note        text,
  created_at  timestamptz not null default now()
);

create index credit_ledger_cabinet_idx on public.credit_ledger (cabinet_id, created_at desc);
create index credit_ledger_reseller_idx on public.credit_ledger (reseller_id, created_at desc);

-- Les achats par carte, sur le Stripe du revendeur. Même forme que les
-- commandes de la boutique (0010) : la session Stripe rend la vérification
-- idempotente, et rien ne se crédite avant que le paiement soit constaté.
create table public.credit_orders (
  id                uuid primary key default gen_random_uuid(),
  reseller_id       uuid not null references public.resellers (id) on delete cascade,
  cabinet_id        uuid not null references public.cabinets (id) on delete cascade,
  pack_id           uuid references public.credit_packs (id) on delete set null,
  label             text not null,
  credits           integer not null check (credits > 0),
  amount_cents      integer not null check (amount_cents > 0),
  currency          text not null default 'eur',
  stripe_session_id text not null unique,
  status            text not null default 'en_attente'
                    check (status in ('en_attente', 'payee', 'annulee')),
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index credit_orders_cabinet_idx on public.credit_orders (cabinet_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------

alter table public.reseller_ai_settings enable row level security;
alter table public.reseller_secrets     enable row level security;
alter table public.credit_packs         enable row level security;
alter table public.credit_ledger        enable row level security;
alter table public.credit_orders        enable row level security;

revoke all on public.reseller_ai_settings from anon;
revoke all on public.reseller_secrets     from anon, authenticated;
revoke all on public.credit_packs         from anon;
revoke all on public.credit_ledger        from anon;
revoke all on public.credit_orders        from anon;

-- Le revendeur lit ses réglages. Il ne les écrit pas lui-même : chaque clé
-- passe par le serveur, qui la vérifie par un vrai appel avant de
-- l'enregistrer, chiffrée. La marge et le découvert, eux, n'ont pas de
-- secret : ils passent par le serveur pour rester au même endroit.
create policy "le revendeur lit ses réglages de revente"
  on public.reseller_ai_settings for select to authenticated
  using (public.is_reseller_member(reseller_id));

-- Les paquets : le revendeur les compose, ses cabinets les voient.
create policy "le revendeur gère ses paquets"
  on public.credit_packs for all to authenticated
  using (public.is_reseller_member(reseller_id))
  with check (public.is_reseller_member(reseller_id));

create policy "le cabinet voit les paquets de son revendeur"
  on public.credit_packs for select to authenticated
  using (
    is_active
    and archived_at is null
    and exists (
      select 1 from public.cabinets c
      where c.reseller_id = credit_packs.reseller_id
        and public.is_cabinet_member(c.id)
    )
  );

-- Le grand livre se lit des deux côtés, et ne s'écrit que par le serveur.
create policy "le cabinet lit son grand livre"
  on public.credit_ledger for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

create policy "le revendeur lit le grand livre de ses cabinets"
  on public.credit_ledger for select to authenticated
  using (public.is_reseller_member(reseller_id));

revoke insert, update, delete on public.credit_ledger from authenticated;

create policy "le cabinet lit ses achats de crédits"
  on public.credit_orders for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

create policy "le revendeur lit les achats de ses cabinets"
  on public.credit_orders for select to authenticated
  using (public.is_reseller_member(reseller_id));

revoke insert, update, delete on public.credit_orders from authenticated;

-- ---------------------------------------------------------------------------
-- Le solde : une somme, jamais une colonne
-- ---------------------------------------------------------------------------

create or replace function public.cabinet_credit_balance(p_cabinet uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(l.delta), 0)::integer
  from public.credit_ledger l
  where l.cabinet_id = p_cabinet;
$$;

revoke execute on function public.cabinet_credit_balance(uuid) from public, anon;
grant execute on function public.cabinet_credit_balance(uuid) to authenticated;

/**
 * Ce qu'une thérapeute doit savoir de sa facturation IA.
 *
 * Une seule requête au chargement de son espace : le mode, son solde, le
 * découvert que son revendeur lui laisse. Rien du revendeur — ni sa marge,
 * ni son coût réel, ni l'ombre d'une clé.
 */
create or replace function public.cabinet_ai_billing()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'mode', coalesce(s.ai_billing, 'cle_cabinet'),
    'solde', public.cabinet_credit_balance(c.id),
    'decouvert', coalesce(r.decouvert_credits, 0)
  )
  from public.cabinets c
  left join public.subscriptions s on s.cabinet_id = c.id
  left join public.reseller_ai_settings r on r.reseller_id = c.reseller_id
  where public.is_cabinet_member(c.id)
  limit 1;
$$;

revoke execute on function public.cabinet_ai_billing() from public, anon;
grant execute on function public.cabinet_ai_billing() to authenticated;
