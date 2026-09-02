import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Notice, Pill, Title } from '@/components/ui'
import { euroCents } from '@/lib/format'
import { nomDuGenre } from '@/lib/revente'
import { acheterCredits, lireCredits, verifierAchat, type EtatCredits } from '@/services/credits'
import s from './CreditsIA.module.css'

/** Retour de Stripe : la commande à vérifier, ou l'annulation. Lus une fois. */
function retourAchat(): { commande: string | null; annule: boolean } {
  if (typeof window === 'undefined') return { commande: null, annule: false }
  const q = new URLSearchParams(window.location.search)
  const commande = q.get('credits')
  const annule = q.get('credits_annule') === '1'
  if (commande || annule) {
    // On nettoie l'adresse : recharger ne doit pas revérifier ni ré-annoncer.
    window.history.replaceState(null, '', window.location.pathname)
  }
  return { commande, annule }
}

/** « 1 sept. » — l'historique est long, les dates y sont courtes. */
function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function libelleMouvement(m: { reason: string; kind: string | null; note: string | null }): string {
  if (m.note) return m.note
  switch (m.reason) {
    case 'consommation':
      return m.kind ? nomDuGenre(m.kind) : 'Analyse'
    case 'achat':
      return 'Achat de crédits'
    case 'geste':
      return 'Crédits offerts par votre revendeur'
    default:
      return 'Ajustement'
  }
}

/**
 * Les crédits d'analyse, côté thérapeute.
 *
 * N'apparaît que si son revendeur l'a passée en mode crédits : dans l'autre
 * mode, c'est sa propre clé Anthropic qui paie et ce bloc n'aurait aucun
 * sens. Un crédit vaut une action — un brouillon de séance, un module, un
 * jeu d'affirmations, un profil — quelle que soit la longueur de la séance.
 *
 * Le solde vient du serveur et n'est jamais calculé ici : il se somme depuis
 * un grand livre en ajout seul, auquel le navigateur n'écrit pas.
 */
export function CreditsIA({ onCharge }: { onCharge?: (mode: 'cle_cabinet' | 'credits') => void }) {
  const [retour] = useState(retourAchat)
  const [etat, setEtat] = useState<EtatCredits | null>(null)
  const [erreur, setErreur] = useState('')
  const [notice, setNotice] = useState('')
  const [enCours, setEnCours] = useState('')
  const [historique, setHistorique] = useState(false)

  /* Le rappel passe par une référence : un appelant qui le redéclare à chaque
     rendu ne doit pas relancer la lecture en boucle. */
  const prevenir = useRef(onCharge)
  prevenir.current = onCharge

  const charger = useCallback(async () => {
    try {
      const lu = await lireCredits()
      setEtat(lu)
      prevenir.current?.(lu.mode)
    } catch (err) {
      setErreur((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  useEffect(() => {
    if (retour.annule) setNotice("Achat annulé. Rien n'a été débité.")
  }, [retour.annule])

  // Retour de Stripe : on demande au serveur, jamais on ne conclut soi-même.
  useEffect(() => {
    if (!retour.commande) return
    let vivant = true
    verifierAchat(retour.commande)
      .then(async (r) => {
        if (!vivant) return
        if (r.payee) {
          setNotice(`Paiement confirmé${r.credits ? ` : ${r.credits} crédits ajoutés` : ''}.`)
          await charger()
        } else {
          setNotice("Le paiement n'est pas encore confirmé. Si vous avez payé, il le sera dans un instant.")
        }
      })
      .catch((err: Error) => {
        if (vivant) setErreur(err.message)
      })
    return () => {
      vivant = false
    }
  }, [retour.commande, charger])

  // Mode « clé du cabinet » : rien à afficher, la question ne se pose pas.
  if (!etat || etat.mode !== 'credits') return null

  const decouvert = etat.solde <= 0 && etat.decouvert > 0
  const epuise = etat.solde <= -etat.decouvert

  async function acheter(packId: string) {
    setEnCours(packId)
    setErreur('')
    setNotice('')
    try {
      const { url } = await acheterCredits(packId)
      window.location.href = url
    } catch (err) {
      setErreur((err as Error).message)
      setEnCours('')
    }
  }

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Crédits d'analyse
        </Title>
        <Pill tone={epuise ? 'warn' : decouvert ? 'kind' : 'accent'}>
          {etat.solde} {Math.abs(etat.solde) === 1 ? 'crédit' : 'crédits'}
        </Pill>
      </div>

      <p className={s.blocText}>
        Votre revendeur fournit l'analyse : ses appels passent par sa clé, et vous lui achetez des
        crédits. Un crédit vaut une action — un brouillon de séance, un module, un jeu
        d'affirmations, un profil — quelle que soit la longueur de la séance. Vous n'avez donc pas
        de clé Anthropic à poser.
      </p>

      {erreur ? <Notice tone="warn">{erreur}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      {epuise ? (
        <Notice tone="warn">
          Vos crédits sont épuisés{etat.decouvert > 0 ? ', découvert compris' : ''}. Les analyses
          sont refusées jusqu'à une recharge.
        </Notice>
      ) : decouvert ? (
        <Notice tone="hot">
          Vous êtes sur le découvert que votre revendeur vous accorde ({etat.decouvert}{' '}
          {etat.decouvert === 1 ? 'crédit' : 'crédits'}). Rechargez avant qu'il soit consommé : une
          séance ne devrait pas s'arrêter devant une patiente.
        </Notice>
      ) : null}

      {etat.paquets.length > 0 ? (
        <div className={s.paquets}>
          {etat.paquets.map((p) => (
            <div key={p.id} className={s.paquet}>
              <span className={s.paquetNom}>{p.label}</span>
              <span className={s.paquetCredits}>{p.credits} crédits</span>
              <span className={s.paquetPrix}>{euroCents(p.prixCentimes)}</span>
              <Button
                variant="primary"
                disabled={!etat.paiementCarte || Boolean(enCours)}
                onClick={() => void acheter(p.id)}
              >
                {enCours === p.id ? 'Ouverture…' : 'Acheter'}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {!etat.paiementCarte ? (
        <p className={s.hint}>
          Votre revendeur n'encaisse pas par carte pour l'instant. Demandez-lui de vous créditer :
          il peut le faire depuis son espace, et vos crédits apparaîtront ici.
        </p>
      ) : etat.paquets.length === 0 ? (
        <p className={s.hint}>
          Votre revendeur ne propose pas encore de paquet. Demandez-lui de vous créditer.
        </p>
      ) : (
        <p className={s.hint}>Paiement sécurisé par Stripe, sur le compte de votre revendeur.</p>
      )}

      {etat.mouvements.length > 0 ? (
        <div className={s.histo}>
          <button type="button" className={s.plier} onClick={() => setHistorique(!historique)}>
            {historique ? 'Masquer le détail' : 'Voir le détail de mes crédits'}
          </button>
          {historique ? (
            <table className={s.table}>
              <tbody>
                {etat.mouvements.map((m) => (
                  <tr key={m.id}>
                    <td className={s.date}>{dateCourte(m.date)}</td>
                    <td>{libelleMouvement(m)}</td>
                    <td className={m.delta < 0 ? s.debit : s.credit}>
                      {m.delta > 0 ? '+' : ''}
                      {m.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
