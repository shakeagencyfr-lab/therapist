# Handoff : Suivi entre-séances pour thérapeutes (Cabinet Laetitia Ollivier)

## Overview
Application de suivi entre les séances d'hypnothérapie. Elle relie deux espaces :

- **Espace thérapeute** — fiches patients, profil psychologique évolutif, parcours hebdomadaire de modules, courbe d'auto-évaluation, audios personnalisés, affirmations, journal partagé.
- **Espace patient** — application mobile : une à trois tâches par jour, audios hors connexion, journal, échelle du soir, affirmation du jour.

Quatre écrans outils complètent l'espace thérapeute : captation de séance (transcription + brouillon de note), atelier de modules IA, bibliothèque audio du cabinet, notifications ciblées.

Les fonctions IA passent par un appel LLM (dans le prototype : `window.claude.complete`, à remplacer côté serveur par un appel API authentifié — voir « Fonctions IA »).

## About the Design Files
Les fichiers de ce dossier sont des **références de design écrites en HTML** : un prototype qui montre l'apparence et le comportement voulus, pas du code de production à copier tel quel.

Le travail consiste à **recréer ces écrans dans l'environnement du produit cible** (React, Vue, SwiftUI, natif…) avec ses conventions, ses composants et sa bibliothèque de styles. Si aucun environnement n'existe encore, choisir la pile la plus adaptée (React + TypeScript pour le web thérapeute, React Native ou natif pour l'app patient) et y implémenter les designs.

Le prototype est un fichier unique piloté par un état local en mémoire. Les données patients y sont codées en dur : dans le produit réel, elles viennent d'une API et doivent être chiffrées (données de santé — hébergement HDS obligatoire en France).

## Fidelity
**High-fidelity.** Couleurs, typographie, espacements, rayons et micro-interactions sont définitifs. Les recréer fidèlement avec les composants du codebase cible. Le contenu textuel est du contenu réaliste de démonstration, pas du copywriting définitif : à valider avec la thérapeute, sauf pour les libellés d'interface qui, eux, sont à reprendre tels quels.

---

## Design Tokens

### Couleurs
| Rôle | Hex |
| --- | --- |
| Fond application | `#FAF6EF` |
| Surface / carte | `#FFFDF8` |
| Surface secondaire (encart discret) | `#FBF9F5` |
| Surface champ / zone de saisie | `#F8F5EF` |
| Surface neutre (pilules, pistes) | `#F1ECE3`, `#F2EDE4`, `#EEE9E0` |
| Bordure standard | `#E6E1D8` |
| Bordure légère | `#F2EDE4` |
| Bordure pointillée | `#DDD6C9` |
| Texte principal | `#1B1A17` |
| Texte secondaire | `#3A372F` / `#57544C` / `#6E6A62` |
| Texte tertiaire | `#8A857B` |
| Texte désactivé | `#A6A096` / `#C0B9A9` |
| Accent (marque) | `#A17A45` |
| Accent foncé (hover) | `#856239` / `#6E5230` |
| Accent clair (fond de pilule) | `#F0E7D6` / `#F5EEE1` |
| Bande d'incertitude (profil) | `#EBDCC1` |
| Alerte douce — fond / bordure / texte | `#FBF3E6` / `#F0E2C9` / `#7A5320`, `#8A5A2B` |
| Succès — fond / bordure / texte | `#EEF3EB` / `#DCE6D8` / `#41603C` |
| Signal chaud (journal, brouillon) | `#B5643F` sur `#F7EDE7` |
| Danger (suppression) | `#B0402C` |
| Sombre (barre d'action, app patient) | `#33291C` |
| Texte sur sombre | `#F5EEE1`, `rgba(240,245,242,0.7)` |

Un thème blanc-marque est prévu (écran de marque blanche non encore construit) : l'accent `#A17A45` et le sombre `#33291C` doivent être paramétrables par cabinet.

### Typographie
- **Titres et citations** : `Newsreader` (serif, Google Fonts), graisses 400/500/600, italique 400 disponible.
  - H1 écran : 40px / line-height 1.05 / letter-spacing -0.015em / poids 400
  - H2 carte : 19 à 23px / poids 400
  - Chiffre de statistique : 30px / line-height 1
  - Corps « voix du patient » (journal, affirmations, portrait) : 15,5 à 16px / line-height 1.5–1.6
- **Interface** : `Public Sans` (Google Fonts), graisses 400/500/600.
  - Corps : 13 à 15px / line-height 1.5–1.6
  - Libellé de champ, méta : 11,5 à 12,5px
  - Sur-titre : 11px / letter-spacing 0.1em / majuscules / `#8A857B`
- `-webkit-font-smoothing: antialiased` sur la racine. `text-wrap: pretty` sur les paragraphes.

### Espacements
Échelle utilisée : 2, 3, 4, 6, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 34, 40 px. Gouttières de grille : 14 à 28px. Padding de carte : 17–22px vertical, 20–24px horizontal.

### Rayons
Pilule `999px` · petit contrôle `9px` · carte compacte `11–13px` · carte `14–16px` · panneau app patient `18–20px` · téléphone `38px`.

### Ombres
Aucune ombre portée dans l'interface thérapeute : la hiérarchie passe par les bordures `1px` et les fonds. Seul le cadre du téléphone (vue patient) utilise une ombre douce.

---

## Screens / Views

### 1. Espace thérapeute — fiche client
**Purpose** : voir en un écran où en est un patient et décider quoi lui envoyer.

**Layout** : en-tête collant (64px) ; sous l'en-tête, grille `296px | 1fr`.

- **Barre latérale** (`#FFFDF8`, bordure droite `#E6E1D8`, padding 22/18) : champ de recherche, compteur « Patients actifs », liste de patients (avatar initiales 32px, nom 13,5px/500, sous-titre 11,5px `#8A857B`, pastille d'état à droite), encart pointillé « 2 patients décrochent ».
- **Colonne principale** (padding 30/34/60, max-width 1240px) :
  1. **En-tête patient** : H1 nom, pilule programme (`#F0E7D6`/`#A17A45`), semaine, prochaine séance ; à droite deux boutons — « Note de séance » (secondaire) et « Ajouter un module » (primaire `#A17A45`).
  2. **Cartes de statistiques** : grille `repeat(auto-fit, minmax(190px, 1fr))`, gap 14. Chacune : sur-titre, valeur Newsreader 30px + unité, barre de progression 4px (`#EEE9E0` / remplissage `#A17A45`). Assiduité, écoutes audio, séances, modules du jour.
  3. **Profil psychologique** (voir section dédiée ci-dessous).
  4. **Grille `1.15fr | 1fr`, gap 18** :
     - Gauche : « Parcours de la semaine » — liste de modules, case à cocher ronde 22px cliquable, titre barré quand fait, pilule de type (Audio, Exercice, Journal, Échelle, Écriture, Séance, Formulaire).
     - Droite : courbe d'auto-évaluation (SVG 300×90, polyline `#A17A45` 2px, points r=2,6), « Audios personnalisés », « Affirmations de la semaine », « Journal partagé ».

### 2. Profil psychologique (ajout le plus récent)
**Purpose** : donner à la thérapeute une lecture synthétique du patient qui se précise séance après séance, et des conseils d'accompagnement concrets.

**Layout** : carte pleine largeur (`#FFFDF8`, bordure `#E6E1D8`, rayon 14, padding 20/22/18, marge basse 18).

- **En-tête** : à gauche H2 « Profil psychologique » + sous-titre « Établi à partir de vos notes, affiné après chaque séance ». À droite : pilule de maturité, date de mise à jour, bouton « Actualiser le profil ».
- **Corps** : grille `1.05fr | 1fr`, gap 28.
  - **Colonne gauche** : portrait en Newsreader 16px/1.6 ; puis cinq axes. Chaque axe = libellé 13px/500 à gauche, note courte 11,5px `#8A857B` à droite, puis piste 6px `#F2EDE4` contenant une **bande d'incertitude** `#EBDCC1` (de `valeur − marge` à `valeur + marge`, bornée 0–100) et un **repère** 2px `#A17A45` débordant de 3px en haut et en bas, positionné à `valeur%`. Sous les axes, la légende de marge ; sous elle, l'encart vert du résumé d'actualisation quand il existe.
  - **Colonne droite** : sur-titre « Comment l'accompagner », 3 à 4 conseils (pastille numérotée 20px `#F0E7D6`, titre 13,5px/500, corps 12,5px/1.5) ; puis encart « Points d'attention » (`#FBF3E6`, bordure `#F0E2C9`, texte `#7A5320`, tirets `#C79B54`).

**Règle de précision** — c'est le cœur du composant :
```
marge      = max(3, round(26 − sessions × 3))        // en points, ± autour de la valeur
maturité   = sessions ≤ 1 ? "Ébauche"
           : sessions ≤ 3 ? "Se précise"
           : sessions < totalSessions ? "Consolidé"
           : "Stabilisé"
étiquette  = maturité + " · " + sessions + " séance(s)"
```
Après une actualisation IA, `sessions` est incrémenté de 1 pour l'affichage : la bande se resserre visiblement et le badge peut passer au palier suivant.

### 3. Captation de séance
Trois étapes successives dans un conteneur 940px centré.
1. **Consentement** : liste de points, case à cocher, bouton de démarrage. Bloquant.
2. **Captation** : minuteur, transcription en direct (Web Speech API dans le prototype), zone « Vos notes de séance » avec boutons d'horodatage, échantillons de démonstration, estimation de coût d'analyse, bouton « Générer le brouillon ».
3. **Brouillon** : synthèse validable, points de vigilance (`#FBF3E6`), questions à reprendre, propositions de modules à cocher, audios suggérés depuis la bibliothèque, brouillon d'induction éditable, message au patient éditable, **carte « Actualiser le profil de <Prénom> »**, puis barre d'envoi sombre (`#33291C`).

### 4. Atelier de modules
Grille `1fr | 1.1fr`. À gauche : brief libre, type de module, options quiz, bouton de génération, bibliothèque des modules du cabinet. À droite : le module généré (consigne en trois temps, « pourquoi » destiné au patient, quiz), sélection multi-patients et assignation.

### 5. Bibliothèque audio
Import de fichiers, filtres par catégorie (pilules), création de catégorie à la volée, liste d'audios avec indicateur de forme d'onde, panneau de détail à droite : catégorie, patients destinataires, envoi.

### 6. Notifications
Filtres (programme, assiduité, situation) → liste des destinataires calculée en direct, éditeur titre + message, modèles rapides, choix d'envoi (maintenant / ce soir / demain), aperçu écran verrouillé, journal des envois.

### 7. Espace patient
Maquette téléphone 390×844, rayon 38, cadre sombre. Accueil : salutation, affirmation du jour (défilement automatique toutes les 5 s, arrêt au tap), une à trois tâches, échelle du soir 0–10, bandeau de notification si envoi récent. Vues secondaires : détail de tâche (audio, « pourquoi », quiz), journal (pages, bascule partagé/privé).

---

## Interactions & Behavior
- **Navigation** : commutateur de vues en pilules dans l'en-tête (Vue thérapeute, Vue patient, Séance, Atelier, Audios, Notifications). Une seule vue affichée.
- **Sélection patient** : la barre latérale change toutes les données de la colonne principale, sans rechargement.
- **Modules** : la case à cocher bascule l'état localement ; les modules non réalisés basculent à la semaine suivante (règle métier annoncée en pied de liste).
- **Affirmations** : mode automatique (génération le lundi) ou manuel (édition ligne par ligne puis publication). Côté patient, rotation automatique toutes les 5 s, arrêtée définitivement au premier tap.
- **Profil psychologique** : « Actualiser le profil » est disponible depuis la fiche client et depuis le brouillon de fin de séance. Pendant l'appel, le bouton passe à « Analyse des notes… », désactivé, fond `#F7F2E8`, texte `#A6A096`. Au retour : le profil est remplacé, la bande d'incertitude se resserre, l'encart vert affiche la phrase de résumé. En cas d'échec : « L'actualisation a échoué. Réessayez. »
- **États de survol** : boutons secondaires passent le fond à `#F5EEE1` ou `#FBF9F5` ; le primaire passe de `#A17A45` à `#856239` ; les liens de suppression passent à `#B0402C`.
- **États vides** : encadrés pointillés `#DDD6C9` avec une phrase explicative (jamais un simple « aucune donnée »).
- **Transitions** : aucune animation d'entrée. Seule exception : l'illustration du journal (deux `@keyframes`, `omJournalCover` et `omJournalLines`) et la rotation des affirmations.
- **Responsive** : l'espace thérapeute est conçu pour ≥ 1280px. En dessous de 1100px, replier la grille `1.15fr | 1fr` en une colonne et la grille du profil également. La barre latérale devient un tiroir sous 900px.

## Fonctions IA
Quatre appels distincts, chacun avec son prompt système :
1. **Brouillon de séance** — transcription + notes → synthèse, points de vigilance, questions, propositions de modules, induction, message patient.
2. **Module sur mesure** — brief → consigne en trois temps, « pourquoi », quiz.
3. **Affirmations** — profil + journal → 4 affirmations. Règles strictes appliquées dans le prompt système : présent de l'indicatif, aucune négation, aucun mot de doute, jamais le nom du problème, 8 à 16 mots, une idée par phrase.
4. **Profil psychologique** — notes, synthèse, transcription, journal, modules et profil actuel → `{ portrait, axes[5], levers[3-4], care[1-3], resume }`. Le prompt demande de conserver les axes existants tant qu'ils restent pertinents.

Tous renvoient du JSON, extrait par `out.match(/\{[\s\S]*\}/)` puis `JSON.parse`, avec repli sur un message d'erreur en cas d'échec. **En production, ces appels doivent partir du serveur** : la clé API ne doit jamais atteindre le client, et le contenu transite par des données de santé (chiffrement en transit et au repos, journalisation des accès, hébergeur certifié HDS).

## State Management
État du prototype, à répartir entre serveur et client dans le produit réel :

| Clé | Rôle |
| --- | --- |
| `mode` | vue active |
| `sel`, `q` | patient sélectionné, recherche |
| `consent`, `recording`, `elapsed`, `transcript`, `interim` | captation |
| `sessionNotes` | notes écrites pendant la séance |
| `draft`, `syntheseOk`, `proposalOff`, `sent` | brouillon de note |
| `extra`, `done` | modules ajoutés / cochés, par patient |
| `customs`, `aMod`, `aAssign` | atelier de modules |
| `lib`, `cats`, `libFilter`, `libSel`, `extraAudios` | bibliothèque audio |
| `nProgs`, `nAdh`, `nSits`, `nTitle`, `nMsg`, `nWhen`, `pushes` | notifications |
| `pages`, `noteLog`, `scaleLog` | journal patient, échelle |
| `affAuto`, `affs`, `affPending`, `affIdx`, `affGen`, `affPaused` | affirmations |
| `profNew`, `profGen`, `profNote` | profil actualisé par l'IA, appel en cours, résumé du changement |

Données par patient dans le prototype (`DATA`) : `name, initials, program, subtitle, weekLabel, nextSession, adherence, listens, sessions, totalSessions, scaleLabel, scaleQuestion, scaleDelta, scale[], modules[], audios[], journal[], profile{updated, portrait, axes[{label,value,note}], levers[{title,body}], care[]}`.

## Assets
Aucune image, aucune icône bitmap. Tous les symboles sont des caractères texte ou de petites formes CSS ; les graphiques (courbe, formes d'onde, illustration du journal) sont des SVG inline. Polices : Newsreader et Public Sans via Google Fonts — à auto-héberger en production.

Le logo « LO » est un carré `#A17A45` rayon 10 avec les initiales en Newsreader : **placeholder**, à remplacer par le vrai logo du cabinet. Les couleurs de marque sont estimées et doivent être confirmées avec la thérapeute.

## Captures
Le dossier `screenshots/` contient un rendu de chaque écran, dans l'ordre :

1. `01-fiche-client.png` — espace thérapeute, fiche complète
2. `02-profil-psychologique.png` — section profil, axes et conseils
3. `03-seance-captation.png` — écran de séance, étape consentement
4. `04-atelier-modules.png` — atelier de modules IA
5. `05-bibliotheque-audio.png` — bibliothèque audio du cabinet
6. `06-notifications.png` — ciblage et envoi de notifications
7. `07-espace-patient.png` — application patient

Les six premières sont capturées à une largeur utile de 1460px, réduites pour tenir dans l'image : se fier aux valeurs du README, pas aux pixels mesurés sur ces captures.

## Files
- `Entre-seances.dc.html` — le prototype complet (tous les écrans, tous les états, toutes les données de démonstration).
- `support.js` — runtime du prototype. Il n'a aucun équivalent en production : ne pas le porter.

Pour lire le prototype : le template (markup + styles inline) occupe le début du fichier, la logique se trouve dans le `<script data-dc-script>` en fin de fichier, avec les données patients dans `DATA` et le rendu dans `renderVals()`.
