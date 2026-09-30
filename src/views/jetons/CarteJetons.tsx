import { useState } from 'react'
import { useMaybeAuth } from '@/auth/session'
import { useJetons } from '@/cabinet/useJetons'
import { Button, Card, Notice, Title } from '@/components/ui'
import {
  ACTION_COURTE,
  LIBELLE_ACTION,
  dateDite,
  debitDit,
  etatHypnoseDit,
  euroParJeton,
  forfaitDuMois,
  jetonsDits,
  libelleOptionHypnose,
  phraseDuForfait,
  precedentesDites,
  prixDit,
  quandDit,
  repartitionDesLots,
} from '@/lib/jetonsIA'
import type { ActionJetons, EtatJetons } from '@/types/jetons'
import s from './Jetons.module.css'

/**
 * Les actions que la praticienne peut lancer aujourd'hui — toutes, depuis
 * que les retouches ont leur bouton : le pouce baissé sous chaque texte de
 * l'IA (0066).
 */
const ACTIONS_OUVERTES: ActionJetons[] = ['seance', 'module', 'profil', 'affirmations', 'hypnose', 'retouche', 'retouche_hypnose']

/** Au-delà, l'historique se déplie. */
const LIGNES_VISIBLES = 8

export interface VueJetonsProps {
  etat: EtatJetons
  /** Seule la titulaire achète (server/jetons.ts) : les autres voient, sans bouton. */
  titulaire: boolean
  /** L'achat qui part : « recharge-<id> » ou « hypnose ». */
  enCours: string
  echec: string
  /** Le cabinet a-t-il une clé Anthropic posée ? Elle reste là, mais ne sert plus. */
  cleCabinetPosee?: boolean
  onAcheter?: (choix: { recharge: string } | { option: 'hypnose' }) => void
}

/**
 * La carte des jetons, telle qu'Intégrations la montre en mode jetons — pure,
 * pour le banc de rendu.
 *
 * Elle remplace la clé Anthropic du cabinet : c'est le revendeur qui paie
 * l'analyse. Quatre questions, dans l'ordre où la praticienne se les pose :
 * combien m'en reste-t-il, qu'est-ce que ça coûte, comment en racheter, et
 * où sont-ils passés.
 */
export function VueJetons({ etat, titulaire, enCours, echec, cleCabinetPosee = false, onAcheter }: VueJetonsProps) {
  const [toutVoir, setToutVoir] = useState(false)
  const bas = etat.solde < etat.bareme.seance
  const achatOuvert = etat.paiementPossible && etat.enRegle
  const lignes = toutVoir ? etat.historique : etat.historique.slice(0, LIGNES_VISIBLES)
  const option = etat.optionHypnose
  const h = etat.hypnose
  /* Un forfait de zéro jeton n'en est pas un : la carte le dit comme une
     offre sans forfait, plutôt que « votre jeton du mois se renouvelle ». */
  const forfait = forfaitDuMois(etat)
  /* Les jetons du pass expirent avec lui : ils ne vont pas sous « douze mois ». */
  const { douzeMois, option: jetonsDuPass } = repartitionDesLots(etat.lots)

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Jetons IA
        </Title>
        <span className={bas ? `${s.etat} ${s.etatBas}` : s.etat}>{jetonsDits(etat.solde)}</span>
      </div>
      <p className={s.carteTexte}>
        Votre revendeur paie l'analyse de vos séances : chaque note, module, profil ou hypnose
        utilise des jetons, décomptés de votre solde. Aucune clé Anthropic n'est nécessaire.
      </p>

      {/* Placé en jetons par son revendeur (0070), qui a retiré sa clé depuis :
          le cabinet ne retombe pas sur la sienne, et l'analyse attend. */}
      {!etat.pret ? (
        <Notice tone="warn">
          Votre revendeur a placé votre cabinet en jetons, mais sa clé d'analyse n'est pas posée :
          l'analyse est suspendue jusqu'à ce qu'il la pose. Prévenez-le ; vos jetons sont gardés.
        </Notice>
      ) : null}

      {!etat.enRegle ? (
        <Notice tone="warn">
          Votre contrat n'est pas en cours : vos jetons sont gardés, mais aucune analyse ne s'écrit
          et aucune recharge ne s'achète tant qu'il ne l'est pas de nouveau.
        </Notice>
      ) : null}

      <div className={s.solde}>
        <div>
          <span className={s.soldeChiffre}>{etat.solde.toLocaleString('fr-FR')}</span>
          <span className={s.soldeUnite}>{etat.solde > 1 ? 'jetons restants' : 'jeton restant'}</span>
        </div>
        <ul className={s.lots}>
          {forfait ? (
            <li>
              Forfait du mois : <strong>{forfait.restant.toLocaleString('fr-FR')}</strong> sur{' '}
              {forfait.total.toLocaleString('fr-FR')}
            </li>
          ) : null}
          {etat.essai ? (
            <li>
              Essai : <strong>{etat.essai.restant.toLocaleString('fr-FR')}</strong> sur{' '}
              {etat.essai.total.toLocaleString('fr-FR')}, jusqu'au {dateDite(etat.essai.fin)}
            </li>
          ) : null}
          <li>
            Achetés ou offerts : <strong>{douzeMois.toLocaleString('fr-FR')}</strong>
            {douzeMois > 1 ? ', valables douze mois' : douzeMois === 1 ? ', valable douze mois' : ''}
          </li>
          {jetonsDuPass ? (
            <li>
              Offerts avec l'option Hypnose : <strong>{jetonsDuPass.restant.toLocaleString('fr-FR')}</strong>,
              jusqu'au {dateDite(jetonsDuPass.fin)}
            </li>
          ) : null}
        </ul>
      </div>
      {forfait ? <p className={s.renouvellement}>{phraseDuForfait(forfait)}</p> : null}
      {!forfait && !etat.essai && etat.enRegle ? (
        <p className={s.renouvellement}>Votre offre ne comprend pas de forfait mensuel : vos jetons viennent de vos recharges.</p>
      ) : null}

      {echec ? (
        <Notice tone="warn" style={{ marginTop: 14 }}>
          {echec}
        </Notice>
      ) : null}

      <div className={s.section}>
        <h3 className={s.sectionTitre}>Ce que coûte chaque action</h3>
        <ul className={s.bareme}>
          {ACTIONS_OUVERTES.map((a) => (
            <li key={a} className={s.baremeLigne}>
              <span>{LIBELLE_ACTION[a]}</span>
              <span className={s.baremeJetons}>{jetonsDits(etat.bareme[a])}</span>
            </li>
          ))}
        </ul>
        <p className={s.note}>
          Une analyse qui échoue ne se paie pas : ses jetons reviennent aussitôt. Les consignes d'une
          séance et la mise à jour du profil qui la suit sont comprises dans son prix. Les jetons du
          mois (ou de l'essai) partent en premier, puis ceux de l'option Hypnose, puis vos recharges,
          la plus ancienne d'abord.
        </p>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitre}>Recharger</h3>
        {!etat.paiementPossible ? (
          <p className={s.note}>Pour recharger, contactez votre revendeur.</p>
        ) : etat.recharges.length === 0 ? (
          <p className={s.note}>Votre revendeur ne propose aucune recharge pour le moment : contactez-le.</p>
        ) : (
          <>
            <ul className={s.recharges}>
              {etat.recharges.map((r) => (
                <li key={r.id} className={s.recharge}>
                  <span className={s.rechargeNom}>{r.libelle}</span>
                  <span className={s.rechargePrix}>{prixDit(r.prixCents)}</span>
                  <span className={s.rechargeUnite}>
                    {jetonsDits(r.jetons)} · {euroParJeton(r.prixCents, r.jetons)} le jeton
                  </span>
                  {titulaire ? (
                    <Button
                      variant="secondary"
                      disabled={!achatOuvert || enCours !== ''}
                      onClick={() => onAcheter?.({ recharge: r.id })}
                    >
                      {enCours === `recharge-${r.id}` ? 'Ouverture du paiement…' : 'Acheter'}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className={s.note}>
              {titulaire
                ? 'Le paiement se fait sur la page sécurisée de Stripe, au nom de votre revendeur. Les jetons achetés restent valables douze mois.'
                : 'Seule la titulaire du cabinet peut acheter des jetons. Ceux achetés restent valables douze mois.'}
            </p>
          </>
        )}
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitre}>Option Hypnose</h3>
        <div className={s.option}>
          <span className={s.optionEtat}>{etatHypnoseDit(h)}</span>
          {!h.incluse && etat.paiementPossible && titulaire ? (
            <Button
              variant={h.droit ? 'secondary' : 'primary'}
              className={s.long}
              disabled={!etat.enRegle || enCours !== ''}
              onClick={() => onAcheter?.({ option: 'hypnose' })}
            >
              {enCours === 'hypnose'
                ? 'Ouverture du paiement…'
                : libelleOptionHypnose(option, h.droit ? "Prolonger l'option" : "Activer l'option")}
            </Button>
          ) : null}
        </div>
        {!h.incluse && !etat.paiementPossible ? (
          <p className={s.note}>Demandez l'option Hypnose à votre revendeur.</p>
        ) : null}
        {!h.incluse && etat.paiementPossible && !titulaire ? (
          <p className={s.note}>Seule la titulaire du cabinet peut activer l'option Hypnose.</p>
        ) : null}
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitre}>Dernières consommations</h3>
        {etat.historique.length === 0 ? (
          <p className={s.note}>Aucune analyse décomptée pour l'instant.</p>
        ) : (
          <ul className={s.historique}>
            {lignes.map((l, i) => (
              <li key={`${l.le}-${i}`} className={s.historiqueLigne}>
                <span className={s.historiqueQuand}>{quandDit(l.le)}</span>
                <span>{ACTION_COURTE[l.action] ?? l.action}</span>
                <span className={l.jetons === 0 || l.statut === 'rembourse' ? `${s.historiqueDebit} ${s.historiqueCompris}` : s.historiqueDebit}>
                  {debitDit(l)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {etat.historique.length > LIGNES_VISIBLES ? (
          <Button variant="ghost" onClick={() => setToutVoir((v) => !v)} style={{ marginTop: 8 }}>
            {toutVoir ? 'Replier' : precedentesDites(etat.historique.length - LIGNES_VISIBLES)}
          </Button>
        ) : null}
      </div>

      {cleCabinetPosee ? (
        <p className={s.note}>
          La clé Anthropic de votre cabinet reste enregistrée, mais elle ne sert plus : tant que
          votre revendeur fournit les jetons, c'est lui qui paie l'analyse.
        </p>
      ) : null}
    </Card>
  )
}

/**
 * La carte des jetons, branchée : l'état partagé du cabinet, et l'achat qui
 * part chez Stripe. Seule la titulaire achète — la base et le serveur le
 * vérifient ; l'écran ne propose simplement pas ce qu'ils refuseraient.
 */
export function CarteJetons({ cleCabinetPosee = false }: { cleCabinetPosee?: boolean }) {
  const jetons = useJetons()
  const auth = useMaybeAuth()
  const titulaire = auth?.context?.cabinet?.role === 'owner'
  const [enCours, setEnCours] = useState('')
  const [echec, setEchec] = useState('')

  if (!jetons?.etat) return null

  async function acheter(choix: { recharge: string } | { option: 'hypnose' }) {
    if (!jetons || enCours) return
    setEnCours('recharge' in choix ? `recharge-${choix.recharge}` : 'hypnose')
    setEchec('')
    const message = await jetons.acheter(choix)
    // Réussi, la page part chez Stripe : on ne revient ici qu'en échec.
    if (message) {
      setEchec(message)
      setEnCours('')
    }
  }

  return (
    <VueJetons
      etat={jetons.etat}
      titulaire={titulaire}
      enCours={enCours}
      echec={echec}
      cleCabinetPosee={cleCabinetPosee}
      onAcheter={(choix) => void acheter(choix)}
    />
  )
}
