-- ============================================================================
-- 0073 — Le cache se compte
-- ============================================================================
--
-- Depuis le 2 octobre 2026, les mouvements d'une hypnose et les consignes
-- d'une séance relisent leur contexte commun dans le cache du modèle
-- (server/ai.ts, `callClaude`). L'API compte alors l'entrée en trois parts :
-- l'entrée ordinaire (`input_tokens`), celle écrite au cache (1,25 fois le
-- tarif d'entrée) et celle relue (un vingtième sur Opus 5.5). Sans ces deux
-- colonnes, le journal ne garderait que la première : il dirait l'appel
-- moins cher qu'il n'est pour l'écriture, et ne saurait pas montrer ce que
-- la relecture fait gagner. `cost_cents` compte déjà les trois parts.
--
-- ADDITIF : deux colonnes, nulles pour le passé.
-- ============================================================================

alter table public.ai_usage
  add column if not exists cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  add column if not exists cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0);

comment on column public.ai_usage.cache_write_tokens is
  'Jetons d''entrée écrits au cache du modèle (1,25 fois le tarif d''entrée).';
comment on column public.ai_usage.cache_read_tokens is
  'Jetons d''entrée relus dans le cache du modèle (0,05 fois le tarif d''entrée sur Opus 5.5, 0,1 ailleurs).';
