/**
 * Captation de séance : points de consentement et raccourcis de prise de
 * notes.
 *
 * Les séances elles-mêmes vivent dans la base du cabinet (Supabase, région
 * de Paris). Aucune certification HDS n'est revendiquée : c'est un chantier
 * ouvert, décrit dans server/README.md, pas un acquis à laisser entendre.
 */
import { DELAI_PURGE_JOURS } from '@/lib/seance'

/**
 * Points lus au patient avant d'enregistrer. Le consentement est bloquant.
 *
 * Ils se lisent à voix haute devant la personne : l'un d'eux la nomme, il
 * prend donc son prénom plutôt qu'un exemple.
 *
 * TROIS D'ENTRE EUX ÉTAIENT FAUX, et c'est le pire endroit du produit pour
 * l'être — on les prononce avant d'enregistrer une séance d'hypnothérapie.
 *
 * 1. « … depuis son espace » : aucun écran de l'espace patient ne permettait
 *    de révoquer quoi que ce soit. La révocation se demande de vive voix, et
 *    l'écran de séance porte le geste qui l'exécute (« Retirer le
 *    consentement »).
 * 2. « Aucun transfert hors Union européenne » : la transcription part chez
 *    Anthropic pour être analysée. C'est le cœur du produit ; le taire dans
 *    le consentement revenait à obtenir un accord sur autre chose.
 * 3. « hébergeur agréé données de santé » : l'agrément HDS est un contrat
 *    que le produit ne peut pas affirmer à la place de qui l'a signé.
 *
 * TROIS AUTRES L'ÉTAIENT ENCORE, sur le trajet du son et du texte.
 *
 * 4. « L'enregistrement sonore est détruit dès la transcription terminée, il
 *    n'est stocké nulle part » : la transcription n'est pas la nôtre, c'est
 *    celle du NAVIGATEUR (src/services/speech.ts), et elle envoie le son chez
 *    l'éditeur du navigateur. Ce que nous pouvons dire, c'est que nous ne
 *    recevons jamais le son — seulement le texte — et pas ce que Google,
 *    Microsoft ou Apple en font.
 * 5. Le seul service externe nommé était Anthropic : l'éditeur du navigateur
 *    en est un aussi, et il reçoit la voix, pas seulement le texte.
 * 6. « Le dossier est hébergé en France » : vrai pour la base (Paris), et
 *    désormais pour les fonctions du serveur (épinglées à Paris dans
 *    vercel.json) — mais le texte part aux États-Unis pour être analysé, et
 *    la phrase le laissait oublier. Chaque trajet est dit à sa place.
 *
 * Le délai de purge (sept jours, 0043) est dit aussi : le texte s'enregistre
 * maintenant pendant la séance, et une séance jamais validée ne doit pas
 * garder son verbatim sans que la personne l'ait su.
 *
 * GENRE NEUTRE. Ces phrases sont lues par qui mène la séance : « sa
 * thérapeute » imposait un féminin que rien ne garantit. On dit ce qu'il
 * suffit de faire, sans nommer qui le reçoit.
 *
 * CES PHRASES ENGAGENT LE CABINET. Elles décrivent ce que le code fait
 * aujourd'hui ; leur formulation juridique reste à valider par qui exploite
 * le produit.
 */
export function consentPoints(prenom: string): string[] {
  return [
    "La transcription est faite par le navigateur de cet appareil : pour cela, le son part chez l'éditeur du navigateur (Google pour Chrome, Microsoft pour Edge, Apple pour Safari), qui le transcrit. L'application ne reçoit que le texte ; le son n'y est jamais enregistré.",
    "Ce texte — la transcription et les notes prises pendant la séance — est envoyé pour analyse à Anthropic, aux États-Unis, qui en rédige un brouillon de note.",
    `Pendant la séance, le texte s'enregistre au fur et à mesure dans le dossier, pour ne rien perdre si la page se ferme. La note reste un brouillon jusqu'à sa relecture et sa validation ; la transcription est alors effacée, et elle l'est d'office au bout de ${DELAI_PURGE_JOURS} jours si la note n'est jamais validée.`,
    `${prenom} peut demander l'arrêt de l'enregistrement, ou l'effacement de ce qui a déjà été pris, à tout moment et sans justification : il suffit de le dire.`,
    "Le dossier est conservé dans une base hébergée à Paris (Supabase), où fonctionne aussi le serveur de l'application. Aucune certification d'hébergeur de données de santé (HDS) n'est revendiquée. Dans l'application, seules les personnes du cabinet ont accès au dossier.",
  ]
}

/** Boutons d'horodatage sous la zone de notes (libellé du bouton). */
export const NOTE_TAGS: string[] = ['Horodater', 'Mot du patient', 'À reprendre', 'Vigilance', 'Module à donner']

/** Préfixe inséré dans la note après l'horodatage, par libellé de bouton. */
export const NOTE_TAG_PREFIXES: Record<string, string> = {
  Horodater: '',
  'Mot du patient': 'mot du patient : ',
  'À reprendre': 'à reprendre : ',
  Vigilance: 'vigilance : ',
  'Module à donner': 'module à donner : ',
}
