-- ============================================================================
-- 0046 — Chaque jour se coche ; les mots et les pages se rangent en tête
-- ============================================================================
--
-- Trois écarts entre ce que l'espace du patient promet et ce que la base
-- sait tenir.
--
--   1. UNE CASE COCHÉE L'ÉTAIT POUR TOUJOURS. Les exercices entre les séances
--      sont une PRATIQUE QUOTIDIENNE — respirer, s'ancrer, écrire trois
--      lignes : on les refait chaque jour, c'est le principe même du travail
--      entre deux séances. Or `patient_set_module_done` posait `done_at` une
--      fois, et rien ne le remettait jamais à zéro. Une fois tout coché, « Ma
--      journée » affichait « La journée est faite. À demain. » — le lendemain
--      aussi, et tous les jours suivants : les exercices ne revenaient plus,
--      et la thérapeute lisait « fait » pour un geste d'il y a trois semaines.
--
--      L'achèvement devient JOURNALIER : une ligne par module et par jour de
--      Paris (`module_completions`). La fonction coche ou décoche le jour de
--      Paris ; `done_at` reste tenu — l'instant du dernier jour fait — pour ce
--      qui le lit encore (le portefeuille du revendeur, les épreuves).
--
--      LE JOUR EST CELUI DE LA BASE, PAS CELUI DU TÉLÉPHONE. Le patient ne
--      reçoit aucun droit d'écriture sur la table : cocher passe par la
--      fonction, qui fixe le jour elle-même et tient `done_at` dans la même
--      transaction. Une politique d'insertion laisserait un téléphone mal
--      réglé — ou un appel direct à l'API — remplir les jours passés, et
--      `done_at` ne suivrait pas.
--
--      La même fonction sert désormais la case de la fiche, côté cabinet : un
--      seul chemin d'écriture, donc une seule définition de « fait ».
--
--   2. LES MOTS LES PLUS RÉCENTS DISPARAISSAIENT. L'espace lisait vingt
--      lignes de destinataire SANS ORDRE, puis triait dans le navigateur :
--      au-delà de vingt mots — trois semaines d'un programme quotidien —, le
--      mot du jour pouvait ne pas être dans le lot. Et un mot programmé se
--      datait de son écriture, pas de son envoi. La date qui compte est celle
--      où le mot devient visible : `coalesce(scheduled_at, created_at)`, que
--      PostgREST ne sait pas trier. D'où une fonction qui trie en base, SOUS
--      LES DROITS DE L'APPELANT : elle ne voit que ce que la RLS lui montre
--      déjà, elle ne fait que ranger.
--
--   3. UN MOT AU THÉRAPEUTE PARTAIT AU FOND DU JOURNAL. Dès qu'une page a été
--      déplacée, toutes les pages portent un rang ; une page insérée sans rang
--      se rangeait derrière elles, sous les pages d'il y a six mois. Le
--      journal donnait un rang à ses propres pages, le « mot pour votre
--      thérapeute » non. C'est la base qui le donne désormais, quel que soit
--      l'écran qui écrit.

-- ============================================================================
-- 1. Les jours faits
-- ============================================================================

create table if not exists public.module_completions (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.patient_modules(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  -- Posé par le déclencheur de rangement d'après la fiche, comme partout.
  cabinet_id  uuid not null references public.cabinets(id) on delete cascade,
  -- Le jour de PARIS où l'exercice a été fait : c'est le jour que vit le
  -- patient, et celui que la note du soir utilise déjà (0024).
  jour        date not null,
  created_at  timestamptz not null default now(),
  constraint module_completions_un_par_jour unique (module_id, jour)
);

comment on table public.module_completions is
  'Un exercice fait, un jour de Paris. Écrite par patient_set_module_done seule.';

-- Le patient lit sa journée ; le cabinet, la semaine de ses fiches.
create index if not exists module_completions_patient_jour_idx on public.module_completions (patient_id, jour);
create index if not exists module_completions_cabinet_jour_idx on public.module_completions (cabinet_id, jour);

drop trigger if exists module_completions_rangement on public.module_completions;
create trigger module_completions_rangement
  before insert or update on public.module_completions
  for each row execute function public.ranger_selon_la_fiche();

alter table public.module_completions enable row level security;

-- Le patient relit ses jours, pour les exercices encore à son parcours — un
-- exercice retiré (0045) sort de son espace avec ce qui s'y rattache.
drop policy if exists "le patient lit ses jours faits" on public.module_completions;
create policy "le patient lit ses jours faits" on public.module_completions
  for select to authenticated
  using (
    public.is_patient_record(patient_id)
    and exists (
      select 1 from public.patient_modules m
       where m.id = module_completions.module_id and m.archived_at is null
    )
  );

-- Le cabinet lit ceux de ses fiches. Il n'écrit pas ici non plus : la case
-- de la fiche passe par la même fonction que celle du patient.
drop policy if exists "le cabinet lit les jours faits" on public.module_completions;
create policy "le cabinet lit les jours faits" on public.module_completions
  for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

revoke all on table public.module_completions from anon, authenticated;
grant select on table public.module_completions to authenticated;
grant all on table public.module_completions to service_role;

-- L'histoire d'avant : chaque `done_at` posé devient le jour où il l'a été.
-- C'est tout ce que la base en sait — un seul jour par exercice.
insert into public.module_completions (module_id, patient_id, cabinet_id, jour, created_at)
select m.id, m.patient_id, m.cabinet_id, (m.done_at at time zone 'Europe/Paris')::date, m.done_at
  from public.patient_modules m
 where m.done_at is not null
on conflict (module_id, jour) do nothing;

/**
 * Cocher, ou décocher, l'exercice POUR AUJOURD'HUI.
 *
 * La signature et le type rendu sont ceux de 0007 (repris par 0044 et 0045) :
 * l'espace et les épreuves l'appellent tels quels. Ce qui change :
 *
 *   - le geste porte sur le jour de Paris, et sur lui seul. Décocher ce soir
 *     n'efface pas hier ;
 *   - `done_at` devient l'instant du dernier jour fait. Un `done_at` antérieur
 *     à toute ligne de jour (posé avant cette migration, ou par un autre
 *     chemin) est gardé tant qu'il n'est pas d'aujourd'hui : décocher
 *     aujourd'hui ne doit pas effacer un passé qu'on ne connaît que par lui ;
 *   - la case de la fiche l'appelle aussi. Le cabinet cochait jusqu'ici
 *     `done_at` directement ; une fiche close (0044) ne se coche plus, ni
 *     d'un côté ni de l'autre.
 *
 * `for update` sur le module : deux appuis rapprochés — le doigt qui hésite —
 * se suivent au lieu de se croiser, et `done_at` dit le dernier des deux.
 */
create or replace function public.patient_set_module_done(p_module uuid, p_done boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid;
  v_jour    date := (now() at time zone 'Europe/Paris')::date;
  v_done    timestamptz;
begin
  select m.patient_id into v_patient
    from public.patient_modules m
    join public.patients p on p.id = m.patient_id
   where m.id = p_module
     and m.archived_at is null
     and p.archived_at is null
     and (public.is_patient_record(m.patient_id) or public.is_cabinet_member(m.cabinet_id))
     for update of m;

  if not found then
    raise exception 'Module introuvable ou hors de votre parcours.';
  end if;

  if p_done then
    insert into public.module_completions (module_id, patient_id, jour)
    values (p_module, v_patient, v_jour)
    on conflict (module_id, jour) do nothing;
  else
    delete from public.module_completions c
     where c.module_id = p_module and c.jour = v_jour;
  end if;

  update public.patient_modules m
     set done_at = coalesce(
           (select max(c.created_at) from public.module_completions c where c.module_id = m.id),
           case when (m.done_at at time zone 'Europe/Paris')::date < v_jour then m.done_at end
         )
   where m.id = p_module
  returning m.done_at into v_done;

  return v_done;
end;
$$;

comment on function public.patient_set_module_done(uuid, boolean) is
  'Coche ou décoche un exercice pour le jour de Paris ; done_at suit (dernier jour fait). Le patient de la fiche, ou son cabinet.';

revoke execute on function public.patient_set_module_done(uuid, boolean) from public, anon;
grant execute on function public.patient_set_module_done(uuid, boolean) to authenticated;

-- ============================================================================
-- 2. Les mots du cabinet, du plus récent au plus ancien
-- ============================================================================

/**
 * Les mots adressés au patient, triés par l'instant où ils sont devenus
 * visibles, les plus récents d'abord.
 *
 * SECURITY INVOKER : la fonction ne donne aucun droit. Les politiques de
 * 0036 et 0044 (le mot est dû, il est adressé à une fiche en cours de ce
 * compte) s'appliquent telles quelles ; les deux conditions redites ici ne
 * servent qu'à écarter, pour un compte qui est AUSSI membre d'un cabinet,
 * les mots de ce cabinet que sa politique à lui laisserait passer.
 */
create or replace function public.patient_mots(p_limite integer default 20)
returns table (push_id uuid, title text, body text, du_le timestamptz, read_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.id, n.title, n.body, coalesce(n.scheduled_at, n.created_at), r.read_at
    from public.push_recipients r
    join public.push_notifications n on n.id = r.push_id
   where public.is_patient_record(r.patient_id)
     and (n.scheduled_at is null or n.scheduled_at <= now())
   order by coalesce(n.scheduled_at, n.created_at) desc, n.id
   limit least(greatest(coalesce(p_limite, 20), 1), 100);
$$;

comment on function public.patient_mots(integer) is
  'Les mots dus du patient connecté, du plus récent au plus ancien (date d''envoi, sinon d''écriture). Sous ses propres droits.';

revoke execute on function public.patient_mots(integer) from public, anon;
grant execute on function public.patient_mots(integer) to authenticated;

-- ============================================================================
-- 3. Une page neuve se range en tête du journal
-- ============================================================================

/**
 * Le rang d'une page insérée sans rang.
 *
 * Tant que rien n'a été déplacé, aucune page n'a de rang et le journal se lit
 * dans l'ordre du temps : la page neuve y arrive en tête d'elle-même, et on
 * n'y touche pas. Dès qu'une page en porte un, la neuve prend le rang d'avant
 * le premier. SECURITY DEFINER : le rang se calcule sur toutes les pages de
 * la fiche, pas seulement sur celles qu'un lecteur donné verrait.
 */
create or replace function public.journal_page_en_tete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.position is null then
    select min(j.position) - 1 into new.position
      from public.journal_pages j
     where j.patient_id = new.patient_id
       and j.position is not null;
  end if;
  return new;
end;
$$;

revoke execute on function public.journal_page_en_tete() from public, anon, authenticated;

drop trigger if exists journal_pages_en_tete on public.journal_pages;
create trigger journal_pages_en_tete
  before insert on public.journal_pages
  for each row execute function public.journal_page_en_tete();
