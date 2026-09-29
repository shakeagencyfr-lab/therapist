import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { plural } from '@/lib/format'
import {
  CLE_ACTIVITE,
  CLE_SORTIE,
  ECRITURE_PARTAGEE_MS,
  etatVeille,
  lireActivitePartagee,
  lireSortie,
  noteDeSortie,
  plusRecente,
  secondesRestantes,
  type DelaiInactivite,
} from '@/lib/inactivite'
import { useAppState } from '@/state/store'
import s from './Inactivite.module.css'

/*
 * La garde d'inactivité de l'espace de la praticienne et du revendeur.
 *
 * Les règles — le préavis, la captation, le partage entre onglets — sont
 * dans src/lib/inactivite.ts, éprouvées là. Ce fichier ne fait qu'écouter
 * les gestes, lire l'horloge, et afficher le préavis.
 */

/** Ce qui compte pour un geste : toucher, taper, faire défiler, bouger la souris. */
const GESTES = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

/* Le stockage du navigateur peut être refusé (navigation privée, réglage
   strict) : la garde fonctionne alors onglet par onglet, sans rien casser. */
function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle)
  } catch {
    return null
  }
}

function ecrire(cle: string, valeur: string): void {
  try {
    window.localStorage.setItem(cle, valeur)
  } catch {
    /* rien : voir plus haut */
  }
}

/**
 * La note laissée à la porte par la dernière fermeture, lue une fois puis
 * effacée : la phrase ne se répète pas au rechargement suivant.
 */
export function prendreNoteDeSortie(): DelaiInactivite | null {
  const note = lireSortie(lire(CLE_SORTIE), Date.now())
  try {
    window.localStorage.removeItem(CLE_SORTIE)
  } catch {
    /* rien */
  }
  return note
}

/**
 * Surveille l'inactivité et ferme la session sur cet appareil.
 *
 * Montée dans l'espace connecté, sous le magasin d'état : elle lit
 * `recording`, qui dit si le micro de la séance est ouvert. Rien ne s'affiche
 * hors du préavis.
 */
export function GardeInactivite({
  delaiMinutes,
  onExpire,
}: {
  delaiMinutes: DelaiInactivite
  /** La déconnexion locale ; la note pour la porte est déjà posée. */
  onExpire: () => void
}) {
  const { recording } = useAppState()
  const derniere = useRef(Date.now())
  const derniereEcriture = useRef(0)
  const parti = useRef(false)
  /* Lus par l'intervalle, posé une fois : toujours la valeur du moment. */
  const captation = useRef(recording)
  captation.current = recording
  const expirer = useRef(onExpire)
  expirer.current = onExpire
  /** Les secondes du préavis, ou null hors préavis. */
  const [secondes, setSecondes] = useState<number | null>(null)

  /** Un geste : on le retient, et on le dit aux autres onglets de temps en temps. */
  const noter = useRef((maintenant: number) => {
    derniere.current = maintenant
    if (maintenant - derniereEcriture.current >= ECRITURE_PARTAGEE_MS) {
      derniereEcriture.current = maintenant
      ecrire(CLE_ACTIVITE, String(maintenant))
    }
  }).current

  useEffect(() => {
    if (delaiMinutes === 0) {
      setSecondes(null)
      return
    }
    // Ouvrir l'espace, ou changer de réglage, compte pour un geste.
    noter(Date.now())
    const surGeste = () => noter(Date.now())

    const verifier = () => {
      if (parti.current) return
      const maintenant = Date.now()
      /* Micro ouvert : la séance s'écrit, la praticienne est là même sans
         toucher à rien. On le dit aussi aux autres onglets, pour qu'aucun
         ne ferme la session commune sous la captation. */
      if (captation.current) noter(maintenant)
      const partagee = lireActivitePartagee(lire(CLE_ACTIVITE), maintenant)
      const e = etatVeille({
        derniereActivite: plusRecente(derniere.current, partagee),
        maintenant,
        delaiMinutes,
        captation: captation.current,
      })
      if (e.etat === 'expire') {
        parti.current = true
        setSecondes(null)
        ecrire(CLE_SORTIE, noteDeSortie(maintenant, delaiMinutes))
        expirer.current()
        return
      }
      const suivant = e.etat === 'preavis' ? secondesRestantes(e.resteMs) : null
      setSecondes((avant) => (avant === suivant ? avant : suivant))
    }

    for (const g of GESTES) window.addEventListener(g, surGeste, { passive: true, capture: true })
    /* Un onglet en arrière-plan voit ses minuteries ralenties : au retour, on
       juge tout de suite, sur l'heure réelle. */
    document.addEventListener('visibilitychange', verifier)
    const id = window.setInterval(verifier, 1000)
    return () => {
      for (const g of GESTES) window.removeEventListener(g, surGeste, { capture: true })
      document.removeEventListener('visibilitychange', verifier)
      window.clearInterval(id)
    }
  }, [delaiMinutes, noter])

  if (secondes === null) return null
  return (
    <AvertissementInactivite
      secondes={secondes}
      onRester={() => {
        noter(Date.now())
        setSecondes(null)
      }}
      onPartir={() => {
        parti.current = true
        setSecondes(null)
        expirer.current()
      }}
    />
  )
}

/**
 * Le préavis : une minute avant la fermeture.
 *
 * Tout geste le referme — le bouton n'est là que pour qui cherche où
 * cliquer. Il dit ce qui serait perdu : c'est la raison d'être du préavis.
 */
export function AvertissementInactivite({
  secondes,
  onRester,
  onPartir,
}: {
  secondes: number
  onRester: () => void
  onPartir: () => void
}) {
  return (
    <div className={s.voile}>
      <div
        className={s.carte}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inactivite-titre"
        aria-describedby="inactivite-texte"
      >
        <h2 id="inactivite-titre" className={s.titre}>
          Toujours là ?
        </h2>
        {/* Le décompte n'est pas annoncé seconde par seconde : la boîte
            l'est une fois, à son ouverture, et c'est assez. */}
        <p id="inactivite-texte" className={s.texte}>
          Sans geste de votre part, votre session se fermera sur cet appareil dans{' '}
          <strong className={s.decompte}>{plural(secondes, 'seconde', 'secondes')}</strong>. Ce qui
          n'est pas encore enregistré serait perdu.
        </p>
        <div className={s.actions}>
          <Button variant="primary" autoFocus onClick={onRester}>
            Je suis là
          </Button>
          <Button variant="ghost" onClick={onPartir}>
            Me déconnecter maintenant
          </Button>
        </div>
      </div>
    </div>
  )
}
