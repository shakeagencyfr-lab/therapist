-- ============================================================================
-- 0025 — La dérive rattrapée, et trois oublis
--
-- L'audit du produit a trouvé quatre choses dans la base. Trois sont des
-- oublis ; la quatrième est plus gênante que les trois autres réunies, parce
-- qu'elle ne se voit qu'à la reconstruction.
--
-- 1. DÉRIVE. `push_notifications.scheduled_at` existe en production, ajoutée
--    à la main pendant la séance des notifications, et ne figure dans aucun
--    fichier de ce dossier. La production marche ; une base reconstruite à
--    partir d'ici, non — l'envoi à l'heure dite planterait sur une colonne
--    absente. On la remet dans l'histoire écrite, sans rien changer à celle
--    qui tourne.
--
-- 2. UN ACCENT. 0007 a déplacé le comptage des écoutes vers une fonction, et
--    a voulu retirer la politique d'écriture large qui la précédait. Il l'a
--    nommée « le patient compte ses ecoutes » ; elle s'appelle « le patient
--    compte ses écoutes ». `drop policy if exists` n'a rien trouvé, et n'a
--    rien dit. En production, la politique a fini par disparaître autrement ;
--    dans le fichier, elle survivrait à toute reconstruction — et une
--    patient pourrait alors réécrire le titre et la consigne de ses audios,
--    pas seulement les compter.
--
-- 3. UN CATALOGUE OUVERT. `plans` s'ouvrait à tout membre de tout revendeur,
--    quel que soit son rôle. Le catalogue étant global (voir la réserve de
--    0019), un employé pouvait reprendre les prix de toute l'enseigne. Il
--    faut être propriétaire.
--
-- 4. UNE COLONNE QUI MENT. `subscriptions.ai_billing` pilotait la revente de
--    crédits. Le serveur ne la lit plus : le modèle est l'abonnement seul,
--    chaque cabinet branchant sa clé. La colonne reste — le schéma dormant de
--    0016 se tient — mais elle doit dire qu'elle ne décide plus rien.
-- ============================================================================

-- 1. La colonne d'envoi à l'heure dite ---------------------------------------

alter table public.push_notifications
  add column if not exists scheduled_at timestamptz;

comment on column public.push_notifications.scheduled_at is
  'Le moment réel de l''envoi. scheduled_for reste le libellé lisible : « Ce soir, 20 h » se comprend, un horodatage non.';

create index if not exists push_notifications_a_envoyer_idx
  on public.push_notifications (scheduled_at)
  where sent_at is null and scheduled_at is not null;

-- 2. La politique que 0007 a manquée ----------------------------------------

drop policy if exists "le patient compte ses écoutes" on public.patient_audios;

-- 3. Le catalogue, réservé aux propriétaires ---------------------------------

drop policy if exists "le revendeur regle les offres" on public.plans;

create policy "le proprietaire regle les offres"
  on public.plans for update to authenticated
  using (exists (
    select 1 from public.reseller_members m
     where m.user_id = auth.uid() and m.role = 'owner'
  ))
  with check (exists (
    select 1 from public.reseller_members m
     where m.user_id = auth.uid() and m.role = 'owner'
  ));

-- 4. La colonne qui ne décide plus -------------------------------------------

comment on column public.subscriptions.ai_billing is
  'Dormant depuis le retour à l''abonnement seul : le serveur ne lit plus cette colonne, et la basculer ne change rien. Voir 0016 et 0020.';

-- ---------------------------------------------------------------------------
-- Ce qui n'est PAS changé, et pourquoi
--
-- L'audit signale que `claim_access()` rattache un compte à toute fiche non
-- réclamée portant son adresse, dans n'importe quel cabinet. C'est exact, et
-- c'est voulu : dans ce produit, la fiche EST l'invitation — la thérapeute
-- écrit une adresse, le patient se connecte avec, sans mot de passe ni
-- jeton. Aucune donnée existante ne fuit par là : la fiche rattachée est
-- vide, et ne contient que ce que ce cabinet y mettra.
--
-- Ce qu'un cabinet malveillant y gagne est un canal : poser une fiche à
-- l'adresse de quelqu'un pour lui envoyer des modules le jour où il se
-- connecte. La parade tient en une table d'invitations pour les patients,
-- comme il en existe une pour les praticiennes — c'est un changement de
-- parcours, pas un correctif, et il se décide.
-- ---------------------------------------------------------------------------

comment on function public.claim_access() is
  'Rattache le compte connecté à ce qui l''attend sous son adresse : fiche patient, invitation de cabinet, invitation de revendeur. La fiche vaut invitation — voir la note de 0025 avant d''en faire une table à part.';
