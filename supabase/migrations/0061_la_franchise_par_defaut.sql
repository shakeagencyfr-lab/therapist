-- ============================================================================
-- 0061 — La note d'honoraires propose d'abord la franchise en base (293 B)
-- ============================================================================
--
-- 0053 proposait d'office « TVA non applicable, art. 261-4-1° du CGI ».
-- Cette exonération vise les soins des professions de santé RÉGLEMENTÉES ;
-- l'hypnothérapie ne l'est pas, et la plupart des praticiennes relèvent de
-- la franchise en base (art. 293 B). Le défaut suit donc le cas le plus
-- courant ; les deux mentions restent au choix, et « aucune » aussi.
--
-- Seul le DÉFAUT change. Une identité déjà enregistrée garde la mention que
-- la praticienne a choisie, et une note déjà émise ne bouge jamais : elle
-- est la copie figée de ce qui a été imprimé.

alter table public.cabinet_facturation
  alter column mention_tva set default 'art-293-b';
