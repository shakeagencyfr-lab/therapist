# Serveur d'API

## Deux enveloppes, une seule logique

Les modules de `server/` portent tout : les prompts, l'appel au modèle, la
validation, les droits, les messages d'erreur français. Deux enveloppes les
appellent, et n'y ajoutent que le transport :

| Enveloppe | Où | Rôle |
| --- | --- | --- |
| `server/index.ts` | `npm run dev`, port 8787 | Express, CORS, corps JSON de 2 Mo |
| `api/**/*.ts` | Vercel | une fonction serverless par fichier |

Les routes sont identiques des deux côtés — le client ne sait pas laquelle
des deux le sert :

| Route | Module | Ce qu'elle fait |
| --- | --- | --- |
| `/api/ai/{session-draft,module,affirmations,profile,hypnose}` | `ai.ts` | les cinq analyses |
| `/api/integrations` | `integrations.ts` | clés Anthropic et Stripe, agenda, boutique |
| `/api/cabinet?volet=…` | `cabinet.ts` | offre, domaine, envoi de courriels, site vitrine |
| `/api/shop` | `shop.ts` | paiement d'un produit, et sa vérification |
| `/api/invitations` | `invitations.ts` | le courriel qui porte le lien de connexion |

Ajouter une route IA se fait dans `ai.ts` puis dans les deux enveloppes — le
type `AiRoute` fait échouer la compilation si l'une est oubliée. Les réglages
du cabinet passent tous par `/api/cabinet` plutôt que par une fonction
chacun : l'hébergement plafonne le nombre de fonctions par déploiement, et
quatre volets lus une fois par écran n'ont pas besoin de quatre déploiements.

`vercel.json` fixe `maxDuration` à 60 secondes : un brouillon de séance peut
demander 4 000 jetons de sortie, bien au-delà des 10 secondes accordées par
défaut à une fonction.

## Qui appelle, et ce qu'il a le droit de faire

`auth.ts` identifie l'appelant : le client transmet son jeton Supabase, le
serveur le fait vérifier par la base (`my_context()` sous ce jeton) et ne
croit que ce qui en revient. Deux clients, jamais confondus — celui qui agit
au nom de l'appelant, sous la RLS, et celui qui porte la clé de service,
réservé aux écritures que la base refuse au navigateur.

`droits.ts` lit ensuite ce que l'offre du cabinet ouvre — plafond de fiches,
boutique, marque blanche, site vitrine — en appelant `cabinet_droits()`. La
règle est calculée en base et nulle part ailleurs : deux endroits qui
décideraient du même droit finiraient par ne plus être d'accord.


## Variables d'environnement

`.env.example` en donne la liste complète, sans valeur. Aucune n'est préfixée
`VITE_` : ce préfixe met une variable dans le paquet servi au navigateur, ce
qui est exactement ce qu'un secret ne doit pas devenir.

Les indispensables tiennent en quatre : `SUPABASE_URL` (ou `VITE_SUPABASE_URL`)
et `SUPABASE_PUBLISHABLE_KEY` pour identifier les appelants,
`SUPABASE_SERVICE_ROLE_KEY` pour les écritures réservées au serveur, et
`INTEGRATIONS_KEY` pour chiffrer les secrets confiés par les cabinets.
`PUBLIC_SITE_URL` fixe la destination des liens de connexion — elle est fixée
ici et jamais reçue du client, sinon un courriel de confiance ouvrirait une
redirection vers n'importe où.

Le reste est optionnel et se dégrade proprement : sans `VERCEL_TOKEN`, un
domaine de cabinet se pose à la main et se vérifie par résolution DNS ; sans
`GOOGLE_PLACES_KEY`, un site vitrine se remplit à la main.

Pour l'analyse : `ANTHROPIC_API_KEY` est la clé d'accès à l'API Claude : elle vit sur le serveur, jamais dans le navigateur ni dans le dépôt — le fichier `.env.example` en donne la forme, sans valeur. `CLAUDE_MODEL` choisit le modèle, `claude-opus-5` par défaut ; l'identifiant est complet tel quel, il ne prend pas de suffixe de date. `PORT` fixe le port d'écoute en développement, 8787 par défaut, celui vers lequel Vite renvoie `/api` (sur Vercel, le port n'a pas de sens : chaque fonction est servie par la plateforme). `AI_MOCK` bascule le serveur en mode maquette. `NODE_ENV=production` désactive CORS : en production le client est servi par la même origine que l'API, et l'ouvrir à d'autres origines n'aurait pas de raison d'être.

## Mode maquette

Si `AI_MOCK` vaut `1`, les cinq routes d'analyse répondent depuis `mock.ts` avec des sorties de démonstration bien formées : le brouillon de séance, le module sur mesure, les affirmations, le profil actualisé et les mouvements d'hypnose. Aucun appel réseau n'est fait et aucune donnée de séance ne quitte la machine, ce qui permet de développer et de montrer toute l'interface sans clé. Les réponses portent un drapeau `mock` sur l'enveloppe (`{ "mock": true, "data": … }`) et non dans les données elles-mêmes : l'interface affiche les mêmes objets dans les deux modes, et peut signaler la maquette si elle le souhaite. Ces textes sont de la démonstration ; ils n'ont aucune valeur clinique.

## Avant la production

L'**authentification** est en place : toute route qui agit pour quelqu'un
passe par `auth.ts`, et la base borne ce qu'elle rend. Il manque encore, dans
l'ordre : le **chiffrement au repos** des transcriptions, notes, journaux et profils, avec des clés gérées hors de la base ; la **journalisation des accès** — qui a lu quel dossier, quand, depuis où — conservée séparément des données elles-mêmes ; un **hébergeur certifié HDS**, obligatoire en France pour des données de santé, avec le contrat de sous-traitance correspondant pour le service d'analyse ; et la règle qui tient tout le reste : **aucune donnée patient dans les journaux**, ni ici, ni chez l'hébergeur, ni dans les traces d'erreur — le serveur ne trace que la route appelée et le motif technique de l'échec.
