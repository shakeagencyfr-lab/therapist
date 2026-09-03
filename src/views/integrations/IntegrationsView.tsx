import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Notice, Overline, TextInput, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import {
  agirIntegration,
  lireIntegrations,
  type ActionIntegration,
  type EtatIntegrations,
} from '@/services/integrations'
import { MotDePasse } from './MotDePasse'
import s from './IntegrationsView.module.css'

/** « 1 septembre 2026 » */
function dateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Réglages du cabinet : les trois services extérieurs que la praticienne
 * relie à son espace.
 *
 * Rien ici ne touche la base directement : chaque geste part au serveur,
 * qui vérifie la clé par un vrai appel avant de l'enregistrer, chiffrée.
 * L'écran ne reçoit jamais une clé — seulement le fait qu'elle existe.
 */
export function IntegrationsView() {
  const cabinet = useMaybeCabinet()
  const [etat, setEtat] = useState<EtatIntegrations | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [notice, setNotice] = useState('')
  /** Le geste en cours, pour n'afficher qu'un seul « Vérification… » à la fois. */
  const [enCours, setEnCours] = useState<string>('')

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur('')
    try {
      setEtat(await lireIntegrations())
    } catch (err) {
      setErreur((err as Error).message)
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    if (cabinet?.reel) void charger()
    else setChargement(false)
  }, [cabinet?.reel, charger])

  async function agir(action: ActionIntegration, confirmation: string) {
    setEnCours(action.action)
    setErreur('')
    setNotice('')
    try {
      setEtat(await agirIntegration(action))
      // Le dossier du cabinet porte aussi ces réglages — l'aperçu du
      // téléphone y lit la prise de rendez-vous. Sans cette relecture, il
      // gardait l'état d'avant jusqu'au prochain chargement de la page : les
      // réglages disaient « widget intégré » et l'aperçu montrait un bouton.
      await cabinet?.recharger()
      setNotice(confirmation)
    } catch (err) {
      setErreur((err as Error).message)
    } finally {
      setEnCours('')
    }
  }

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div>
          <div className={s.crumb}>
            <Overline>Réglages du cabinet</Overline>
          </div>
          <h1 className={s.h1}>Intégrations</h1>
        </div>
      </div>
      <p className={s.intro}>
        Les services extérieurs que vous reliez à votre espace. Chaque clé est vérifiée par un vrai
        appel avant d'être enregistrée, puis chiffrée : elle ne réapparaît jamais à l'écran, et
        personne au cabinet ni chez votre revendeur ne peut la relire.
      </p>

      {!cabinet?.reel ? (
        <Card>
          <p className={s.muted}>
            Fiches de démonstration. Connectez-vous à votre cabinet pour relier vos services.
          </p>
        </Card>
      ) : chargement && !etat ? (
        <Card>
          <p className={s.muted}>Lecture des réglages…</p>
        </Card>
      ) : (
        <>
          {erreur ? <Notice tone="warn">{erreur}</Notice> : null}
          {notice ? <Notice tone="ok">{notice}</Notice> : null}

          {etat?.maquette ? (
            <Notice tone="warn">
              <strong>Le serveur tourne en mode maquette.</strong> Les analyses de séance sont des
              textes écrits d'avance : aucune clé n'est appelée, et celle que vous poseriez ici ne
              servirait à rien. Retirez la variable <code>AI_MOCK</code> de l'environnement du
              serveur, puis redéployez.
            </Notice>
          ) : null}

          {etat && !etat.chiffrement ? (
            <Notice tone="warn">
              Le serveur ne peut pas encore chiffrer les clés (variable <code>INTEGRATIONS_KEY</code>{' '}
              absente). Tant qu'elle n'est pas posée, l'enregistrement d'une clé est refusé plutôt
              que fait en clair. L'adresse de réservation, elle, peut déjà être réglée.
            </Notice>
          ) : null}

          {etat ? (
            <div className={s.grid}>
              <CleAnthropic etat={etat} enCours={enCours} onAgir={agir} />
              <CleStripe etat={etat} enCours={enCours} onAgir={agir} />
              <RendezVous etat={etat} enCours={enCours} onAgir={agir} />
              <MotDePasse />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

interface BlocProps {
  etat: EtatIntegrations
  enCours: string
  onAgir: (action: ActionIntegration, confirmation: string) => Promise<void>
}

/* ---- Analyse des séances ------------------------------------------- */

function CleAnthropic({ etat, enCours, onAgir }: BlocProps) {
  const [cle, setCle] = useState('')
  const posee = etat.anthropic
  const occupe = enCours === 'anthropic' || enCours === 'anthropic-retirer'

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Analyse des séances
        </Title>
        <span className={posee ? s.etatOn : s.etatOff}>{posee ? 'Clé active' : 'Aucune clé'}</span>
      </div>
      <p className={s.blocText}>
        La rédaction des notes, des modules, des affirmations et du profil passe par le service
        d'analyse d'Anthropic. Avec votre propre clé, ces appels sont facturés sur votre compte
        Anthropic.{' '}
        {etat.cleplateforme
          ? 'Sans clé, ils utilisent celle de la plateforme.'
          : "Sans clé, aucune analyse n'est possible pour l'instant."}
      </p>

      {posee ? (
        <div className={s.posee}>
          <span className={s.poseeText}>
            <span className={s.mono}>sk-ant-{posee.hint}</span> · ajoutée le {dateLongue(posee.setAt)}
          </span>
          <Button
            variant="ghost"
            disabled={occupe}
            onClick={() => void onAgir({ action: 'anthropic-retirer' }, 'Clé Anthropic retirée.')}
          >
            {enCours === 'anthropic-retirer' ? 'Retrait…' : 'Retirer'}
          </Button>
        </div>
      ) : (
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault()
            void onAgir({ action: 'anthropic', key: cle }, 'Clé Anthropic vérifiée et enregistrée.').then(() =>
              setCle(''),
            )
          }}
        >
          <label className={s.field}>
            <span className={s.label}>Clé d'API Anthropic</span>
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={cle}
              onChange={(e) => setCle(e.target.value)}
              placeholder="sk-ant-…"
              disabled={!etat.chiffrement || occupe}
            />
            <span className={s.hint}>
              Créée dans votre console Anthropic. Elle est vérifiée par un appel réel avant d'être
              enregistrée.
            </span>
          </label>
          <Button variant="primary" type="submit" disabled={!etat.chiffrement || occupe || !cle.trim()}>
            {enCours === 'anthropic' ? 'Vérification…' : 'Vérifier et enregistrer'}
          </Button>
        </form>
      )}
    </Card>
  )
}

/* ---- Paiements ---------------------------------------------------------- */

function CleStripe({ etat, enCours, onAgir }: BlocProps) {
  const [cle, setCle] = useState('')
  const posee = etat.stripe
  const occupe = enCours === 'stripe' || enCours === 'stripe-retirer' || enCours === 'boutique'

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Paiements
        </Title>
        <span className={posee ? s.etatOn : s.etatOff}>{posee ? 'Stripe connecté' : 'Non connecté'}</span>
      </div>
      <p className={s.blocText}>
        Votre compte Stripe encaisse directement ce que vos patients achètent dans votre boutique
        : audios, séances, programmes. L'argent arrive chez vous, sans intermédiaire.
      </p>

      {posee ? (
        <>
          <div className={s.posee}>
            <span className={s.poseeText}>
              {posee.label ? <strong>{posee.label}</strong> : null}
              {posee.label ? ' · ' : ''}
              <span className={s.mono}>{posee.hint}</span> · connecté le {dateLongue(posee.setAt)}
            </span>
            <Button
              variant="ghost"
              disabled={occupe}
              onClick={() =>
                void onAgir({ action: 'stripe-retirer' }, 'Compte Stripe déconnecté. La boutique est fermée.')
              }
            >
              {enCours === 'stripe-retirer' ? 'Déconnexion…' : 'Déconnecter'}
            </Button>
          </div>

          <div className={s.toggleRow}>
            <span className={s.toggleText}>
              <span className={s.toggleTitle}>Boutique en ligne</span>
              <span className={s.hint}>
                {etat.shopEnabled
                  ? 'Ouverte : vos patients voient vos produits dans leur espace.'
                  : 'Fermée : vos produits restent invisibles tant que vous ne l’ouvrez pas.'}
              </span>
            </span>
            <Button
              variant={etat.shopEnabled ? 'secondary' : 'primary'}
              disabled={occupe}
              onClick={() =>
                void onAgir(
                  { action: 'boutique', enabled: !etat.shopEnabled },
                  etat.shopEnabled ? 'Boutique fermée.' : 'Boutique ouverte.',
                )
              }
            >
              {enCours === 'boutique' ? '…' : etat.shopEnabled ? 'Fermer la boutique' : 'Ouvrir la boutique'}
            </Button>
          </div>
        </>
      ) : (
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault()
            void onAgir({ action: 'stripe', key: cle }, 'Compte Stripe vérifié et connecté.').then(() =>
              setCle(''),
            )
          }}
        >
          <label className={s.field}>
            <span className={s.label}>Clé secrète Stripe</span>
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={cle}
              onChange={(e) => setCle(e.target.value)}
              placeholder="sk_live_… ou rk_live_…"
              disabled={!etat.chiffrement || occupe}
            />
            <span className={s.hint}>
              Tableau de bord Stripe → Développeurs → Clés d'API. Une clé restreinte suffit si elle
              peut lire le compte et créer des paiements.
            </span>
          </label>
          <Button variant="primary" type="submit" disabled={!etat.chiffrement || occupe || !cle.trim()}>
            {enCours === 'stripe' ? 'Vérification…' : 'Vérifier et connecter'}
          </Button>
        </form>
      )}
    </Card>
  )
}

/* ---- Prise de rendez-vous ------------------------------------------------- */

function RendezVous({ etat, enCours, onAgir }: BlocProps) {
  const posee = Boolean(etat.bookingUrl)
  const [mode, setMode] = useState<'bouton' | 'widget'>(etat.bookingMode)
  /** L'adresse, en mode bouton. Repartir vide quand un widget est en place. */
  const [url, setUrl] = useState(etat.bookingMode === 'bouton' ? (etat.bookingUrl ?? '') : '')
  /** Le code d'intégration, en mode widget. Jamais relu : il n'est pas stocké. */
  const [code, setCode] = useState('')
  const occupe = enCours === 'rdv' || enCours === 'rdv-retirer'

  const pret = mode === 'bouton' ? Boolean(url.trim()) : Boolean(code.trim())

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Prise de rendez-vous
        </Title>
        <span className={posee ? s.etatOn : s.etatOff}>
          {posee ? (etat.bookingMode === 'widget' ? 'Widget intégré' : 'Bouton') : 'Non réglée'}
        </span>
      </div>
      <p className={s.blocText}>
        Là où vos patients réservent, quel que soit votre agenda. Vous choisissez ce qu'ils
        voient dans leur espace, sous « Rendez-vous ».
      </p>

      {posee ? (
        <div className={s.posee}>
          <span className={s.poseeText}>
            {etat.bookingMode === 'widget'
              ? 'Le widget est intégré à leur espace.'
              : 'Un bouton ouvre votre agenda.'}{' '}
            <a className={s.link} href={etat.bookingUrl ?? '#'} target="_blank" rel="noreferrer">
              Voir la page ↗
            </a>
          </span>
          <Button
            variant="ghost"
            disabled={occupe}
            onClick={() =>
              void onAgir({ action: 'rdv-retirer' }, 'Prise de rendez-vous retirée.').then(() => {
                setUrl('')
                setCode('')
                setMode('bouton')
              })
            }
          >
            {enCours === 'rdv-retirer' ? 'Retrait…' : 'Retirer'}
          </Button>
        </div>
      ) : null}

      <form
        className={s.formCol}
        onSubmit={(e) => {
          e.preventDefault()
          void onAgir(
            mode === 'widget'
              ? { action: 'rdv', mode: 'widget', embed: code }
              : { action: 'rdv', mode: 'bouton', url },
            mode === 'widget' ? 'Widget de réservation intégré.' : 'Adresse de réservation enregistrée.',
          ).then(() => setCode(''))
        }}
      >
        <fieldset className={s.choix} disabled={occupe}>
          <legend className={s.label}>Comment vos patients y accèdent</legend>
          <label className={mode === 'bouton' ? `${s.option} ${s.optionOn}` : s.option}>
            <input type="radio" name="mode-rdv" checked={mode === 'bouton'} onChange={() => setMode('bouton')} />
            <span>
              <span className={s.optionTitle}>Un bouton</span>
              <span className={s.hint}>
                Votre agenda s'ouvre dans un nouvel onglet. Marche avec tous les agendas, sans
                réglage. Vous donnez son adresse.
              </span>
            </span>
          </label>
          <label className={mode === 'widget' ? `${s.option} ${s.optionOn}` : s.option}>
            <input type="radio" name="mode-rdv" checked={mode === 'widget'} onChange={() => setMode('widget')} />
            <span>
              <span className={s.optionTitle}>Le widget, dans leur espace</span>
              <span className={s.hint}>
                Elles choisissent leur créneau sans quitter l'application. Vous collez le code
                d'intégration que votre agenda vous donne.
              </span>
            </span>
          </label>
        </fieldset>

        {mode === 'bouton' ? (
          <label className={s.field}>
            <span className={s.label}>Adresse de réservation</span>
            <TextInput
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mon-cabinet.bookrdv.com/"
              disabled={occupe}
            />
            <span className={s.hint}>La page publique de votre agenda. Elle doit être en https.</span>
          </label>
        ) : (
          <label className={s.field}>
            <span className={s.label}>Code d'intégration</span>
            <textarea
              className={s.code}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              rows={5}
              placeholder={'<!-- Embedded booking begin -->\n<div class="embedded-booking" data-url="…" data-query="…"></div>\n…'}
              disabled={occupe}
            />
            <span className={s.hint}>
              Dans BookRDV : « Intégrer sur mon site », puis collez le bloc en entier. Nous n'en
              gardons que l'adresse de réservation — le script de votre agenda n'est jamais exécuté
              dans l'espace de vos patients, qui contient leur dossier.
            </span>
          </label>
        )}

        <div className={s.actions}>
          <Button variant="primary" type="submit" disabled={occupe || !pret}>
            {enCours === 'rdv' ? 'Enregistrement…' : posee ? 'Remplacer' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
