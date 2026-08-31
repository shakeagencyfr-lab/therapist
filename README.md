# Entre-séances — Cabinet Laetitia Ollivier

Application de suivi entre les séances d'hypnothérapie. Elle relie deux espaces :

- **Espace thérapeute** — fiches patients, profil psychologique évolutif, parcours
  hebdomadaire de modules, courbe d'auto-évaluation, audios personnalisés,
  affirmations, journal partagé.
- **Espace patient** — une à trois tâches par jour, audios hors connexion, journal,
  échelle du soir, affirmation du jour.

Quatre écrans outils complètent l'espace thérapeute : captation de séance,
atelier de modules IA, bibliothèque audio du cabinet, notifications ciblées.

## Pile

| Choix | Pourquoi |
| --- | --- |
| React 18 + TypeScript strict | Interface dense, état partagé entre sept vues, typage du modèle de santé |
| Vite | Démarrage et build rapides, alias `@/` vers `src/` |
| CSS Modules + variables CSS | Fidélité au design sans bibliothèque de style ; marque blanche par variables |
| Express + `@anthropic-ai/sdk` | Les quatre appels LLM partent du **serveur** : la clé n'atteint jamais le navigateur |

Aucune dépendance d'interface tierce : les primitives (`src/components/ui`) sont
écrites à partir des jetons du design.

## Démarrer

```bash
npm install
cp .env.example .env      # renseigner ANTHROPIC_API_KEY, ou laisser AI_MOCK=1
npm run dev               # interface sur :5173, API sur :8787
```

Sans clé API, le serveur répond en **mode maquette** (`AI_MOCK=1`) : les quatre
fonctions IA renvoient des sorties de démonstration bien formées, ce qui permet
de travailler l'interface sans appeler le modèle.

```bash
npm run build      # typecheck + build de production
npm run typecheck  # client et serveur
```

## Organisation

```
design-reference/     le prototype HTML et sa spécification (référence de design)
index.html            hôte Vite, polices Google (à auto-héberger en production)
server/               proxy des quatre appels IA : prompts, schémas, mode maquette
src/
  App.tsx             une seule vue à la fois, choisie par l'en-tête
  components/layout/  en-tête et commutateur de vues
  components/ui/      primitives : carte, pilule, bouton, case, barre, encart…
  data/               données de démonstration (remplacées par l'API)
  lib/                formatage partagé
  services/           client des fonctions IA, reconnaissance vocale
  state/              contrat d'état, store, sélecteurs et règles métier
  styles/             jetons de design et styles globaux
  theme/              marque blanche : accent et sombre paramétrables
  types/              modèle de domaine
  views/              les sept écrans
```

## Ce qui est porté depuis le prototype

Le prototype est une **référence de design** : un fichier unique piloté par un
état en mémoire. Ce dépôt le recrée avec les conventions d'un produit web.
Les différences volontaires :

- **Les appels IA partent du serveur.** Le prototype appelait `window.claude.complete`
  depuis la page. Ici, quatre routes `POST /api/ai/*` portent les prompts ; le client
  n'a ni clé ni prompt.
- **Sorties structurées** plutôt qu'extraction de JSON à la regex : le schéma de
  chaque réponse est déclaré côté serveur, donc validé avant d'atteindre l'interface.
- **`support.js` n'est pas porté** : c'est le runtime du prototype, il n'a pas
  d'équivalent en production.
- Les données patients sont typées et isolées dans `src/data/` pour rendre visible
  la frontière à remplacer par l'API.

## Règles métier reprises telles quelles

- **Précision du profil psychologique** — `marge = max(3, round(26 − séances × 3))`,
  maturité en quatre paliers (Ébauche, Se précise, Consolidé, Stabilisé). Après une
  actualisation IA, une séance de plus est comptée : la bande d'incertitude se
  resserre à l'écran. Implémenté une seule fois, dans `src/state/selectors.ts`.
- **Ciblage des notifications** — le groupe est calculé à partir de ce que
  l'application sait déjà (programme, assiduité, modules en retard, rendez-vous
  manquant, écoutes, courbe plate), jamais saisi à la main.
- **Modules non réalisés** — ils basculent à la semaine suivante.
- **Affirmations** — génération le lundi ou édition manuelle ; côté patient,
  rotation toutes les cinq secondes, arrêtée définitivement au premier tap.

## Avant la mise en production

Ce dépôt est une recréation fidèle des écrans, pas un produit déployable. Il reste :

- **Données de santé** — hébergeur certifié HDS, chiffrement en transit et au repos,
  journalisation des accès, durées de conservation, registre de traitement.
- **Authentification** de la thérapeute et du patient, séparation stricte des espaces.
- **Consentement** — le consentement de captation doit être horodaté et conservé,
  et la suppression d'une transcription doit être effective côté serveur.
- **Polices** — Newsreader et Public Sans à auto-héberger (pas de requête vers
  Google Fonts depuis un poste de santé).
- **Marque** — le logo « LO » est un placeholder ; l'accent `#A17A45` et le sombre
  `#33291C` sont estimés et paramétrables par cabinet (`src/theme/theme.ts`).
- **Contenu** — le texte de démonstration est réaliste mais à valider avec la
  thérapeute ; les libellés d'interface, eux, sont définitifs.
