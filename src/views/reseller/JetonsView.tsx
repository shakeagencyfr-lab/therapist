import { useState } from 'react'
import { GesteAConfirmer } from '@/components/GesteAConfirmer'
import { Button, Notice, Pill, TextInput } from '@/components/ui'
import {
  ACTIONS_DU_BAREME,
  CONSIGNES_PAR_SEANCE_ESTIMEES,
  LIBELLE_ACTION,
  SEUIL_MARGE,
  centimesCourts,
  coutsParAction,
  dateDite,
  entierSaisi,
  euroParJeton,
  jetonsDits,
  margeDe,
  offertsDits,
  prixDit,
  prixDuJetonCents,
  prixEnSaisie,
  prixSaisi,
} from '@/lib/jetonsIA'
import { plural } from '@/lib/format'
import { useJetonsRevendeur } from '@/reseller/useJetonsRevendeur'
import type { ActionJetons, ActionRevendeur, Bareme, EtatRevendeurJetons, RechargeRevendeur } from '@/types/jetons'
import s from './JetonsView.module.css'

/** Un geste envoyé, et la phrase qui dit s'il a abouti. */
type Agir = (cle: string, action: ActionRevendeur, confirmation: string) => Promise<boolean>

interface SectionProps {
  etat: EtatRevendeurJetons
  /** Le propriétaire, connecté : lui seul règle. Les autres lisent. */
  peutRegler: boolean
  enCours: string
  agir: Agir
}

/** Ce qu'on dit à la place d'un contrôle fermé : pas de bouton grisé sans raison. */
const RESERVE = 'Réservé au compte propriétaire de votre organisation.'

/**
 * L'onglet « Jetons IA » de l'espace revendeur.
 *
 * Le revendeur y décide si SA clé Anthropic paie l'analyse de tous ses
 * cabinets, et à quel prix : le barème, les recharges, l'option Hypnose,
 * l'essai, le compte Stripe qui encaisse. Tant qu'il n'active pas, rien ne
 * change pour personne — chaque cabinet garde sa clé (server/jetons.ts).
 *
 * LE BARÈME SE LIT AVEC SA MARGE. Un prix en jetons ne dit rien seul : à
 * côté de chaque action, ce qu'elle coûte vraiment chez Anthropic (mesuré sur
 * les appels de ses cabinets), ce qu'elle rapporte au jeton le moins cher de
 * ses recharges, et la marge — en alerte sous 60 %.
 *
 * Lire est à toute l'équipe ; régler, au propriétaire (server/revendeur.ts).
 * Aucune clé ne revient jamais à l'écran : une date de pose, pas un
 * caractère.
 */
export function JetonsView() {
  const jetons = useJetonsRevendeur()
  const [sortie, setSortie] = useState<{ ton: 'ok' | 'warn'; texte: string } | null>(null)
  if (!jetons) return null

  const { etat, reel, chargement, erreur, enCours } = jetons
  const peutRegler = reel && etat?.proprietaire === true

  const agir: Agir = async (cle, action, confirmation) => {
    setSortie(null)
    const r = await jetons.agir(cle, action, confirmation)
    setSortie({ ton: r.ok ? 'ok' : 'warn', texte: r.message })
    return r.ok
  }

  return (
    <>
      {!reel && !chargement ? (
        <p className={s.demo}>Réglages de démonstration : connectez-vous pour régler les vôtres.</p>
      ) : null}
      {reel && etat && !etat.proprietaire ? (
        <p className={s.demo}>
          Ces réglages se font par le compte propriétaire de votre organisation : vous les voyez, sans
          pouvoir les changer.
        </p>
      ) : null}
      {erreur ? (
        <Notice tone="warn" style={{ marginBottom: 18 }}>
          {erreur}
        </Notice>
      ) : null}
      {sortie ? (
        <Notice tone={sortie.ton} style={{ marginBottom: 18 }}>
          {sortie.texte}
        </Notice>
      ) : null}

      {!etat ? (
        chargement ? <p className={s.demo}>Lecture de vos réglages de jetons…</p> : null
      ) : (
        <div className={s.pile}>
          <CleAnalyse etat={etat} peutRegler={peutRegler} enCours={enCours} agir={agir} />
          <BaremeJetons
            // Une relecture de la base repart du barème enregistré.
            key={ACTIONS_DU_BAREME.map((a) => etat.bareme[a]).join('|')}
            etat={etat}
            peutRegler={peutRegler}
            enCours={enCours}
            agir={agir}
          />
          <div className={s.grille}>
            <Recharges etat={etat} peutRegler={peutRegler} enCours={enCours} agir={agir} />
            <div className={s.colonne}>
              <OptionHypnose
                key={`${etat.optionHypnose.prixCents}|${etat.optionHypnose.jours}|${etat.optionHypnose.jetons}`}
                etat={etat}
                peutRegler={peutRegler}
                enCours={enCours}
                agir={agir}
              />
              <Essai key={etat.essaiJetons} etat={etat} peutRegler={peutRegler} enCours={enCours} agir={agir} />
            </div>
          </div>
          <Encaissement etat={etat} peutRegler={peutRegler} enCours={enCours} agir={agir} />
          <Consommation etat={etat} />
        </div>
      )}
    </>
  )
}

/* ---- La clé d'analyse ---------------------------------------------------- */

function CleAnalyse({ etat, peutRegler, enCours, agir }: SectionProps) {
  const [cle, setCle] = useState('')
  const [remplacer, setRemplacer] = useState(false)
  const posee = etat.cle.posee
  const occupe = enCours !== ''

  async function enregistrer() {
    const ok = await agir(
      'cle',
      { action: 'cle', cle: cle.trim() },
      posee ? 'Nouvelle clé vérifiée et enregistrée.' : 'Clé vérifiée et enregistrée.',
    )
    if (ok) {
      setCle('')
      setRemplacer(false)
    }
  }

  /* LE RÉGLAGE DE TOUS, ET LES EXCEPTIONS (0070). Un cabinet peut être placé
     dans l'autre mode depuis ses exceptions (écran Offres) : le compte des
     cabinets en jetons est donc celui de leur mode effectif, et la phrase
     dit combien suivent leur propre réglage. */
  const enJetons = etat.cabinets.filter((c) => c.modeEffectif === 'jetons').length
  const aPart = etat.cabinets.filter((c) => c.override !== null).length
  const forcesEnJetons = etat.cabinets.filter((c) => c.override === 'jetons').length
  const exceptionsDites =
    aPart === 0
      ? ''
      : aPart === 1
        ? ' Un cabinet a son propre réglage (ses exceptions, écran Offres).'
        : ` ${aPart} cabinets ont leur propre réglage (leurs exceptions, écran Offres).`
  const etatDuMode =
    (etat.mode === 'jetons'
      ? `Activé : ${plural(enJetons, 'cabinet analyse', 'cabinets analysent')} avec votre clé et paie${enJetons > 1 ? 'nt' : ''} en jetons.`
      : etat.actif
        ? "Activé, mais sans clé enregistrée : chaque cabinet garde la sienne tant que vous n'en posez pas une."
        : 'Désactivé : chaque cabinet branche sa propre clé Anthropic et paie ses appels.') + exceptionsDites
  /* Les cabinets placés en jetons par exception ne retombent pas sur leur
     clé : retirer la vôtre les arrête. Le geste le dit avant d'agir. */
  const forcesDits =
    forcesEnJetons === 0
      ? ''
      : forcesEnJetons === 1
        ? ' Le cabinet placé en jetons par exception ne pourra plus rien analyser tant que la clé ne sera pas reposée.'
        : ` Les ${forcesEnJetons} cabinets placés en jetons par exception ne pourront plus rien analyser tant que la clé ne sera pas reposée.`

  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Votre clé d'analyse</h2>
        <Pill tone={posee ? 'accent' : 'neutral'}>{posee ? 'Clé enregistrée' : 'Aucune clé'}</Pill>
      </div>
      <p className={s.panelSub}>
        La clé Anthropic de votre organisation. Elle est vérifiée par un vrai appel avant d'être
        enregistrée, puis chiffrée : elle ne réapparaît jamais à l'écran, pas même ici.
      </p>

      {!etat.chiffrement ? (
        <Notice tone="warn" style={{ marginBottom: 14 }}>
          Le serveur ne peut pas encore chiffrer les clés (variable <code>INTEGRATIONS_KEY</code>{' '}
          absente) : l'enregistrement d'une clé est refusé plutôt que fait en clair.
        </Notice>
      ) : null}

      {posee ? (
        <div className={s.posee}>
          <span className={s.poseeTexte}>
            Enregistrée le {dateDite(etat.cle.poseeLe)}, chiffrée.
          </span>
          {peutRegler ? (
            <span className={s.gestes}>
              {!remplacer ? (
                <Button variant="ghost" disabled={occupe} onClick={() => setRemplacer(true)}>
                  Remplacer
                </Button>
              ) : null}
              <GesteAConfirmer
                libelle="Retirer"
                confirmer="Retirer la clé"
                libelleEnCours="Retrait…"
                enCours={enCours === 'cle-retirer'}
                disabled={occupe && enCours !== 'cle-retirer'}
                onConfirmer={() =>
                  void agir('cle-retirer', { action: 'cle', retirer: true }, 'Clé retirée. Les jetons sont désactivés : chaque cabinet reprend sa clé.')
                }
                consequence={`Les jetons se coupent aussitôt : chaque cabinet reprend sa propre clé Anthropic, et ceux qui n'en ont pas ne peuvent plus rien analyser.${forcesDits} Pour la reposer, il faudra la recopier depuis votre console Anthropic.`}
              />
            </span>
          ) : null}
        </div>
      ) : !peutRegler ? (
        <p className={s.muted}>Aucune clé n'est enregistrée.</p>
      ) : null}

      {peutRegler && (!posee || remplacer) ? (
        <form
          className={s.formLigne}
          onSubmit={(e) => {
            e.preventDefault()
            void enregistrer()
          }}
        >
          <label className={s.champ}>
            <span className={s.label}>{posee ? 'Nouvelle clé Anthropic' : "Clé d'API Anthropic"}</span>
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={cle}
              onChange={(e) => setCle(e.target.value)}
              placeholder="sk-ant-…"
              disabled={!etat.chiffrement || occupe}
            />
          </label>
          <span className={s.gestes}>
            <Button variant="primary" type="submit" disabled={!etat.chiffrement || occupe || !cle.trim()}>
              {enCours === 'cle' ? 'Vérification…' : 'Vérifier et enregistrer'}
            </Button>
            {remplacer ? (
              <Button
                variant="ghost"
                disabled={occupe}
                onClick={() => {
                  setRemplacer(false)
                  setCle('')
                }}
              >
                Annuler
              </Button>
            ) : null}
          </span>
        </form>
      ) : null}

      <div className={s.bascule}>
        <span className={s.basculeTexte}>
          <span className={s.basculeTitre}>Alimenter tous mes cabinets avec cette clé</span>
          <span className={s.aide}>{etatDuMode}</span>
          <span className={s.aide}>
            Activé, vos cabinets n'ont plus besoin de leur propre clé : chaque analyse est payée par
            la vôtre et décomptée de leurs jetons — le forfait mensuel de leur offre, puis ce qu'ils
            rachètent. Un cabinet peut aussi être réglé à part, dans ses exceptions (écran Offres).
          </span>
        </span>
        {!peutRegler ? (
          <span className={s.aide}>{RESERVE}</span>
        ) : etat.actif ? (
          <GesteAConfirmer
            libelle="Désactiver"
            confirmer="Revenir aux clés des cabinets"
            libelleEnCours="Désactivation…"
            enCours={enCours === 'actif'}
            disabled={occupe && enCours !== 'actif'}
            onConfirmer={() =>
              void agir('actif', { action: 'reglages', actif: false }, 'Jetons désactivés : chaque cabinet reprend sa propre clé.')
            }
            consequence={`Chaque cabinet repaie ses analyses avec sa propre clé Anthropic dès maintenant ; ceux qui n'en ont pas posé ne peuvent plus rien analyser. Leurs jetons restants sont gardés pour une prochaine activation.${forcesEnJetons ? ' Les cabinets placés en jetons par exception y restent.' : ''}`}
          />
        ) : (
          <Button
            variant="primary"
            disabled={occupe || !posee}
            title={posee ? undefined : "Posez d'abord votre clé."}
            onClick={() =>
              void agir('actif', { action: 'reglages', actif: true }, 'Jetons activés : vos cabinets analysent désormais avec votre clé.')
            }
          >
            {enCours === 'actif' ? 'Activation…' : 'Activer'}
          </Button>
        )}
      </div>
      {peutRegler && !posee && !etat.actif ? (
        <p className={s.aide}>
          Posez d'abord votre clé : sans elle, les jetons n'auraient rien pour payer l'analyse.
        </p>
      ) : null}
    </section>
  )
}

/* ---- Le barème --------------------------------------------------------- */

type SaisieBareme = Record<ActionJetons, string>

function versSaisie(b: Bareme): SaisieBareme {
  const saisie = {} as SaisieBareme
  for (const a of ACTIONS_DU_BAREME) saisie[a] = String(b[a])
  return saisie
}

function BaremeJetons({ etat, peutRegler, enCours, agir }: SectionProps) {
  const [saisie, setSaisie] = useState<SaisieBareme>(() => versSaisie(etat.bareme))
  const prixJeton = prixDuJetonCents(etat.recharges)
  const couts = coutsParAction(etat.coutsReels)

  const lus = ACTIONS_DU_BAREME.map((a) => ({ action: a, valeur: entierSaisi(saisie[a], 0, 10_000) }))
  const invalide = lus.some((l) => l.valeur === null)
  const changes: Partial<Bareme> = {}
  for (const l of lus) if (l.valeur !== null && l.valeur !== etat.bareme[l.action]) changes[l.action] = l.valeur
  const modifie = !invalide && Object.keys(changes).length > 0

  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Barème des jetons</h2>
        <span className={s.compte}>
          {prixJeton === null
            ? 'Aucune recharge en vente'
            : `Jeton le moins cher : ${(prixJeton / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €`}
        </span>
      </div>
      <p className={s.panelSub}>
        Ce que chaque action coûte à vos praticiennes, en jetons. À côté : ce qu'elle vous coûte
        vraiment chez Anthropic, ce qu'elle vous rapporte au prix du jeton le moins cher de vos
        recharges, et votre marge — en alerte sous {SEUIL_MARGE} %.
      </p>

      <div className={s.bareme}>
        <div className={s.baremeTete} aria-hidden>
          <span>Action</span>
          <span>Jetons</span>
          <span>Coût réel</span>
          <span>Prix payé</span>
          <span>Marge</span>
        </div>
        <ul className={s.baremeListe}>
          {lus.map(({ action, valeur }) => {
            const jetonsAction = valeur ?? etat.bareme[action]
            const cout = couts[action]
            const m = margeDe(jetonsAction, prixJeton, cout)
            return (
              <li key={action} className={s.baremeLigne}>
                <span className={s.baremeAction}>{LIBELLE_ACTION[action]}</span>
                <span className={s.baremeCellule} data-libelle="Jetons">
                  {peutRegler ? (
                    <TextInput
                      inputMode="numeric"
                      className={s.champJetons}
                      value={saisie[action]}
                      onChange={(e) => setSaisie((x) => ({ ...x, [action]: e.target.value }))}
                      aria-label={`Jetons pour : ${LIBELLE_ACTION[action]}`}
                      aria-invalid={valeur === null}
                    />
                  ) : (
                    <strong>{jetonsDits(etat.bareme[action])}</strong>
                  )}
                </span>
                <span className={s.baremeCellule} data-libelle="Coût réel">
                  {cout === undefined ? <span className={s.muet}>non mesuré</span> : centimesCourts(cout)}
                </span>
                <span className={s.baremeCellule} data-libelle="Prix payé">
                  {m.prixCents === null ? '—' : centimesCourts(m.prixCents)}
                </span>
                <span
                  className={m.faible ? `${s.baremeCellule} ${s.faible}` : s.baremeCellule}
                  data-libelle="Marge"
                >
                  {m.margePct === null ? (m.faible ? 'à perte' : '—') : `${m.margePct} %`}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <p className={s.aide}>
        Coûts moyens mesurés sur les quatre-vingt-dix derniers jours d'appels de vos cabinets, au taux
        fixe de l'application. La séance additionne la note et la mise à jour du profil qui la suit ;
        ses modules se paient chacun au prix du module, en séance comme dans l'atelier — une séance
        avec {CONSIGNES_PAR_SEANCE_ESTIMEES} modules retenus coûte donc la séance plus{' '}
        {CONSIGNES_PAR_SEANCE_ESTIMEES} modules. L'hypnose additionne ses quatre mouvements. Une
        action sans mesure n'a pas encore été lancée par vos cabinets.
      </p>

      {peutRegler ? (
        <div className={s.pied}>
          {invalide ? (
            <span className={s.probleme}>Chaque prix est un nombre entier de jetons, entre 0 et 10 000.</span>
          ) : (
            <span className={s.aide}>Un nouveau prix vaut pour la prochaine action lancée, dans tous vos cabinets.</span>
          )}
          <Button
            variant="secondary"
            disabled={!modifie || enCours !== ''}
            onClick={() => void agir('bareme', { action: 'reglages', bareme: changes }, 'Barème enregistré.')}
          >
            {enCours === 'bareme' ? 'Enregistrement…' : 'Enregistrer le barème'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

/* ---- Les recharges ------------------------------------------------------ */

function LigneRecharge({ r, peutRegler, enCours, agir }: { r: RechargeRevendeur } & Omit<SectionProps, 'etat'>) {
  const [edition, setEdition] = useState(false)
  const [libelle, setLibelle] = useState(r.libelle)
  const [jetons, setJetons] = useState(String(r.jetons))
  const [prix, setPrix] = useState(prixEnSaisie(r.prixCents))
  const occupe = enCours !== ''

  const n = entierSaisi(jetons, 1, 1_000_000)
  const cents = prixSaisi(prix)
  const valide = libelle.trim().length > 0 && libelle.trim().length <= 80 && n !== null && cents !== null && cents >= 100

  async function enregistrer() {
    if (!valide || n === null || cents === null) return
    const ok = await agir(
      `recharge-${r.id}`,
      { action: 'recharge', id: r.id, libelle: libelle.trim(), jetons: n, prixCents: cents },
      'Recharge enregistrée.',
    )
    if (ok) setEdition(false)
  }

  if (edition) {
    return (
      <li className={s.ligne}>
        <form
          className={s.formRecharge}
          onSubmit={(e) => {
            e.preventDefault()
            void enregistrer()
          }}
        >
          <label className={s.champ}>
            <span className={s.label}>Libellé</span>
            <TextInput value={libelle} maxLength={80} onChange={(e) => setLibelle(e.target.value)} />
          </label>
          <label className={s.champ}>
            <span className={s.label}>Jetons</span>
            <TextInput inputMode="numeric" value={jetons} onChange={(e) => setJetons(e.target.value)} />
          </label>
          <label className={s.champ}>
            <span className={s.label}>Prix (€)</span>
            <TextInput inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)} />
          </label>
          <span className={s.gestes}>
            <Button variant="primary" type="submit" disabled={!valide || occupe}>
              {enCours === `recharge-${r.id}` ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button variant="ghost" disabled={occupe} onClick={() => setEdition(false)}>
              Annuler
            </Button>
          </span>
        </form>
        <span className={s.aide}>
          {valide && n !== null && cents !== null
            ? `${euroParJeton(cents, n)} le jeton.`
            : 'Un libellé, un nombre entier de jetons, un prix d’au moins 1 €.'}
        </span>
      </li>
    )
  }

  return (
    <li className={s.ligne}>
      <span className={s.qui}>
        <span className={s.nom}>
          {r.libelle}
          {!r.actif ? <span className={s.horsVente}> · hors vente</span> : null}
        </span>
        <span className={s.detail}>
          {jetonsDits(r.jetons)} · {prixDit(r.prixCents)} · {euroParJeton(r.prixCents, r.jetons)} le jeton
        </span>
      </span>
      {peutRegler ? (
        <span className={s.gestes}>
          {!r.actif ? (
            <Button
              variant="ghost"
              disabled={occupe}
              onClick={() => void agir(`recharge-${r.id}`, { action: 'recharge', id: r.id, actif: true }, 'Recharge remise en vente.')}
            >
              Remettre en vente
            </Button>
          ) : null}
          <Button variant="ghost" disabled={occupe} onClick={() => setEdition(true)}>
            Modifier
          </Button>
          <GesteAConfirmer
            libelle="Retirer"
            confirmer="Retirer de la vente"
            libelleEnCours="Retrait…"
            enCours={enCours === `archiver-${r.id}`}
            disabled={occupe && enCours !== `archiver-${r.id}`}
            onConfirmer={() =>
              void agir(`archiver-${r.id}`, { action: 'recharge', id: r.id, archiver: true }, 'Recharge retirée de la vente.')
            }
            consequence="Vos praticiennes ne la verront plus. Les jetons déjà achetés restent sur leur solde, jusqu'à leur échéance."
          />
        </span>
      ) : null}
    </li>
  )
}

function NouvelleRecharge({ enCours, agir }: Pick<SectionProps, 'enCours' | 'agir'>) {
  const [libelle, setLibelle] = useState('')
  const [jetons, setJetons] = useState('')
  const [prix, setPrix] = useState('')
  const n = entierSaisi(jetons, 1, 1_000_000)
  const cents = prixSaisi(prix)
  const valide = libelle.trim().length > 0 && libelle.trim().length <= 80 && n !== null && cents !== null && cents >= 100

  async function ajouter() {
    if (!valide || n === null || cents === null) return
    const ok = await agir(
      'recharge-nouvelle',
      { action: 'recharge', libelle: libelle.trim(), jetons: n, prixCents: cents },
      `Recharge « ${libelle.trim()} » mise en vente.`,
    )
    if (ok) {
      setLibelle('')
      setJetons('')
      setPrix('')
    }
  }

  return (
    <form
      className={s.formRecharge}
      onSubmit={(e) => {
        e.preventDefault()
        void ajouter()
      }}
    >
      <label className={s.champ}>
        <span className={s.label}>Nouvelle recharge</span>
        <TextInput value={libelle} maxLength={80} placeholder="500 jetons" onChange={(e) => setLibelle(e.target.value)} />
      </label>
      <label className={s.champ}>
        <span className={s.label}>Jetons</span>
        <TextInput inputMode="numeric" value={jetons} placeholder="500" onChange={(e) => setJetons(e.target.value)} />
      </label>
      <label className={s.champ}>
        <span className={s.label}>Prix (€)</span>
        <TextInput inputMode="decimal" value={prix} placeholder="45" onChange={(e) => setPrix(e.target.value)} />
      </label>
      <span className={s.gestes}>
        <Button variant="secondary" type="submit" disabled={!valide || enCours !== ''}>
          {enCours === 'recharge-nouvelle' ? 'Ajout…' : 'Ajouter'}
        </Button>
      </span>
      {valide && n !== null && cents !== null ? (
        <span className={s.aide}>{euroParJeton(cents, n)} le jeton.</span>
      ) : null}
    </form>
  )
}

function Recharges({ etat, peutRegler, enCours, agir }: SectionProps) {
  const enVente = etat.recharges.filter((r) => r.actif).length
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Recharges</h2>
        <span className={s.compte}>{enVente} en vente</span>
      </div>
      <p className={s.panelSub}>
        Ce que vos praticiennes achètent quand leur forfait ne suffit plus. Les jetons achetés restent
        valables douze mois.
      </p>
      {etat.recharges.length === 0 ? (
        <p className={s.muted}>Aucune recharge : vos praticiennes ne peuvent rien acheter.</p>
      ) : (
        <ul className={s.liste}>
          {etat.recharges.map((r) => (
            <LigneRecharge
              key={`${r.id}|${r.libelle}|${r.jetons}|${r.prixCents}|${r.actif}`}
              r={r}
              peutRegler={peutRegler}
              enCours={enCours}
              agir={agir}
            />
          ))}
        </ul>
      )}
      {peutRegler ? <NouvelleRecharge enCours={enCours} agir={agir} /> : <p className={s.aide}>{RESERVE}</p>}
    </section>
  )
}

/* ---- L'option Hypnose, l'essai ------------------------------------------ */

function OptionHypnose({ etat, peutRegler, enCours, agir }: SectionProps) {
  const o = etat.optionHypnose
  const [prix, setPrix] = useState(prixEnSaisie(o.prixCents))
  const [jours, setJours] = useState(String(o.jours))
  const [jetons, setJetons] = useState(String(o.jetons))
  const cents = prixSaisi(prix)
  const j = entierSaisi(jours, 1, 366)
  const n = entierSaisi(jetons, 0, 1_000_000)
  const lu = cents !== null && cents >= 100 && j !== null && n !== null ? { prixCents: cents, jours: j, jetons: n } : null
  const modifie = lu !== null && (lu.prixCents !== o.prixCents || lu.jours !== o.jours || lu.jetons !== o.jetons)

  return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Option Hypnose</h2>
      <p className={s.panelSub}>
        Le pass qu'une praticienne achète quand son offre ne comprend pas l'hypnose. Il ouvre
        l'écriture d'hypnoses pour la durée choisie ; racheté, il se prolonge.
      </p>
      {peutRegler ? (
        <>
          <div className={s.trois}>
            <label className={s.champ}>
              <span className={s.label}>Prix (€)</span>
              <TextInput inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)} />
            </label>
            <label className={s.champ}>
              <span className={s.label}>Durée (jours)</span>
              <TextInput inputMode="numeric" value={jours} onChange={(e) => setJours(e.target.value)} />
            </label>
            <label className={s.champ}>
              <span className={s.label}>Jetons offerts</span>
              <TextInput inputMode="numeric" value={jetons} onChange={(e) => setJetons(e.target.value)} />
            </label>
          </div>
          <div className={s.pied}>
            {!lu ? (
              <span className={s.probleme}>Un prix d'au moins 1 €, de 1 à 366 jours, un nombre entier de jetons.</span>
            ) : (
              <span className={s.aide}>
                {prixDit(lu.prixCents)} pour {plural(lu.jours, 'jour', 'jours')}
                {lu.jetons > 0 ? `, ${offertsDits(lu.jetons)}` : ''}.
              </span>
            )}
            <Button
              variant="secondary"
              disabled={!modifie || enCours !== ''}
              onClick={() =>
                lu && void agir('option', { action: 'reglages', optionHypnose: lu }, 'Option Hypnose enregistrée.')
              }
            >
              {enCours === 'option' ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </>
      ) : (
        <p className={s.lecture}>
          {prixDit(o.prixCents)} pour {plural(o.jours, 'jour', 'jours')}
          {o.jetons > 0 ? `, ${offertsDits(o.jetons)}` : ''}.
        </p>
      )}
    </section>
  )
}

function Essai({ etat, peutRegler, enCours, agir }: SectionProps) {
  const [jetons, setJetons] = useState(String(etat.essaiJetons))
  const n = entierSaisi(jetons, 0, 1_000_000)
  const modifie = n !== null && n !== etat.essaiJetons

  return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Essai</h2>
      <p className={s.panelSub}>
        Les jetons versés une fois à un cabinet en essai. Ils expirent avec l'essai ; un essai
        prolongé les prolonge.
      </p>
      {peutRegler ? (
        <div className={s.pied}>
          <label className={s.champ}>
            <span className={s.label}>Jetons offerts pendant l'essai</span>
            <TextInput
              inputMode="numeric"
              className={s.champJetons}
              value={jetons}
              onChange={(e) => setJetons(e.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            disabled={!modifie || enCours !== ''}
            onClick={() =>
              n !== null && void agir('essai', { action: 'reglages', essaiJetons: n }, "Jetons de l'essai enregistrés.")
            }
          >
            {enCours === 'essai' ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      ) : (
        <p className={s.lecture}>{offertsDits(etat.essaiJetons)} pendant l'essai.</p>
      )}
      {n === null && peutRegler ? <p className={s.probleme}>Un nombre entier de jetons, zéro compris.</p> : null}
    </section>
  )
}

/* ---- L'encaissement ------------------------------------------------------ */

function Encaissement({ etat, peutRegler, enCours, agir }: SectionProps) {
  const [cle, setCle] = useState('')
  const occupe = enCours !== ''
  const st = etat.stripe

  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Encaissement</h2>
        <Pill tone={st.pose ? 'accent' : 'neutral'}>{st.pose ? 'Stripe connecté' : 'Non connecté'}</Pill>
      </div>
      <p className={s.panelSub}>
        Les paiements de vos praticiennes — recharges et option Hypnose — arrivent directement sur
        votre compte Stripe, sans intermédiaire. Sans compte connecté, elles ne peuvent rien acheter en
        ligne : elles vous demandent des jetons.
      </p>

      {st.pose ? (
        <div className={s.posee}>
          <span className={s.poseeTexte}>
            {st.compte ? <strong>{st.compte}</strong> : null}
            {st.compte ? ' · ' : ''}connecté le {dateDite(st.poseLe)}
          </span>
          {peutRegler ? (
            <GesteAConfirmer
              libelle="Déconnecter"
              confirmer="Déconnecter Stripe"
              libelleEnCours="Déconnexion…"
              enCours={enCours === 'stripe-retirer'}
              disabled={occupe && enCours !== 'stripe-retirer'}
              onConfirmer={() =>
                void agir('stripe-retirer', { action: 'stripe', retirer: true }, 'Compte Stripe déconnecté.')
              }
              consequence="Vos praticiennes ne pourront plus acheter de recharges ni l'option Hypnose en ligne : elles devront vous demander des jetons. Pour reconnecter, il faudra ressaisir la clé secrète."
            />
          ) : null}
        </div>
      ) : peutRegler ? (
        <form
          className={s.formLigne}
          onSubmit={(e) => {
            e.preventDefault()
            void agir('stripe', { action: 'stripe', cle: cle.trim() }, 'Compte Stripe vérifié et connecté.').then((ok) => {
              if (ok) setCle('')
            })
          }}
        >
          <label className={s.champ}>
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
          </label>
          <Button variant="primary" type="submit" disabled={!etat.chiffrement || occupe || !cle.trim()}>
            {enCours === 'stripe' ? 'Vérification…' : 'Vérifier et connecter'}
          </Button>
        </form>
      ) : (
        <p className={s.aide}>{RESERVE}</p>
      )}
    </section>
  )
}

/* ---- La consommation du mois --------------------------------------------- */

function Consommation({ etat }: { etat: EtatRevendeurJetons }) {
  const total = etat.cabinets.reduce((n, c) => n + c.consommesMois, 0)
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Consommation du mois</h2>
        <span className={s.compte}>{jetonsDits(total)} depuis le 1er</span>
      </div>
      <p className={s.panelSub}>
        {etat.mode === 'jetons' || etat.cabinets.some((c) => c.modeEffectif === 'jetons')
          ? 'Les jetons décomptés depuis le premier du mois, et ce qui reste à chaque cabinet. Un cabinet sur sa propre clé ne décompte rien.'
          : "Les jetons ne sont pas activés : rien n'est décompté. Les soldes offerts attendent l'activation."}
      </p>
      {etat.cabinets.length === 0 ? (
        <p className={s.muted}>Aucun cabinet pour l'instant.</p>
      ) : (
        <ul className={s.liste}>
          {etat.cabinets.map((c) => (
            <li key={c.cabinetId} className={s.ligne}>
              {/* Le mode effectif du cabinet (0070) : c'est lui qui dit si ses
                  chiffres comptent. « par exception » quand il ne suit pas
                  votre réglage. */}
              <span className={s.qui}>
                <span className={s.nom}>{c.nom}</span>
                <span className={s.modeCabinet}>
                  {`${c.modeEffectif === 'jetons' ? 'Jetons' : 'Clé du cabinet'}${c.override !== null ? ', par exception' : ''}`}
                </span>
              </span>
              <span className={s.chiffres}>
                <span>
                  <strong>{c.consommesMois.toLocaleString('fr-FR')}</strong> ce mois-ci
                </span>
                <span className={c.solde === 0 ? s.faible : undefined}>
                  <strong>{c.solde.toLocaleString('fr-FR')}</strong> en solde
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
