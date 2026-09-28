import { useCallback, useEffect, useState } from 'react'
import { Notice } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { annonceDeLaReprise, annonceDuRetour, fusionner, type Annonce } from '@/lib/boutique'
import { supabase } from '@/lib/supabase'
import {
  demarrerPaiement,
  verifierEnAttente,
  verifierPaiement,
  type CommandeEnAttente,
} from '@/services/shop'
import s from './PatientSpace.module.css'

interface Produit {
  id: string
  title: string
  description: string
  kind: 'audio' | 'seance' | 'programme' | 'autre'
  price_cents: number
  currency: string
}

interface Achat {
  id: string
  title: string
  amount_cents: number
  paid_at: string | null
}

const GENRES: Record<Produit['kind'], string> = {
  audio: 'Audio',
  seance: 'Séance',
  programme: 'Programme',
  autre: '',
}

function prix(cents: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

/**
 * La boutique de la thérapeute, vue par son patient.
 *
 * La liste vient de la base sous ses propres droits : il ne voit que les
 * produits actifs de son cabinet, et seulement si la boutique est ouverte —
 * contrat en règle, offre qui l'ouvre, thérapeute qui l'allume (0047).
 * Acheter envoie chez Stripe, sur le compte de la thérapeute ; au retour, le
 * serveur vérifie et livre — un audio acheté apparaît dans « Vos audios ».
 * Et à chaque ouverture, il repasse ce qui attend encore : le retour de
 * Stripe n'arrive pas toujours.
 */
export function Boutique({
  patientId,
  accent,
  retourCommande,
  retourAnnule,
  onLivre,
}: {
  /** La fiche dont on montre les achats. Nommée, jamais devinée. */
  patientId: string
  accent?: string
  /** L'identifiant de session Stripe, si l'on revient d'un paiement. */
  retourCommande: string | null
  retourAnnule: boolean
  /** Après une livraison confirmée : l'espace recharge ses audios. */
  onLivre: () => Promise<void>
}) {
  /* LE CABINET DE LA FICHE, NOMMÉ. Un compte à la fois membre d'un cabinet et
     patient d'un autre lit, par la politique « cabinet », tous les produits
     du sien — masqués et retirés compris. Sans ce filtre, ils s'affichaient
     dans la vitrine de sa thérapeute. */
  const cabinetId = useMaybeAuth()?.context?.patient?.cabinet_id ?? null
  const [produits, setProduits] = useState<Produit[]>([])
  const [achats, setAchats] = useState<Achat[]>([])
  /** Ce qui attend encore la confirmation de la banque, selon le serveur. */
  const [enAttente, setEnAttente] = useState<CommandeEnAttente[]>([])
  const [chargement, setChargement] = useState(true)
  /** La boutique n'a pas pu être lue : ce n'est pas une boutique vide. */
  const [illisible, setIllisible] = useState(false)
  const [enCours, setEnCours] = useState('')
  const [notice, setNotice] = useState<Annonce | null>(
    retourAnnule ? { tone: 'hot', text: "Paiement annulé. Rien n'a été débité." } : null,
  )

  const charger = useCallback(async () => {
    const db = supabase()
    if (!db) return
    let vitrine = db
      .from('products')
      .select('id, title, description, kind, price_cents, currency')
      .eq('is_active', true)
      .is('archived_at', null)
    if (cabinetId) vitrine = vitrine.eq('cabinet_id', cabinetId)
    const [p, a] = await Promise.all([
      vitrine.order('position'),
      /* NOMMER LE PATIENT, ET PAS S'EN REMETTRE À LA RLS. `orders` porte deux
         politiques de lecture qui s'additionnent : celle de la fiche et celle
         du cabinet. Un compte qui est à la fois membre du cabinet ET titulaire
         d'une fiche — il en existe un en production — voyait donc tout le
         carnet de commandes du cabinet sous une étiquette « Vos achats ». */
      db
        .from('orders')
        .select('id, title, amount_cents, paid_at')
        .eq('patient_id', patientId)
        .eq('status', 'payee')
        .order('paid_at', { ascending: false }),
    ])
    /* UNE PANNE N'EST PAS UNE VITRINE VIDE. Les deux erreurs étaient tues :
       une boutique illisible affichait « Rien en vente pour l'instant », et
       des achats illisibles disparaissaient de « Vos achats ». Ce qui a été
       lu s'affiche ; ce qui ne l'a pas été le dit. */
    if (p.error) console.warn('[patient] boutique illisible', p.error.message)
    if (a.error) console.warn('[patient] achats illisibles', a.error.message)
    setIllisible(Boolean(p.error || a.error))
    if (!p.error) setProduits((p.data ?? []) as Produit[])
    if (!a.error) setAchats((a.data ?? []) as Achat[])
    setChargement(false)
  }, [patientId, cabinetId])

  useEffect(() => {
    void charger()
  }, [charger])

  /* LE RETOUR, PUIS LA REPRISE. Le retour de Stripe ne vient pas toujours —
     prélèvement confirmé des jours plus tard, onglet fermé avant la
     redirection, réseau coupé — et l'identifiant de session s'efface de
     l'adresse dès sa première lecture. La commande restait alors « en
     attente » pour toujours : payée chez la thérapeute, jamais livrée ici.
     À chaque ouverture de la boutique, le serveur repasse donc chez Stripe ce
     qui attend encore, et reprend les livraisons en échec ; c'est ce qui rend
     vraie la phrase « elle sera reprise à votre prochain passage ». On ne
     conclut jamais soi-même : c'est le serveur qui demande à Stripe.
     Dans cet ordre, et pas ensemble : le même achat serait annoncé deux fois. */
  useEffect(() => {
    let vivant = true
    void (async () => {
      let dejaAnnoncee: string | null = null
      let arrive = false
      if (retourCommande) {
        try {
          const r = await verifierPaiement(retourCommande)
          if (!vivant) return
          dejaAnnoncee = r.id
          arrive = r.payee
          setNotice((avant) => fusionner(avant, annonceDuRetour(r)))
        } catch (err) {
          if (vivant) setNotice({ tone: 'warn', text: (err as Error).message })
        }
      }
      try {
        const reprise = await verifierEnAttente('patient')
        if (!vivant) return
        setEnAttente(reprise.enAttente)
        const annonce = annonceDeLaReprise(reprise, dejaAnnoncee)
        if (annonce) setNotice((avant) => fusionner(avant, annonce))
        arrive = arrive || reprise.confirmees.length > 0
      } catch (err) {
        // Sans réponse, rien n'est perdu : la reprise repassera à la prochaine ouverture.
        console.warn('[patient] reprise des commandes', (err as Error).message)
      }
      if (arrive && vivant) {
        await onLivre()
        await charger()
      }
    })()
    return () => {
      vivant = false
    }
  }, [retourCommande, onLivre, charger])

  async function acheter(id: string) {
    setEnCours(id)
    setNotice(null)
    try {
      const { url } = await demarrerPaiement(id)
      window.location.href = url
    } catch (err) {
      setNotice({ tone: 'warn', text: (err as Error).message })
      setEnCours('')
    }
  }

  return (
    <>
      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.sectionTitle}>Boutique</span>
          <span className={s.count}>Paiement sécurisé par Stripe</span>
        </div>

        {notice ? (
          <div className={s.noticeWrap}>
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </div>
        ) : null}

        {illisible ? (
          <div className={s.noticeWrap}>
            <Notice tone="warn">
              La boutique n'a pas pu être chargée entièrement. Réessayez dans un instant : vos
              achats ne sont pas perdus.
            </Notice>
          </div>
        ) : null}

        {chargement ? (
          <p className={s.count}>Chargement…</p>
        ) : produits.length === 0 ? (
          illisible ? null : <p className={s.frameNote}>Rien en vente pour l'instant.</p>
        ) : (
          produits.map((p) => (
            <div key={p.id} className={s.produit}>
              <span className={s.produitText}>
                <span className={s.produitTitle}>
                  {p.title}
                  {GENRES[p.kind] ? <span className={s.produitKind}>{GENRES[p.kind]}</span> : null}
                </span>
                {p.description ? <span className={s.produitDesc}>{p.description}</span> : null}
              </span>
              {/* Le bouton ne portait qu'un prix : « 24,00 € », annoncé tel
                  quel par un lecteur d'écran, sans dire ni ce qu'il fait ni de
                  quel produit il parle — et il y en a autant que d'articles.
                  Le libellé visible reste le prix ; le nom accessible dit le
                  geste et l'article. */}
              <button
                type="button"
                className={s.acheter}
                style={accent ? { background: accent } : undefined}
                disabled={Boolean(enCours)}
                aria-label={
                  enCours === p.id
                    ? `Achat de « ${p.title} » en cours`
                    : `Acheter « ${p.title} » — ${prix(p.price_cents, p.currency)}`
                }
                onClick={() => void acheter(p.id)}
              >
                {enCours === p.id ? '…' : prix(p.price_cents, p.currency)}
              </button>
            </div>
          ))
        )}
      </section>

      {/* Un paiement validé que la banque n'a pas encore confirmé n'est ni
          un achat ni rien : il se montre, pour qu'on ne paie pas deux fois
          en croyant la première perdue. */}
      {enAttente.length > 0 ? (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <span className={s.sectionTitle}>En attente</span>
            <span className={s.count}>Vérifié à chaque visite</span>
          </div>
          {enAttente.map((c) => (
            <div key={c.id} className={s.achat}>
              <span className={s.produitTitle}>{c.title}</span>
              <span className={s.count}>
                {prix(c.amount_cents, c.currency)} ·{' '}
                {c.etat === 'reglement' ? 'confirmation de la banque en cours' : 'vérification en cours'}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {achats.length > 0 ? (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <span className={s.sectionTitle}>Vos achats</span>
          </div>
          {achats.map((a) => (
            <div key={a.id} className={s.achat}>
              <span className={s.produitTitle}>{a.title}</span>
              <span className={s.count}>
                {prix(a.amount_cents, 'eur')}
                {a.paid_at
                  ? ` · ${new Date(a.paid_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                  : ''}
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  )
}
