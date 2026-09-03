-- ============================================================================
-- 0027 — Le patient range son journal
--
-- Une page se supprime déjà : la politique « le patient tient son journal »
-- couvre le DELETE depuis 0002. Ce qui manquait, c'est l'ordre.
--
-- Un journal est chronologique par nature, et ce reste la règle : sans
-- position, les pages se lisent de la plus récente à la plus ancienne. Mais
-- ce journal-là n'est pas qu'un carnet de dates — c'est ce qu'on montre à sa
-- thérapeute, et on veut pouvoir mettre en tête ce qui compte, quelle que
-- soit la date où on l'a écrit.
--
-- D'où une position FACULTATIVE. Tant que personne n'a rien déplacé, elle est
-- nulle partout et la chronologie s'applique. Dès qu'une page est déplacée,
-- toutes reçoivent la leur, et c'est l'ordre choisi qui vaut.
-- ============================================================================

alter table public.journal_pages
  add column if not exists position integer;

comment on column public.journal_pages.position is
  'Ordre choisi par le patient. NULL partout = ordre chronologique, du plus récent au plus ancien.';

-- L'index sert la lecture de l'espace patient : sa soixantaine de pages, dans
-- l'ordre, en une passe.
create index if not exists journal_pages_ordre_idx
  on public.journal_pages (patient_id, position nulls last, written_at desc);
