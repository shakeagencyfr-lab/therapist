# Les courriels de connexion

Ces quatre modèles se collent dans **Supabase → Authentication → Emails →
Templates**. Ils ne vivent pas dans la base : ce dossier en garde la version
de référence, et `server/courriels.test.ts` vérifie qu'ils portent ce que
l'application attend.

| Modèle Supabase   | Fichier                 | Sujet                                  |
| ----------------- | ----------------------- | -------------------------------------- |
| Magic Link        | `connexion.html`        | Votre lien de connexion                |
| Invite user       | `invitation.html`       | Votre espace vous attend               |
| Confirm signup    | `confirmation.html`     | Confirmez votre adresse                |
| Reset Password    | `reinitialisation.html` | Choisir un nouveau mot de passe        |

Chaque modèle porte les deux voies d'entrée :

- `{{ .ConfirmationURL }}` — le lien, pour qui lit le courriel sur l'appareil
  où il veut entrer ;
- `{{ .Token }}` — le code à 6 chiffres (`src/lib/codeConnexion.ts`,
  `LONGUEUR_CODE`), pour l'application installée sur un téléphone : un lien
  touché dans la messagerie s'ouvrirait dans le navigateur, pas dans
  l'application.

Les textes ne nomment pas la plateforme : un patient d'un cabinet en marque
blanche lit « votre espace », pas le nom d'un logiciel qu'il ne connaît pas.
Aucune image, aucune ressource extérieure — rien ne se charge à l'ouverture,
donc rien ne signale à un tiers qu'un courriel a été lu.

## L'envoi

Les courriels partent par le serveur d'envoi réglé dans **Authentication →
Emails → SMTP Settings**. Sans lui, Supabase n'envoie qu'aux membres de
l'équipe du projet, et quelques courriels par heure au plus. Le mot de passe
SMTP se colle là, et nulle part ailleurs : jamais dans ce dépôt.
