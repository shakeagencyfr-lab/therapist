import { Notice } from '@/components/ui'
import { useDroits } from '@/cabinet/droits'
import { dateLongue } from '@/lib/format'

/**
 * Le bandeau du contrat arrêté.
 *
 * `subscriptions.status` et `trial_ends_at` ne pilotaient rien : un essai ne
 * se terminait pas, un impayé gardait tout. Depuis 0035 ils ferment les
 * leviers — boutique, marque blanche, site, ouverture de fiches — et laissent
 * les dossiers entiers.
 *
 * Un droit qui se referme sans un mot se lit comme une panne : la thérapeute
 * clique, rien ne s'ouvre, et elle cherche du côté de son navigateur. Ce
 * bandeau est donc la moitié qui manque à la règle — il dit ce qui est
 * suspendu, ce qui ne l'est pas, et à qui parler.
 */
export function BandeauContrat() {
  const droits = useDroits()
  const d = droits?.droits
  // Rien tant qu'on ne sait pas : un bandeau d'impayé affiché à tort, même une
  // seconde, coûte plus cher que le silence.
  if (!d || d.enRegle) return null

  const quand = d.echeance ? dateLongue(d.echeance) : ''
  const cause =
    d.statut === 'essai'
      ? `Votre période d'essai s'est terminée${quand ? ` le ${quand}` : ''}.`
      : d.statut === 'impaye'
        ? 'Votre dernier règlement n’a pas abouti.'
        : d.statut === 'suspendu'
          ? 'Votre abonnement est suspendu.'
          : d.statut === 'resilie'
            ? 'Votre abonnement a pris fin.'
            : "Aucun abonnement n'est enregistré pour ce cabinet."

  return (
    <Notice tone="hot" style={{ margin: '12px 20px 0' }}>
      {cause} Vos dossiers, vos séances et les espaces de vos patients restent
      accessibles. Sont suspendus jusqu'à la reprise : l'analyse par l'IA, la boutique, la marque
      blanche, le site vitrine et l'ouverture de nouvelles fiches. Votre revendeur peut réactiver
      l'offre depuis son espace.
    </Notice>
  )
}
