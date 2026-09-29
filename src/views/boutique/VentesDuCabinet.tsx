import { Button, Card, Notice, Title } from '@/components/ui'
import { totalDesVentes } from '@/lib/boutique'
import { euros, referenceDeCommande } from '@/lib/ventes'
import s from './Ventes.module.css'

/** Une vente telle que la liste la montre. */
export interface VenteAffichee {
  id: string
  title: string
  amount_cents: number
  currency: string
  status: 'payee' | 'remboursee'
  paid_at: string | null
  rembourse_at: string | null
  /** Le nom de la fiche ; null si elle n'est pas lisible. */
  patient: string | null
  /** Le genre du produit vendu, s'il existe encore — un audio reste chez le patient. */
  genre: string | null
}

/** Ce que le dernier geste a donné, dit sous la vente qu'il concerne. */
export interface RetourVente {
  commandeId: string
  tone: 'ok' | 'warn'
  text: string
  /** Le paiement dans le tableau de bord Stripe, quand c'est là qu'il faut aller. */
  lien: string | null
}

function jourCourt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : ''
}

/**
 * Les dernières ventes du cabinet : ce qui a été vendu, à qui, quand — et,
 * sur chaque vente, son reçu et son remboursement.
 *
 * Vue pure : les données et les gestes arrivent par les props, ce qui la
 * laisse s'éprouver sans base (scripts/render-check.mts).
 *
 * REMBOURSER SE CONFIRME, SUR PLACE. La confirmation se déplie sous la vente,
 * dit la somme, la personne, le délai de la banque, et que rien n'est retiré
 * à son espace — avant le bouton, pas après. Un remboursement ne s'annule
 * pas : on le fait les yeux ouverts.
 */
export function VueVentes({
  etat,
  ventes,
  limite,
  peutRembourser,
  aConfirmer,
  enCours,
  retour,
  onRecu,
  onDemander,
  onConfirmer,
  onAnnuler,
}: {
  etat: 'pret' | 'illisible'
  ventes: VenteAffichee[]
  /** Combien de ventes la liste lit au plus. */
  limite: number
  /** Réservé à la personne titulaire : les autres voient, téléchargent les reçus. */
  peutRembourser: boolean
  /** La vente dont on confirme le remboursement. */
  aConfirmer: string | null
  /** Le geste en cours : « recu:<id> » ou « remboursement:<id> ». */
  enCours: string
  retour: RetourVente | null
  onRecu: (id: string) => void
  onDemander: (id: string) => void
  onConfirmer: (id: string) => void
  onAnnuler: () => void
}) {
  const total = totalDesVentes(ventes, limite)
  const rendues = ventes.some((v) => v.status === 'remboursee')
  const aRembourser = ventes.some((v) => v.status === 'payee')

  return (
    <Card className={s.bloc}>
      <div className={s.tete}>
        <Title large as="h2">
          Dernières ventes
        </Title>
        {ventes.length ? (
          <span className={s.compte}>
            {total.complet
              ? `${euros(total.cents)} encaissés${rendues ? ', remboursements déduits' : ''}`
              : `${euros(total.cents)} sur les ${limite} dernières ventes — le livre des recettes les compte toutes`}
          </span>
        ) : null}
      </div>

      {etat === 'illisible' ? (
        <p className={s.muted}>Les ventes n’ont pas pu être lues. Rouvrez la boutique dans un instant : rien n’est perdu.</p>
      ) : ventes.length === 0 ? (
        <p className={s.muted}>
          Aucune vente pour l’instant. Elles s’afficheront ici dès qu’un paiement sera confirmé par Stripe.
        </p>
      ) : (
        <div className={s.liste}>
          {ventes.map((v) => {
            const rendue = v.status === 'remboursee'
            const confirme = aConfirmer === v.id
            const idQuestion = `rembourser-${v.id}`
            return (
              <div key={v.id} className={s.vente}>
                <div className={s.ligne}>
                  <span className={s.texte}>
                    <span className={s.titre}>
                      {v.title}
                      {rendue ? <span className={s.marque}>Remboursée</span> : null}
                    </span>
                    <span className={s.detail}>
                      {[
                        v.patient ?? '—',
                        jourCourt(v.paid_at),
                        `réf. ${referenceDeCommande(v.id)}`,
                        rendue && v.rembourse_at ? `remboursée le ${jourCourt(v.rembourse_at)}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className={rendue ? `${s.prix} ${s.prixRendu}` : s.prix}>{euros(v.amount_cents)}</span>
                  <span className={s.gestes}>
                    <Button
                      variant="ghost"
                      aria-label={`Télécharger le reçu de « ${v.title} »`}
                      disabled={enCours === `recu:${v.id}`}
                      onClick={() => onRecu(v.id)}
                    >
                      {enCours === `recu:${v.id}` ? 'Reçu…' : 'Reçu'}
                    </Button>
                    {peutRembourser && !rendue ? (
                      <Button
                        variant="ghost"
                        aria-label={`Rembourser « ${v.title} »`}
                        aria-expanded={confirme}
                        disabled={Boolean(enCours)}
                        onClick={() => (confirme ? onAnnuler() : onDemander(v.id))}
                      >
                        Rembourser
                      </Button>
                    ) : null}
                  </span>
                </div>

                {confirme ? (
                  <div className={s.confirmation} role="group" aria-labelledby={idQuestion}>
                    <p className={s.question} id={idQuestion}>
                      Rembourser {euros(v.amount_cents)}
                      {v.patient ? ` à ${v.patient}` : ''} ?
                    </p>
                    <p className={s.explication}>
                      La somme entière repart sur le moyen de paiement utilisé, depuis votre compte
                      Stripe ; la banque la crédite en général sous 5 à 10 jours. Un remboursement ne
                      s’annule pas.
                    </p>
                    <p className={s.explication}>
                      {v.genre === 'audio'
                        ? 'L’audio acheté reste dans sa bibliothèque : le remboursement ne retire rien à son espace. Si vous souhaitez le lui retirer, faites-le depuis sa fiche.'
                        : 'Le remboursement ne retire rien à son espace.'}
                    </p>
                    <div className={s.boutons}>
                      <Button
                        variant="danger"
                        disabled={enCours === `remboursement:${v.id}`}
                        onClick={() => onConfirmer(v.id)}
                      >
                        {enCours === `remboursement:${v.id}` ? 'Remboursement…' : 'Confirmer le remboursement'}
                      </Button>
                      <Button variant="ghost" disabled={enCours === `remboursement:${v.id}`} onClick={onAnnuler}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : null}

                {retour?.commandeId === v.id ? (
                  <div className={s.retour} role="status">
                    <Notice tone={retour.tone}>
                      {retour.text}
                      {retour.lien ? (
                        <>
                          {' '}
                          <a className={s.lien} href={retour.lien} target="_blank" rel="noopener noreferrer">
                            Ouvrir ce paiement dans Stripe
                          </a>
                        </>
                      ) : null}
                    </Notice>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {etat === 'pret' && aRembourser && !peutRembourser ? (
        <p className={s.pied}>
          Le remboursement d’une vente est réservé à la personne titulaire du cabinet : l’argent
          repart de son compte Stripe.
        </p>
      ) : null}
    </Card>
  )
}
