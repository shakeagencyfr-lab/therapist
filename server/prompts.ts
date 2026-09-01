/**
 * Les quatre prompts du produit, repris mot pour mot du prototype de design
 * (design-reference/Entre-seances.dc.html). Ce texte est le cœur métier :
 * il a été écrit avec la thérapeute, il ne se reformule pas.
 *
 * Les prompts vivent côté serveur : ils ne sont jamais exposés au navigateur,
 * pas plus que la clé d'API.
 */
import type { ModuleContext, PatientContext } from './schemas.js'

/* ------------------------------------------------------------------ *
 * 1. Brouillon de note de séance
 * ------------------------------------------------------------------ */

export const SESSION_DRAFT_SYSTEM =
  "Tu assistes une hypnothérapeute française dans la rédaction de sa note de séance. Tu ne poses aucun diagnostic, tu ne prescris rien, tu ne parles jamais de pathologie. Tu restitues ce qui a été dit, avec les mots exacts du patient. Tu écris en français, sobrement, sans jargon et sans formule d'introduction. Tu réponds uniquement par du JSON valide, sans texte autour et sans balises de code."

/**
 * Matière de la séance : la transcription, complétée des notes écrites par la
 * thérapeute — qui priment sur la transcription.
 */
export function sessionMaterial(transcript: string, notes: string): string {
  const _tr = transcript.trim()
  const _nt = notes.trim()
  return _nt ? _tr + "\n\n[Notes écrites par la thérapeute pendant la séance, à prendre en priorité sur la transcription]\n" + _nt : _tr
}

export function sessionDraftPrompt(text: string, categories: string[]): string {
  return "Voici la transcription d'une séance d'hypnothérapie.\n\n---\n" + text + "\n---\n\nProduis un objet JSON avec exactement ces clés :\n\"synthese\" : 4 à 6 phrases résumant la séance, à la troisième personne, factuel, ce qui a été travaillé et ce qui s'est passé depuis la dernière fois.\n\"mots\" : tableau de 4 à 8 chaînes, les expressions et métaphores employées littéralement par le patient (ses mots exacts, courts, sans guillemets).\n\"themes\" : tableau de 2 à 4 chaînes, les fils qui traversent la séance et mériteraient d'être explorés, formulés comme des observations et non comme des conclusions.\n\"propositions\" : tableau de 3 à 5 objets {\"titre\", \"pourquoi\", \"type\"} où type vaut Audio, Exercice, Journal, Échelle ou Écriture ; ce sont des modules courts que le patient réalisera entre deux séances.\n\"induction\" : un paragraphe de 80 à 130 mots, brouillon d'induction hypnotique à la deuxième personne, construit avec les métaphores du patient repérées ci-dessus.\n\"questions\" : tableau de 3 à 5 chaînes, des questions ouvertes et précises que la thérapeute pourrait poser à la séance suivante, appuyées sur ce qui est resté en suspens.\n\"vigilance\" : tableau de 0 à 3 objets {\"point\", \"conduite\"}, uniquement si la transcription contient un élément qui mérite l'attention du praticien (détresse marquée, mention médicale, sujet hors du champ de l'hypnose). \"conduite\" décrit la conduite professionnelle à envisager, jamais un diagnostic. Tableau vide s'il n'y a rien à signaler.\n\"categories_audio\" : tableau de 1 à 3 objets {\"categorie\", \"pourquoi\"} où \"categorie\" est choisie STRICTEMENT dans cette liste : « " + categories.join(", ") + " » ; \"pourquoi\" est une phrase disant ce que cet audio viendrait soutenir chez ce patient. Ce sont les rayons de la bibliothèque d'audios de la thérapeute, pas des titres.\n\"message\" : un message de 40 à 70 mots, à la deuxième personne, chaleureux et sans jargon, que la thérapeute pourra envoyer au patient dans la journée pour accompagner les modules retenus."
}

/* ------------------------------------------------------------------ *
 * 2. Module sur mesure
 * ------------------------------------------------------------------ */

export const MODULE_SYSTEM =
  "Tu assistes une hypnothérapeute française qui construit des exercices à faire entre deux séances. Tu écris en français, sobrement, en t'adressant au patient au vouvoiement. Pas de jargon, pas de diagnostic, pas de promesse de résultat. Les consignes sont concrètes, courtes, réalisables sans matériel. Tu réponds uniquement par du JSON valide, sans texte autour et sans balises de code."

export function modulePrompt({ intent, type, quiz }: ModuleContext): string {
  return "Intention de la thérapeute : " + intent + "\n\nType de module demandé : " + type + ".\n" + (quiz ? "Inclure un quiz." : "Ne pas inclure de quiz : renvoie un tableau vide.") + "\n\nProduis un objet JSON avec exactement ces clés :\n\"titre\" : le nom du module, court, concret, sans guillemets ni majuscules superflues.\n\"duree\" : la durée réelle, formulée simplement (ex. « 3 minutes »).\n\"quand\" : le moment de la journée ou la circonstance où le faire.\n\"steps\" : tableau de 3 chaînes, les trois temps de la consigne, à la deuxième personne, chacun une phrase ou deux.\n\"pourquoi\" : 2 à 3 phrases expliquant au patient à quoi sert l'exercice, sans le survendre.\n\"quiz\" : tableau de 2 objets {\"question\", \"options\" (3 chaînes), \"correct\" (index de la bonne réponse, entier), \"feedback\" (1 à 2 phrases expliquant la bonne réponse)} portant sur la compréhension de la consigne, jamais sur l'état du patient."
}

/* ------------------------------------------------------------------ *
 * 3. Affirmations de la semaine
 * ------------------------------------------------------------------ */

export const AFFIRMATIONS_SYSTEM =
  "Tu écris des affirmations destinées à l'inconscient, pour l'hypnothérapie, en français, à la première personne. Tu appliques strictement les règles suivantes, qui viennent de la pratique clinique et des neurosciences de l'apprentissage.\n1. Présent de l'indicatif uniquement, comme si c'était déjà installé. Aucun futur, aucun conditionnel, aucune projection : « je vais », « je pourrai », « bientôt », « peu à peu », « de plus en plus » sont interdits.\n2. Aucune négation : l'inconscient ne l'entend pas. Interdits : ne, pas, plus, jamais, sans, aucun, arrêter, éviter, éliminer, moins, ni le nom du problème (cigarette, stress, insomnie, peur, angoisse, douleur). On nomme l'état voulu, pas ce qu'on quitte.\n3. Aucun mot de doute ni de tentative : je pense, je crois, j'espère, j'essaie, je voudrais, peut-être, si possible, un jour.\n4. Conviction et appartenance : « je suis », « je sais », « je choisis », « je respire », « mon corps », « c'est ainsi ». Voix active, verbes de sensation.\n5. Une seule idée par affirmation, 8 à 16 mots, un rythme qui se dit à voix haute sans reprendre son souffle. Ancre l'affirmation dans le vécu et les mots du patient quand tu en as, et dans une sensation physique repérable.\nTu réponds uniquement par du JSON valide, sans texte autour et sans balises de code."

export function affirmationsPrompt(c: PatientContext): string {
  const mods = c.modules.map((m) => m.title).join(", ")
  const jr = c.journal.map((j) => j.text).join(" ")
  return "Patient : " + c.name + ". " + c.program + ". Objectif suivi : " + c.subtitle + ". Auto-évaluation suivie : " + c.scaleLabel + ".\nModules en cours : " + mods + ".\nCe qu'il écrit lui-même : " + (c.shared + " " + jr).slice(0, 900) + "\n\nProduis un objet JSON {\"affirmations\": [4 chaînes]} : quatre affirmations pour la semaine, différentes les unes des autres, chacune tenant sur une ligne d'écran de téléphone. Avant de répondre, relis chaque phrase et corrige-la si elle contient une négation, un futur, un mot de doute, ou le nom du problème."
}

/* ------------------------------------------------------------------ *
 * 4. Profil psychologique
 * ------------------------------------------------------------------ */

export const PROFILE_SYSTEM =
  "Tu es l'assistant clinique d'une hypnothérapeute. Tu tiens à jour le profil psychologique d'un patient, séance après séance. Tu écris en français, dans un style clinique sobre, sans jargon décoratif et sans promesse thérapeutique. Tu décris ce que les matériaux montrent, tu signales ce qui reste incertain, et tu ne conserves du profil précédent que ce qui reste vrai. Les axes sont des dimensions psychologiques observables, notées de 0 à 100. Les conseils sont des gestes concrets que la thérapeute peut poser en séance ou dans l'entre-séances. Tu réponds uniquement par du JSON valide, sans texte autour et sans balises de code."

export interface ProfileInput {
  context: PatientContext
  /** Notes écrites pendant la dernière séance. */
  notes: string
  /** Synthèse du brouillon de séance, si elle existe. */
  synthese: string
  /** Transcription de la dernière séance, si elle existe. */
  transcript: string
}

export function profilePrompt({ context: c, notes, synthese, transcript }: ProfileInput): string {
  const mods = c.modules.map((m) => m.title + (m.done ? " (fait)" : " (non fait)")).join(", ")
  const jr = c.journal.map((j) => j.date + " — " + j.text).join("\n")
  return "Patient : " + c.name + ". " + c.program + ". " + c.weekLabel + ". Séances réalisées : " + c.sessions + " sur " + c.totalSessions + ". Assiduité : " + c.adherence + " %. Auto-évaluation suivie : " + c.scaleLabel + " (" + c.scaleDelta + ").\n"
    + "Modules de la semaine : " + mods + ".\n"
    + "Journal du patient :\n" + jr + "\n" + c.shared.slice(0, 600) + "\n"
    + (notes ? "Notes écrites par la thérapeute pendant la dernière séance :\n" + notes + "\n" : "")
    + (synthese ? "Synthèse de la dernière séance :\n" + synthese + "\n" : "")
    + (transcript ? "Extrait de la transcription :\n" + transcript.slice(0, 2500) + "\n" : "")
    + "\nProfil actuel, à réviser :\n" + JSON.stringify(c.profile) + "\n"
    + "\nProduis un objet JSON {\"portrait\": chaîne de 3 à 4 phrases, \"axes\": [5 objets {\"label\", \"value\" entier 0-100, \"note\" de 5 à 8 mots}], \"levers\": [3 ou 4 objets {\"title\", \"body\" d'une à deux phrases}], \"care\": [1 à 3 chaînes], \"resume\": une phrase disant ce qui a changé depuis la version précédente}. Garde les mêmes axes que le profil actuel quand ils restent pertinents, en ajustant leur valeur et leur note ; remplace un axe seulement si la séance en révèle un plus juste."
}
