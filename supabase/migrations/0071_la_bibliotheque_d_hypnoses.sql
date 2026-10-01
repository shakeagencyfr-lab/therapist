-- ============================================================================
-- 0071 — La bibliothèque d'hypnoses du cabinet
-- ============================================================================
--
-- Une hypnose coûte l'appel le plus cher du produit, et elle restait sur la
-- fiche du patient pour qui elle avait été écrite. Une séance sur le sommeil,
-- relue et corrigée, ne servait qu'une fois : pour le patient suivant qui
-- dormait mal, on en repayait une autre. Avec l'option Hypnose, le cabinet
-- garde désormais ses hypnoses dans une bibliothèque, comme ses modules
-- d'atelier : on les relit, on les corrige, et on les attribue à d'autres
-- patients.
--
-- DEUX CHEMINS Y MÈNENT.
--
--   1. ÉCRITE EN SÉANCE. Une hypnose écrite pour un patient rejoint la
--      bibliothèque au moment où elle se referme (`complete` passe à vrai) :
--      un INSTANTANÉ — titre, intention, les quatre mouvements — pris par un
--      déclencheur. Les corrections faites ensuite sur la fiche du patient ne
--      remontent pas : la bibliothèque garde sa propre copie, qui se corrige
--      chez elle. La ligne retient d'où elle vient (`source_hypnose_id`,
--      `source_patient_id`), une fois et une seule : l'index unique sur
--      `source_hypnose_id` rend le versement idempotent.
--
--   2. ÉCRITE DANS L'ATELIER, sans patient : un script général, que la
--      praticienne lance depuis la bibliothèque. La ligne s'ouvre en base
--      AVANT d'être écrite, comme une hypnose de fiche, et ses mouvements y
--      sont versés au fil de l'eau (`mouvements`, un tableau ordonné de
--      `{mouvement, titre, texte}`). Le serveur reconnaît son identifiant
--      comme celui d'une hypnose du cabinet : le forfait de 0068 (une hypnose
--      payée une fois pour ses quatre mouvements, `<id>:<mouvement>`) vaut
--      pour elle aussi.
--
-- ATTRIBUER, C'EST COPIER. `cabinet_attribuer_hypnose` écrit, pour chaque
-- patient choisi, une hypnose complète sur sa fiche, avec ses quatre
-- mouvements, marquée `bibliotheque_id`. Cette copie est la sienne : la
-- supprimer de la bibliothèque ne la lui retire pas, et elle ne revient
-- jamais dans la bibliothèque (le déclencheur ignore toute hypnose marquée,
-- et une copie naît déjà complète). La fonction vérifie l'appartenance au
-- cabinet (second facteur compris, 0056), que chaque patient en est un suivi
-- actif, que la ligne est entière, et que l'option Hypnose est ouverte
-- (`hypnose_ouverte`, 0065) — fermée, ce qui est écrit reste lisible, rien ne
-- s'attribue. Le geste est inscrit au journal d'accès, sans contenu.
--
-- UNE DONNÉE DE SANTÉ, ENCORE. Une hypnose écrite en séance reprend les mots
-- d'un patient : la bibliothèque est cloisonnée par cabinet comme les
-- hypnoses (même politique), rien pour l'anonyme, rien pour le revendeur.
-- Supprimer la fiche d'un patient ne supprime PAS en cascade les hypnoses de
-- la bibliothèque nées de ses séances — elles sont au cabinet — mais efface
-- le lien (`source_patient_id` à null) ; l'écran de suppression propose de
-- les retirer aussi, cochée par défaut.
--
-- LE NAVIGATEUR N'ÉCRIT QUE CE QUI EST À LUI. Il crée une ligne d'atelier, en
-- verse les mouvements, la renomme, la referme, la supprime. Il ne pose ni
-- l'origine (« atelier » par défaut ; « seance » vient du seul déclencheur),
-- ni la provenance, ni l'auteur, ni les dates : ces colonnes n'ont pas de
-- droit d'écriture pour `authenticated`.
--
-- Additive : une table, une colonne nullable sur `hypnoses`, quatre fonctions,
-- deux déclencheurs, et le versement des hypnoses complètes déjà écrites.
-- Rien de ce qui existe n'est réécrit.

-- ============================================================================
-- 1. La bibliothèque
-- ============================================================================

create table if not exists public.bibliotheque_hypnoses (
  id                uuid primary key default gen_random_uuid(),
  cabinet_id        uuid not null references public.cabinets (id) on delete cascade,
  titre             text not null check (char_length(btrim(titre)) between 1 and 300),
  -- Ce que la praticienne voulait travailler. Exigée à l'écriture d'atelier
  -- (le serveur la refuse sous quinze caractères), facultative en séance.
  intention         text not null default '' check (char_length(intention) <= 4000),
  -- Les quatre mouvements, dans l'ordre : [{mouvement, titre, texte}, …].
  mouvements        jsonb not null default '[]'::jsonb,
  origine           text not null default 'atelier' check (origine in ('seance', 'atelier')),
  -- Entière : les quatre mouvements sont là. Seule une hypnose entière
  -- s'attribue.
  complete          boolean not null default false,
  -- D'où elle vient, quand elle est née en séance. Effacé, pas cascadé : la
  -- copie de la bibliothèque survit à la fiche, sans plus la désigner.
  source_hypnose_id uuid references public.hypnoses (id) on delete set null,
  source_patient_id uuid references public.patients (id) on delete set null,
  cree_par          uuid default auth.uid() references auth.users (id) on delete set null,
  cree_le           timestamptz not null default now(),
  modifie_le        timestamptz not null default now(),
  /* Un tableau, de quatre éléments au plus. Le CASE garde l'ordre
     d'évaluation : jsonb_array_length lève sur un scalaire. */
  constraint bibliotheque_hypnoses_mouvements_liste check (
    case when jsonb_typeof(mouvements) = 'array' then jsonb_array_length(mouvements) <= 4 else false end
  ),
  -- Entière, c'est quatre mouvements : ni trois, ni un tableau vide.
  constraint bibliotheque_hypnoses_complete_entiere check (
    not complete
    or case when jsonb_typeof(mouvements) = 'array' then jsonb_array_length(mouvements) = 4 else false end
  ),
  -- Une hypnose entière fait vingt à trente mille caractères ; au-delà de
  -- quatre cent mille, ce n'est plus une séance.
  constraint bibliotheque_hypnoses_taille check (octet_length(mouvements::text) <= 400000)
);

comment on table public.bibliotheque_hypnoses is
  'Les hypnoses du cabinet, réutilisables : instantanés des hypnoses écrites en séance, et scripts écrits dans l''atelier. Attribuer copie l''hypnose sur la fiche du patient (hypnoses.bibliotheque_id).';
comment on column public.bibliotheque_hypnoses.mouvements is
  'Tableau ordonné de {mouvement, titre, texte} : induction, approfondissement, travail, retour.';
comment on column public.bibliotheque_hypnoses.source_patient_id is
  'Le patient dont la séance a produit cette hypnose. Mis à null quand sa fiche est supprimée.';

-- Le versement est idempotent : une hypnose de fiche n'entre qu'une fois. Cet
-- index couvre aussi la clé : l'effacement d'une hypnose y cherche sa ligne.
create unique index if not exists bibliotheque_hypnoses_source_unique
  on public.bibliotheque_hypnoses (source_hypnose_id) where source_hypnose_id is not null;
-- La liste du cabinet, les plus récentes d'abord ; et un index sous chaque clé (0050).
create index if not exists bibliotheque_hypnoses_cabinet_idx
  on public.bibliotheque_hypnoses (cabinet_id, cree_le desc);
create index if not exists bibliotheque_hypnoses_source_patient_idx
  on public.bibliotheque_hypnoses (source_patient_id);
create index if not exists bibliotheque_hypnoses_cree_par_idx
  on public.bibliotheque_hypnoses (cree_par);

/* Les droits — ceux des hypnoses (0017), à la colonne près. La politique
   borne au cabinet ; les droits de colonne bornent ce que le navigateur
   écrit. */
alter table public.bibliotheque_hypnoses enable row level security;

revoke all on public.bibliotheque_hypnoses from anon, authenticated;
grant select, delete on public.bibliotheque_hypnoses to authenticated;
grant insert (cabinet_id, titre, intention, mouvements, complete) on public.bibliotheque_hypnoses to authenticated;
grant update (titre, intention, mouvements, complete) on public.bibliotheque_hypnoses to authenticated;
grant all on public.bibliotheque_hypnoses to service_role;

create policy "cabinet"
  on public.bibliotheque_hypnoses for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));

/* La date de modification suit ce qui se lit — le texte, le titre,
   l'intention, l'achèvement —, pas l'effacement d'une provenance. */
create or replace function public.bibliotheque_hypnoses_modifiee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.modifie_le := now();
  return new;
end;
$$;

revoke execute on function public.bibliotheque_hypnoses_modifiee() from public, anon, authenticated;

create trigger bibliotheque_hypnoses_modifiee
  before update of titre, intention, mouvements, complete on public.bibliotheque_hypnoses
  for each row execute function public.bibliotheque_hypnoses_modifiee();

-- ============================================================================
-- 2. La copie d'un patient se souvient de la bibliothèque
-- ============================================================================

alter table public.hypnoses
  add column if not exists bibliotheque_id uuid references public.bibliotheque_hypnoses (id) on delete set null;

comment on column public.hypnoses.bibliotheque_id is
  'Copie attribuée depuis la bibliothèque du cabinet. Une telle hypnose ne revient jamais dans la bibliothèque.';

create index if not exists hypnoses_bibliotheque_idx on public.hypnoses (bibliotheque_id);

-- ============================================================================
-- 3. Une hypnose refermée rejoint la bibliothèque
-- ============================================================================

/*
 * L'instantané d'une hypnose de fiche, versé dans la bibliothèque de son
 * cabinet. Rend l'identifiant de la ligne créée, ou null : déjà versée,
 * copie venue de la bibliothèque, ou pas entière (quatre mouvements non
 * vides). Le déclencheur et le versement initial passent par ici.
 *
 * Aucun droit d'exécution hors du propriétaire : elle écrit hors RLS.
 */
create or replace function public.verser_hypnose_a_la_bibliotheque(p_hypnose uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h     public.hypnoses;
  v_liste jsonb;
  v_n     integer;
  v_id    uuid;
begin
  select * into v_h from public.hypnoses h where h.id = p_hypnose;
  if v_h.id is null or not v_h.complete or v_h.bibliotheque_id is not null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('mouvement', m.mouvement::text, 'titre', m.titre, 'texte', m.texte)
                            order by m.rang), '[]'::jsonb),
         count(*) filter (where btrim(m.texte) <> '')
    into v_liste, v_n
    from public.hypnose_mouvements m
   where m.hypnose_id = p_hypnose;
  -- Une hypnose qui s'arrête au milieu ne se lit pas à un autre patient.
  if v_n <> 4 then return null; end if;

  insert into public.bibliotheque_hypnoses
    (cabinet_id, titre, intention, mouvements, origine, complete,
     source_hypnose_id, source_patient_id, cree_par, cree_le, modifie_le)
  values
    (v_h.cabinet_id,
     left(coalesce(nullif(btrim(v_h.titre), ''), 'Hypnose'), 300),
     left(coalesce(v_h.intention, ''), 4000),
     v_liste, 'seance', true,
     v_h.id, v_h.patient_id, auth.uid(), v_h.created_at, now())
  on conflict (source_hypnose_id) where source_hypnose_id is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.verser_hypnose_a_la_bibliotheque(uuid) from public, anon, authenticated;

/*
 * Le déclencheur : à l'instant où une hypnose de fiche se referme.
 *
 * LA BIBLIOTHÈQUE NE BLOQUE JAMAIS LA FICHE. Un versement qui échouerait —
 * une contrainte, un verrou — ferait échouer avec lui la fermeture de
 * l'hypnose du patient, qui vient de coûter quatre appels. L'échec est donc
 * avalé et signalé au journal du serveur : l'hypnose du patient se referme,
 * la bibliothèque ne la reçoit pas.
 */
create or replace function public.hypnose_vers_la_bibliotheque()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.verser_hypnose_a_la_bibliotheque(new.id);
  exception when others then
    raise warning 'bibliotheque_hypnoses : hypnose % non versée (%)', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.hypnose_vers_la_bibliotheque() from public, anon, authenticated;

create trigger hypnoses_vers_la_bibliotheque
  after update of complete on public.hypnoses
  for each row
  when (new.complete and not old.complete and new.bibliotheque_id is null)
  execute function public.hypnose_vers_la_bibliotheque();

-- ============================================================================
-- 4. Attribuer une hypnose de la bibliothèque
-- ============================================================================

/*
 * Copie une hypnose entière de la bibliothèque sur la fiche de chaque patient
 * choisi : une hypnose complète, ses quatre mouvements, marquée
 * `bibliotheque_id`. Rend les identifiants des copies, dans l'ordre des
 * patients.
 *
 * Tout ou rien : un patient d'un autre cabinet, ou dont le suivi est clos,
 * refuse l'ensemble — rien n'est écrit pour les autres.
 *
 * Les messages sont écrits pour l'écran (src/lib/bibliothequeHypnoses.ts).
 */
create or replace function public.cabinet_attribuer_hypnose(p_bibliotheque uuid, p_patients uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b        public.bibliotheque_hypnoses;
  v_patients uuid[];
  v_patient  uuid;
  v_id       uuid;
  v_ids      uuid[] := '{}';
  v_ordre    constant text[] := array['induction', 'approfondissement', 'travail', 'retour'];
begin
  select * into v_b from public.bibliotheque_hypnoses b where b.id = p_bibliotheque;
  if v_b.id is null or not public.is_cabinet_member(v_b.cabinet_id) then
    raise exception 'Cette hypnose n''est pas dans la bibliothèque de votre cabinet.' using errcode = '42501';
  end if;

  -- L'option fermée, ce qui est écrit reste lisible ; rien ne s'attribue.
  if not public.hypnose_ouverte(v_b.cabinet_id) then
    raise exception 'L''hypnose personnalisée n''est pas ouverte pour votre cabinet : la bibliothèque se lit, elle ne s''attribue plus.'
      using errcode = '42501';
  end if;

  if not v_b.complete
     or (select count(distinct e ->> 'mouvement')
           from jsonb_array_elements(v_b.mouvements) e
          where e ->> 'mouvement' = any (v_ordre)
            and btrim(coalesce(e ->> 'texte', '')) <> '') <> 4 then
    raise exception 'Cette hypnose n''est pas entière : terminez son écriture avant de l''attribuer.'
      using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(distinct p), '{}') into v_patients
    from unnest(coalesce(p_patients, '{}'::uuid[])) p
   where p is not null;
  if cardinality(v_patients) = 0 then
    raise exception 'Choisissez au moins un patient.' using errcode = 'check_violation';
  end if;
  if cardinality(v_patients) > 200 then
    raise exception 'Deux cents patients au plus en une fois.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(v_patients) p
     where not exists (
       select 1 from public.patients f
        where f.id = p and f.cabinet_id = v_b.cabinet_id and f.archived_at is null
     )
  ) then
    raise exception 'Un des patients choisis n''est pas un suivi en cours de votre cabinet.' using errcode = '42501';
  end if;

  -- Dans l'ordre de la liste reçue : les copies rendues lui correspondent.
  for v_patient in
    select p from unnest(coalesce(p_patients, '{}'::uuid[])) with ordinality as u(p, n)
     where p = any (v_patients)
     group by p
     order by min(n)
  loop
    insert into public.hypnoses (cabinet_id, patient_id, session_id, titre, intention, complete, bibliotheque_id)
    values (v_b.cabinet_id, v_patient, null, v_b.titre, nullif(btrim(v_b.intention), ''), true, v_b.id)
    returning id into v_id;

    insert into public.hypnose_mouvements (hypnose_id, cabinet_id, mouvement, rang, titre, texte)
    select v_id, v_b.cabinet_id, (e ->> 'mouvement')::public.mouvement_hypnose,
           array_position(v_ordre, e ->> 'mouvement'),
           coalesce(e ->> 'titre', ''), e ->> 'texte'
      from (
        select distinct on (e ->> 'mouvement') e
          from jsonb_array_elements(v_b.mouvements) e
         where e ->> 'mouvement' = any (v_ordre)
      ) x(e);

    v_ids := v_ids || v_id;
  end loop;

  -- Qui, quoi, combien — jamais le texte.
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
  values (v_b.cabinet_id, auth.uid(), 'hypnose.attribuee', 'bibliotheque_hypnoses', v_b.id,
          jsonb_build_object('patients', cardinality(v_ids)));

  return v_ids;
end;
$$;

revoke execute on function public.cabinet_attribuer_hypnose(uuid, uuid[]) from public, anon;
grant execute on function public.cabinet_attribuer_hypnose(uuid, uuid[]) to authenticated;

-- ============================================================================
-- 5. Les hypnoses déjà écrites rejoignent la bibliothèque
-- ============================================================================

select public.verser_hypnose_a_la_bibliotheque(h.id)
  from public.hypnoses h
 where h.complete
   and h.bibliotheque_id is null
   and not exists (select 1 from public.bibliotheque_hypnoses b where b.source_hypnose_id = h.id)
 order by h.created_at;
