-- ============================================================================
-- 0008 — L'invitation se fait par courriel, pas par jeton.
--
-- cabinet_invitations.token_hash datait d'un modèle où l'invitation portait un
-- lien signé. Avec le lien magique, le rendez-vous se fait sur l'adresse :
-- claim_access() rattache le compte à l'invitation qui porte son courriel.
-- Le jeton n'est plus produit par personne — il devient facultatif.
-- ============================================================================

alter table public.cabinet_invitations alter column token_hash drop not null;

-- Une seule invitation en attente par adresse et par cabinet.
create unique index if not exists cabinet_invitations_cabinet_email_idx
  on public.cabinet_invitations (cabinet_id, lower(email)) where accepted_at is null;
