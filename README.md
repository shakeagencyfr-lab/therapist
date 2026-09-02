# Klaro — le suivi entre les séances

Application de suivi entre les séances d'hypnothérapie. Elle relie deux espaces :

- **Espace thérapeute** — fiches patients, profil psychologique évolutif, parcours
  hebdomadaire de modules, courbe d'auto-évaluation, audios personnalisés,
  affirmations, journal partagé.
- **Espace patient** — une à trois tâches par jour, audios hors connexion, journal,
  échelle du soir, affirmation du jour.

Six écrans outils complètent l'espace thérapeute : captation de séance,
atelier de modules IA, bibliothèque audio du cabinet, notifications ciblées,
boutique (Stripe, sur le compte de la thérapeute) et intégrations (clé
d'analyse, Stripe, agenda de réservation).

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
cp .env.example .env      # renseigner ANTHROPIC_API_KEY, ou poser AI_MOCK=1
npm run dev               # interface sur :5173, API sur :8787
```

Le **mode maquette** se demande explicitement, par `AI_MOCK=1` : les quatre
fonctions IA renvoient alors des sorties de démonstration bien formées, ce qui
permet de travailler l'interface sans appeler le modèle. Le brouillon de séance
est signalé comme fictif à l'écran et ne peut pas être versé au dossier.

Sans clé et sans `AI_MOCK`, les fonctions IA répondent **503 avec un message
explicite**. Elles n'inventent jamais de contenu : un serveur mal configuré
rendait autrefois le même brouillon fictif pour n'importe quelle patiente,
présenté comme l'analyse de sa séance.

```bash
npm run build      # typecheck + build de production
npm run typecheck  # client et serveur
npm run check      # typecheck, puis rendu des neuf vues et contrôle de cloisonnement
```

## Organisation

```
design-reference/     le prototype HTML et sa spécification (référence de design)
scripts/              banc de rendu : les dix vues du cabinet rendent, l'espace
                      revendeur ne montre aucun contenu de patient, et la prise
                      de rendez-vous monte bien son cadre
index.html            hôte Vite, polices Google (à auto-héberger en production)
api/                  fonctions serverless Vercel : les routes IA, les
                      intégrations, la boutique, la revente et les crédits
server/               les quatre appels IA : prompts, schémas, mode maquette
                      (ai.ts est commun aux deux enveloppes ; index.ts sert
                      le développement local)
src/
  App.tsx             une seule vue à la fois, choisie par l'en-tête
  components/layout/  en-tête et commutateur de vues
  components/ui/      primitives : carte, pilule, bouton, case, barre, encart…
  data/               données de démonstration (remplacées par l'API)
  lib/                formatage partagé, adresse publique des cabinets
  services/           client des fonctions IA, reconnaissance vocale
  state/              contrat d'état, store, sélecteurs et règles métier
  styles/             jetons de design et styles globaux
  theme/              marque blanche : accent et sombre paramétrables
  types/              modèle de domaine
  views/              les dix écrans du cabinet, plus l'espace revendeur
```

## Ce qui est porté depuis le prototype

Le prototype est une **référence de design** : un fichier unique piloté par un
état en mémoire. Ce dépôt le recrée avec les conventions d'un produit web.
Les différences volontaires :

- **Les appels IA partent du serveur.** Le prototype appelait `window.claude.complete`
  depuis la page. Ici, quatre routes `POST /api/ai/*` portent les prompts ; le client
  n'a ni clé ni prompt. La logique vit dans `server/ai.ts` et deux enveloppes
  l'exposent : Express en développement, fonctions serverless sur Vercel.
- **Sorties structurées** plutôt qu'extraction de JSON à la regex : le schéma de
  chaque réponse est déclaré côté serveur, donc validé avant d'atteindre l'interface.
- **`support.js` n'est pas porté** : c'est le runtime du prototype, il n'a pas
  d'équivalent en production.
- Les données patients sont typées et isolées dans `src/data/` pour rendre visible
  la frontière à remplacer par l'API.

## Entrer dans l'application

Il n'y a pas de mot de passe. On entre son adresse, on reçoit un lien, on est
connecté. Sur une application qu'un patient ouvre deux minutes par jour, un mot
de passe est le premier motif d'abandon.

**Se connecter ne donne accès à rien en soi.** Le compte est créé au premier
lien, puis `claim_access()` le rattache à ce qui l'attendait : une fiche patient
créée par la thérapeute, une invitation de cabinet, une invitation de revendeur.
Une adresse que personne n'a invitée obtient un compte valide et aucune donnée.
C'est le quatrième cas de `supabase/tests/connexion.sql`, et le plus important.

Deux surfaces, deux adresses :

| Surface | Adresse | Pour |
| --- | --- | --- |
| Espace cabinet | `/` | la thérapeute, et le revendeur |
| Vitrine d'un cabinet | `/c/<identifiant>` | la même porte, aux couleurs du cabinet |
| Widget d'intégration | `/e/<identifiant>` | posé sur le site de la thérapeute |
| Espace patient | `/mon` | le patient, sur son téléphone |

Ce ne sont pas deux vues d'une même page : ce sont deux points d'entrée Vite
distincts. Le téléchargement du patient ne contient pas une ligne du code de
l'espace cabinet — vérifié sur le build, pas supposé.

`/c/<identifiant>` est l'adresse qu'une thérapeute donne : la page s'ouvre à son
nom et à ses couleurs **avant** la connexion. Personne n'étant connecté à ce
moment-là, aucune politique RLS ne rendrait la ligne : une fonction dédiée,
`cabinet_vitrine()`, rend le nom, le sur-titre et les couleurs, et rien d'autre
(`supabase/tests/vitrine.sql`). Un chemin plutôt qu'un sous-domaine : pas de DNS
à poser ni de certificat à émettre par cabinet, et l'adresse marche le jour où
le revendeur ouvre le cabinet.

`/e/<identifiant>` est la même porte, réduite à un champ d'adresse, faite pour
être encadrée par le site de la thérapeute. C'est un point d'entrée Vite à part :
ni espace cabinet, ni espace patient, aucune donnée. **Toutes les autres pages
refusent d'être encadrées** (`frame-ancestors 'self'`, posé dans `vercel.json`) —
encadrer une application connectée, c'est offrir ses clics à qui l'encadre.

## Trois niveaux

Le produit est vendu à des cabinets par un revendeur. Trois rôles, et une règle
qui ne se négocie pas : **le revendeur ne lit aucune donnée de santé.**

| Niveau | Voit | Ne voit pas |
| --- | --- | --- |
| **Revendeur** | ses cabinets, ses interlocutrices, les abonnements, des compteurs agrégés | ni patient, ni note, ni transcription, ni journal |
| **Cabinet** | tous ses patients et leurs données | les autres cabinets |
| **Patient** | ses modules, ses audios, son journal, son échelle | le dossier clinique de la thérapeute |

Le cloisonnement est appliqué en base : aucune politique RLS d'une table de
santé ne mentionne l'appartenance à un revendeur, il n'a donc aucun chemin de
lecture (`supabase/README.md`). L'espace revendeur (`src/views/reseller/`)
ajoute le portefeuille de cabinets, l'éditeur de marque blanche avec aperçu, et
les offres avec leur plafond de consommation IA. Les moyennes y disparaissent
sous trois patients actifs : dans un cabinet d'un patient, une moyenne est un
chiffre individuel.

Les programmes sont nommés par le cabinet, dans son onglet **Programmes**
(`src/views/programmes/`) : le catalogue à gauche, et à droite les patientes qui
suivent celui qu'on a ouvert. Le rattachement se lit dans les deux sens — depuis
la fiche d'une patiente on choisit son programme, depuis un programme on coche
celles qui le suivent. C'est la même colonne, `patients.program`, et le libellé y
est écrit en clair : renommer un programme renomme donc les fiches avec lui.

## Deux façons de vendre l'IA

Le revendeur choisit **cabinet par cabinet** comment l'analyse est payée. Rien
ne l'oblige à traiter toutes ses praticiennes pareil, et c'est justement ce
qu'on veut pouvoir vendre.

| Mode | Qui paie l'appel | Ce que la thérapeute voit |
| --- | --- | --- |
| **Clé du cabinet** (défaut) | elle, sur son compte Anthropic | son onglet **Intégrations**, où elle pose sa clé, et le coût en euros de chaque analyse avant de la lancer |
| **Crédits** | le revendeur, sur sa clé | son solde de crédits, les paquets de son revendeur, et « cette analyse consommera 1 crédit » |

**Un crédit vaut une action** — un brouillon de séance, un module, un jeu
d'affirmations, un profil — quelle que soit la longueur de la séance. Une
thérapeute comprend « il me reste douze analyses » ; elle ne compte pas des
jetons.

Le revendeur règle tout cela dans son onglet **Revente IA**
(`src/views/reseller/ReventeView.tsx`) : sa clé Anthropic, son compte Stripe,
ses paquets, et le découvert qu'il accorde. Il y voit surtout **ce qu'une
action lui coûte réellement**, relevé sur ses 500 derniers appels et non
estimé : sans ce chiffre, fixer un prix de revente est un pari. La marge de
chaque paquet s'affiche à côté de son prix, et devient rouge si le paquet est
vendu à perte.

Trois règles tiennent le reste :

- **On n'écrit qu'après coup.** Le solde est éprouvé avant l'appel, la ligne
  n'est inscrite qu'une fois la note produite : une analyse qui échoue ne se
  facture pas. Le revendeur perd l'appel raté, jamais la thérapeute.
- **Le découvert existe pour une raison précise.** Une séance ne s'interrompt
  pas parce qu'un compteur tombe à zéro devant une patiente. Le revendeur
  choisit jusqu'où il avance ; au-delà, l'analyse est refusée (402) avec un
  message qui dit quoi faire.
- **Le solde ne s'écrit pas, il se somme** depuis un grand livre en ajout seul
  auquel le navigateur n'a aucun droit d'écriture
  (`supabase/tests/credits.sql`).

Le paiement passe par le compte Stripe **du revendeur**, jamais par un compte
de la plateforme. S'il n'en branche pas, rien n'est bloqué : il crédite ses
cabinets à la main depuis son portefeuille, et règle la facture autrement.

La marque se règle des deux côtés, et c'est voulu : le revendeur la pose à
l'ouverture d'un cabinet, la praticienne la reprend ensuite depuis son onglet
**Marque** (`src/views/marque/`). Chacun écrit la même ligne, sous sa propre
politique RLS. Le sous-domaine, lui, ne se change que côté revendeur : c'est
l'adresse publique du cabinet, pas une préférence d'affichage.

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

## Variables d'environnement, côté serveur

| Variable | Rôle |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | destinées au navigateur ; à cocher aussi pour **Preview** sur Vercel si l'on veut tester une branche |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur seul : envoi des invitations, consommation IA, secrets d'intégration, commandes |
| `PUBLIC_SITE_URL` | adresse publique, fixée par le serveur (liens des courriels, retours de paiement) |
| `INTEGRATIONS_KEY` | chiffrement des clés confiées par les cabinets ; `openssl rand -base64 32`, à ne jamais changer ensuite |
| `ANTHROPIC_API_KEY` | clé d'analyse de la plateforme, en repli quand un cabinet n'a pas posé la sienne |

`INTEGRATIONS_KEY` chiffre aussi les clés du revendeur (`reseller_secrets`) :
son Anthropic et son Stripe de revente. Comme celles des cabinets, elles sont
vérifiées par un appel réel avant d'être enregistrées, et ne reviennent jamais
au navigateur — seulement leurs quatre derniers caractères.

Aucune de ces variables, hormis les deux `VITE_`, ne doit approcher un préfixe
`VITE_` : elles seraient compilées dans le paquet envoyé au navigateur.

## Avant la mise en production

Ce dépôt est une recréation fidèle des écrans, pas un produit déployable. Il reste :

- **Données de santé** — hébergeur certifié HDS, chiffrement en transit et au repos,
  journalisation des accès, durées de conservation, registre de traitement.
- **Consentement** — le consentement de captation doit être horodaté et conservé,
  et la suppression d'une transcription doit être effective côté serveur.
- **Transcription** — l'API Web Speech du navigateur, utilisée aujourd'hui, a deux
  limites qui interdisent un usage clinique réel. Elle **envoie l'audio à un tiers**
  (Google, sur Chrome), ce qui contredit la promesse HDS ci-dessus ; et elle **ne
  distingue pas les locuteurs**, si bien que « les mots du patient » et l'induction
  bâtie sur ses images reposent sur une attribution que la chaîne ne fournit pas —
  le serveur le détecte et l'annonce au modèle plutôt que de le laisser deviner. La
  chaîne visée : captation locale, transcription **avec diarisation** chez un
  hébergeur de données de santé européen, destruction de l'audio, puis rédaction.
- **Polices** — Newsreader et Public Sans à auto-héberger (pas de requête vers
  Google Fonts depuis un poste de santé).
- **Marque** — le logo « LO » est un placeholder ; l'accent `#A17A45` et le sombre
  `#33291C` sont estimés et paramétrables par cabinet (`src/theme/theme.ts`).
- **Contenu** — le texte de démonstration est réaliste mais à valider avec la
  thérapeute ; les libellés d'interface, eux, sont définitifs.
- **Notifications** — les envois sont enregistrés avec leurs destinataires ;
  la remise sur téléphone attend un service de push (Web Push ou natif).
- **Courriels** — l'envoi intégré de Supabase est limité et ne convient qu'aux
  essais ; un SMTP dédié est nécessaire avant les premières patientes.
