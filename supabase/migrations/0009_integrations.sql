-- ============================================================================
-- 0009 — Intégrations du cabinet : clé d'analyse, Stripe, prise de rendez-vous.
--
-- Deux tables, parce que deux natures de données :
--
--   cabinet_settings  ce qui se MONTRE — l'existence d'une clé (ses quatre
--                     derniers caractères, sa date), le nom du compte Stripe,
--                     l'adresse de réservation. Le cabinet le lit. Ses
--                     patients n'en lisent que ce qui les concerne, par une
--                     fonction qui choisit les colonnes.
--
--   cabinet_secrets   ce qui ne se montre JAMAIS — les clés elles-mêmes,
--                     chiffrées par le serveur (AES-256-GCM, server/secrets.ts)
--                     avant d'arriver ici. Aucune politique, aucun droit pour
--                     le rôle authentifié : seul le rôle de service y touche,
--                     et seulement depuis le serveur, après avoir identifié
--                     l'appelant.
--
-- Une clé Stripe ou Anthropic est un moyen de paiement. Elle entre par le
-- serveur, elle en sort déchiffrée uniquement pour être utilisée, et le
-- navigateur ne la revoit jamais.
-- ============================================================================

create table public.cabinet_settings (
  cabinet_id           uuid primary key references public.cabinets (id) on delete cascade,
  -- Clé d'analyse : « …AB12 » et la date, jamais la clé.
  anthropic_hint       text,
  anthropic_set_at     timestamptz,
  -- Stripe : de même, plus le nom du compte tel que Stripe le donne.
  stripe_hint          text,
  stripe_account_label text,
  stripe_set_at        timestamptz,
  -- Page de réservation (Trafft). Publique par nature : ses patients l'ouvrent.
  trafft_url           text,
  -- La boutique n'apparaît aux patients que si la thérapeute l'a ouverte.
  shop_enabled         boolean not null default false,
  updated_at           timestamptz not null default now(),
  constraint cabinet_settings_trafft_https check (trafft_url is null or trafft_url ~ '^https://')
);

create table public.cabinet_secrets (
  cabinet_id         uuid primary key references public.cabinets (id) on delete cascade,
  anthropic_key_enc  text,
  stripe_secret_enc  text,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------

alter table public.cabinet_settings enable row level security;
alter table public.cabinet_secrets  enable row level security;

revoke all on public.cabinet_settings from anon;
revoke all on public.cabinet_secrets  from anon, authenticated;

-- Le cabinet lit ses réglages. Il ne les écrit pas lui-même : chaque
-- réglage passe par le serveur, qui valide (un vrai appel à Anthropic, à
-- Stripe) avant d'enregistrer. C'est ce qui évite une clé fausse découverte
-- en séance.
create policy "le cabinet lit ses réglages"
  on public.cabinet_settings for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

-- ---------------------------------------------------------------------------
-- Ce qu'un patient voit de son cabinet : l'adresse de réservation et
-- l'ouverture de la boutique. Rien des clés, pas même leur empreinte.
-- ---------------------------------------------------------------------------
create or replace function public.patient_cabinet_settings()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'trafft_url', s.trafft_url,
    'shop_enabled', s.shop_enabled
  )
  from public.patients p
  left join public.cabinet_settings s on s.cabinet_id = p.cabinet_id
  where p.auth_user_id = auth.uid() and p.archived_at is null
  limit 1;
$$;

revoke execute on function public.patient_cabinet_settings() from public, anon;
grant execute on function public.patient_cabinet_settings() to authenticated;

-- ---------------------------------------------------------------------------
-- Journal : la pose ou le retrait d'une clé se voit dans audit_log, sans la
-- clé. Écrit par le serveur avec la clé de service.
-- ---------------------------------------------------------------------------
