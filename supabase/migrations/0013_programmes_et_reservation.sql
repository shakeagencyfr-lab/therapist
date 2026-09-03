-- ============================================================================
-- 0013 — Les programmes appartiennent au cabinet ; la réservation n'appartient
-- à aucun éditeur.
--
-- Deux corrections de la même nature : du particulier codé en dur, remplacé
-- par du réglable.
--
--   cabinet_programs   « Liberté », « Équilibre », « Harmonie »,
--                      « Compétences » étaient les quatre programmes d'UNE
--                      thérapeute, écrits dans l'interface. Chaque cabinet
--                      nomme désormais les siens.
--
--   booking_*          la colonne s'appelait trafft_url, du nom d'un logiciel
--                      d'agenda. Une thérapeute peut en utiliser un autre :
--                      le champ ne porte plus de marque, et il sait
--                      maintenant s'afficher en bouton ou en widget encadré.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Les programmes du cabinet
-- ---------------------------------------------------------------------------

create table public.cabinet_programs (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  label       text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint cabinet_programs_label_not_blank check (length(trim(label)) > 0)
);

-- Deux programmes de même nom dans un cabinet n'auraient aucun sens : la
-- fiche d'un patient ne garde que le libellé.
create unique index cabinet_programs_unique_idx
  on public.cabinet_programs (cabinet_id, lower(label))
  where archived_at is null;

create index cabinet_programs_cabinet_idx
  on public.cabinet_programs (cabinet_id, position)
  where archived_at is null;

alter table public.cabinet_programs enable row level security;
revoke all on public.cabinet_programs from anon;

-- Le cabinet, et lui seul. Le patient n'a pas à lire ce catalogue : son
-- programme est écrit sur sa fiche, en clair.
create policy "le cabinet gère ses programmes"
  on public.cabinet_programs for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));

-- ---------------------------------------------------------------------------
-- La prise de rendez-vous, sans nom d'éditeur
-- ---------------------------------------------------------------------------

alter table public.cabinet_settings rename column trafft_url to booking_url;
alter table public.cabinet_settings
  rename constraint cabinet_settings_trafft_https to cabinet_settings_booking_https;

-- Deux façons de la donner au patient : un bouton qui ouvre la page, ou
-- le widget de réservation encadré dans son espace.
alter table public.cabinet_settings
  add column booking_mode text not null default 'bouton'
    check (booking_mode in ('bouton', 'widget')),
  add column booking_widget_url text
    check (booking_widget_url is null or booking_widget_url ~ '^https://');

-- ---------------------------------------------------------------------------
-- Ce qu'un patient voit de son cabinet — mêmes règles, nouveaux noms.
-- ---------------------------------------------------------------------------
create or replace function public.patient_cabinet_settings()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'booking_url', s.booking_url,
    'booking_mode', coalesce(s.booking_mode, 'bouton'),
    'booking_widget_url', s.booking_widget_url,
    'shop_enabled', coalesce(s.shop_enabled, false)
  )
  from public.patients p
  left join public.cabinet_settings s on s.cabinet_id = p.cabinet_id
  where p.auth_user_id = auth.uid() and p.archived_at is null
  limit 1;
$$;

revoke execute on function public.patient_cabinet_settings() from public, anon;
grant execute on function public.patient_cabinet_settings() to authenticated;
