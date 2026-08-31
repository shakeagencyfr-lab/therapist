# Serveur d'API — fonctions IA

## Deux enveloppes, une seule logique

`ai.ts` porte tout : les prompts, l'appel au modèle, la validation, les
messages d'erreur français. Deux enveloppes l'appellent, et n'y ajoutent que
le transport :

| Enveloppe | Où | Rôle |
| --- | --- | --- |
| `server/index.ts` | `npm run dev`, port 8787 | Express, CORS, corps JSON de 2 Mo |
| `api/ai/*.ts` | Vercel | une fonction serverless par route |

Les quatre routes sont identiques des deux côtés (`/api/ai/session-draft`,
`/module`, `/affirmations`, `/profile`) : le client ne sait pas laquelle des
deux le sert. Ajouter une route se fait dans `ai.ts` puis dans les deux
enveloppes — le type `AiRoute` fait échouer la compilation si l'une est
oubliée.

`vercel.json` fixe `maxDuration` à 60 secondes : un brouillon de séance peut
demander 3 000 jetons de sortie, bien au-delà des 10 secondes accordées par
défaut à une fonction.


## Variables d'environnement

Le serveur lit quatre variables, toutes optionnelles sauf la clé (voir le mode maquette ci-dessous). `ANTHROPIC_API_KEY` est la clé d'accès à l'API Claude : elle vit sur le serveur, jamais dans le navigateur ni dans le dépôt — le fichier `.env.example` en donne la forme, sans valeur. `CLAUDE_MODEL` choisit le modèle, `claude-opus-5` par défaut ; l'identifiant est complet tel quel, il ne prend pas de suffixe de date. `PORT` fixe le port d'écoute en développement, 8787 par défaut, celui vers lequel Vite renvoie `/api` (sur Vercel, le port n'a pas de sens : chaque fonction est servie par la plateforme). `AI_MOCK` bascule le serveur en mode maquette. `NODE_ENV=production` désactive CORS : en production le client est servi par la même origine que l'API, et l'ouvrir à d'autres origines n'aurait pas de raison d'être.

## Mode maquette

Si `AI_MOCK` vaut `1`, ou si aucune clé n'est configurée, les quatre routes répondent depuis `mock.ts` avec des sorties de démonstration bien formées : le brouillon de séance, le module sur mesure, les affirmations et le profil actualisé. Aucun appel réseau n'est fait et aucune donnée de séance ne quitte la machine, ce qui permet de développer et de montrer toute l'interface sans clé. Les réponses portent un drapeau `mock` sur l'enveloppe (`{ "mock": true, "data": … }`) et non dans les données elles-mêmes : l'interface affiche les mêmes objets dans les deux modes, et peut signaler la maquette si elle le souhaite. Ces textes sont de la démonstration ; ils n'ont aucune valeur clinique.

## Avant la production

Ce serveur n'est pas prêt à recevoir de vraies séances. Il manque, dans l'ordre : l'**authentification de la thérapeute** — aujourd'hui les routes sont ouvertes à qui atteint le port, il faut une session, un contrôle d'accès par cabinet et une protection contre le rejeu ; le **chiffrement au repos** des transcriptions, notes, journaux et profils, avec des clés gérées hors de la base ; la **journalisation des accès** — qui a lu quel dossier, quand, depuis où — conservée séparément des données elles-mêmes ; un **hébergeur certifié HDS**, obligatoire en France pour des données de santé, avec le contrat de sous-traitance correspondant pour le service d'analyse ; et la règle qui tient tout le reste : **aucune donnée patient dans les journaux**, ni ici, ni chez l'hébergeur, ni dans les traces d'erreur — le serveur ne trace que la route appelée et le motif technique de l'échec.
