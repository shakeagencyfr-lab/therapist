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

## Exécuter

```bash
# via le CLI Supabase, en local ou contre le projet distant
supabase db push
psql "$DATABASE_URL" -f supabase/tests/isolation.sql
```
