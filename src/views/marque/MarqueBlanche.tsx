import { useEffect, useState } from 'react'
import { Button, Card, FieldLabel, Notice, TextInput, Title } from '@/components/ui'
import {
  lireDomaine,
  lireSmtp,
  poserDomaine,
  reglerSmtp,
  retirerDomaine,
  retirerSmtp,
  verifierDomaine,
  type EtatDomaine,
  type EtatSmtp,
} from '@/services/cabinet'
import { adresseEspacePatient, lienEspacePatient } from '@/lib/domaine'
import s from './MarqueBlanche.module.css'

/**
 * La marque blanche totale : son domaine, et ses courriels.
 *
 * Les couleurs et le logo habillent l'application ; ces deux réglages-ci font
 * disparaître le fournisseur. Un patient qui reçoit un lien de
 * « cabinet-ollivier.fr », envoyé depuis « contact@cabinet-ollivier.fr »,
 * n'a aucune raison de savoir que Klaro existe.
 *
 * Les deux écrans suivent la même règle : rien n'est annoncé avant d'avoir
 * été éprouvé. Un domaine n'est « vérifié » qu'après une vraie résolution, un
 * serveur d'envoi qu'après une vraie connexion.
 */
export function MarqueBlanche({ slug }: { slug: string }) {
  return (
    <div className={s.colonne}>
      <Domaine slug={slug} />
      <Courriels />
    </div>
  )
}

/** L'explication commune quand l'offre ne comprend pas la marque blanche. */
function HorsOffre({ offre, quoi }: { offre: string; quoi: string }) {
  return (
    <p className={s.hint}>
      {quoi} fait partie de la marque blanche totale, que votre offre {offre ? `« ${offre} » ` : ''}
      ne comprend pas. Votre revendeur peut l'ouvrir depuis son espace, sans que vous ayez rien à
      refaire ici.
    </p>
  )
}

function Domaine({ slug }: { slug: string }) {
  const [etat, setEtat] = useState<EtatDomaine | null>(null)
  const [chargement, setChargement] = useState(true)
  const [saisie, setSaisie] = useState('')
  const [occupe, setOccupe] = useState('')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let vivant = true
    lireDomaine()
      .then((e) => vivant && setEtat(e))
      .catch((err: Error) => vivant && setErreur(err.message))
      .finally(() => vivant && setChargement(false))
    return () => {
      vivant = false
    }
  }, [])

  async function agir(quoi: string, action: () => Promise<EtatDomaine>) {
    if (occupe) return
    setOccupe(quoi)
    setErreur('')
    try {
      setEtat(await action())
      if (quoi === 'poser') setSaisie('')
    } catch (err) {
      setErreur((err as Error).message)
    }
    setOccupe('')
  }

  if (chargement) return <Card className={s.panel}>Chargement de votre domaine…</Card>

  return (
    <Card className={s.panel}>
      <Title large as="h2">
        Votre domaine
      </Title>
      <p className={s.hint}>
        Une option, pas un préalable : vos patients ont déjà une adresse à votre marque, et un
        domaine à vous ne fait que la remplacer. Un sous-domaine du vôtre — par exemple
        espace.votre-cabinet.fr — suffit, et vous gardez votre site principal où il est.
      </p>

      <div className={s.repli}>
        <span className={s.repliTitre}>Votre adresse aujourd'hui</span>
        <a className={s.lien} href={lienEspacePatient(slug)} target="_blank" rel="noreferrer">
          {adresseEspacePatient(slug)} ↗
        </a>
        <p className={s.note}>
          Elle porte votre nom, votre logo et vos couleurs dès la page de connexion, et elle
          continuera de fonctionner même après avoir posé votre domaine.
        </p>
      </div>

      {erreur ? <Notice tone="warn">{erreur}</Notice> : null}

      {etat && !etat.droit ? (
        <HorsOffre offre={etat.offre} quoi="Le domaine personnalisé" />
      ) : etat?.domaine ? (
        <>
          <div className={s.ligne}>
            <span className={s.valeur}>{etat.domaine}</span>
            <span className={etat.verifie ? s.badgeOk : s.badgeAttente}>
              {etat.verifie ? 'Vérifié' : 'En attente'}
            </span>
          </div>

          {etat.etat ? (
            <Notice tone={etat.verifie ? 'ok' : 'warn'}>{etat.etat}</Notice>
          ) : null}

          {!etat.verifie && etat.dns.length ? (
            <>
              <p className={s.hint}>
                À poser chez votre registrar — celui où vous avez acheté le domaine (OVH, Gandi,
                Ionos…). Recopiez les valeurs exactement.
              </p>
              <table className={s.dns}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Nom</th>
                    <th>Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {etat.dns.map((d) => (
                    <tr key={`${d.type}-${d.nom}-${d.valeur}`}>
                      <td>{d.type}</td>
                      <td>{d.nom}</td>
                      <td className={s.mono}>{d.valeur}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          <div className={s.actions}>
            {!etat.verifie ? (
              <Button
                variant="primary"
                disabled={occupe !== ''}
                onClick={() => void agir('verifier', verifierDomaine)}
              >
                {occupe === 'verifier' ? 'Vérification…' : 'Vérifier maintenant'}
              </Button>
            ) : (
              <a className={s.lien} href={`https://${etat.domaine}`} target="_blank" rel="noreferrer">
                Ouvrir mon espace ↗
              </a>
            )}
            <Button
              variant="ghost"
              disabled={occupe !== ''}
              onClick={() => void agir('retirer', retirerDomaine)}
            >
              {occupe === 'retirer' ? 'Retrait…' : 'Retirer ce domaine'}
            </Button>
          </div>

          {!etat.automatique ? (
            <p className={s.note}>
              L'hébergement n'est pas piloté depuis ce serveur : prévenez votre revendeur pour
              qu'il rattache le domaine, sans quoi la vérification passera mais l'adresse ne
              servira pas.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className={s.field}>
            <FieldLabel>Domaine</FieldLabel>
            <TextInput
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="espace.votre-cabinet.fr"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className={s.actions}>
            <Button
              variant="primary"
              disabled={saisie.trim().length < 4 || occupe !== ''}
              onClick={() => void agir('poser', () => poserDomaine(saisie))}
            >
              {occupe === 'poser' ? 'Enregistrement…' : 'Utiliser ce domaine'}
            </Button>
          </div>
          <p className={s.note}>
            Vous recevrez ensuite l'enregistrement DNS à poser chez votre registrar. Tant qu'il
            n'est pas vérifié, rien ne change : votre adresse actuelle continue de fonctionner.
          </p>
        </>
      )}
    </Card>
  )
}

/** Le brouillon du serveur d'envoi. Le mot de passe ne revient jamais. */
interface Brouillon {
  host: string
  port: string
  user: string
  from: string
  pass: string
}

const VIDE: Brouillon = { host: '', port: '465', user: '', from: '', pass: '' }

function Courriels() {
  const [etat, setEtat] = useState<EtatSmtp | null>(null)
  const [chargement, setChargement] = useState(true)
  const [brouillon, setBrouillon] = useState<Brouillon>(VIDE)
  const [ouvert, setOuvert] = useState(false)
  const [occupe, setOccupe] = useState('')
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let vivant = true
    lireSmtp()
      .then((e) => vivant && setEtat(e))
      .catch((err: Error) => vivant && setErreur(err.message))
      .finally(() => vivant && setChargement(false))
    return () => {
      vivant = false
    }
  }, [])

  const port = Number(brouillon.port)
  const complet =
    brouillon.host.trim().length > 3 &&
    Number.isInteger(port) &&
    port > 0 &&
    brouillon.from.includes('@') &&
    brouillon.pass.length > 0

  async function enregistrer() {
    if (!complet || occupe) return
    setOccupe('regler')
    setErreur('')
    setMessage('')
    try {
      setEtat(
        await reglerSmtp({
          host: brouillon.host.trim(),
          port,
          user: brouillon.user.trim(),
          from: brouillon.from.trim(),
          pass: brouillon.pass,
        }),
      )
      setBrouillon(VIDE)
      setOuvert(false)
      setMessage('Serveur d’envoi vérifié et enregistré. Vos courriels partiront de votre adresse.')
    } catch (err) {
      setErreur((err as Error).message)
    }
    setOccupe('')
  }

  async function retirer() {
    if (occupe) return
    setOccupe('retirer')
    setErreur('')
    setMessage('')
    try {
      setEtat(await retirerSmtp())
      setMessage('Serveur d’envoi retiré. Vos courriels repartent du service de la plateforme.')
    } catch (err) {
      setErreur((err as Error).message)
    }
    setOccupe('')
  }

  if (chargement) return <Card className={s.panel}>Chargement de vos réglages d'envoi…</Card>

  const configure = Boolean(etat?.setAt && etat.host)

  return (
    <Card className={s.panel}>
      <Title large as="h2">
        Vos courriels
      </Title>
      <p className={s.hint}>
        Les liens de connexion de vos patients partent aujourd'hui du service de la plateforme.
        Branchez votre propre serveur d'envoi et ils partiront de votre adresse — c'est la dernière
        chose qui trahit le fournisseur.
      </p>

      {erreur ? <Notice tone="warn">{erreur}</Notice> : null}
      {message ? <Notice tone="ok">{message}</Notice> : null}

      {etat && !etat.droit ? (
        <HorsOffre offre={etat.offre} quoi="L'envoi depuis votre adresse" />
      ) : (
        <>
          {etat && !etat.chiffrement ? (
            <Notice tone="warn">
              Ce serveur n'a pas sa clé de chiffrement : un mot de passe ne peut pas y être
              enregistré en sûreté. Prévenez votre revendeur avant de le saisir.
            </Notice>
          ) : null}

          {configure ? (
            <div className={s.recap}>
              <div className={s.ligne}>
                <span className={s.valeur}>
                  {etat?.host}:{etat?.port}
                </span>
                <span className={s.badgeOk}>Actif</span>
              </div>
              <p className={s.note}>
                Expéditeur : {etat?.from}
                {etat?.user ? ` · identifiant ${etat.user}` : ''}
                {etat?.hint ? ` · mot de passe ${etat.hint}` : ''}
              </p>
            </div>
          ) : null}

          {ouvert || !configure ? (
            <div className={s.formulaire}>
              <div className={s.deux}>
                <div className={s.field}>
                  <FieldLabel>Serveur d'envoi</FieldLabel>
                  <TextInput
                    value={brouillon.host}
                    onChange={(e) => setBrouillon((b) => ({ ...b, host: e.target.value }))}
                    placeholder="smtp.votre-hebergeur.fr"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <div className={s.field}>
                  <FieldLabel>Port</FieldLabel>
                  <TextInput
                    inputMode="numeric"
                    value={brouillon.port}
                    onChange={(e) => setBrouillon((b) => ({ ...b, port: e.target.value }))}
                    placeholder="465"
                  />
                </div>
              </div>
              <div className={s.deux}>
                <div className={s.field}>
                  <FieldLabel>Identifiant</FieldLabel>
                  <TextInput
                    value={brouillon.user}
                    onChange={(e) => setBrouillon((b) => ({ ...b, user: e.target.value }))}
                    placeholder="contact@votre-cabinet.fr"
                    autoComplete="off"
                  />
                </div>
                <div className={s.field}>
                  <FieldLabel>Mot de passe</FieldLabel>
                  <TextInput
                    type="password"
                    value={brouillon.pass}
                    onChange={(e) => setBrouillon((b) => ({ ...b, pass: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className={s.field}>
                <FieldLabel>Adresse d'expédition</FieldLabel>
                <TextInput
                  type="email"
                  value={brouillon.from}
                  onChange={(e) => setBrouillon((b) => ({ ...b, from: e.target.value }))}
                  placeholder="contact@votre-cabinet.fr"
                  autoComplete="off"
                />
                <span className={s.hint}>C'est elle que vos patients verront.</span>
              </div>

              <div className={s.actions}>
                <Button variant="primary" disabled={!complet || occupe !== ''} onClick={() => void enregistrer()}>
                  {occupe === 'regler' ? 'Vérification…' : 'Vérifier et enregistrer'}
                </Button>
                {configure ? (
                  <Button variant="ghost" disabled={occupe !== ''} onClick={() => setOuvert(false)}>
                    Annuler
                  </Button>
                ) : null}
              </div>
              <p className={s.note}>
                La connexion est éprouvée avant l'enregistrement : un mot de passe faux se découvre
                ici, pas le jour où un patient attend son lien. Il est ensuite chiffré et ne
                revient jamais à votre navigateur.
              </p>
            </div>
          ) : (
            <div className={s.actions}>
              <Button variant="secondary" disabled={occupe !== ''} onClick={() => setOuvert(true)}>
                Remplacer
              </Button>
              <Button variant="ghost" disabled={occupe !== ''} onClick={() => void retirer()}>
                {occupe === 'retirer' ? 'Retrait…' : 'Retirer'}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
