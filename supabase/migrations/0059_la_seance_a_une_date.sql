-- ============================================================================
-- 0059 — La séance a une date, la veille s'en souvient, le programme a son
--        parcours
-- ============================================================================
--
-- Trois manques de l'agenda d'un cabinet.
--
--   1. LA PROCHAINE SÉANCE ÉTAIT UN TEXTE LIBRE (`patients.next_session`,
--      0002) : « Jeudi 10 septembre, 14 h ». Il se lisait, rien ne s'en
--      déduisait — ni l'ordre de la liste, ni les séances du jour, ni un
--      rappel. Elle devient un instant, `next_session_at`, que la fiche fixe
--      à l'heure de Paris. Le texte reste, en repli, pour les fiches d'avant :
--      rien ne le convertit, parce qu'un texte libre ne se relit pas sans se
--      tromper — c'est la praticienne qui datera, fiche par fiche.
--
--   2. LE RAPPEL DE LA VEILLE. La veille de la séance, à 18 h (Paris), un mot
--      part au patient par le chemin de TOUS les mots (0040, 0055) :
--      « Votre séance est demain à 14 h 30. » Il s'écrit d'avance, quand la
--      date est fixée, comme un mot programmé — le passage de la minute
--      l'envoie à son heure, sans qu'on redéfinisse rien de ce qu'il fait.
--      Un seul par séance : la date resauvée telle quelle n'en écrit pas un
--      second. Déplacé, il suit la séance ; effacée la séance ou clos le
--      suivi, il s'annule — tant qu'il n'est pas parti. Un mot parti ne se
--      reprend pas (0047). Rien ne s'écrit pour un suivi clos, ni quand la
--      veille à 18 h est déjà passée : un « demain » envoyé le jour même
--      mentirait.
--
--   3. LE PARCOURS D'UN PROGRAMME. « Sommeil », « Arrêt du tabac » : un
--      programme revient avec les mêmes premiers exercices. Il porte
--      désormais un parcours par défaut — quelques exercices, un titre, un
--      type, une consigne courte —, que la praticienne propose d'ajouter au
--      parcours d'un patient quand elle lui attribue le programme. Rien ne
--      s'ajoute tout seul : l'écran montre, elle choisit.
--
-- Ce que cette migration ne redéfinit pas : declencher_rappels(),
-- rappels_a_pousser(), patient_mots() (0040, puis 0055). Le rappel de la
-- veille est un mot programmé comme un autre ; il hérite de leurs filtres,
-- présents et à venir (suivi clos, discrétion sur l'écran verrouillé,
-- cabinet fermé).

-- ============================================================================
-- 1. La date de la prochaine séance
-- ============================================================================

alter table public.patients
  add column if not exists next_session_at timestamptz;

comment on column public.patients.next_session_at is
  'La prochaine séance, datée (fixée à l''heure de Paris par la fiche). Vide : pas de séance datée ; next_session garde alors le texte libre des fiches d''avant.';

-- Aucun droit à ajouter : la politique « cabinet » (0001) et les droits de
-- table couvrent la colonne ; le patient la lit avec sa fiche (« le patient
-- lit sa fiche »), et ne l'écrit pas.

-- ============================================================================
-- 2. Le rappel de la veille
-- ============================================================================

/**
 * Ce que la base retient du rappel d'une fiche : pour quelle séance il a été
 * écrit, et quel mot le porte.
 *
 * Une ligne par fiche, au plus. `seance_le` est ce qui empêche le doublon :
 * la même séance resauvée ne réécrit rien — que son mot attende, soit parti,
 * ou ait été annulé exprès par le cabinet depuis son journal des envois.
 * `push_id` se vide quand le cabinet annule le mot : il ne revient pas.
 *
 * AUCUNE POLITIQUE, AUCUN DROIT pour le navigateur : seul le déclencheur y
 * écrit. Le cabinet voit le mot lui-même, dans son journal des envois — pas
 * cette mécanique.
 */
create table if not exists public.rappels_de_seance (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  cabinet_id uuid not null references public.cabinets (id) on delete cascade,
  seance_le  timestamptz not null,
  push_id    uuid references public.push_notifications (id) on delete set null,
  ecrit_le   timestamptz not null default now()
);

create index if not exists rappels_de_seance_cabinet_idx on public.rappels_de_seance (cabinet_id);
create index if not exists rappels_de_seance_push_idx on public.rappels_de_seance (push_id);

comment on table public.rappels_de_seance is
  'Le rappel de la veille d''une fiche : la séance pour laquelle il a été écrit, et son mot. Écrit par le seul déclencheur de patients ; aucun droit pour le navigateur.';

alter table public.rappels_de_seance enable row level security;
revoke all on table public.rappels_de_seance from anon, authenticated;
grant all on table public.rappels_de_seance to service_role;

/** « 14 h 30 », « 9 h » : l'heure de Paris d'une séance, dite comme on la dit. */
create or replace function public.heure_de_la_seance(p_seance timestamptz)
returns text
language sql stable set search_path = ''
as $fn$
  select extract(hour from (p_seance at time zone 'Europe/Paris'))::int || ' h'
         || case
              when extract(minute from (p_seance at time zone 'Europe/Paris'))::int > 0
              then ' ' || lpad(extract(minute from (p_seance at time zone 'Europe/Paris'))::int::text, 2, '0')
              else ''
            end;
$fn$;

/** L'instant du rappel : la veille de la séance, 18 h à Paris. */
create or replace function public.rappel_de_la_veille_a(p_seance timestamptz)
returns timestamptz
language sql stable set search_path = ''
as $fn$
  select ((((p_seance at time zone 'Europe/Paris')::date - 1) + time '18:00') at time zone 'Europe/Paris');
$fn$;

-- Deux outils du déclencheur, pas des gestes : l'écran calcule les mêmes (src/lib/agenda.ts).
revoke execute on function public.heure_de_la_seance(timestamptz) from public, anon, authenticated;
revoke execute on function public.rappel_de_la_veille_a(timestamptz) from public, anon, authenticated;

/**
 * Écrire, déplacer ou annuler le rappel de la veille d'une fiche.
 *
 * Déclenché quand la date de la séance ou la clôture du suivi changent, et
 * avant qu'une fiche ne s'efface. `security definer` : le mot s'écrit au nom
 * du cabinet de la fiche — celui que la RLS a déjà laissé écrire la fiche —,
 * sans auteur (`created_by` vide) : c'est un mot automatique.
 *
 * Seul un mot PAS ENCORE DÛ s'annule. Au-delà, il est parti ou part dans la
 * minute ; le garde de 0047 refuserait d'ailleurs de l'effacer.
 */
create or replace function public.rappeler_la_veille()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_deja public.rappels_de_seance%rowtype;
  v_trouve boolean;
  v_instant timestamptz;
  v_push uuid;
begin
  if tg_op = 'DELETE' then
    -- La fiche s'efface : son rappel en attente ne partira vers personne.
    delete from public.push_notifications n
     using public.rappels_de_seance r
     where r.patient_id = old.id
       and n.id = r.push_id
       and n.scheduled_at > now();
    return old;
  end if;

  select * into v_deja from public.rappels_de_seance r where r.patient_id = new.id for update;
  v_trouve := found;

  /* LA MÊME SÉANCE, UN SUIVI EN COURS : rien à refaire. Le mot attend, est
     parti, ou a été annulé par le cabinet — et une annulation voulue ne se
     défait pas parce que la fiche a été réenregistrée. */
  if v_trouve and new.archived_at is null and v_deja.seance_le is not distinct from new.next_session_at then
    return new;
  end if;

  -- La séance a bougé, s'est effacée, ou le suivi s'est clos : le mot en attente ne vaut plus.
  if v_trouve and v_deja.push_id is not null then
    delete from public.push_notifications n
     where n.id = v_deja.push_id
       and n.scheduled_at > now();
  end if;

  /* Plus rien à rappeler. La ligne part aussi : un suivi rouvert, une date
     refixée, repartent de zéro. */
  if new.next_session_at is null or new.archived_at is not null then
    delete from public.rappels_de_seance r where r.patient_id = new.id;
    return new;
  end if;

  v_instant := public.rappel_de_la_veille_a(new.next_session_at);
  if v_instant > now() then
    insert into public.push_notifications (cabinet_id, title, body, scheduled_for, scheduled_at, created_by)
    values (new.cabinet_id, 'À demain',
            'Votre séance est demain à ' || public.heure_de_la_seance(new.next_session_at) || '.',
            'La veille de la séance, 18 h', v_instant, null)
    returning id into v_push;

    -- cabinet_id est reposé par le déclencheur de rangement, d'après la fiche.
    insert into public.push_recipients (push_id, patient_id, cabinet_id)
    values (v_push, new.id, new.cabinet_id);
  end if;

  -- La séance est notée même sans mot (veille passée) : resauvée, elle n'en écrira pas.
  insert into public.rappels_de_seance as r (patient_id, cabinet_id, seance_le, push_id, ecrit_le)
  values (new.id, new.cabinet_id, new.next_session_at, v_push, now())
  on conflict (patient_id) do update
     set cabinet_id = excluded.cabinet_id,
         seance_le  = excluded.seance_le,
         push_id    = excluded.push_id,
         ecrit_le   = excluded.ecrit_le;
  return new;
end;
$fn$;

revoke execute on function public.rappeler_la_veille() from public, anon, authenticated;

drop trigger if exists patients_rappel_de_la_veille on public.patients;
create trigger patients_rappel_de_la_veille
  after insert or update of next_session_at, archived_at on public.patients
  for each row execute function public.rappeler_la_veille();

/* AVANT l'effacement : après, la cascade a déjà emporté la ligne qui dit
   quel mot annuler. */
drop trigger if exists patients_rappel_de_la_veille_depart on public.patients;
create trigger patients_rappel_de_la_veille_depart
  before delete on public.patients
  for each row execute function public.rappeler_la_veille();

-- ============================================================================
-- 3. Le parcours par défaut d'un programme
-- ============================================================================

/**
 * Les exercices qu'un programme propose d'ajouter au parcours d'un patient.
 *
 * Un modèle du cabinet, pas une donnée de santé : aucun patient n'y figure.
 * Il ne se lit qu'au cabinet — le patient reçoit des exercices, pas leur
 * modèle —, et ne s'écrit que par cabinet_regler_parcours_type(), qui
 * remplace la liste entière d'un coup : écrite ligne à ligne depuis le
 * navigateur, une coupure laissait un parcours à moitié renuméroté.
 *
 * Les types sont ceux de l'atelier : des tâches que le patient fait et
 * coche. Ni « Audio » ni « Échelle », qui ne se cochent pas (0046).
 */
create table if not exists public.exercices_du_programme (
  id           uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.cabinet_programs (id) on delete cascade,
  -- Posé par la fonction d'après le programme : jamais par le navigateur.
  cabinet_id   uuid not null references public.cabinets (id) on delete cascade,
  rang         smallint not null,
  titre        text not null,
  type_module  public.module_kind not null,
  consigne     text not null default '',
  cree_le      timestamptz not null default now(),
  constraint exercices_du_programme_titre check (char_length(btrim(titre)) between 1 and 120),
  constraint exercices_du_programme_consigne check (char_length(consigne) <= 600),
  constraint exercices_du_programme_type check (type_module in ('Exercice', 'Journal', 'Écriture', 'Visualisation')),
  constraint exercices_du_programme_rang check (rang between 0 and 11),
  -- L'index qu'elle crée couvre aussi la clé étrangère du programme.
  constraint exercices_du_programme_rang_unique unique (programme_id, rang)
);

create index if not exists exercices_du_programme_cabinet_idx on public.exercices_du_programme (cabinet_id);

comment on table public.exercices_du_programme is
  'Le parcours par défaut d''un programme du cabinet : titre, type et consigne courte de chaque exercice. Lu par le cabinet seul, écrit par cabinet_regler_parcours_type().';

alter table public.exercices_du_programme enable row level security;

drop policy if exists "le cabinet lit les parcours de ses programmes" on public.exercices_du_programme;
create policy "le cabinet lit les parcours de ses programmes" on public.exercices_du_programme
  for select to authenticated using (public.is_cabinet_member(cabinet_id));

revoke all on table public.exercices_du_programme from anon, authenticated;
grant select on table public.exercices_du_programme to authenticated;
grant all on table public.exercices_du_programme to service_role;

/**
 * Remplacer le parcours par défaut d'un programme.
 *
 * Tout est relu ici, et les refus sont dits en français : l'écran les montre
 * tels quels. Une liste vide efface le parcours.
 */
create or replace function public.cabinet_regler_parcours_type(p_programme uuid, p_exercices jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_cabinet uuid;
  v_retire timestamptz;
  v_n integer;
  v_e jsonb;
begin
  select c.cabinet_id, c.archived_at into v_cabinet, v_retire
    from public.cabinet_programs c
   where c.id = p_programme
   for update;
  if v_cabinet is null or not public.is_cabinet_member(v_cabinet) then
    raise exception 'Ce programme n''est pas celui de votre cabinet.' using errcode = '42501';
  end if;
  if v_retire is not null then
    raise exception 'Ce programme a été retiré de votre catalogue : son parcours ne se modifie plus.' using errcode = '22023';
  end if;
  if p_exercices is null or jsonb_typeof(p_exercices) <> 'array' then
    raise exception 'Parcours illisible : rechargez la page, puis réessayez.' using errcode = '22023';
  end if;

  v_n := jsonb_array_length(p_exercices);
  if v_n > 12 then
    raise exception 'Un parcours par défaut compte douze exercices au plus : il se complète ensuite, fiche par fiche.' using errcode = '22023';
  end if;

  for v_e in select x.value from jsonb_array_elements(p_exercices) as x loop
    if jsonb_typeof(v_e) <> 'object'
       or jsonb_typeof(v_e -> 'titre') is distinct from 'string'
       or char_length(btrim(v_e ->> 'titre')) = 0 then
      raise exception 'Chaque exercice a besoin d''un titre.' using errcode = '22023';
    end if;
    if char_length(btrim(v_e ->> 'titre')) > 120 then
      raise exception 'Le titre d''un exercice dépasse 120 caractères.' using errcode = '22023';
    end if;
    if coalesce(v_e ->> 'type', '') not in ('Exercice', 'Journal', 'Écriture', 'Visualisation') then
      raise exception 'Type d''exercice inconnu : choisissez Exercice, Journal, Écriture ou Visualisation.' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(v_e ->> 'consigne', ''))) > 600 then
      raise exception 'Une consigne dépasse 600 caractères : elle se veut courte, le détail se donne en séance.' using errcode = '22023';
    end if;
  end loop;

  delete from public.exercices_du_programme e where e.programme_id = p_programme;

  insert into public.exercices_du_programme (programme_id, cabinet_id, rang, titre, type_module, consigne)
  select p_programme, v_cabinet, (x.n - 1)::smallint, btrim(x.e ->> 'titre'),
         (x.e ->> 'type')::public.module_kind, btrim(coalesce(x.e ->> 'consigne', ''))
    from jsonb_array_elements(p_exercices) with ordinality as x (e, n);

  return v_n;
end;
$fn$;

revoke execute on function public.cabinet_regler_parcours_type(uuid, jsonb) from public, anon;
grant execute on function public.cabinet_regler_parcours_type(uuid, jsonb) to authenticated;

/**
 * Ajouter au parcours d'un patient les exercices choisis d'un programme.
 *
 * Les choisis seulement, dans l'ordre du programme, à la suite de son
 * parcours. Un exercice qu'il a déjà — même titre, même type, toujours dans
 * son parcours — ne se double pas : un double clic, ou le programme proposé
 * une seconde fois, n'empilent rien. La consigne courte devient ses étapes,
 * une par ligne ; vide, l'espace du patient dit que l'exercice a été
 * expliqué en séance.
 *
 * Rend le nombre d'exercices réellement ajoutés.
 */
create or replace function public.cabinet_appliquer_parcours_type(
  p_programme uuid,
  p_patient uuid,
  p_exercices uuid[]
)
returns integer
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_cabinet uuid;
  v_choisis integer;
  v_valides integer;
  v_position integer;
  v_n integer := 0;
  x record;
begin
  select c.cabinet_id into v_cabinet from public.cabinet_programs c where c.id = p_programme;
  if v_cabinet is null or not public.is_cabinet_member(v_cabinet) then
    raise exception 'Ce programme n''est pas celui de votre cabinet.' using errcode = '42501';
  end if;

  -- Le verrou de la fiche range les positions : deux ajouts simultanés ne prennent pas la même.
  perform 1
     from public.patients p
    where p.id = p_patient
      and p.cabinet_id = v_cabinet
      and p.archived_at is null
    for update;
  if not found then
    raise exception 'Cette fiche n''est pas un suivi en cours de votre cabinet.' using errcode = '22023';
  end if;

  select count(distinct u) into v_choisis from unnest(coalesce(p_exercices, '{}'::uuid[])) as u;
  if v_choisis = 0 then
    raise exception 'Choisissez au moins un exercice à ajouter.' using errcode = '22023';
  end if;
  select count(*) into v_valides
    from public.exercices_du_programme e
   where e.id = any (p_exercices)
     and e.programme_id = p_programme;
  if v_valides <> v_choisis then
    raise exception 'Un des exercices choisis n''appartient pas à ce programme.' using errcode = '22023';
  end if;

  select coalesce(max(m.position), -1) into v_position
    from public.patient_modules m
   where m.patient_id = p_patient;

  for x in
    select e.titre, e.type_module, e.consigne
      from public.exercices_du_programme e
     where e.id = any (p_exercices)
       and e.programme_id = p_programme
     order by e.rang
  loop
    if exists (
      select 1 from public.patient_modules m
       where m.patient_id = p_patient
         and m.archived_at is null
         and m.kind = x.type_module
         and lower(btrim(m.title)) = lower(btrim(x.titre))
    ) then
      continue;
    end if;

    v_position := v_position + 1;
    -- cabinet_id est reposé par le déclencheur de rangement, d'après la fiche.
    insert into public.patient_modules (cabinet_id, patient_id, title, meta, kind, source, position, consigne)
    values (
      v_cabinet, p_patient, x.titre, x.type_module::text, x.type_module, 'programme', v_position,
      case
        when btrim(x.consigne) = '' then null
        else jsonb_build_object(
          'duree', '',
          'quand', '',
          'steps', (
            select coalesce(jsonb_agg(btrim(l.ligne) order by l.n), '[]'::jsonb)
              from regexp_split_to_table(x.consigne, E'\r?\n') with ordinality as l (ligne, n)
             where btrim(l.ligne) <> ''
          )
        )
      end
    );
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$fn$;

revoke execute on function public.cabinet_appliquer_parcours_type(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.cabinet_appliquer_parcours_type(uuid, uuid, uuid[]) to authenticated;
