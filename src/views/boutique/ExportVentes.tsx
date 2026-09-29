import { useState } from 'react'
import { Button, Card, Chip, Notice, Title } from '@/components/ui'
import { useMaybeAuth } from '@/auth/session'
import { useMaybeCabinet } from '@/cabinet/context'
import {
  PERIODES,
  bilanDuLivre,
  bornesDeLaPeriode,
  csvDuLivre,
  ecrituresDuLivre,
  nomFichierVentes,
  periodeDite,
  periodePredefinie,
  phraseDuBilan,
  refusPeriode,
  type ChoixPeriode,
} from '@/lib/ventes'
import { lireLeLivre, tracerExportDuLivre } from '@/services/ventes'
import s from './Ventes.module.css'

/** La période à exporter : une période toute faite, ou deux dates choisies. */
export function periodeChoisie(
  choix: ChoixPeriode,
  libre: { du: string; au: string },
  maintenant: Date = new Date(),
): { du: string; au: string } {
  return choix === 'libre' ? libre : periodePredefinie(choix, maintenant)
}

/**
 * Le livre des recettes, à télécharger — vue pure : l'état et les gestes
 * arrivent par les props (scripts/render-check.mts l'éprouve ainsi).
 *
 * DES INITIALES PAR DÉFAUT. Un livre de recettes part chez un comptable,
 * parfois par courriel ; il n'a pas à dire qui consulte. Le nom complet se
 * demande, et l'écran dit alors ce que cela engage.
 */
export function VueExportVentes({
  reel,
  choix,
  libre,
  nomsComplets,
  etat,
  retour,
  maintenant,
  onChoix,
  onLibre,
  onNomsComplets,
  onExporter,
}: {
  /** Faux sur le portefeuille de démonstration : rien à exporter. */
  reel: boolean
  choix: ChoixPeriode
  libre: { du: string; au: string }
  nomsComplets: boolean
  etat: 'repos' | 'lecture'
  retour: { tone: 'ok' | 'warn'; text: string } | null
  maintenant?: Date
  onChoix: (c: ChoixPeriode) => void
  onLibre: (p: { du: string; au: string }) => void
  onNomsComplets: (v: boolean) => void
  onExporter: () => void
}) {
  const { du, au } = periodeChoisie(choix, libre, maintenant)
  const refus = refusPeriode(du, au)
  const dite = refus ? '' : periodeDite(du, au)

  return (
    <Card className={s.bloc}>
      <div className={s.livre}>
        <Title large as="h2">
          Livre des recettes
        </Title>
        <p className={s.intro}>
          Toutes les ventes encaissées sur une période — et les remboursements, en négatif, à leur
          date — en un fichier que votre tableur ou votre comptable ouvre directement.
        </p>

        <div className={s.chips} role="group" aria-label="Période">
          {PERIODES.map((p) => (
            <Chip key={p.value} on={choix === p.value} onClick={() => onChoix(p.value)}>
              {p.label}
            </Chip>
          ))}
        </div>

        {choix === 'libre' ? (
          <div className={s.dates}>
            <label className={s.champ}>
              <span className={s.label}>Du</span>
              <input
                className={s.date}
                type="date"
                value={libre.du}
                max={libre.au || undefined}
                onChange={(e) => onLibre({ ...libre, du: e.target.value })}
              />
            </label>
            <label className={s.champ}>
              <span className={s.label}>Au</span>
              <input
                className={s.date}
                type="date"
                value={libre.au}
                min={libre.du || undefined}
                onChange={(e) => onLibre({ ...libre, au: e.target.value })}
              />
            </label>
          </div>
        ) : null}

        {refus ? (
          <p className={s.refus} role="alert">
            {refus}
          </p>
        ) : (
          <p className={s.periode}>Période : {dite}.</p>
        )}

        <label className={s.option}>
          <input type="checkbox" checked={nomsComplets} onChange={(e) => onNomsComplets(e.target.checked)} />
          <span className={s.optionTexte}>
            <span>Écrire le nom complet des patients</span>
            <span className={s.optionAide}>
              Sans cette case, le fichier ne porte que des initiales (« C. M. ») : il peut partir chez
              votre comptable sans dire qui vous accompagnez.
            </span>
          </span>
        </label>
        {nomsComplets ? (
          <Notice tone="warn">
            Le fichier nommera chaque personne qui a acheté, avec ce qu’elle a acheté. Transmettez-le
            par un moyen sûr, et ne le laissez pas sur un poste partagé.
          </Notice>
        ) : null}

        {retour ? (
          <div role="status">
            <Notice tone={retour.tone}>{retour.text}</Notice>
          </div>
        ) : null}

        <div className={s.actions}>
          <Button variant="secondary" disabled={!reel || Boolean(refus) || etat === 'lecture'} onClick={onExporter}>
            {etat === 'lecture' ? 'Lecture des ventes…' : 'Télécharger le livre (CSV)'}
          </Button>
          {!reel ? <span className={s.compte}>L’export se fait depuis la boutique réelle de votre cabinet.</span> : null}
        </div>
        <p className={s.pied}>
          Colonnes : date, opération, produit, patient, montant, devise, statut, référence du reçu,
          identifiants Stripe. Séparateur point-virgule et virgule décimale, pour Excel en français.
          Chaque export est inscrit au journal d’accès de votre cabinet — qui, quand, quelle
          période —, jamais son contenu. Les ventes d’une fiche supprimée disparaissent avec elle :
          exportez votre livre avant de supprimer une fiche.
        </p>
      </div>
    </Card>
  )
}

/** Le fichier, enregistré sur cet appareil. */
function enregistrer(contenu: string, nom: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }))
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  document.body.appendChild(lien)
  lien.click()
  lien.remove()
  // Laissé le temps au téléchargement de partir avant de libérer l'adresse.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Le livre des recettes du cabinet : lu en entier sur la période (pagination
 * en base, `lireLeLivre`), inscrit au journal d'accès, composé sur
 * l'appareil, téléchargé. Rien ne passe par le serveur : la RLS « le cabinet
 * lit ses commandes » suffit pour lire, et la trace s'écrit par une fonction
 * de la base qui n'y met aucune ligne du livre.
 */
export function ExportVentes() {
  const cabinet = useMaybeCabinet()
  const cabinetId = useMaybeAuth()?.context?.cabinet?.id ?? null
  const [choix, setChoix] = useState<ChoixPeriode>('mois')
  const [libre, setLibre] = useState(() => periodePredefinie('mois'))
  const [nomsComplets, setNomsComplets] = useState(false)
  const [etat, setEtat] = useState<'repos' | 'lecture'>('repos')
  const [retour, setRetour] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const reel = Boolean(cabinet?.reel && cabinetId)

  /** Lire, tracer, fabriquer : chaque étape qui échoue arrête les suivantes, et le dit. */
  async function preparer(du: string, au: string): Promise<{ tone: 'ok' | 'warn'; text: string }> {
    if (!cabinetId) return { tone: 'warn', text: 'Connectez-vous à votre cabinet.' }
    const bornes = bornesDeLaPeriode(du, au)
    const lu = await lireLeLivre(cabinetId, bornes)
    if (!lu.ok) return { tone: 'warn', text: lu.message }
    const ecritures = ecrituresDuLivre(lu.commandes, bornes, { nomsComplets })
    if (!ecritures.length) {
      return {
        tone: 'ok',
        text: `Aucune vente ni aucun remboursement ${periodeDite(du, au)} : il n’y avait rien à mettre dans un fichier.`,
      }
    }
    // La trace d'abord : sans elle, pas de fichier.
    const trace = await tracerExportDuLivre(cabinetId, { du, au }, nomsComplets)
    if (!trace.ok) return { tone: 'warn', text: trace.message }
    const nom = nomFichierVentes(du, au)
    try {
      enregistrer(csvDuLivre(ecritures), nom)
    } catch {
      return { tone: 'warn', text: 'Le fichier n’a pas pu être enregistré sur cet appareil. Réessayez.' }
    }
    return { tone: 'ok', text: `${nom} téléchargé : ${phraseDuBilan(bilanDuLivre(ecritures))}.` }
  }

  async function exporter() {
    if (!reel || etat === 'lecture') return
    const { du, au } = periodeChoisie(choix, libre)
    if (refusPeriode(du, au)) return
    setEtat('lecture')
    setRetour(null)
    setRetour(await preparer(du, au))
    setEtat('repos')
  }

  return (
    <VueExportVentes
      reel={reel}
      choix={choix}
      libre={libre}
      nomsComplets={nomsComplets}
      etat={etat}
      retour={retour}
      onChoix={(c) => {
        setChoix(c)
        setRetour(null)
      }}
      onLibre={(p) => {
        setLibre(p)
        setRetour(null)
      }}
      onNomsComplets={setNomsComplets}
      onExporter={() => void exporter()}
    />
  )
}
