/**
 * Le formulaire de demande d'essai.
 *
 * Chaque champ a son étiquette, dit s'il est facultatif, et porte son erreur
 * juste en dessous — liée par `aria-describedby`, lue par un lecteur d'écran
 * au moment où le champ prend le focus. À l'envoi raté, le focus va au
 * premier champ à reprendre : une liste d'erreurs en haut d'un long
 * formulaire ne se lit pas sur un téléphone.
 *
 * LE CHAMP PIÈGE. Invisible et hors de la tabulation, il n'est rempli que par
 * un robot. Rempli, la demande n'est pas envoyée, et l'écran remercie comme
 * pour une vraie : un refus apprendrait au robot quoi éviter. Le serveur fait
 * la même vérification (server/demandes.ts).
 */
import { lazy, Suspense, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  BORNES,
  confirmation,
  FOURCHETTES,
  OFFRES_DEMANDEES,
  premierChampEnDefaut,
  SAISIE_VIDE,
  validerDemande,
  type ChampDemande,
  type SaisieDemande,
} from '@/lib/demandeEssai'
import { CHEMIN_CGU, CHEMIN_CGV, CHEMIN_CONFIDENTIALITE, EDITEUR } from './contenu'
import { envoyerDemande } from './envoi'
import s from './PageDeVente.module.css'

const CaptchaDemande = lazy(() => import('./CaptchaDemande'))

// `import.meta.env` n'existe que sous Vite : le banc de rendu passe sans.
const env = import.meta.env ?? {}
const CLE_CAPTCHA = String(env.VITE_HCAPTCHA_SITE_KEY ?? '').trim()

type Etat = 'saisie' | 'envoi' | 'envoyee'

/** Une autre issue que « réessayez », quand une adresse de contact est connue. */
function Secours() {
  if (!EDITEUR.contact) return null
  return (
    <>
      {' '}
      Si cela persiste, écrivez-nous à <a href={`mailto:${EDITEUR.contact}`}>{EDITEUR.contact}</a>.
    </>
  )
}

function Champ({
  id,
  libelle,
  facultatif,
  erreur,
  aide,
  children,
}: {
  id: string
  libelle: string
  facultatif?: boolean
  erreur?: string
  aide?: string
  children: ReactNode
}) {
  return (
    <div className={s.champ}>
      <label className={s.etiquette} htmlFor={id}>
        {libelle}
        {facultatif ? <span className={s.facultatif}> (facultatif)</span> : null}
      </label>
      {aide ? (
        <p className={s.aide} id={`${id}-aide`}>
          {aide}
        </p>
      ) : null}
      {children}
      {erreur ? (
        <p className={s.erreur} id={`${id}-erreur`}>
          {erreur}
        </p>
      ) : null}
    </div>
  )
}

export function Formulaire({ offreProposee }: { offreProposee: string }) {
  const base = useId()
  const id = (champ: ChampDemande) => `${base}-${champ}`
  const [saisie, setSaisie] = useState<SaisieDemande>(SAISIE_VIDE)
  const [erreurs, setErreurs] = useState<Partial<Record<ChampDemande, string>>>({})
  const [etat, setEtat] = useState<Etat>('saisie')
  const [refus, setRefus] = useState('')
  /** Le refus vient-il du serveur ? Alors on propose une autre issue. */
  const [refusServeur, setRefusServeur] = useState(false)
  const [merci, setMerci] = useState('')
  const [piege, setPiege] = useState('')
  const [jeton, setJeton] = useState<string | undefined>(undefined)
  const [remise, setRemise] = useState(0)
  const formulaire = useRef<HTMLFormElement | null>(null)
  const annonce = useRef<HTMLDivElement | null>(null)

  /* Une offre choisie plus haut, sur sa carte, arrive cochée ici. */
  useEffect(() => {
    if (offreProposee) setSaisie((prev) => ({ ...prev, offre: offreProposee }))
  }, [offreProposee])

  function changer<K extends ChampDemande>(champ: K, valeur: SaisieDemande[K]) {
    setSaisie((prev) => ({ ...prev, [champ]: valeur }))
    // Une erreur corrigée disparaît dès la frappe ; les autres attendent l'envoi.
    if (erreurs[champ]) setErreurs((prev) => ({ ...prev, [champ]: undefined }))
  }

  function focaliser(champ: ChampDemande | null) {
    if (!champ) return
    const cible = formulaire.current?.querySelector<HTMLElement>(`[data-champ="${champ}"]`)
    cible?.focus()
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    if (etat === 'envoi') return
    setRefus('')
    setRefusServeur(false)

    const verdict = validerDemande(saisie)
    if (!verdict.ok) {
      setErreurs(verdict.erreurs)
      focaliser(premierChampEnDefaut(verdict.erreurs))
      return
    }
    setErreurs({})

    // Le robot reçoit un « merci », et rien ne part.
    if (piege.trim()) {
      setMerci(confirmation(verdict.demande))
      setEtat('envoyee')
      return
    }

    if (CLE_CAPTCHA && !jeton) {
      setRefus('Cochez la case « Je suis un humain » avant d’envoyer : elle nous protège des robots.')
      return
    }

    setEtat('envoi')
    const issue = await envoyerDemande(saisie, { piege, captcha: jeton })
    // Un jeton ne sert qu'une fois : le suivant se regagne.
    setJeton(undefined)
    setRemise((n) => n + 1)
    if (issue.ok) {
      setMerci(issue.message)
      setEtat('envoyee')
      return
    }
    setEtat('saisie')
    if (issue.erreurs && Object.keys(issue.erreurs).length) {
      setErreurs(issue.erreurs)
      focaliser(premierChampEnDefaut(issue.erreurs))
    }
    setRefus(issue.message)
    setRefusServeur(!issue.erreurs || !Object.keys(issue.erreurs).length)
  }

  /* La confirmation prend le focus : c'est la réponse à ce qu'on vient de faire. */
  useEffect(() => {
    if (etat === 'envoyee') annonce.current?.focus()
  }, [etat])

  if (etat === 'envoyee') {
    return (
      <div className={s.merci} ref={annonce} tabIndex={-1} role="status">
        <p className={s.merciTitre}>Demande envoyée</p>
        <p className={s.merciTexte}>{merci}</p>
        <p className={s.merciTexte}>
          En attendant, vous pouvez relire <a href="#confidentialite">ce que devient la voix</a> ou{' '}
          <a href="#questions">les questions fréquentes</a>.
        </p>
      </div>
    )
  }

  const decrit = (champ: ChampDemande, aide = false) =>
    [aide ? `${id(champ)}-aide` : '', erreurs[champ] ? `${id(champ)}-erreur` : ''].filter(Boolean).join(' ') ||
    undefined

  return (
    <form ref={formulaire} className={s.formulaire} onSubmit={soumettre} noValidate aria-describedby={`${base}-legende`}>
      <p className={s.legendeFormulaire} id={`${base}-legende`}>
        Tous les champs sont obligatoires, sauf mention contraire.
      </p>

      <div className={s.grille}>
        <Champ id={id('nom')} libelle="Prénom et nom" erreur={erreurs.nom}>
          <input
            id={id('nom')}
            data-champ="nom"
            className={s.saisie}
            type="text"
            autoComplete="name"
            maxLength={BORNES.nom[1]}
            value={saisie.nom}
            onChange={(e) => changer('nom', e.target.value)}
            aria-invalid={Boolean(erreurs.nom)}
            aria-describedby={decrit('nom')}
            required
          />
        </Champ>

        <Champ id={id('email')} libelle="Adresse électronique" erreur={erreurs.email}>
          <input
            id={id('email')}
            data-champ="email"
            className={s.saisie}
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={BORNES.email[1]}
            value={saisie.email}
            onChange={(e) => changer('email', e.target.value)}
            aria-invalid={Boolean(erreurs.email)}
            aria-describedby={decrit('email')}
            required
          />
        </Champ>

        <Champ id={id('telephone')} libelle="Téléphone" facultatif erreur={erreurs.telephone}>
          <input
            id={id('telephone')}
            data-champ="telephone"
            className={s.saisie}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={BORNES.telephone[1]}
            value={saisie.telephone}
            onChange={(e) => changer('telephone', e.target.value)}
            aria-invalid={Boolean(erreurs.telephone)}
            aria-describedby={decrit('telephone')}
          />
        </Champ>

        <Champ id={id('cabinet')} libelle="Nom du cabinet, ou votre nom" erreur={erreurs.cabinet}>
          <input
            id={id('cabinet')}
            data-champ="cabinet"
            className={s.saisie}
            type="text"
            autoComplete="organization"
            maxLength={BORNES.cabinet[1]}
            value={saisie.cabinet}
            onChange={(e) => changer('cabinet', e.target.value)}
            aria-invalid={Boolean(erreurs.cabinet)}
            aria-describedby={decrit('cabinet')}
            required
          />
        </Champ>

        <Champ id={id('ville')} libelle="Ville" erreur={erreurs.ville}>
          <input
            id={id('ville')}
            data-champ="ville"
            className={s.saisie}
            type="text"
            autoComplete="address-level2"
            maxLength={BORNES.ville[1]}
            value={saisie.ville}
            onChange={(e) => changer('ville', e.target.value)}
            aria-invalid={Boolean(erreurs.ville)}
            aria-describedby={decrit('ville')}
            required
          />
        </Champ>
      </div>

      <fieldset
        className={s.choix}
        aria-describedby={erreurs.patients ? `${id('patients')}-erreur` : undefined}
      >
        <legend className={s.etiquette}>Combien de patients suivez-vous ?</legend>
        <div className={s.options}>
          {FOURCHETTES.map((f, i) => (
            <label key={f.valeur} className={s.option}>
              <input
                type="radio"
                name={`${base}-patients`}
                value={f.valeur}
                data-champ={i === 0 ? 'patients' : undefined}
                aria-invalid={Boolean(erreurs.patients)}
                checked={saisie.patients === f.valeur}
                onChange={() => changer('patients', f.valeur)}
              />
              <span>{f.libelle}</span>
            </label>
          ))}
        </div>
        {erreurs.patients ? (
          <p className={s.erreur} id={`${id('patients')}-erreur`}>
            {erreurs.patients}
          </p>
        ) : null}
      </fieldset>

      <fieldset
        className={s.choix}
        aria-describedby={erreurs.offre ? `${id('offre')}-erreur` : undefined}
      >
        <legend className={s.etiquette}>Quelle offre vous intéresse ?</legend>
        <div className={s.options}>
          {OFFRES_DEMANDEES.map((o, i) => (
            <label key={o.valeur} className={s.option}>
              <input
                type="radio"
                name={`${base}-offre`}
                value={o.valeur}
                data-champ={i === 0 ? 'offre' : undefined}
                aria-invalid={Boolean(erreurs.offre)}
                checked={saisie.offre === o.valeur}
                onChange={() => changer('offre', o.valeur)}
              />
              <span>{o.libelle}</span>
            </label>
          ))}
        </div>
        {erreurs.offre ? (
          <p className={s.erreur} id={`${id('offre')}-erreur`}>
            {erreurs.offre}
          </p>
        ) : null}
      </fieldset>

      <Champ
        id={id('message')}
        libelle="Un mot sur votre pratique"
        facultatif
        aide="Ce que vous attendez d’un suivi entre les séances, vos questions. Ne mentionnez aucun patient."
        erreur={erreurs.message}
      >
        <textarea
          id={id('message')}
          data-champ="message"
          className={s.saisie}
          rows={4}
          maxLength={BORNES.message[1]}
          value={saisie.message}
          onChange={(e) => changer('message', e.target.value)}
          aria-invalid={Boolean(erreurs.message)}
          aria-describedby={decrit('message', true)}
        />
      </Champ>

      {/* Le piège : hors de l'écran, hors de la tabulation, ignoré des
          lecteurs d'écran et du remplissage automatique. */}
      <div className={s.piege} aria-hidden="true">
        <label htmlFor={`${base}-site`}>Ne remplissez pas ce champ</label>
        <input
          id={`${base}-site`}
          name="site_internet"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={piege}
          onChange={(e) => setPiege(e.target.value)}
        />
      </div>

      <div className={s.consentement}>
        <input
          id={id('consentement')}
          data-champ="consentement"
          type="checkbox"
          checked={saisie.consentement}
          onChange={(e) => changer('consentement', e.target.checked)}
          aria-invalid={Boolean(erreurs.consentement)}
          aria-describedby={erreurs.consentement ? `${id('consentement')}-erreur` : undefined}
          required
        />
        <label htmlFor={id('consentement')}>
          J’accepte que l’on me recontacte au sujet de cette demande, par courriel ou par téléphone.
          Ces informations ne servent qu’à cela ; je peux demander leur effacement à tout moment.
        </label>
      </div>
      {erreurs.consentement ? (
        <p className={s.erreur} id={`${id('consentement')}-erreur`}>
          {erreurs.consentement}
        </p>
      ) : null}

      {/* LES CONDITIONS, UNE CASE À PART. Jamais cochée d'avance, distincte
          du recontact et du bouton : c'est ce qui rend les conditions
          opposables (code civil, art. 1119 et 1127-1). Les deux documents
          s'ouvrent dans un nouvel onglet — la saisie reste là. Le serveur et
          la base refusent une demande sans elle (server/demandes.ts, 0067). */}
      <div className={s.consentement}>
        <input
          id={id('conditions')}
          data-champ="conditions"
          type="checkbox"
          checked={saisie.conditions}
          onChange={(e) => changer('conditions', e.target.checked)}
          aria-invalid={Boolean(erreurs.conditions)}
          aria-describedby={erreurs.conditions ? `${id('conditions')}-erreur` : undefined}
          required
        />
        <label htmlFor={id('conditions')}>
          J’ai lu et j’accepte les{' '}
          <a href={CHEMIN_CGV} target="_blank" rel="noopener noreferrer">
            conditions générales de vente<span className={s.horsEcran}> (nouvel onglet)</span>
          </a>{' '}
          et{' '}
          <a href={CHEMIN_CGU} target="_blank" rel="noopener noreferrer">
            d’utilisation<span className={s.horsEcran}> (nouvel onglet)</span>
          </a>
          .
        </label>
      </div>
      {erreurs.conditions ? (
        <p className={s.erreur} id={`${id('conditions')}-erreur`}>
          {erreurs.conditions}
        </p>
      ) : null}

      {CLE_CAPTCHA ? (
        <div className={s.captcha}>
          <Suspense fallback={<p className={s.aide}>Chargement de la vérification anti-robot…</p>}>
            <CaptchaDemande cle={CLE_CAPTCHA} onJeton={setJeton} remise={remise} />
          </Suspense>
        </div>
      ) : null}

      <div aria-live="assertive" className={s.annonce}>
        {refus ? (
          <p className={s.refus}>
            {refus}
            {refusServeur ? <Secours /> : null}
          </p>
        ) : null}
      </div>

      <button type="submit" className={`${s.bouton} ${s.boutonPlein} ${s.boutonLarge}`} disabled={etat === 'envoi'}>
        {etat === 'envoi' ? 'Envoi…' : 'Envoyer ma demande'}
      </button>
      {/* Ce que devient ce qu'on vient d'écrire, dit AVANT l'envoi (RGPD,
          art. 13) : qui le lit, pour quoi faire, et comment le reprendre. */}
      <p className={s.aide}>
        Vos réponses sont lues par l’équipe {EDITEUR.nom} pour vous recontacter au sujet de cet essai,
        et pour rien d’autre. Vous pouvez demander à tout moment à les consulter, les corriger ou les effacer
        {EDITEUR.contact ? (
          <>
            {' '}
            en écrivant à <a href={`mailto:${EDITEUR.contact}`}>{EDITEUR.contact}</a>
          </>
        ) : null}
        . Voir aussi <a href={CHEMIN_CONFIDENTIALITE}>la politique de confidentialité</a>.
      </p>
    </form>
  )
}
