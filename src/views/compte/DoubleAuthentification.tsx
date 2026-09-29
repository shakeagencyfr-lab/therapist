import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, Notice, TextInput, Title } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { LONGUEUR_CODE_TOTP, cleLisible, codeTotpComplet, normaliserCodeTotp } from '@/lib/doubleAuthentification'
import { dateLongue } from '@/lib/format'
import {
  abandonnerInscription,
  commencerInscription,
  confirmerInscription,
  desactiverDoubleAuth,
  lireDoubleAuth,
  type Inscription,
} from '@/services/securiteDuCompte'
import s from './Securite.module.css'

/** Où en est la carte. */
type Etape =
  | { nom: 'lecture' }
  | { nom: 'erreur'; message: string }
  | { nom: 'inactive' }
  | { nom: 'inscription'; inscription: Inscription }
  | { nom: 'active'; facteurId: string; depuis: string | null }
  | { nom: 'desactivation'; facteurId: string; depuis: string | null }

/**
 * Activer ou désactiver la double authentification.
 *
 * FACULTATIVE, comme le mot de passe : elle s'active ici, par qui le veut.
 * Une fois active, chaque connexion demande, en plus du lien ou du mot de
 * passe, le code de l'application — et la base ne rend aucun dossier à une
 * session qui ne l'a pas donné (0056).
 *
 * Le QR code arrive du service en SVG : il s'affiche dans une <img>, par une
 * adresse `data:` (src/lib/doubleAuthentification.ts) — jamais injecté dans
 * la page. La clé s'affiche en clair pour qui ne peut pas scanner, et
 * disparaît de l'écran une fois l'activation faite : elle n'est rangée nulle
 * part par nous.
 */
export function DoubleAuthentification() {
  const auth = useMaybeAuth()
  const [etape, setEtape] = useState<Etape>({ nom: 'lecture' })
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [copiee, setCopiee] = useState(false)

  const protege = auth?.context?.cabinet ? 'les dossiers de vos patients' : 'votre espace'

  async function lire() {
    setEtape({ nom: 'lecture' })
    const r = await lireDoubleAuth()
    if (!r.ok) {
      setEtape({ nom: 'erreur', message: r.message })
      return
    }
    setEtape(
      r.valeur.facteur
        ? { nom: 'active', facteurId: r.valeur.facteur.id, depuis: r.valeur.facteur.depuis }
        : { nom: 'inactive' },
    )
  }

  useEffect(() => {
    void lire()
  }, [])

  async function commencer() {
    setEnvoi(true)
    setNotice(null)
    setCode('')
    setCopiee(false)
    const r = await commencerInscription()
    setEnvoi(false)
    if (!r.ok) {
      setNotice({ tone: 'warn', text: r.message })
      return
    }
    setEtape({ nom: 'inscription', inscription: r.valeur })
  }

  async function activer(e: FormEvent, inscription: Inscription) {
    e.preventDefault()
    if (!codeTotpComplet(code) || envoi) return
    setEnvoi(true)
    setNotice(null)
    const r = await confirmerInscription(inscription.factorId, code)
    setEnvoi(false)
    setCode('')
    if (!r.ok) {
      // L'inscription reste ouverte : on corrige le code, pas tout le reste.
      setNotice({ tone: 'warn', text: r.message })
      return
    }
    setNotice({
      tone: 'ok',
      text: r.valeur.autresFermes
        ? 'La double authentification est active. Vos autres appareils ont été déconnectés : ils vous demanderont le code à la prochaine connexion.'
        : "La double authentification est active. Vos autres appareils n'ont pas pu être déconnectés : faites-le depuis « Vos appareils », plus bas.",
    })
    await auth?.relireSecondFacteur()
    await lire()
  }

  async function annulerInscription(inscription: Inscription) {
    setEnvoi(true)
    await abandonnerInscription(inscription.factorId)
    setEnvoi(false)
    setCode('')
    setNotice(null)
    setEtape({ nom: 'inactive' })
  }

  async function desactiver(e: FormEvent, facteurId: string) {
    e.preventDefault()
    if (!codeTotpComplet(code) || envoi) return
    setEnvoi(true)
    setNotice(null)
    const r = await desactiverDoubleAuth(facteurId, code)
    setEnvoi(false)
    setCode('')
    if (!r.ok) {
      setNotice({ tone: 'warn', text: r.message })
      return
    }
    setNotice({ tone: 'ok', text: 'La double authentification est désactivée. Vos connexions ne demandent plus de code.' })
    await auth?.relireSecondFacteur()
    setEtape({ nom: 'inactive' })
  }

  async function copier(cle: string) {
    try {
      await navigator.clipboard.writeText(cle.replace(/\s+/g, ''))
      setCopiee(true)
    } catch {
      // Presse-papiers refusé : la clé reste lisible à l'écran.
      setCopiee(false)
    }
  }

  const active = etape.nom === 'active' || etape.nom === 'desactivation'

  /** Le champ du code, le même pour activer et pour désactiver. */
  const champCode = (
    <label className={s.champ}>
      <span className={s.label}>Code à {LONGUEUR_CODE_TOTP} chiffres</span>
      <TextInput
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(normaliserCodeTotp(e.target.value))}
        placeholder={'0'.repeat(LONGUEUR_CODE_TOTP)}
        className={s.code}
        disabled={envoi}
      />
    </label>
  )

  return (
    <Card className={s.bloc}>
      <div className={s.head}>
        <Title large as="h2">
          Double authentification
        </Title>
        {etape.nom === 'lecture' || etape.nom === 'erreur' ? null : (
          <span className={active ? s.etatActif : s.etat}>{active ? 'Active' : 'Inactive'}</span>
        )}
      </div>
      <p className={s.texte}>
        À chaque connexion, en plus du lien ou du mot de passe, un code à {LONGUEUR_CODE_TOTP} chiffres
        tiré d'une application d'authentification sur votre téléphone (Google Authenticator,
        Microsoft Authenticator, 1Password, Authy…). Quelqu'un qui obtiendrait votre mot de passe,
        ou l'accès à votre boîte aux lettres, n'ouvrirait pas {protege} pour autant.
      </p>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {etape.nom === 'lecture' ? <p className={s.muted}>Lecture de votre réglage…</p> : null}

      {etape.nom === 'erreur' ? (
        <>
          <Notice tone="warn">{etape.message}</Notice>
          <div className={s.actions}>
            <Button onClick={() => void lire()}>Réessayer</Button>
          </div>
        </>
      ) : null}

      {etape.nom === 'inactive' ? (
        <div className={s.actions}>
          <Button variant="primary" disabled={envoi} onClick={() => void commencer()}>
            {envoi ? 'Préparation…' : 'Activer la double authentification'}
          </Button>
        </div>
      ) : null}

      {etape.nom === 'inscription' ? (
        <form className={s.inscription} onSubmit={(e) => void activer(e, etape.inscription)}>
          <ol className={s.etapes}>
            <li>
              <span className={s.etapeTitre}>Scannez ce QR code avec votre application.</span>
              <img
                className={s.qr}
                src={etape.inscription.image}
                width={184}
                height={184}
                alt="QR code à scanner avec votre application d'authentification"
              />
            </li>
            <li>
              <span className={s.etapeTitre}>Impossible de scanner ? Saisissez cette clé à la main.</span>
              <div className={s.cle}>
                <code className={s.cleTexte}>{cleLisible(etape.inscription.cle)}</code>
                <Button variant="ghost" onClick={() => void copier(etape.inscription.cle)}>
                  {copiee ? 'Clé copiée' : 'Copier la clé'}
                </Button>
              </div>
              <span className={s.hint}>
                Notez-la en lieu sûr, hors de cet ordinateur : sur un nouveau téléphone, elle redonne
                les mêmes codes. Elle ne s'affichera plus une fois l'activation faite.
              </span>
            </li>
            <li>
              <span className={s.etapeTitre}>Saisissez le code affiché par l'application.</span>
              <div className={s.ligneCode}>
                {champCode}
                <div className={s.actions}>
                  <Button type="submit" variant="primary" disabled={envoi || !codeTotpComplet(code)}>
                    {envoi ? 'Vérification…' : 'Activer'}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={envoi}
                    onClick={() => void annulerInscription(etape.inscription)}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            </li>
          </ol>
        </form>
      ) : null}

      {etape.nom === 'active' ? (
        <>
          <p className={s.texte}>
            Active depuis le {dateLongue(etape.depuis)}. Chaque connexion vous demande le code de
            votre application ; sans lui, rien de votre espace ne s'ouvre.
          </p>
          <div className={s.actions}>
            <Button
              onClick={() => {
                setNotice(null)
                setCode('')
                setEtape({ nom: 'desactivation', facteurId: etape.facteurId, depuis: etape.depuis })
              }}
            >
              Désactiver…
            </Button>
          </div>
        </>
      ) : null}

      {etape.nom === 'desactivation' ? (
        <form className={s.inscription} onSubmit={(e) => void desactiver(e, etape.facteurId)}>
          <p className={s.texte}>
            Confirmez par un code de votre application : un ordinateur resté ouvert ne doit pas
            suffire à retirer cette protection.
          </p>
          <div className={s.ligneCode}>
            {champCode}
            <div className={s.actions}>
              <Button type="submit" variant="danger" disabled={envoi || !codeTotpComplet(code)}>
                {envoi ? 'Vérification…' : 'Désactiver'}
              </Button>
              <Button
                variant="ghost"
                disabled={envoi}
                onClick={() => {
                  setCode('')
                  setNotice(null)
                  setEtape({ nom: 'active', facteurId: etape.facteurId, depuis: etape.depuis })
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </Card>
  )
}
