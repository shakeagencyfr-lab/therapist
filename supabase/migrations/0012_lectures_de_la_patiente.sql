-- ============================================================================
-- 0012 — Ce que le patient lit des tables du cabinet.
--
-- patient_audios lui était ouvert (0002), mais pas audio_library : la
-- jointure qui donne le titre et la durée d'un audio rendait null sous ses
-- droits, et son écran affichait « cet audio », sans durée. Même trou pour
-- push_notifications : elle voyait qu'une notification lui était adressée
-- (push_recipients) sans pouvoir en lire le titre. Deux politiques de
-- lecture, bornées à ce qui lui a été envoyé.
-- ============================================================================

create policy "le patient lit les audios qui lui ont été envoyés"
  on public.audio_library for select to authenticated
  using (exists (
    select 1 from public.patient_audios pa
    where pa.audio_id = audio_library.id and public.is_patient_record(pa.patient_id)
  ));

create policy "le patient lit les notifications qui lui sont adressées"
  on public.push_notifications for select to authenticated
  using (exists (
    select 1 from public.push_recipients r
    where r.push_id = push_notifications.id and public.is_patient_record(r.patient_id)
  ));
