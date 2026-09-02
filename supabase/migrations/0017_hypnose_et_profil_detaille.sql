-- ============================================================================
-- 0017 — L'hypnose personnalisée, et un profil qui dit enfin le mouvement.
--
--   L'HYPNOSE remplace l'ancien « brouillon d'induction » : un paragraphe de
--   130 mots que personne ne lisait, trop court pour la séance et trop
--   générique pour être repris. À la place, une séance entière — environ
--   trente minutes de lecture à voix haute — écrite sur les formulations de
--   la patiente, en quatre mouvements.
--
--   Elle est ÉCRITE EN QUATRE APPELS et non un seul. Trente minutes font près
--   de cinq mille jetons, soit deux à trois minutes de génération : au-delà
--   de ce que l'hébergeur accorde à une requête. Chaque mouvement tient
--   largement dans ce budget, et le modèle écrit mieux sept minutes qu'il
--   n'en écrit trente d'une traite. Les mouvements sont donc stockés à part
--   et assemblés à la lecture : une hypnose interrompue au troisième garde
--   les deux premiers.
--
--   ELLE NE SE GÉNÈRE PAS TOUJOURS. C'est une option que la thérapeute
--   ouvre patiente par patiente (`patients.hypnose_activee`) : toutes n'en
--   ont pas besoin, et elle coûte plus cher que le reste réuni.
--
--   LE PROFIL gagne deux rubriques que l'ancien ne disait jamais : ce qui a
--   BOUGÉ depuis le début du suivi, et ce à quoi la personne répond dans la
--   relation de travail. Un profil qui ne décrit qu'un état est une photo ;
--   ce qui sert une praticienne, c'est la trajectoire.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Le profil, en mouvement
-- ---------------------------------------------------------------------------

alter table public.psych_profiles
  add column dynamique text,
  add column alliance  text;

comment on column public.psych_profiles.dynamique is
  'Ce qui a bougé depuis le début du suivi, dans quel sens, et ce qui résiste.';
comment on column public.psych_profiles.alliance is
  'Ce à quoi cette personne répond dans la relation de travail.';

-- ---------------------------------------------------------------------------
-- L'hypnose : une option par patiente
-- ---------------------------------------------------------------------------

alter table public.patients
  add column hypnose_activee boolean not null default false;

comment on column public.patients.hypnose_activee is
  'La séance de cette patiente produit-elle aussi une hypnose personnalisée ?';

-- ---------------------------------------------------------------------------
-- Les hypnoses produites
-- ---------------------------------------------------------------------------

create type public.mouvement_hypnose as enum
  ('induction', 'approfondissement', 'travail', 'retour');

create table public.hypnoses (
  id          uuid primary key default gen_random_uuid(),
  cabinet_id  uuid not null references public.cabinets (id) on delete cascade,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  -- La séance dont elle est née. Nulle si la thérapeute l'a lancée depuis la
  -- fiche, hors captation.
  session_id  uuid references public.therapy_sessions (id) on delete set null,
  titre       text not null,
  -- L'intention donnée par la thérapeute, si elle en a donné une.
  intention   text,
  -- Écrite mouvement par mouvement : tant que les quatre ne sont pas là,
  -- l'hypnose est en cours et l'écran le dit plutôt que de servir un texte
  -- qui s'arrête au milieu.
  complete    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index hypnoses_patient_idx on public.hypnoses (patient_id, created_at desc);
create index hypnoses_cabinet_idx on public.hypnoses (cabinet_id, created_at desc);

create table public.hypnose_mouvements (
  id         uuid primary key default gen_random_uuid(),
  hypnose_id uuid not null references public.hypnoses (id) on delete cascade,
  -- Redondant avec l'hypnose, et volontairement : la politique RLS devient
  -- une seule recherche d'index, comme partout ailleurs dans ce schéma.
  cabinet_id uuid not null references public.cabinets (id) on delete cascade,
  mouvement  public.mouvement_hypnose not null,
  rang       smallint not null check (rang between 1 and 4),
  titre      text not null,
  texte      text not null,
  created_at timestamptz not null default now(),
  unique (hypnose_id, mouvement)
);

create index hypnose_mouvements_idx on public.hypnose_mouvements (hypnose_id, rang);

-- ---------------------------------------------------------------------------
-- Droits — une hypnose est une donnée de santé : le cabinet, et personne
-- d'autre. Pas même la patiente : c'est un texte que la thérapeute LIT, pas
-- un document qu'on remet.
-- ---------------------------------------------------------------------------

alter table public.hypnoses           enable row level security;
alter table public.hypnose_mouvements enable row level security;

revoke all on public.hypnoses, public.hypnose_mouvements from anon;

create policy "cabinet"
  on public.hypnoses for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));

create policy "cabinet"
  on public.hypnose_mouvements for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));
