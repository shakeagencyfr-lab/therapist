import { useState } from 'react'
import { useMaybeAuth } from '@/auth/session'
import { enRegle, useDroits } from '@/cabinet/droits'
import { useJetons } from '@/cabinet/useJetons'
import { ContactRevendeur } from '@/components/layout/BandeauContrat'
import { Button } from '@/components/ui'
import { libelleOptionHypnose } from '@/lib/jetonsIA'
import s from './Jetons.module.css'

/**
 * L'hypnose fermée, et le chemin pour l'ouvrir.
 *
 * Depuis 0065, l'hypnose personnalisée est une option : comprise dans
 * certaines offres, accordée par le revendeur, ou achetée en pass. Quand
 * elle est fermée, la case et le bouton d'écriture laissent la place à ce
 * verrou — qui dit pourquoi, et quoi faire : acheter le pass quand le
 * revendeur a ouvert le paiement et que c'est la titulaire qui regarde, lui
 * demander sinon.
 *
 * LES HYPNOSES DÉJÀ ÉCRITES RESTENT À ELLE. Fermer l'écriture ne retire rien
 * du dossier : elles se lisent et se téléchargent comme avant (`dejaEcrites`
 * le dit).
 *
 * HORS CONTRAT, CE N'EST PAS L'OPTION QUI MANQUE. `cabinet_droits` ferme
 * l'hypnose avec tout le reste quand l'essai est fini ou la facture
 * impayée — y compris pour une offre qui la comprend. Dire alors « pas
 * comprise dans votre offre », et proposer un pass que le serveur refuserait,
 * c'était se tromper de cause : le verrou dit le contrat, et à qui parler.
 */
export function VerrouHypnose({ dejaEcrites = false }: { dejaEcrites?: boolean }) {
  const jetons = useJetons()
  const droits = useDroits()
  const auth = useMaybeAuth()
  const titulaire = auth?.context?.cabinet?.role === 'owner'
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState('')

  const option = jetons?.optionHypnose ?? null
  const paiement = jetons?.paiementPossible === true
  /* Les jetons offerts avec le pass ne valent qu'en mode jetons : à un
     cabinet qui paie avec sa clé, les annoncer serait promettre du vide. */
  const avecJetons = jetons?.mode === 'jetons'
  const revendeur = droits?.droits?.revendeur ?? null
  const horsContrat = !enRegle(droits)

  async function activer() {
    if (!jetons || enCours) return
    setEnCours(true)
    setEchec('')
    const message = await jetons.acheter({ option: 'hypnose' })
    // En cas de succès, la page part chez Stripe : on ne revient ici qu'en échec.
    if (message) {
      setEchec(message)
      setEnCours(false)
    }
  }

  if (horsContrat) {
    return (
      <div className={s.verrou}>
        <span className={s.verrouTitre}>L'hypnose personnalisée est suspendue avec votre contrat</span>
        <p className={s.verrouTexte}>
          Votre contrat n'est pas en cours : l'écriture d'hypnoses reprendra avec lui.
          {dejaEcrites ? ' Les hypnoses déjà écrites restent lisibles et téléchargeables.' : ''}
        </p>
        <p className={s.verrouTexte}>
          <ContactRevendeur revendeur={revendeur} pour="pour réactiver l'offre" />
        </p>
      </div>
    )
  }

  return (
    <div className={s.verrou}>
      <span className={s.verrouTitre}>L'hypnose personnalisée n'est pas comprise dans votre offre</span>
      <p className={s.verrouTexte}>
        {option
          ? `Elle s'ajoute en option : un pass de ${option.jours} jours, qui ouvre l'écriture d'hypnoses pour toutes les personnes que vous suivez.`
          : "Elle s'ajoute en option, que votre revendeur peut ouvrir pour votre cabinet."}
        {dejaEcrites ? ' Les hypnoses déjà écrites restent lisibles et téléchargeables.' : ''}
      </p>
      <div className={s.verrouGestes}>
        {option && paiement && titulaire ? (
          <Button variant="primary" className={s.long} disabled={enCours} onClick={() => void activer()}>
            {enCours
              ? 'Ouverture du paiement…'
              : libelleOptionHypnose({ ...option, jetons: avecJetons ? option.jetons : 0 })}
          </Button>
        ) : (
          <p className={s.verrouTexte}>
            {paiement
              ? "Seule la titulaire du cabinet peut activer l'option Hypnose."
              : `Demandez l'option Hypnose à votre revendeur${revendeur?.nom ? ` (${revendeur.nom}${revendeur.courriel ? `, ${revendeur.courriel}` : ''})` : ''}.`}
          </p>
        )}
      </div>
      {echec ? <p className={s.echec}>{echec}</p> : null}
    </div>
  )
}
