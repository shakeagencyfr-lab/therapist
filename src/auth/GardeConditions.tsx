import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Marque, Notice } from '@/components/ui'
import { ouvert, useDroits } from '@/cabinet/droits'
import { cheminLegal } from '@/legal/chemins'
import { MISE_A_JOUR } from '@/legal/version'
import {
  ECHECS_AVANT_PASSAGE,
  LECTURES_AVANT_OUVERTURE,
  LIBELLE_CASE,
  PAUSE_ENTRE_LECTURES_MS,
} from '@/lib/conditions'
import { accepterConditions, lireConditions } from '@/services/conditions'
import { KLARO, logoDePorte } from '@/theme/klaro'
import { useAuth } from './session'
import p from './SignIn.module.css'
import s from './GardeConditions.module.css'

/**
 * L'acceptation des conditions générales, avant d'entrer dans l'espace.
 *
 * Posée par Root.tsx après la connexion et le second facteur, devant
 * l'espace d'un cabinet ou d'un revendeur — jamais devant celui d'une
 * personne suivie, qui a sa propre application (src/patient) et n'achète
 * rien à l'éditrice. Tant que le compte n'a pas accepté la version en cours
 * (src/legal/version.ts), l'espace ne s'ouvre pas : une case à cocher, deux
 * liens, un bouton. C'est ce qui rend les conditions opposables à un compte
 * ouvert par un revendeur, qui n'a jamais vu la page de vente.
 *
 * UNE PANNE NE FERME PAS LA PORTE (src/lib/conditions.ts). Une lecture qui
 * échoue se retente une fois, puis l'espace s'ouvre et l'échec est
 * journalisé ; un enregistrement qui échoue deux fois laisse entrer « pour
 * l'instant ». La question revient à la connexion suivante.
 */
export function GardeConditions({ children }: { children: ReactNode }) {
  const { session, context, seDeconnecter } = useAuth()
  const droits = useDroits()
  const utilisateur = session?.user.id ?? null

  const [etat, setEtat] = useState<'lecture' | 'a-accepter' | 'entree'>('lecture')
  const [miseAJour, setMiseAJour] = useState(false)

  useEffect(() => {
    if (!utilisateur) {
      setEtat('entree')
      return
    }
    let vivant = true
    void (async () => {
      for (let essai = 1; essai <= LECTURES_AVANT_OUVERTURE; essai++) {
        const lu = await lireConditions(MISE_A_JOUR)
        if (!vivant) return
        if (lu.ok) {
          setMiseAJour(lu.miseAJour)
          setEtat(lu.acceptee ? 'entree' : 'a-accepter')
          return
        }
        if (essai < LECTURES_AVANT_OUVERTURE) {
          await new Promise((r) => setTimeout(r, PAUSE_ENTRE_LECTURES_MS))
          if (!vivant) return
        } else {
          // Le motif seulement : aucune donnée du compte n'est journalisée.
          console.error(`[conditions] lecture impossible, l'espace s'ouvre sans elle — ${lu.message}`)
        }
      }
      if (vivant) setEtat('entree')
    })()
    return () => {
      vivant = false
    }
  }, [utilisateur])

  const accepter = useCallback(async () => {
    const r = await accepterConditions(MISE_A_JOUR)
    if (r.ok) setEtat('entree')
    else console.error(`[conditions] acceptation non enregistrée — ${r.message}`)
    return r.ok
  }, [])

  if (etat === 'entree') return <>{children}</>

  /* LA MARQUE BLANCHE NE MONTRE PAS KLARO. Tant que l'offre du cabinet n'est
     pas lue, on attend : mieux vaut une seconde de plus qu'un logo Klaro
     entrevu chez un cabinet qui a payé pour ne pas le voir. Une offre
     illisible compte comme une marque blanche (`ouvert`). */
  const cabinet = context?.cabinet ?? null
  if (etat === 'lecture' || (cabinet && droits?.chargement)) {
    return (
      <div className={p.page}>
        <span className={s.attente}>Vérification de votre accès…</span>
      </div>
    )
  }
  const neutre = Boolean(cabinet) && ouvert(droits, 'marqueBlanche')
  const marque =
    neutre && cabinet
      ? {
          nom: cabinet.name,
          logo: cabinet.branding?.logo ?? '',
          logoUrl: cabinet.branding?.logoUrl ?? null,
          tagline: cabinet.tagline,
        }
      : null

  return (
    <CarteConditions
      neutre={neutre}
      cabinet={marque}
      miseAJour={miseAJour}
      accepter={accepter}
      passer={() => setEtat('entree')}
      seDeconnecter={() => void seDeconnecter()}
    />
  )
}

/**
 * La carte elle-même — sans session ni base, pour que le banc de rendu
 * l'affiche. Les gestes arrivent par les props.
 */
export function CarteConditions({
  neutre,
  cabinet,
  miseAJour,
  accepter,
  passer,
  seDeconnecter,
}: {
  /** Marque blanche : ni le nom ni le logo de Klaro. */
  neutre: boolean
  /** La marque du cabinet, quand la carte est neutre. */
  cabinet: { nom: string; logo: string; logoUrl: string | null; tagline: string } | null
  /** Le compte avait accepté une version antérieure. */
  miseAJour: boolean
  /** Enregistre l'acceptation ; rend vrai si elle est enregistrée. */
  accepter: () => Promise<boolean>
  /** Entrer malgré un enregistrement qui échoue. */
  passer: () => void
  seDeconnecter: () => void
}) {
  const base = useId()
  const [coche, setCoche] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const [echecs, setEchecs] = useState(0)
  const caseRef = useRef<HTMLInputElement | null>(null)

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    if (envoi) return
    if (!coche) {
      setErreur('Cochez la case pour continuer : l’espace s’ouvre aux conditions que vous acceptez.')
      caseRef.current?.focus()
      return
    }
    setEnvoi(true)
    setErreur('')
    const ok = await accepter()
    setEnvoi(false)
    if (!ok) {
      setEchecs((n) => n + 1)
      setErreur('Votre acceptation n’a pas pu être enregistrée. Réessayez dans un instant.')
    }
  }

  const nom = neutre ? (cabinet?.nom ?? '') : KLARO.nom
  const date = MISE_A_JOUR
  const lienOnglet = { target: '_blank', rel: 'noopener noreferrer' } as const

  return (
    <div className={p.page}>
      <div className={`${p.card} ${s.carte}`}>
        {nom ? (
          <div className={p.brand}>
            <Marque
              className={p.logo}
              logo={neutre ? (cabinet?.logo ?? '') : 'KL'}
              url={logoDePorte(nom, neutre ? (cabinet?.logoUrl ?? null) : null)}
            />
            <div>
              <div className={p.name}>{nom}</div>
              <div className={p.tagline}>{neutre ? cabinet?.tagline || 'Espace thérapie' : KLARO.slogan}</div>
            </div>
          </div>
        ) : null}

        <h1 className={p.title}>{neutre ? 'Avant d’entrer dans votre espace' : 'Avant d’entrer dans Klaro'}</h1>
        <p className={p.intro}>
          {miseAJour
            ? `Les conditions générales de vente et d’utilisation du service ont changé le ${date}. Lisez-les, puis acceptez-les pour continuer.`
            : `Pour utiliser votre espace, lisez et acceptez les conditions générales de vente et d’utilisation du service, dans leur version du ${date}.`}
        </p>

        <ul className={s.documents}>
          <li>
            <a href={cheminLegal('cgv')} {...lienOnglet}>
              Conditions générales de vente<span className={s.horsEcran}> (nouvel onglet)</span>
            </a>
          </li>
          <li>
            <a href={cheminLegal('conditions')} {...lienOnglet}>
              Conditions générales d’utilisation<span className={s.horsEcran}> (nouvel onglet)</span>
            </a>
          </li>
        </ul>

        <form onSubmit={soumettre} noValidate>
          <div className={s.case}>
            <input
              ref={caseRef}
              id={`${base}-case`}
              type="checkbox"
              checked={coche}
              onChange={(e) => {
                setCoche(e.target.checked)
                if (e.target.checked) setErreur('')
              }}
              aria-invalid={erreur && !coche ? true : undefined}
              aria-describedby={erreur ? `${base}-erreur` : undefined}
              required
            />
            <label htmlFor={`${base}-case`}>{LIBELLE_CASE}</label>
          </div>

          {erreur ? (
            <div id={`${base}-erreur`} role="alert">
              <Notice tone="warn" style={{ marginBottom: 14 }}>
                {erreur}
              </Notice>
            </div>
          ) : null}

          <div className={p.actions}>
            <Button type="submit" variant="primary" big disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Accepter et continuer'}
            </Button>
            {/* La base ne suit pas : la personne a coché et cliqué, elle entre.
                La question reviendra à la connexion suivante. */}
            {echecs >= ECHECS_AVANT_PASSAGE ? (
              <Button type="button" variant="secondary" onClick={passer}>
                Continuer pour l’instant
              </Button>
            ) : null}
          </div>
        </form>

        <button type="button" className={p.bascule} onClick={seDeconnecter}>
          Me déconnecter
        </button>
      </div>
    </div>
  )
}
