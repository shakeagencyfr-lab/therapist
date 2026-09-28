-- ============================================================================
-- 0043 — La séance se referme
-- ============================================================================
--
-- Le consentement lu au patient promet trois choses sur la transcription :
-- elle ne sert qu'à écrire la note, elle disparaît quand la note est validée,
-- et tout ce qui a été pris s'efface s'il le demande. La base n'en tenait
-- aucune, et l'écran permettait de renvoyer une séance déjà close.
--
--   1. DEUX VERBATIMS SURVIVAIENT À L'ENVOI. Les séances envoyées avant que la
--      clôture n'efface la transcription (commit 8678415) la gardaient
--      encore. Elles sont purgées ici — et l'envoi ne peut plus en laisser :
--      c'est la base qui efface, quel que soit le chemin qui clôt la séance.
--
--   2. UNE SÉANCE ABANDONNÉE GARDAIT SON VERBATIM POUR TOUJOURS. Depuis que
--      la captation s'enregistre au fil de la séance (pour qu'une page fermée
--      ne perde rien), c'est le cas de toute séance qu'on ne mène pas jusqu'à
--      l'envoi. Une purge quotidienne efface la transcription des séances non
--      envoyées au bout de SEPT JOURS — voir la section 4 pour ce choix.
--
--   3. LE RETRAIT DU CONSENTEMENT N'ÉTAIT ÉCRIT NULLE PART. La colonne
--      consent_revoked_at attendait depuis 0002. La poser efface désormais,
--      en base, ce qui a été pris : transcription, notes et brouillon. La
--      RLS permettait déjà à la thérapeute de l'écrire ; c'est l'effacement
--      qui manquait, et un déclencheur le garantit.
--
--   4. UNE SÉANCE SE RENVOYAIT. « Reprendre » après l'envoi ramenait à la
--      captation, et un second envoi insérait les modules une seconde fois,
--      avançait deux fois le compteur et restockait le verbatim. L'envoi
--      devient une seule transaction qui refuse une séance déjà close, et une
--      séance close refuse d'être réécrite en brouillon.

-- ============================================================================
-- 1. Les verbatims restés après l'envoi
-- ============================================================================

update public.therapy_sessions
   set transcript = null,
       transcript_deleted_at = coalesce(transcript_deleted_at, now())
 where sent_at is not null
   and transcript is not null;

-- ============================================================================
-- 2. Ce qu'une séance close, ou dont le consentement est retiré, n'accepte plus
-- ============================================================================

/**
 * La garde de la séance.
 *
 * POURQUOI UN DÉCLENCHEUR, ET PAS SEULEMENT L'ÉCRAN. L'écran masque désormais
 * « Reprendre » après l'envoi et vérifie la séance avant d'écrire. Mais deux
 * onglets ouverts sur la même séance, une page restée en arrière-plan qui se
 * réveille, une future route du serveur : chacun est un chemin qui ne passe
 * pas par cet écran. La promesse faite au patient ne doit pas dépendre du
 * chemin emprunté.
 *
 * Ce qui reste permis sur une séance envoyée : corriger la note (`draft`) —
 * c'est celle de la thérapeute, elle la relit encore — et la ranger
 * (`archive`). Ce qui ne l'est plus : la renvoyer, la ramener en brouillon, y
 * remettre un verbatim.
 *
 * Deux effacements se font ici plutôt qu'à la charge de l'appelant, pour la
 * même raison :
 *   - poser `sent_at` efface la transcription ;
 *   - poser `consent_revoked_at` efface transcription, notes et brouillon, et
 *     range la séance. Le consentement, lui, reste daté, avec son retrait :
 *     c'est la trace de ce qui a été autorisé puis retiré.
 */
create or replace function public.garder_la_seance()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.sent_at is not null then
      if new.sent_at is distinct from old.sent_at then
        raise exception 'Cette séance est déjà envoyée : elle ne se renvoie pas.'
          using errcode = '55000';
      end if;
      if new.status not in ('envoye', 'archive') then
        raise exception 'Une séance envoyée ne redevient pas un brouillon.'
          using errcode = '55000';
      end if;
      if new.transcript is not null then
        raise exception 'La transcription d''une séance envoyée a été effacée : elle ne revient pas.'
          using errcode = '55000';
      end if;
    end if;

    /* Un retrait ne s'annule pas, et ce qu'il a effacé ne revient pas. */
    if old.consent_revoked_at is not null then
      if new.consent_revoked_at is distinct from old.consent_revoked_at
         or new.sent_at is distinct from old.sent_at
         or new.transcript is not null
         or new.notes is not null
         or new.draft is not null then
        raise exception 'Le consentement de cette séance a été retiré : elle ne se complète plus.'
          using errcode = '55000';
      end if;
    end if;
  end if;

  if new.consent_revoked_at is not null then
    new.transcript := null;
    new.notes := null;
    new.draft := null;
    new.status := 'archive';
    new.transcript_deleted_at := coalesce(new.transcript_deleted_at, now());
  end if;

  if new.sent_at is not null and new.transcript is not null then
    new.transcript := null;
    new.transcript_deleted_at := coalesce(new.transcript_deleted_at, now());
  end if;

  return new;
end;
$$;

revoke execute on function public.garder_la_seance() from public, anon, authenticated;

drop trigger if exists therapy_sessions_garde on public.therapy_sessions;
create trigger therapy_sessions_garde
  before insert or update on public.therapy_sessions
  for each row execute function public.garder_la_seance();

-- ============================================================================
-- 3. L'envoi, en une seule transaction
-- ============================================================================

/**
 * Envoyer une séance : les modules, les audios, la clôture, le compteur.
 *
 * Le navigateur enchaînait quatre écritures. Un échec au milieu laissait des
 * modules sans séance close — et le nouvel essai les insérait une seconde
 * fois. Un second envoi de la même séance (« Reprendre » après l'envoi, deux
 * onglets) faisait pareil, en comptant la séance deux fois. Ici, tout passe
 * ou rien ne passe, et la ligne de la séance est verrouillée le temps de
 * l'envoi : deux envois simultanés ne peuvent pas passer tous les deux.
 *
 * SECURITY INVOKER : chaque écriture reste soumise à la RLS de qui appelle.
 * La fonction n'ouvre aucun droit, elle ne fait qu'ordonner des gestes que la
 * thérapeute pouvait déjà faire un par un. La séance, verrouillée sous cette
 * même RLS, n'est trouvée que dans son cabinet.
 *
 * `p_patient` n'est pas redondant : l'écran dit à quelle fiche il croit
 * envoyer, et une séance d'une autre fiche est refusée plutôt que versée au
 * mauvais dossier.
 *
 * Les audios : seulement ceux que la bibliothèque du cabinet contient — lus
 * sous la RLS, ceux d'un autre cabinet n'existent pas ici.
 */
create or replace function public.cabinet_envoyer_seance(
  p_session uuid,
  p_patient uuid,
  p_draft   jsonb default null,
  p_modules jsonb default '[]'::jsonb,
  p_audios  uuid[] default '{}'::uuid[]
)
returns table (id uuid, title text, kind public.module_kind)
language plpgsql security invoker set search_path = ''
as $$
#variable_conflict use_column
declare
  v_seance   record;
  v_position integer;
begin
  select s.cabinet_id, s.patient_id, s.sent_at, s.consent_revoked_at
    into v_seance
    from public.therapy_sessions s
   where s.id = p_session
   for update;

  if not found or v_seance.patient_id is distinct from p_patient then
    raise exception 'Séance introuvable pour cette fiche, ou hors de votre cabinet.'
      using errcode = 'P0002';
  end if;
  if v_seance.sent_at is not null then
    raise exception 'Cette séance est déjà envoyée : elle ne se renvoie pas.'
      using errcode = '55000';
  end if;
  if v_seance.consent_revoked_at is not null then
    raise exception 'Le consentement de cette séance a été retiré : elle ne peut plus être envoyée.'
      using errcode = '55000';
  end if;
  if jsonb_typeof(coalesce(p_modules, '[]'::jsonb)) <> 'array' then
    raise exception 'Les modules doivent former une liste.' using errcode = '22023';
  end if;

  -- Les modules retenus prennent la suite du parcours existant.
  select coalesce(max(m.position), -1) + 1
    into v_position
    from public.patient_modules m
   where m.patient_id = p_patient;

  return query
  insert into public.patient_modules as m
    (cabinet_id, patient_id, title, meta, kind, source, consigne, position)
  select v_seance.cabinet_id,
         p_patient,
         btrim(e.value->>'title'),
         coalesce(e.value->>'meta', ''),
         (e.value->>'kind')::public.module_kind,
         'seance',
         /* Le « pourquoi » de la séance devient la consigne du module :
            savoir à quoi sert un exercice change tout pour qui doit le faire
            seul, un soir de semaine. */
         case
           when nullif(btrim(coalesce(e.value->>'pourquoi', '')), '') is not null
             then jsonb_build_object('why', btrim(e.value->>'pourquoi'))
         end,
         v_position + (e.rang - 1)::integer
    from jsonb_array_elements(coalesce(p_modules, '[]'::jsonb)) with ordinality as e(value, rang)
   order by e.rang
  returning m.id, m.title, m.kind;

  insert into public.patient_audios (cabinet_id, patient_id, audio_id)
  select v_seance.cabinet_id, p_patient, l.id
    from public.audio_library l
   where l.id = any (coalesce(p_audios, '{}'::uuid[]))
  on conflict (patient_id, audio_id) do nothing;

  /* La version relue l'emporte sur celle de l'IA : c'est elle que la
     thérapeute vient de valider. Le verbatim part avec la clôture — le
     déclencheur l'effacerait de toute façon, on le dit ici aussi. */
  update public.therapy_sessions s
     set sent_at = now(),
         status = 'envoye',
         transcript = null,
         transcript_deleted_at = coalesce(s.transcript_deleted_at, now()),
         draft = coalesce(p_draft, s.draft)
   where s.id = p_session;

  perform public.cabinet_compter_seance(p_patient);
end;
$$;

revoke execute on function public.cabinet_envoyer_seance(uuid, uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.cabinet_envoyer_seance(uuid, uuid, jsonb, jsonb, uuid[]) to authenticated;

comment on function public.cabinet_envoyer_seance(uuid, uuid, jsonb, jsonb, uuid[]) is
  'Verse une séance au dossier en une transaction : modules, audios, clôture, compteur. Refuse une séance déjà envoyée ou dont le consentement est retiré.';

-- ============================================================================
-- 4. La purge des séances abandonnées
-- ============================================================================
--
-- POURQUOI SEPT JOURS. La transcription ne sert qu'à écrire la note, et la
-- note s'écrit entre deux séances : le rythme d'un suivi est hebdomadaire.
-- Une thérapeute qui enregistre le vendredi soir et relit le lundi doit
-- retrouver sa matière ; une séance qui n'est toujours pas envoyée quand la
-- suivante arrive ne le sera plus, et son verbatim n'a plus d'usage — le
-- garder serait conserver la donnée la plus sensible du cabinet sans but
-- (RGPD, art. 5-1-e, limitation de la conservation). Plus court, on
-- effacerait la matière d'une note qu'on comptait écrire après un week-end
-- prolongé ; plus long, on garderait un verbatim au-delà de la séance
-- suivante.
--
-- Seule la transcription part. Les notes sont celles de la thérapeute, et
-- le brouillon déjà rédigé reste envoyable : la purge efface le verbatim,
-- pas le travail.
--
-- Le délai se compte depuis l'ouverture de la séance — la signature du
-- consentement —, et le consentement lu au patient le dit.

create index if not exists therapy_sessions_a_purger_idx
  on public.therapy_sessions (created_at)
  where transcript is not null and sent_at is null;

create or replace function public.purger_transcriptions_abandonnees()
returns integer
language plpgsql set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.therapy_sessions s
     set transcript = null,
         transcript_deleted_at = now()
   where s.transcript is not null
     and s.sent_at is null
     and s.created_at < now() - interval '7 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Le planificateur l'appelle en tant que propriétaire : personne d'autre.
revoke execute on function public.purger_transcriptions_abandonnees() from public, anon, authenticated;

comment on function public.purger_transcriptions_abandonnees() is
  'Efface la transcription des séances non envoyées ouvertes depuis plus de sept jours. Appelée chaque nuit par pg_cron (klaro-purge-transcriptions).';

-- Ce qui dépasse déjà le délai part tout de suite.
select public.purger_transcriptions_abandonnees();

-- Chaque nuit, à une heure où personne ne dicte. Un nom de tâche existant est
-- remplacé : rejouer la migration ne double pas la purge.
select cron.schedule(
  'klaro-purge-transcriptions',
  '11 3 * * *',
  'select public.purger_transcriptions_abandonnees()'
);
