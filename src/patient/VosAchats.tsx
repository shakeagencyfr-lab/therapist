import { useCallback, useEffect, useState } from 'react'
import { Notice } from '@/components/ui'
import { telechargerRecu } from '@/lib/recuPdf'
import { supabase } from '@/lib/supabase'
import { montantLisible } from '@/lib/ventes'
import { lireRecu } from '@/services/shop'
import p from './PatientSpace.module.css'
import s from './VosAchats.module.css'

/** Un achat payé — ou payé puis remboursé — tel que le patient le lit. */
export interface AchatAffiche {
  id: string
  title: string
  amount_cents: number
  currency: string
  status: 'payee' | 'remboursee'
  paid_at: string | null
  rembourse_at: string | null
}

export const COLONNES_ACHAT = 'id, title, amount_cents, currency, status, paid_at, rembourse_at'

function jourCourt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : ''
}

/**
 * « Vos achats » — vue pure : les achats, le geste en cours et son retour
 * arrivent par les props (scripts/render-check.mts l'éprouve ainsi).
 *
 * Un achat remboursé reste dans la liste, marqué : il a eu lieu, son reçu
 * le dit, et le patient doit pouvoir le retrouver.
 */
export function VueAchats({
  achats,
  enCours,
  retour,
  onRecu,
}: {
  achats: AchatAffiche[]
  /** L'achat dont le reçu se prépare. */
  enCours: string
  retour: { id: string; tone: 'ok' | 'warn'; text: string } | null
  onRecu: (id: string) => void
}) {
  if (!achats.length) return null
  return (
    <section className={p.section}>
      <div className={p.sectionHead}>
        <span className={p.sectionTitle}>Vos achats</span>
        <span className={p.count}>Un reçu pour chacun</span>
      </div>
      {achats.map((a) => {
        const rendu = a.status === 'remboursee'
        return (
          <div key={a.id}>
            <div className={s.achat}>
              <span className={s.texte}>
                <span className={s.titre}>
                  {a.title}
                  {rendu ? <span className={s.marque}>Remboursé</span> : null}
                </span>
                <span className={s.detail}>
                  {[
                    montantLisible(a.amount_cents, a.currency),
                    jourCourt(a.paid_at),
                    rendu && a.rembourse_at ? `remboursé le ${jourCourt(a.rembourse_at)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {/* Le libellé visible reste court ; le nom accessible dit de
                  quel achat il s'agit — il y a un bouton par ligne. */}
              <button
                type="button"
                className={s.recu}
                disabled={Boolean(enCours)}
                aria-label={enCours === a.id ? `Reçu de « ${a.title} » en préparation` : `Télécharger le reçu de « ${a.title} »`}
                onClick={() => onRecu(a.id)}
              >
                {enCours === a.id ? 'Reçu…' : 'Reçu'}
              </button>
            </div>
            {retour?.id === a.id ? (
              <div className={s.retour} role="status">
                <Notice tone={retour.tone}>{retour.text}</Notice>
              </div>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}

/**
 * « Vos achats », avec le téléchargement du reçu. Le reçu vient du serveur,
 * qui relit l'achat en base : c'est le même que celui que le cabinet
 * télécharge depuis la vente.
 */
export function VosAchats({ achats }: { achats: AchatAffiche[] }) {
  const [enCours, setEnCours] = useState('')
  const [retour, setRetour] = useState<{ id: string; tone: 'ok' | 'warn'; text: string } | null>(null)

  async function recu(id: string) {
    if (enCours) return
    setEnCours(id)
    setRetour(null)
    try {
      const nom = await telechargerRecu(await lireRecu(id, 'patient'))
      setRetour({ id, tone: 'ok', text: `Reçu enregistré dans les téléchargements : ${nom}.` })
    } catch (err) {
      setRetour({ id, tone: 'warn', text: (err as Error).message || 'Le reçu n’a pas pu être préparé. Réessayez.' })
    }
    setEnCours('')
  }

  return <VueAchats achats={achats} enCours={enCours} retour={retour} onRecu={(id) => void recu(id)} />
}

/**
 * Les achats d'une fiche, lus par eux-mêmes — pour « Moi », quand la
 * boutique est fermée.
 *
 * UN REÇU NE DÉPEND PAS DE LA VITRINE. L'onglet Boutique disparaît quand la
 * thérapeute ferme sa boutique, ou quand l'offre de son cabinet ne l'ouvre
 * plus ; les achats, eux, ont eu lieu, et le patient doit pouvoir en
 * retrouver le reçu. La lecture nomme la fiche, comme dans la boutique :
 * un compte à la fois membre d'un cabinet et patient ne lit que SES achats.
 */
export function AchatsDuPatient({ patientId }: { patientId: string }) {
  const [achats, setAchats] = useState<AchatAffiche[] | null>(null)
  const [illisible, setIllisible] = useState(false)

  const charger = useCallback(async () => {
    const db = supabase()
    if (!db) return
    const { data, error } = await db
      .from('orders')
      .select(COLONNES_ACHAT)
      .eq('patient_id', patientId)
      .in('status', ['payee', 'remboursee'])
      .order('paid_at', { ascending: false })
    if (error) {
      console.warn('[patient] achats illisibles', error.message)
      setIllisible(true)
      return
    }
    setIllisible(false)
    setAchats((data ?? []) as AchatAffiche[])
  }, [patientId])

  useEffect(() => {
    void charger()
  }, [charger])

  if (illisible) {
    return (
      <section className={p.section}>
        <div className={p.sectionHead}>
          <span className={p.sectionTitle}>Vos achats</span>
        </div>
        <Notice tone="warn">Vos achats n’ont pas pu être lus. Réessayez dans un instant : ils ne sont pas perdus.</Notice>
      </section>
    )
  }
  // Pendant la lecture, et sans achat, rien : « Moi » n'a pas à parler d'une boutique fermée.
  return achats ? <VosAchats achats={achats} /> : null
}
