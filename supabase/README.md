# Base de données

Projet Supabase **entre-seances** (`koytgcbpeorupdklswxd`), région `eu-west-3`
(Paris), distinct de tout autre projet de l'organisation.

## Les trois niveaux

| Niveau | Voit | Ne voit pas |
| --- | --- | --- |
| **Revendeur** | ses cabinets, ses interlocuteurs, les abonnements, des compteurs agrégés | **aucune donnée de santé** : ni patient, ni note, ni transcription, ni journal |
| **Cabinet** (thérapeute) | tous ses patients et leurs données | les autres cabinets |
| **Patient** | ses modules, ses audios, son journal, son échelle | le dossier clinique de la thérapeute, les autres patients |

Le cloisonnement du revendeur ne repose pas sur l'interface : **aucune politique
RLS d'une table de santé ne mentionne l'appartenance à un revendeur.** Il n'a
donc pas de chemin de lecture, quelle que soit la requête. `tests/isolation.sql`
vérifie cet invariant et échoue si une migration future l'entame.

Ce que le revendeur obtient à la place : `reseller_cabinet_overview()`, une
fonction `security definer` qui filtre d'abord sur son appartenance et ne
renvoie que des compteurs. Les moyennes sont supprimées sous trois patients
actifs — dans un cabinet d'un patient, une moyenne est un chiffre individuel.

## Migrations

| Fichier | Contenu |
| --- | --- |
| `0001_socle_multi_cabinet.sql` | revendeurs, cabinets, membres, invitations, marque blanche, fonctions d'appartenance |
| `0002_donnees_de_sante.sql` | patients, modules, audios, échelle, journal, séances, profils, affirmations, notifications |
| `0003_commercial_et_revendeur.sql` | offres, abonnements, consommation IA, journal d'accès, agrégats du revendeur |
| `0004_durcissement_execution.sql` | qui a le droit d'appeler quelle fonction |
| `0005_connexion_et_roles.sql` | `my_context()`, `claim_access()` : le lien magique rattache un compte à ce qui l'attendait |
| `0006_invitations_revendeur.sql` | invitations d'un revendeur |
| `0007_gestes_du_patient.sql` | ce qu'un patient peut modifier, par fonctions nommées |
| `0008_invitation_sans_jeton.sql` | le jeton d'invitation devient facultatif |
| `0009_integrations.sql` | `cabinet_settings` (ce qui se montre) et `cabinet_secrets` (clés chiffrées, réservées au serveur) |
| `0010_boutique.sql` | produits du cabinet, commandes écrites par le serveur seul |
| `0011_stockage_audios.sql` | compartiment privé `audios`, rangé par cabinet, URL signées |
| `0012_lectures_de_la_patiente.sql` | la patiente lit les audios et notifications qui lui sont envoyés |
| `0013_programmes_et_reservation.sql` | chaque cabinet nomme ses programmes ; la réservation perd son nom d'éditeur et sait s'encadrer |
| `0014_vitrine_du_cabinet.sql` | nom, sur-titre et couleurs d'un cabinet, lisibles avant toute connexion |

Les tests de `tests/` se jouent sous les droits réels de chaque acteur, dans
un seul bloc qui se rétracte (`RAISE EXCEPTION 'REUSSITE …'`) : rien ne
persiste, et le message dit ce qui a été vérifié.

## Choix à connaître

- **`cabinet_id` est répété sur chaque table de santé.** Dénormalisation
  volontaire : chaque politique RLS devient une seule recherche d'index, et une
  jointure oubliée ne peut pas élargir l'accès.
- **`ai_usage` ne porte ni `patient_id` ni contenu.** Le revendeur facture des
  appels ; il ne remonte pas à une personne. L'horodatage détaillé lui reste
  invisible : il ne voit que la somme du mois.
- **Le profil psychologique est versionné** (`psych_profiles.version`) et garde
  le nombre de séances au moment de l'établissement : c'est lui qui donne la
  marge d'incertitude affichée à l'écran.
- **Une transcription exige un consentement horodaté** (contrainte
  `therapy_sessions_transcript_needs_consent`). L'effacement demandé par le
  patient vide la transcription sans détruire la note de la thérapeute.
- **Le journal privé du patient est invisible au cabinet** tant qu'il n'est pas
  partagé : la politique de lecture du cabinet exige `shared = true`.
- **`audit_log` est en ajout seul** : `update` et `delete` sont révoqués.

## Hébergement — à régler avant toute donnée réelle

Supabase n'est pas certifié **HDS**. Pour des données de santé en France, cette
certification est une obligation légale. Cette base convient au développement,
à la démonstration et à la vente ; avant qu'une patiente y écrive une vraie
note, il faut une bascule vers un hébergeur certifié (OVHcloud, Scaleway,
Clever Cloud) ou un accord équivalent. Le schéma est du PostgreSQL standard,
sans extension propriétaire, précisément pour que cette bascule reste possible.

## La base est vierge

Aucune donnée de démonstration n'est versée en base. Tout ce qui existe est
créé depuis l'interface : le revendeur ouvre un cabinet et invite sa
praticienne, la praticienne crée ses patients. La seule ligne posée à la main
est l'organisation du revendeur et son invitation — il faut bien une première
porte.

Les données fictives de `src/data/` servent uniquement à l'affichage de
démonstration, quand l'application tourne sans base configurée. Elles ne sont
jamais écrites.

## Exécuter

```bash
# via le CLI Supabase, en local ou contre le projet distant
supabase db push
psql "$DATABASE_URL" -f supabase/tests/isolation.sql
```
