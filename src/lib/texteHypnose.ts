/**
 * Ce que l'écran dit d'une hypnose en cours d'écriture, et ce qu'il accepte
 * qu'on corrige dans un mouvement déjà écrit.
 *
 * Deux écrans écrivent des hypnoses — la note de séance et la fiche — et ils
 * disaient des choses différentes du même état : la fiche annonçait « écrite
 * et conservée » sans regarder si la base l'avait reçue, et aucun des deux ne
 * disait quoi faire après un échec au troisième mouvement. Les phrases vivent
 * donc ici, une fois, et s'éprouvent sans navigateur.
 */
import { plural } from '@/lib/format'
import { MOUVEMENTS_HYPNOSE, type MouvementHypnose } from '@/services/aiClient'

/** La place du mouvement dans la séance, de 1 à 4 — le `rang` de la base. */
export function rangDuMouvement(mouvement: MouvementHypnose): number {
  return MOUVEMENTS_HYPNOSE.indexOf(mouvement) + 1
}

/**
 * Le libellé du bouton qui reprend une écriture interrompue.
 *
 * Rien d'écrit encore : ce n'est pas une reprise, c'est une relance — dire
 * « reprendre au mouvement 1 » laisserait croire qu'un morceau est acquis.
 */
export function libelleReprise(mouvement: MouvementHypnose): string {
  const rang = rangDuMouvement(mouvement)
  return rang <= 1 ? "Relancer l'écriture" : `Reprendre au mouvement ${rang}`
}

export type Correction = { ok: true; texte: string } | { ok: false; message: string }

/**
 * Le texte corrigé d'un mouvement, tel qu'il sera enregistré.
 *
 * La praticienne lit ce texte à voix haute : une tournure qui ne passe pas
 * dans sa bouche se reprend ici plutôt qu'en séance. On ne touche qu'à la
 * forme qui ne se voit pas — fins de ligne Windows, espaces en bout de ligne,
 * blancs autour du texte — et l'on refuse un mouvement vide : on ne lit pas
 * un blanc pendant sept minutes, et un mouvement vide ferait passer la séance
 * de l'approfondissement au retour sans transition.
 */
export function corrigerTexte(saisie: string): Correction {
  const texte = saisie
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((ligne) => ligne.replace(/\s+$/, ''))
    .join('\n')
    .trim()
  if (!texte) {
    return {
      ok: false,
      message:
        "Un mouvement ne peut pas rester vide : il se lit à voix haute, d'un bout à l'autre. Corrigez le texte, ou supprimez l'hypnose pour en écrire une autre.",
    }
  }
  return { ok: true, texte }
}

/** Ce que l'écran sait de l'écriture, au moment d'en rendre compte. */
export interface EtatEcriture {
  /** Les quatre mouvements sont écrits. */
  fini: boolean
  /** Tout ce qui est écrit a rejoint la base (et l'hypnose est refermée si elle est finie). */
  conservee: boolean
  /** Combien de mouvements sont écrits, depuis l'induction. */
  ecrits: number
  /** L'écriture s'est arrêtée sur un échec. */
  interrompue: boolean
  /** Un cabinet réel : sans lui, rien ne s'enregistre nulle part. */
  reel: boolean
}

/** Le ton d'un bilan : réussite, alerte, ou simple information. */
export type TonBilan = 'ok' | 'warn' | 'neutre'

/**
 * Le bilan d'une écriture, pour la phrase qui l'accompagne à l'écran.
 *
 * « CONSERVÉE » N'EST DIT QUE S'IL EST VRAI. Le texte peut être entièrement
 * écrit et n'exister que dans cet onglet — sans cabinet réel, ou sur un refus
 * d'écriture. L'annoncer conservé le fait perdre au premier rechargement,
 * alors qu'il vient de coûter l'appel le plus cher du produit.
 *
 * APRÈS UN ÉCHEC, ON DIT CE QUI RESTE ET OÙ ALLER. L'écran restait figé sur
 * deux coches, sans un mot : la praticienne ne savait ni si les deux premiers
 * mouvements étaient gardés, ni qu'elle pouvait repartir du troisième.
 *
 * `null` : rien à dire (écriture en cours, ou pas encore lancée).
 */
export function bilanHypnose(etat: EtatEcriture, prenom: string): { ton: TonBilan; texte: string } | null {
  if (etat.fini) {
    if (etat.conservee) {
      return { ton: 'ok', texte: `Hypnose écrite et conservée dans le dossier de ${prenom}.` }
    }
    if (!etat.reel) {
      return {
        ton: 'warn',
        texte:
          "Hypnose écrite pour la démonstration : elle n'est conservée dans aucun dossier et disparaîtra au prochain chargement.",
      }
    }
    return {
      ton: 'warn',
      texte: `Hypnose écrite, mais pas conservée : elle n'a pas pu rejoindre le dossier de ${prenom}. Réessayez de l'enregistrer — sinon, copiez-la maintenant : elle disparaîtra au prochain chargement.`,
    }
  }

  if (!etat.interrompue) return null

  if (etat.ecrits === 0) {
    return {
      ton: 'neutre',
      texte: "Aucun mouvement n'a pu être écrit. Relancez l'écriture, ou fermez pour changer d'intention.",
    }
  }
  if (!etat.reel) {
    return {
      ton: 'warn',
      texte: `${plural(etat.ecrits, 'mouvement écrit', 'mouvements écrits')} sur 4, pour la démonstration : rien n'est conservé. Reprenez là où l'écriture s'est arrêtée, ou fermez.`,
    }
  }
  if (!etat.conservee) {
    return {
      ton: 'warn',
      texte: `${plural(etat.ecrits, 'mouvement écrit', 'mouvements écrits')} sur 4, mais pas tous conservés. Reprenez : ce qui manque au dossier y sera versé avant que l'écriture ne continue.`,
    }
  }
  return {
    ton: 'neutre',
    texte: `${plural(etat.ecrits, 'mouvement écrit et conservé', 'mouvements écrits et conservés')} sur 4. Reprenez là où l'écriture s'est arrêtée, ou fermez : l'hypnose restera sur la fiche de ${prenom}, marquée interrompue, et pourra être reprise plus tard.`,
  }
}
