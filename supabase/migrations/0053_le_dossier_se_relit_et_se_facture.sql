-- ============================================================================
-- 0053 — Le dossier se relit, s'annote, s'exporte et se facture
-- ============================================================================
--
-- Quatre gestes de base manquaient à la fiche d'un patient.
--
--   1. RELIRE LA SÉANCE PRÉCÉDENTE avant de recevoir quelqu'un. Les séances
--      sont en base depuis 0002, avec la note relue par la praticienne ;
--      aucun écran ne les rendait. Rien à créer pour elles : la lecture se
--      fait sous la politique « cabinet » de therapy_sessions, et l'écran ne
--      demande jamais la transcription (purgée à l'envoi, 0043).
--
--   2. L'ANAMNÈSE ET LES NOTES HORS SÉANCE. Le motif, les antécédents, les
--      contre-indications à l'hypnose, les traitements : ce qu'on recueille
--      au premier rendez-vous et qu'on relit avant chaque induction. Ils
--      n'avaient nulle part où aller — ou finissaient dans les notes d'une
--      séance, et disparaissaient avec son consentement retiré. Deux tables
--      à part, tenues par le seul cabinet : ni le patient ni le revendeur
--      n'y ont de politique, donc aucun chemin de lecture.
--
--   3. L'EXPORT DU DOSSIER (droit d'accès, RGPD art. 15) se fabrique dans le
--      navigateur, à partir de ce que la praticienne lit déjà. La base n'en
--      garde que la trace : qui a exporté quel dossier, et quand — jamais ce
--      qu'il contenait.
--
--   4. LA NOTE D'HONORAIRES. Numérotée sans trou par cabinet, figée à
--      l'émission, jamais effacée : une note fausse s'annule et garde son
--      numéro. C'est ce qu'on attend d'une pièce comptable, et c'est ce que
--      la base garantit — le navigateur n'a pas le droit d'en écrire une.

-- ============================================================================
-- 1. La signature des lignes du dossier
-- ============================================================================
--
-- L'auteur et l'heure sont posés par la base, jamais par le navigateur : une
-- note datée dont l'auteur se choisit à l'écriture ne prouve rien, et dans un
-- cabinet à plusieurs praticiennes (0042), savoir qui a écrit compte.
--
-- La date d'une note (`le`), elle, reste celle que la praticienne choisit :
-- on consigne souvent le soir ce qu'on a appris le matin.

create or replace function public.dossier_signer()
returns trigger
language plpgsql set search_path = ''
as $fn$
begin
  if tg_table_name = 'dossier_notes' then
    if tg_op = 'INSERT' then
      new.auteur := auth.uid();
      new.creee_le := now();
    else
      new.auteur := old.auteur;
      new.creee_le := old.creee_le;
    end if;
  elsif tg_table_name = 'dossier_anamneses' then
    new.modifiee_par := auth.uid();
  end if;
  new.modifiee_le := now();
  return new;
end;
$fn$;

revoke execute on function public.dossier_signer() from public, anon, authenticated;

-- ============================================================================
-- 2. L'anamnèse : une par fiche
-- ============================================================================
--
-- Des champs libres, et aucune liste médicale : l'application ne sait pas ce
-- qui contre-indique une hypnose chez cette personne, la praticienne si.
-- Suivre la fiche : supprimer la fiche supprime l'anamnèse avec le reste.

create table if not exists public.dossier_anamneses (
  patient_id          uuid primary key references public.patients (id) on delete cascade,
  cabinet_id          uuid not null references public.cabinets (id) on delete cascade,
  motif               text not null default '',
  antecedents         text not null default '',
  contre_indications  text not null default '',
  traitements         text not null default '',
  modifiee_le         timestamptz not null default now(),
  modifiee_par        uuid references auth.users (id) on delete set null,
  constraint dossier_anamneses_longueurs check (
        char_length(motif) <= 8000
    and char_length(antecedents) <= 8000
    and char_length(contre_indications) <= 8000
    and char_length(traitements) <= 8000
  )
);

create index if not exists dossier_anamneses_cabinet_idx      on public.dossier_anamneses (cabinet_id);
create index if not exists dossier_anamneses_modifiee_par_idx on public.dossier_anamneses (modifiee_par);

comment on table public.dossier_anamneses is
  'L''anamnèse d''un patient, écrite par le cabinet : motif, antécédents, contre-indications à l''hypnose, traitements. Ni le patient ni le revendeur ne la lisent.';

-- ============================================================================
-- 3. Les notes datées, hors séance
-- ============================================================================

create table if not exists public.dossier_notes (
  id           uuid primary key default gen_random_uuid(),
  cabinet_id   uuid not null references public.cabinets (id) on delete cascade,
  patient_id   uuid not null references public.patients (id) on delete cascade,
  le           date not null default (now() at time zone 'Europe/Paris')::date,
  texte        text not null,
  auteur       uuid references auth.users (id) on delete set null,
  creee_le     timestamptz not null default now(),
  modifiee_le  timestamptz not null default now(),
  constraint dossier_notes_texte check (char_length(btrim(texte)) between 1 and 20000)
);

-- La fiche les lit de la plus récente à la plus ancienne : l'index le sait.
create index if not exists dossier_notes_patient_idx on public.dossier_notes (patient_id, le desc, creee_le desc);
create index if not exists dossier_notes_cabinet_idx on public.dossier_notes (cabinet_id);
create index if not exists dossier_notes_auteur_idx  on public.dossier_notes (auteur);

comment on table public.dossier_notes is
  'Les notes datées de la praticienne, hors séance. Tenues par le cabinet seul.';

-- ============================================================================
-- 4. Rangement, signature, droits
-- ============================================================================
--
-- `ranger_selon_la_fiche` (0030) pose le cabinet d'après la fiche : une ligne
-- écrite pour le patient d'un autre cabinet prend ce cabinet-là, et la RLS
-- refuse alors l'écriture. Le cloisonnement ne dépend pas de ce que le
-- navigateur déclare.

drop trigger if exists dossier_anamneses_rangement on public.dossier_anamneses;
create trigger dossier_anamneses_rangement
  before insert or update on public.dossier_anamneses
  for each row execute function public.ranger_selon_la_fiche();

drop trigger if exists dossier_anamneses_signature on public.dossier_anamneses;
create trigger dossier_anamneses_signature
  before insert or update on public.dossier_anamneses
  for each row execute function public.dossier_signer();

drop trigger if exists dossier_notes_rangement on public.dossier_notes;
create trigger dossier_notes_rangement
  before insert or update on public.dossier_notes
  for each row execute function public.ranger_selon_la_fiche();

drop trigger if exists dossier_notes_signature on public.dossier_notes;
create trigger dossier_notes_signature
  before insert or update on public.dossier_notes
  for each row execute function public.dossier_signer();

alter table public.dossier_anamneses enable row level security;
alter table public.dossier_notes     enable row level security;

-- Une anamnèse se vide, elle ne se supprime pas : pas de DELETE.
revoke all on public.dossier_anamneses, public.dossier_notes from anon, authenticated;
grant select, insert, update         on public.dossier_anamneses to authenticated;
grant select, insert, update, delete on public.dossier_notes     to authenticated;

drop policy if exists "le cabinet tient l anamnese" on public.dossier_anamneses;
create policy "le cabinet tient l anamnese"
  on public.dossier_anamneses for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));

drop policy if exists "le cabinet tient ses notes" on public.dossier_notes;
create policy "le cabinet tient ses notes"
  on public.dossier_notes for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));

-- ============================================================================
-- 5. L'identité portée par les notes d'honoraires
-- ============================================================================
--
-- Saisie une fois, reprise à chaque note. L'écran la pré-remplit avec les
-- mentions légales du site vitrine (0048) quand elles existent : c'est la
-- même personne, et elle les a déjà écrites. Mais c'est ICI qu'elle la
-- confirme — une note ne part pas avec une identité que personne n'a relue.
--
-- Le revendeur ne la lit pas : rien dans son métier ne la demande.

create table if not exists public.cabinet_facturation (
  cabinet_id   uuid primary key references public.cabinets (id) on delete cascade,
  praticien    text not null default '',
  adresse      text not null default '',
  numero_pro   text not null default '',
  -- La mention de TVA proposée par défaut ; nulle : aucune mention.
  mention_tva  text default 'art-261-4-1',
  modifiee_le  timestamptz not null default now(),
  constraint cabinet_facturation_longueurs check (
        char_length(praticien) <= 120
    and char_length(adresse) <= 300
    and char_length(numero_pro) <= 60
  ),
  constraint cabinet_facturation_mention check (
    mention_tva is null or mention_tva in ('art-261-4-1', 'art-293-b')
  )
);

drop trigger if exists cabinet_facturation_signature on public.cabinet_facturation;
create trigger cabinet_facturation_signature
  before insert or update on public.cabinet_facturation
  for each row execute function public.dossier_signer();

alter table public.cabinet_facturation enable row level security;
revoke all on public.cabinet_facturation from anon, authenticated;
grant select, insert, update on public.cabinet_facturation to authenticated;

drop policy if exists "le cabinet tient son identite de facturation" on public.cabinet_facturation;
create policy "le cabinet tient son identite de facturation"
  on public.cabinet_facturation for all to authenticated
  using (public.is_cabinet_member(cabinet_id))
  with check (public.is_cabinet_member(cabinet_id));

-- ============================================================================
-- 6. Les notes d'honoraires
-- ============================================================================
--
-- FIGÉES À L'ÉMISSION. La note garde tout ce qu'elle imprime — identité de
-- la praticienne, nom du bénéficiaire, prestation, montant, mention — pour
-- se réimprimer à l'identique dans cinq ans, même si l'adresse du cabinet a
-- changé entre-temps.
--
-- JAMAIS EFFACÉES PAR LA SUPPRESSION D'UNE FICHE. Une pièce justificative se
-- conserve — six ans au moins pour l'administration fiscale (LPF, art. L102 B),
-- dix ans pour qui relève du code de commerce (art. L123-22) — et le RGPD
-- l'admet comme obligation légale (art. 17-3-b). La fiche supprimée, la note perd son lien
-- (`patient_id` nul) et garde le nom qu'elle portait — rien de plus : ni
-- séance, ni contenu clinique.
--
-- ÉCRITES PAR LA BASE SEULE. Le navigateur lit, et appelle deux fonctions :
-- émettre, annuler. Sans droit d'insertion ni de mise à jour, personne ne
-- choisit son numéro, ne réécrit un montant, ne supprime une note gênante.

create table if not exists public.notes_honoraires (
  id                 uuid primary key default gen_random_uuid(),
  cabinet_id         uuid not null references public.cabinets (id) on delete cascade,
  numero             integer not null check (numero > 0),
  patient_id         uuid references public.patients (id) on delete set null,
  session_id         uuid references public.therapy_sessions (id) on delete set null,
  date_prestation    date not null,
  prestation         text not null,
  montant_cents      integer not null,
  mention_tva        text,
  praticien          text not null,
  praticien_adresse  text not null,
  praticien_numero   text not null,
  beneficiaire       text not null,
  emise_le           timestamptz not null default now(),
  emise_par          uuid references auth.users (id) on delete set null,
  annulee_le         timestamptz,
  constraint notes_honoraires_numero_unique unique (cabinet_id, numero),
  constraint notes_honoraires_montant check (montant_cents between 1 and 500000),
  constraint notes_honoraires_prestation check (char_length(btrim(prestation)) between 1 and 200),
  constraint notes_honoraires_mention check (
    mention_tva is null or mention_tva in ('art-261-4-1', 'art-293-b')
  )
);

-- Une séance, une note en cours : l'annulée ne compte plus.
create unique index if not exists notes_honoraires_une_par_seance
  on public.notes_honoraires (session_id)
  where session_id is not null and annulee_le is null;
create index if not exists notes_honoraires_session_idx   on public.notes_honoraires (session_id);
create index if not exists notes_honoraires_patient_idx   on public.notes_honoraires (patient_id, emise_le desc);
create index if not exists notes_honoraires_emise_par_idx on public.notes_honoraires (emise_par);

alter table public.notes_honoraires enable row level security;
revoke all on public.notes_honoraires from anon, authenticated;
grant select on public.notes_honoraires to authenticated;

drop policy if exists "le cabinet relit ses notes d honoraires" on public.notes_honoraires;
create policy "le cabinet relit ses notes d honoraires"
  on public.notes_honoraires for select to authenticated
  using (public.is_cabinet_member(cabinet_id));

comment on table public.notes_honoraires is
  'Notes d''honoraires émises par le cabinet : numérotation continue par cabinet, contenu figé, annulation sans effacement. Écrites par cabinet_emettre_note_honoraires et cabinet_annuler_note_honoraires seulement.';

-- ============================================================================
-- 7. Émettre une note
-- ============================================================================
--
-- SANS TROU. Une séquence Postgres en laisse (une transaction annulée
-- consomme son numéro) et ne sait pas compter par cabinet. Le numéro est donc
-- le plus grand du cabinet plus un, lu APRÈS avoir verrouillé la ligne
-- d'identité du cabinet : deux émissions simultanées passent l'une après
-- l'autre, et l'unicité (cabinet_id, numero) reste la garde de dernier
-- recours. Aucune note n'étant jamais effacée, le plus grand numéro ne
-- recule pas.
--
-- DEPUIS UNE SÉANCE ENVOYÉE, OU SANS SÉANCE. Une séance envoyée donne sa
-- date et n'a qu'une note en cours. Mais toutes les séances ne sont pas
-- captées : une praticienne qui n'enregistre pas doit pouvoir remettre une
-- note à qui la lui demande (pour sa mutuelle, souvent). La date est alors
-- la sienne, jamais dans le futur.
--
-- SECURITY DEFINER, parce que le cabinet n'a aucun droit d'écriture sur la
-- table : chaque lecture est donc bornée ici, à la main, au cabinet de qui
-- appelle.

create or replace function public.cabinet_emettre_note_honoraires(
  p_patient       uuid,
  p_session       uuid,
  p_date          date,
  p_prestation    text,
  p_montant_cents integer,
  p_mention_tva   text
)
returns public.notes_honoraires
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_fiche       record;
  v_seance      record;
  v_ident       record;
  v_date        date;
  v_numero      integer;
  v_note        public.notes_honoraires;
  v_prestation  text := btrim(coalesce(p_prestation, ''));
  v_aujourdhui  date := (now() at time zone 'Europe/Paris')::date;
begin
  select p.cabinet_id, p.display_name
    into v_fiche
    from public.patients p
   where p.id = p_patient;
  if not found or not public.is_cabinet_member(v_fiche.cabinet_id) then
    raise exception 'Fiche introuvable dans votre cabinet.' using errcode = 'P0002';
  end if;

  if p_session is not null then
    select s.patient_id, s.sent_at, s.occurred_at
      into v_seance
      from public.therapy_sessions s
     where s.id = p_session
     for update;
    if not found or v_seance.patient_id is distinct from p_patient then
      raise exception 'Séance introuvable pour cette fiche.' using errcode = 'P0002';
    end if;
    if v_seance.sent_at is null then
      raise exception 'Seule une séance envoyée au dossier se facture depuis son historique.'
        using errcode = '55000';
    end if;
    select n.numero into v_numero
      from public.notes_honoraires n
     where n.session_id = p_session and n.annulee_le is null;
    if found then
      raise exception 'Cette séance a déjà sa note d''honoraires (n° %). Annulez-la pour en émettre une autre.',
        lpad(v_numero::text, 4, '0')
        using errcode = '23505';
    end if;
    v_date := coalesce(p_date, (v_seance.occurred_at at time zone 'Europe/Paris')::date);
  else
    v_date := p_date;
  end if;

  if v_date is null then
    raise exception 'Indiquez la date de la séance.' using errcode = '22023';
  end if;
  if v_date > v_aujourdhui then
    raise exception 'Cette date est à venir : une note d''honoraires s''établit une fois la séance passée.'
      using errcode = '22023';
  end if;
  if char_length(v_prestation) not between 1 and 200 then
    raise exception 'Décrivez la prestation, en 200 caractères au plus.' using errcode = '22023';
  end if;
  if p_montant_cents is null or p_montant_cents not between 1 and 500000 then
    raise exception 'Le montant doit être compris entre 0,01 € et 5 000 €.' using errcode = '22023';
  end if;
  if p_mention_tva is not null and p_mention_tva not in ('art-261-4-1', 'art-293-b') then
    raise exception 'Mention de TVA inconnue.' using errcode = '22023';
  end if;

  -- Le verrou qui numérote : la ligne d'identité du cabinet.
  select f.praticien, f.adresse, f.numero_pro
    into v_ident
    from public.cabinet_facturation f
   where f.cabinet_id = v_fiche.cabinet_id
   for update;
  if not found
     or btrim(v_ident.praticien) = ''
     or btrim(v_ident.adresse) = ''
     or btrim(v_ident.numero_pro) = '' then
    raise exception 'Complétez vos coordonnées de facturation (nom, adresse, numéro professionnel) avant d''émettre une note.'
      using errcode = '22023';
  end if;

  select coalesce(max(n.numero), 0) + 1
    into v_numero
    from public.notes_honoraires n
   where n.cabinet_id = v_fiche.cabinet_id;

  insert into public.notes_honoraires (
    cabinet_id, numero, patient_id, session_id, date_prestation, prestation,
    montant_cents, mention_tva, praticien, praticien_adresse, praticien_numero,
    beneficiaire, emise_par
  ) values (
    v_fiche.cabinet_id, v_numero, p_patient, p_session, v_date, v_prestation,
    p_montant_cents, p_mention_tva, btrim(v_ident.praticien), btrim(v_ident.adresse),
    btrim(v_ident.numero_pro), v_fiche.display_name, auth.uid()
  )
  returning * into v_note;

  -- Le fait, et son numéro : ni le montant, ni la personne.
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
  values (v_fiche.cabinet_id, auth.uid(), 'honoraires.emise', 'notes_honoraires', v_note.id,
          jsonb_build_object('numero', v_numero));

  return v_note;
end;
$fn$;

revoke execute on function public.cabinet_emettre_note_honoraires(uuid, uuid, date, text, integer, text) from public, anon;
grant execute on function public.cabinet_emettre_note_honoraires(uuid, uuid, date, text, integer, text) to authenticated;

comment on function public.cabinet_emettre_note_honoraires(uuid, uuid, date, text, integer, text) is
  'Émet une note d''honoraires numérotée sans trou pour une fiche du cabinet, depuis une séance envoyée ou à une date passée.';

-- ============================================================================
-- 8. Annuler une note
-- ============================================================================
--
-- Elle reste en base, avec son numéro, marquée annulée : la suite des numéros
-- ne se troue pas, et la note se réimprime barrée de sa mention. Une séance
-- dont la note est annulée peut en recevoir une nouvelle.

create or replace function public.cabinet_annuler_note_honoraires(p_note uuid)
returns public.notes_honoraires
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_note public.notes_honoraires;
begin
  select * into v_note
    from public.notes_honoraires n
   where n.id = p_note
   for update;
  if not found or not public.is_cabinet_member(v_note.cabinet_id) then
    raise exception 'Note introuvable dans votre cabinet.' using errcode = 'P0002';
  end if;
  if v_note.annulee_le is not null then
    return v_note;
  end if;

  update public.notes_honoraires n
     set annulee_le = now()
   where n.id = p_note
  returning * into v_note;

  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id, meta)
  values (v_note.cabinet_id, auth.uid(), 'honoraires.annulee', 'notes_honoraires', v_note.id,
          jsonb_build_object('numero', v_note.numero));

  return v_note;
end;
$fn$;

revoke execute on function public.cabinet_annuler_note_honoraires(uuid) from public, anon;
grant execute on function public.cabinet_annuler_note_honoraires(uuid) to authenticated;

comment on function public.cabinet_annuler_note_honoraires(uuid) is
  'Annule une note d''honoraires du cabinet sans l''effacer : son numéro reste pris.';

-- ============================================================================
-- 9. La trace d'un export
-- ============================================================================
--
-- Le PDF se fabrique dans le navigateur ; la base ne voit passer que le
-- geste. Qui, quel dossier, quand — c'est ce qu'un journal d'accès à des
-- données de santé doit pouvoir dire, et rien de plus : le contenu n'y entre
-- jamais. L'écran appelle cette fonction AVANT de fabriquer le document, et
-- s'abstient si la trace n'a pas pu s'écrire.

create or replace function public.cabinet_tracer_export(p_patient uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_cabinet uuid;
begin
  select p.cabinet_id into v_cabinet from public.patients p where p.id = p_patient;
  if v_cabinet is null or not public.is_cabinet_member(v_cabinet) then
    raise exception 'Fiche introuvable dans votre cabinet.' using errcode = 'P0002';
  end if;
  insert into public.audit_log (cabinet_id, actor_user_id, action, target_table, target_id)
  values (v_cabinet, auth.uid(), 'dossier.exporte', 'patients', p_patient);
end;
$fn$;

revoke execute on function public.cabinet_tracer_export(uuid) from public, anon;
grant execute on function public.cabinet_tracer_export(uuid) to authenticated;

comment on function public.cabinet_tracer_export(uuid) is
  'Inscrit au journal d''accès l''export du dossier d''une fiche du cabinet. Le contenu n''y figure pas.';
