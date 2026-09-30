/**
 * La séance, dans ce qui se décide sans rien lire ni écrire : quand une
 * séance est encore « en cours », quand la captation mérite d'être
 * enregistrée, à quel moment part le message du soir, comment dire ce qui a
 * déjà été pris.
 *
 * Les écrans de séance et la fiche s'en servent ; les tests l'éprouvent sans
 * navigateur ni base.
 */
import type { SessionDraft } from '@/types/domain'
import { plural } from './format'
import { momentDuRaccourci } from './planification'

/**
 * Au bout de combien de jours la transcription d'une séance jamais envoyée
 * est effacée (purge de nuit, 0043). Le consentement le dit au patient, et
 * une séance plus ancienne ne se propose plus à la reprise : sa matière n'y
 * est plus.
 */
export const DELAI_PURGE_JOURS = 7

/**
 * Tous les combien la captation s'enregistre en base, en millisecondes.
 *
 * Quinze secondes : ce qu'on peut perdre si l'onglet se ferme sans prévenir,
 * contre une écriture par phrase. En deçà, on écrirait pour chaque mot ; au
 * delà, une coupure emporterait un échange entier.
 */
export const CADENCE_SAUVEGARDE_MS = 15_000

/** Ce qui, dans l'état, dit où en est la captation. */
export interface EtatSeance {
  consent: boolean
  transcript: string
  sessionNotes: string
  draft: unknown
  sent: boolean
}

/**
 * La séance à l'écran est-elle en cours — à rejoindre plutôt qu'à écraser ?
 *
 * Une séance ENVOYÉE ne l'est plus. « Nouvelle séance », depuis la fiche,
 * ramenait au brouillon qu'on venait d'envoyer : le consentement, la
 * transcription et le brouillon étaient encore là, et l'écran en concluait
 * qu'il fallait les rejoindre — d'où « Reprendre », une seconde génération, un
 * second envoi.
 */
export function seanceEnCours(etat: EtatSeance): boolean {
  if (etat.sent) return false
  return Boolean(etat.consent || etat.transcript || etat.sessionNotes || etat.draft)
}

/** Ce que la captation dépose en base. */
export interface Instantane {
  transcript: string
  notes: string
}

/**
 * Faut-il écrire ?
 *
 * Seulement quand le texte a changé depuis la dernière écriture réussie : le
 * minuteur avance chaque seconde, pas la matière. Et un texte effacé
 * (« Effacer ») s'écrit aussi — ce qui a été retiré à l'écran ne doit pas
 * rester en base.
 */
export function aSauver(courant: Instantane, dernier: Instantane | null): boolean {
  if (!dernier) return Boolean(courant.transcript.trim() || courant.notes.trim())
  return courant.transcript !== dernier.transcript || courant.notes !== dernier.notes
}

/**
 * Quand part le message au patient, et comment le dire.
 *
 * « Le soir de la séance » : 20 h, comme le raccourci des notifications. Une
 * séance qui se termine après 20 h n'attend pas le lendemain soir — le
 * message part tout de suite, c'est encore le soir. Passé 22 h, on n'écrit
 * plus sur un téléphone : il part le lendemain à 8 h.
 */
export function momentDuMessage(maintenant: Date = new Date()): {
  quand: Date
  /** Le libellé du journal des envois, comme ceux des notifications. */
  libelle: string
  /** Ce que la phrase de l'écran dit du moment : « ce soir à 20 h »… */
  dit: string
  /** Vrai quand le message part tout de suite. */
  immediat: boolean
} {
  const h = maintenant.getHours()
  if (h < 20) {
    return {
      quand: momentDuRaccourci('Ce soir, 20 h', maintenant),
      libelle: 'Ce soir, 20 h',
      dit: 'ce soir à 20 h',
      immediat: false,
    }
  }
  if (h < 22) return { quand: new Date(maintenant), libelle: 'Maintenant', dit: 'tout de suite', immediat: true }
  return {
    quand: momentDuRaccourci('Demain, 8 h', maintenant),
    libelle: 'Demain, 8 h',
    dit: 'demain à 8 h',
    immediat: false,
  }
}

/**
 * Ce qu'une séance laissée en plan contient déjà, en une phrase.
 *
 * « 1450 mots transcrits, vos notes et un brouillon déjà rédigé ». C'est ce
 * qui permet de décider, devant le patient, entre reprendre et effacer.
 */
export function ceQuiAEtePris(p: { transcript: string; notes: string; aUnBrouillon: boolean }): string {
  const mots = p.transcript.trim() ? p.transcript.trim().split(/\s+/).length : 0
  const parts: string[] = []
  if (mots) parts.push(plural(mots, 'mot transcrit', 'mots transcrits'))
  if (p.notes.trim()) parts.push('vos notes')
  if (p.aUnBrouillon) parts.push('un brouillon déjà rédigé')
  if (!parts.length) return 'rien encore'
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}

/**
 * Ce que la praticienne a décidé sur un brouillon, au-delà de son texte :
 * les modules et les audios écartés, la synthèse relue.
 *
 * GARDER UN BROUILLON POUR PLUS TARD, C'EST GARDER SES CHOIX. Sans eux, le
 * brouillon repris proposait de nouveau les modules qu'elle avait écartés,
 * tous cochés — et un envoi distrait les versait au parcours. Ils voyagent
 * avec le brouillon, sous une clé à part, et en sont retirés à la lecture :
 * ce qui part au dossier est le brouillon seul.
 */
export interface ChoixDuBrouillon {
  proposalOff: Record<number, boolean>
  sugOff: Record<string, boolean>
  syntheseOk: boolean
}

const CLE_CHOIX = 'choix_praticienne'

export const AUCUN_CHOIX: ChoixDuBrouillon = { proposalOff: {}, sugOff: {}, syntheseOk: false }

/**
 * Les choix à écrire avec le brouillon, pris au bon endroit.
 *
 * `courant` : le magasin maintenant (read()), qui a les derniers clics ;
 * `rendu` : le rendu d'où l'écriture part, avec sa séance et ses choix.
 * D'ordinaire le magasin fait foi. Mais un champ démonté annonce encore la
 * fin de sa dictée APRÈS que « Garder en brouillon » ou « Changer de
 * patient » a vidé le magasin (nouvelleSeance) : ses choix y sont ceux par
 * défaut, et les écrire effaçait ceux que la praticienne venait de garder —
 * modules écartés de nouveau cochés, synthèse plus « relue ». Le magasin
 * parti vers une autre séance (ou sans brouillon), ce sont les choix du
 * rendu qui partent.
 */
export function choixAGarder(
  courant: ChoixDuBrouillon & { sessionId: string | null; draft: SessionDraft | null },
  rendu: ChoixDuBrouillon & { sessionId: string | null },
): ChoixDuBrouillon {
  const source = courant.sessionId === rendu.sessionId && courant.draft ? courant : rendu
  return { proposalOff: source.proposalOff, sugOff: source.sugOff, syntheseOk: source.syntheseOk }
}

/** Le brouillon tel qu'il s'enregistre : son texte, et les choix faits dessus. */
export function brouillonAvecChoix(draft: SessionDraft, choix: ChoixDuBrouillon): SessionDraft {
  const proposalOff = Object.fromEntries(Object.entries(choix.proposalOff).filter(([, v]) => v === true))
  const sugOff = Object.fromEntries(Object.entries(choix.sugOff).filter(([, v]) => v === true))
  return { ...draft, [CLE_CHOIX]: { proposalOff, sugOff, syntheseOk: choix.syntheseOk === true } } as SessionDraft
}

/**
 * Le brouillon relu depuis la base, et ses choix, séparés. Les choix sont
 * lus sans confiance : ce qui n'a pas la bonne forme est ignoré.
 */
export function separerChoix(brut: SessionDraft | null): { draft: SessionDraft | null; choix: ChoixDuBrouillon } {
  if (!brut || typeof brut !== 'object') return { draft: brut, choix: AUCUN_CHOIX }
  const { [CLE_CHOIX]: lus, ...reste } = brut as SessionDraft & Record<string, unknown>
  const draft = reste as SessionDraft
  if (!lus || typeof lus !== 'object' || Array.isArray(lus)) return { draft, choix: AUCUN_CHOIX }
  const c = lus as Record<string, unknown>
  const coches = (v: unknown): Array<[string, true]> =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x === true)
          .map(([k]) => [k, true])
      : []
  return {
    draft,
    choix: {
      proposalOff: Object.fromEntries(coches(c.proposalOff).filter(([k]) => /^\d+$/.test(k)).map(([k]) => [Number(k), true])),
      sugOff: Object.fromEntries(coches(c.sugOff)),
      syntheseOk: c.syntheseOk === true,
    },
  }
}
