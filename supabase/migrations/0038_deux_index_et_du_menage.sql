-- Deux index qui manquaient, et du bois mort.
--
-- L'INDEX SUR push_recipients.patient_id. L'espace patient lit ses mots à
-- chaque ouverture, en filtrant sur cette colonne — sans index, PostgreSQL
-- parcourt la table de TOUS les destinataires de TOUS les cabinets pour en
-- rendre trois. C'est invisible aujourd'hui, avec trois lignes ; c'est le
-- genre de chose qui se découvre le jour où le produit marche.
--
-- Même raison pour `module_quiz_answers.module_id` : depuis que le quiz est
-- réellement montré au patient, ses réponses se lisent à chaque ouverture
-- d'un exercice. La contrainte UNIQUE (module_id, question_index) fournit
-- déjà un index utilisable de tête sur module_id — on n'en ajoute donc pas.

create index if not exists push_recipients_patient_idx
  on public.push_recipients (patient_id);

-- L'espace patient trie ses mots par date de la notification : l'index sur
-- la clé étrangère évite d'aller chercher chaque parent une ligne à la fois.
create index if not exists push_recipients_push_idx
  on public.push_recipients (push_id);

-- ============================================================================
-- Du bois mort, retiré
-- ============================================================================
--
-- Trois fonctions écrites pour la revente de crédits d'IA, abandonnée depuis
-- (tâche 33) : plus aucun appelant dans src/, server/ ni api/. Une fonction
-- SECURITY DEFINER qui ne sert plus est une surface qu'on n'inspecte plus.
--
-- `cabinet_of_path` FIGURAIT SUR CETTE LISTE ET N'Y A PAS SA PLACE. Un grep
-- sur src/, server/ et api/ ne la trouve nulle part — mais ce n'est pas le
-- code applicatif qui l'appelle : NEUF POLITIQUES de storage.objects en
-- dépendent, celles qui bornent chaque cabinet à son dossier d'audios, de
-- logos et de photos de vitrine. La base a refusé le DROP, et elle avait
-- raison : un CASCADE aurait emporté le cloisonnement du stockage entier.
-- On la garde, et ce commentaire est là pour que personne ne recommence.

drop function if exists public.cabinet_ai_billing();
drop function if exists public.cabinet_ai_spend_this_month(uuid);
drop function if exists public.cabinet_credit_balance(uuid);
