import { useState } from 'react'
import { Button, Notice, TextArea } from '@/components/ui'
import { RetourIA } from '@/components/retouche/RetourIA'
import type { IssueRetouche, RetourDeLaPraticienne } from '@/lib/retouche'
import { corrigerTexte } from '@/lib/texteHypnose'
import { NOM_MOUVEMENT, type MouvementEcrit } from '@/services/aiClient'
import t from './TexteMouvement.module.css'

interface Props {
  ecrit: MouvementEcrit
  /**
   * La typographie du texte reste celle de l'écran qui l'accueille : la
   * séance le montre plus grand que la fiche, qui le range.
   */
  classes: { article: string; titre: string; para: string }
  /**
   * Enregistre le texte corrigé. Absent, le mouvement se lit sans se
   * corriger — pendant une écriture, par exemple, où il sert de précédent
   * au suivant.
   */
  onCorriger?: (texte: string) => Promise<{ ok: boolean; message: string }>
  /**
   * Les pouces sous le texte, et la retouche par l'IA (0066). Absent — une
   * démonstration, une fiche sans cabinet —, le mouvement se lit sans eux.
   * `occupe` : une écriture tourne, le mouvement sert de précédent au suivant.
   */
  retouche?: {
    /** Absent — l'option Hypnose fermée — : les pouces seuls. */
    onRetoucher?: (retour: RetourDeLaPraticienne) => Promise<IssueRetouche>
    occupe?: boolean
  }
}

/**
 * Un mouvement d'hypnose, à lire — et à corriger.
 *
 * La praticienne LIT ce texte à voix haute, devant quelqu'un, pendant une
 * demi-heure. Une tournure qui ne passe pas dans sa bouche, un prénom mal
 * orthographié, une image qui ne convient pas à cette personne : il fallait
 * jusqu'ici la contourner en séance, ou tout réécrire — quatre appels payés
 * pour une phrase. Elle se corrige ici, mouvement par mouvement, et le PDF
 * suit.
 *
 * Le titre du mouvement ne se corrige pas à la main : c'est le nom de la
 * métaphore, que le texte déroule. Une retouche par l'IA, qui peut changer
 * de métaphore, le renomme avec elle.
 */
export function TexteMouvement({ ecrit, classes, onCorriger, retouche }: Props) {
  /** Le texte en cours de correction ; null : on lit. */
  const [saisie, setSaisie] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState('')
  const nom = NOM_MOUVEMENT[ecrit.mouvement]
  const edition = !!onCorriger && saisie !== null

  function ouvrir() {
    setSaisie(ecrit.texte)
    setEchec('')
  }

  function annuler() {
    setSaisie(null)
    setEchec('')
  }

  async function enregistrer() {
    if (saisie === null || !onCorriger || envoi) return
    const correction = corrigerTexte(saisie)
    if (!correction.ok) {
      setEchec(correction.message)
      return
    }
    // Rien n'a changé : on referme sans écrire.
    if (correction.texte === ecrit.texte) {
      annuler()
      return
    }
    setEnvoi(true)
    const r = await onCorriger(correction.texte)
    setEnvoi(false)
    if (r.ok) annuler()
    else setEchec(r.message || "La correction n'a pas pu être enregistrée : le dossier garde le texte d'avant.")
  }

  return (
    <article className={classes.article}>
      <div className={t.tete}>
        <h3 className={classes.titre}>
          {nom} · {ecrit.titre}
        </h3>
        {onCorriger && !edition ? (
          <button
            type="button"
            className={t.corriger}
            onClick={ouvrir}
            aria-label={`Corriger le texte du mouvement ${nom}`}
          >
            Corriger le texte
          </button>
        ) : null}
      </div>

      {edition ? (
        <div className={t.edition}>
          <TextArea
            className={t.zone}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            rows={Math.min(28, Math.max(10, Math.round(ecrit.texte.length / 90)))}
            aria-label={`Texte du mouvement ${nom}`}
            disabled={envoi}
            dictee
          />
          <p className={t.aide}>
            Un paragraphe par ligne, comme vous le lirez. Les autres mouvements ne changent pas.
          </p>
          {echec ? <Notice tone="warn">{echec}</Notice> : null}
          <div className={t.gestes}>
            <Button variant="primary" disabled={envoi} onClick={() => void enregistrer()}>
              {envoi ? 'Enregistrement…' : 'Enregistrer la correction'}
            </Button>
            <Button variant="ghost" disabled={envoi} onClick={annuler}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <>
          {ecrit.texte
            .split('\n')
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className={classes.para}>
                {para}
              </p>
            ))}
          {/* Sous le mouvement, pas sous chaque paragraphe : la retouche
              réécrit le mouvement entier, raccordé aux trois autres. */}
          {retouche ? (
            <RetourIA
              cible="hypnose"
              libelle={`le mouvement « ${nom} »`}
              version={ecrit.texte}
              occupe={retouche.occupe}
              onRetoucher={retouche.onRetoucher}
            />
          ) : null}
        </>
      )}
    </article>
  )
}
