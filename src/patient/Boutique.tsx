import { useCallback, useEffect, useState } from 'react'
import { Notice } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { demarrerPaiement, verifierPaiement } from '@/services/shop'
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
 * La boutique de la thérapeute, vue par sa patiente.
 *
 * La liste vient de la base sous ses propres droits : elle ne voit que les
 * produits actifs de son cabinet, et seulement si la boutique est ouverte.
 * Acheter envoie chez Stripe, sur le compte de la thérapeute ; au retour, le
 * serveur vérifie et livre — un audio acheté apparaît dans « Vos audios ».
 */
export function Boutique({
  accent,
  retourCommande,
  retourAnnule,
  onLivre,
}: {
  accent?: string
  /** L'identifiant de session Stripe, si l'on revient d'un paiement. */
  retourCommande: string | null
  retourAnnule: boolean
  /** Après une livraison confirmée : l'espace recharge ses audios. */
  onLivre: () => Promise<void>
}) {
  const [produits, setProduits] = useState<Produit[]>([])
  const [achats, setAchats] = useState<Achat[]>([])
  const [chargement, setChargement] = useState(true)
  const [enCours, setEnCours] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'hot'; text: string } | null>(
    retourAnnule ? { tone: 'hot', text: "Paiement annulé. Rien n'a été débité." } : null,
  )

  const charger = useCallback(async () => {
    const db = supabase()
    if (!db) return
    const [p, a] = await Promise.all([
      db.from('products').select('id, title, description, kind, price_cents, currency').order('position'),
      db
        .from('orders')
        .select('id, title, amount_cents, paid_at')
        .eq('status', 'payee')
        .order('paid_at', { ascending: false }),
    ])
    setProduits((p.data ?? []) as Produit[])
    setAchats((a.data ?? []) as Achat[])
    setChargement(false)
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  // Retour de Stripe : on demande au serveur, jamais on ne conclut soi-même.
  useEffect(() => {
    if (!retourCommande) return
    let vivant = true
    verifierPaiement(retourCommande)
      .then(async (r) => {
        if (!vivant) return
        if (r.payee) {
          setNotice({ tone: 'ok', text: `Paiement confirmé${r.title ? ` : ${r.title}` : ''}. Merci.` })
          await onLivre()
          await charger()
        } else {
          setNotice({ tone: 'hot', text: "Le paiement n'est pas encore confirmé. Si vous avez payé, il le sera dans un instant." })
        }
      })
      .catch((err: Error) => {
        if (vivant) setNotice({ tone: 'warn', text: err.message })
      })
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

        {chargement ? (
          <p className={s.count}>Chargement…</p>
        ) : produits.length === 0 ? (
          <p className={s.frameNote}>Rien en vente pour l'instant.</p>
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
              <button
                type="button"
                className={s.acheter}
                style={accent ? { background: accent } : undefined}
                disabled={Boolean(enCours)}
                onClick={() => void acheter(p.id)}
              >
                {enCours === p.id ? '…' : prix(p.price_cents, p.currency)}
              </button>
            </div>
          ))
        )}
      </section>

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
