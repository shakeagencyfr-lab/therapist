import { Notice } from '@/components/ui'
import { useDroits } from '@/cabinet/droits'
import { CE_QUI_EST_SUSPENDU, essaiBientotFini, phraseEssaiRestant } from '@/lib/contrat'
import { dateLongue } from '@/lib/format'
import type { Droits } from '@/services/cabinet'

/**
 * À qui parler de son contrat.
 *
 * L'écran disait « demandez à votre revendeur » à une thérapeute qui ne le
 * connaît souvent que par une facture : ni son nom, ni une adresse. Les deux
 * viennent maintenant avec les droits du cabinet (0049). Sans eux — une base
 * pas encore migrée —, la phrase générale d'avant.
 */
export function ContactRevendeur({
  revendeur,
  pour,
}: {
  revendeur: Droits['revendeur']
  /** Ce qu'on lui demandera : « pour réactiver l'offre », « pour relever le plafond »… */
  pour: string
}) {
  if (!revendeur?.nom) return <>Adressez-vous à votre revendeur {pour}.</>
  if (!revendeur.courriel) return <>Adressez-vous à votre revendeur, {revendeur.nom}, {pour}.</>
  return (
    <>
      Écrivez à votre revendeur, {revendeur.nom}, {pour} :{' '}
      <a href={`mailto:${revendeur.courriel}`}>{revendeur.courriel}</a>.
    </>
  )
}

/**
 * Le bandeau du contrat : celui qui s'arrête, et celui qui va s'arrêter.
 *
 * `subscriptions.status` et `trial_ends_at` ne pilotaient rien : un essai ne
 * se terminait pas, un impayé gardait tout. Depuis 0035 ils ferment les
 * leviers — boutique, marque blanche, site, ouverture de fiches — et laissent
 * les dossiers entiers.
 *
 * Un droit qui se referme sans un mot se lit comme une panne : la thérapeute
 * clique, rien ne s'ouvre, et elle cherche du côté de son navigateur. Ce
 * bandeau est donc la moitié qui manque à la règle — il dit ce qui est
 * suspendu, ce qui ne l'est pas, et à qui parler. Et il le dit AVANT : la
 * dernière semaine d'un essai, il compte les jours, pour que la fin ne
 * tombe pas un matin de séances.
 */
export function BandeauContrat() {
  const droits = useDroits()
  const d = droits?.droits
  // Rien tant qu'on ne sait pas : un bandeau d'impayé affiché à tort, même une
  // seconde, coûte plus cher que le silence.
  if (!d) return null

  if (d.enRegle) {
    const finEssai = d.finEssai ?? null
    const jours = essaiBientotFini({ statut: d.statut, enRegle: d.enRegle, finEssai })
    if (jours === null) return null
    return (
      <Notice tone="warn" style={{ margin: '12px 20px 0' }}>
        {phraseEssaiRestant(jours, finEssai)} Ensuite, {CE_QUI_EST_SUSPENDU} seront suspendus
        jusqu'à la souscription ; vos dossiers et les espaces de vos patients resteront
        accessibles. <ContactRevendeur revendeur={d.revendeur} pour="pour poursuivre" />
      </Notice>
    )
  }

  /* La fin d'essai d'abord, l'échéance à défaut : sur un essai, `echeance`
     est la fin de période quand il y en a une, qui n'est pas la date où
     l'essai a pris fin. */
  const fin = d.statut === 'essai' ? (d.finEssai ?? d.echeance) : null
  const quand = fin ? dateLongue(fin) : ''
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
      {cause} Vos dossiers, vos séances et les espaces de vos patients restent accessibles. Sont
      suspendus jusqu'à la reprise : {CE_QUI_EST_SUSPENDU}.{' '}
      <ContactRevendeur revendeur={d.revendeur} pour="pour réactiver l'offre" />
    </Notice>
  )
}
