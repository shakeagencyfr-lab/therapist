import { useState } from 'react'
import { Button, Card, Notice, Overline, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { hypnoseOuverte, useDroits } from '@/cabinet/droits'
import { useDevis } from '@/cabinet/useJetons'
import { useEcritureHypnose } from '@/cabinet/useEcritureHypnose'
import {
  MOUVEMENTS_HYPNOSE,
  NOM_MOUVEMENT,
  buildPatientContext,
  echecDeRetouche,
  pointDeReprise,
  retoucherMouvement,
} from '@/services/aiClient'
import { plural } from '@/lib/format'
import { telechargerHypnose } from '@/lib/hypnosePdf'
import { logoPourPdf } from '@/lib/logoPdf'
import type { IssueRetouche, RetourDeLaPraticienne } from '@/lib/retouche'
import { bilanHypnose, corrigerTexte, libelleReprise, rangDuMouvement } from '@/lib/texteHypnose'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import { useMaybeAuth } from '@/auth/session'
import type { Hypnose, HypnoseMouvement } from '@/types/domain'
import { CoutEnJetons } from '@/views/jetons/CoutEnJetons'
import { VerrouHypnose } from '@/views/jetons/VerrouHypnose'
import { TexteMouvement } from './TexteMouvement'
import s from './HypnosesFiche.module.css'

/** « 2 septembre 2026 » */
function dateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Les hypnoses écrites pour ce patient, et de quoi en refaire une.
 *
 * Elles sont pliées : une séance d'hypnose fait trois mille mots, et la fiche
 * n'est pas l'endroit où on la lit d'un bout à l'autre — c'est l'endroit où on
 * la retrouve, où on en réécrit une autrement, et où on efface celles qui
 * n'ont pas abouti.
 *
 * LA RÉÉCRITURE PART DE LA DERNIÈRE SÉANCE. Sans les formulations et la
 * synthèse qu'elle porte, on n'écrirait plus qu'à partir du dossier — et on
 * perdrait la matière la plus précieuse, les mots du patient. La fiche
 * charge donc ce brouillon avec le reste, et le dit quand il manque.
 *
 * UNE ÉCRITURE INTERROMPUE SE REPREND, ICI COMME DANS LA LISTE. Après un
 * échec au deuxième, troisième ou quatrième mouvement, l'écran restait figé :
 * le bloc de relance masqué par les mouvements déjà écrits, aucun bouton pour
 * fermer, aucun pour repartir du mouvement manquant. Il dit maintenant ce qui
 * est gardé, reprend au premier manquant, ou se ferme ; et une hypnose restée
 * interrompue en base se reprend depuis sa ligne.
 *
 * QUAND L'OFFRE NE L'OUVRE PLUS (0065), on n'écrit plus — mais ce qui est
 * écrit reste à elle : la liste se lit, se télécharge et s'efface comme
 * avant, et le verrou dit comment rouvrir l'écriture.
 */
export function HypnosesFiche() {
  const state = useAppState()
  const cabinet = useMaybeCabinet()
  const auth = useMaybeAuth()
  const fiche = patientOf(state)
  const [ouverte, setOuverte] = useState('')
  const [intention, setIntention] = useState('')
  const [aSupprimer, setASupprimer] = useState('')
  const [notice, setNotice] = useState('')
  const {
    ecriture,
    enCours,
    ecrits,
    erreur,
    fini,
    conservee,
    aReprendre,
    aEnregistrer,
    ecrire,
    reprendre,
    reprendreHypnose,
    reinitialiser,
  } = useEcritureHypnose()
  /** L'hypnose dont le PDF se fabrique : jsPDF se charge à la demande. */
  const [pdf, setPdf] = useState('')
  const verrouillee = !hypnoseOuverte(useDroits())
  const devis = useDevis('hypnose')

  async function enregistrerPdf(h: Hypnose) {
    if (pdf) return
    setPdf(h.id)
    try {
      // La marque du cabinet : son logo s'il en a déposé un, sa couleur d'accent.
      const branding = auth?.context?.cabinet?.branding
      await telechargerHypnose(h, fiche?.name ?? '', auth?.context?.cabinet?.name ?? '', {
        logo: await logoPourPdf(branding?.logoUrl),
        accent: branding?.accent ?? null,
      })
    } catch {
      setNotice("Le PDF n'a pas pu être fabriqué. Réessayez.")
    }
    setPdf('')
  }

  const hypnoses = fiche?.hypnoses ?? []
  if (!fiche || (hypnoses.length === 0 && !fiche.hypnoseActivee)) return null

  const prenom = fiche.name.split(' ')[0] ?? fiche.name
  const brouillon = fiche.dernierBrouillon
  const cle = state.sel

  async function supprimer(id: string) {
    setNotice('')
    const r = await cabinet?.supprimerHypnose(id)
    setASupprimer('')
    if (r && !r.ok) setNotice(r.message)
  }

  /**
   * Corrige un mouvement d'une hypnose déjà en base. L'écriture remplace le
   * mouvement (même hypnose, même rang) ; le dossier est relu ensuite pour
   * que la fiche — et le PDF — lisent le texte corrigé.
   */
  async function corrigerEnBase(h: Hypnose, m: HypnoseMouvement, texte: string) {
    return ecrireMouvement(h, { ...m, texte })
  }

  /** Remplace un mouvement en base — texte et titre —, puis relit le dossier. */
  async function ecrireMouvement(h: Hypnose, m: HypnoseMouvement) {
    if (!cabinet?.reel) {
      return { ok: false, message: 'En démonstration, aucune correction ne s’enregistre.' }
    }
    const r = await cabinet.ajouterMouvement(h.id, m, rangDuMouvement(m.mouvement))
    if (!r.ok) {
      return { ok: false, message: "La correction n'a pas pu être enregistrée : le dossier garde le texte d'avant." }
    }
    await cabinet.recharger()
    return { ok: true, message: '' }
  }

  /**
   * Fait retoucher un mouvement d'une hypnose en base (0066), les trois
   * autres en contexte, et l'enregistre comme une correction. La version
   * d'avant reste ici, en mémoire : « Annuler la retouche » la réécrit.
   */
  async function retoucherEnBase(h: Hypnose, m: HypnoseMouvement, retour: RetourDeLaPraticienne): Promise<IssueRetouche> {
    let rendu: { titre: string; texte: string }
    try {
      rendu = await retoucherMouvement({
        context: buildPatientContext(state, cle),
        brouillon: brouillon ?? null,
        intention: h.intention,
        hypnoseId: h.id,
        ecrit: m,
        autres: h.mouvements,
        retour,
      })
    } catch (err) {
      return echecDeRetouche(err)
    }
    const correction = corrigerTexte(rendu.texte)
    if (!correction.ok) return { ok: false, message: "La retouche est revenue vide : le texte d'avant reste en place." }
    const retouche: HypnoseMouvement = { ...m, titre: rendu.titre.trim() || m.titre, texte: correction.texte }
    const r = await ecrireMouvement(h, retouche)
    if (!r.ok) return { ok: false, message: r.message }
    return { ok: true, version: retouche.texte, annuler: () => ecrireMouvement(h, m) }
  }

  function fermer() {
    reinitialiser()
    setIntention('')
  }

  const bilan = bilanHypnose(
    { fini, conservee, ecrits: ecrits.length, interrompue: !!erreur, reel: !!cabinet?.reel },
    prenom,
  )

  return (
    <Card className={s.card}>
      <div className={s.head}>
        <Title large as="h2">
          Hypnoses de {prenom}
        </Title>
        {hypnoses.length ? (
          <span className={s.compte}>{plural(hypnoses.length, 'séance écrite', 'séances écrites')}</span>
        ) : null}
      </div>

      {notice ? <Notice tone="warn">{notice}</Notice> : null}
      {erreur ? <Notice tone="warn">{erreur}</Notice> : null}

      {verrouillee && !ecriture && ecrits.length === 0 && !erreur ? (
        <VerrouHypnose dejaEcrites={hypnoses.length > 0} />
      ) : null}

      {!verrouillee && hypnoses.length === 0 && !ecriture && ecrits.length === 0 && !erreur ? (
        <p className={s.vide}>
          L'hypnose est activée pour {prenom}. Elle s'écrira à sa prochaine séance — ou dès
          maintenant, à partir de la dernière.
        </p>
      ) : null}

      {/* Écrire, ou réécrire autrement. Une hypnose qui ne convient pas se
          refait avec une autre intention ; une tournure qui ne passe pas se
          corrige dans le texte. Masqué tant qu'une écriture est à l'écran —
          en cours, finie, ou interrompue : elle se ferme d'abord. */}
      {!verrouillee && !ecriture && ecrits.length === 0 && !erreur ? (
        <div className={s.relance}>
          <label className={s.champ}>
            <span className={s.label}>Ce que vous voulez travailler (facultatif)</span>
            <input
              className={s.input}
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              placeholder="Une autre métaphore, un angle différent, une séance plus courte…"
              disabled={!brouillon}
            />
          </label>
          <Button
            variant={hypnoses.length ? 'secondary' : 'primary'}
            disabled={!brouillon || !cabinet?.reel || Boolean(devis?.manque)}
            onClick={() => brouillon && void ecrire(cle, brouillon, intention)}
          >
            {hypnoses.length ? 'En écrire une autre' : 'Écrire une hypnose'}
          </Button>
        </div>
      ) : null}
      {!verrouillee && brouillon && !ecriture && ecrits.length === 0 && (!erreur || devis?.manque) ? (
        <CoutEnJetons devis={devis} sujet="Cette hypnose" />
      ) : null}

      {!brouillon && !verrouillee ? (
        <p className={s.hint}>
          Aucune séance analysée pour {prenom} : une hypnose se bâtit sur les formulations et la
          synthèse d'une séance. Captez-en une, et elle pourra s'écrire.
        </p>
      ) : null}

      {/* L'écriture en cours, annoncée dès le clic — et, après, ce qu'elle a
          donné : finie, ou interrompue avec de quoi reprendre. */}
      {ecriture || ecrits.length > 0 || erreur ? (
        <div className={s.progression}>
          {enCours ? (
            <p className={s.encours}>
              <span className={s.point} aria-hidden />
              {enCours} en cours d'écriture… chaque mouvement demande une trentaine de secondes.
            </p>
          ) : null}
          <ol className={s.avancement}>
            {MOUVEMENTS_HYPNOSE.map((m, i) => {
              const ecrit = ecrits[i]
              return (
                <li key={m} className={ecrit ? s.fait : s.attente}>
                  <span className={s.puce}>{ecrit ? '✓' : i + 1}</span>
                  <span>{ecrit?.titre || NOM_MOUVEMENT[m]}</span>
                </li>
              )
            })}
          </ol>
          {!ecriture && (fini || erreur) ? (
            <div className={s.finiLigne}>
              {bilan ? (
                bilan.ton === 'neutre' ? (
                  <p className={s.bilan}>{bilan.texte}</p>
                ) : (
                  <Notice tone={bilan.ton}>{bilan.texte}</Notice>
                )
              ) : null}
              <span className={s.gestes}>
                {aReprendre ? (
                  <Button variant="primary" onClick={() => void reprendre()}>
                    {libelleReprise(aReprendre)}
                  </Button>
                ) : null}
                {aEnregistrer ? (
                  <Button variant="primary" onClick={() => void reprendre()}>
                    Réessayer de l'enregistrer
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={fermer}>
                  Fermer
                </Button>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {hypnoses.length ? (
        <ul className={s.liste}>
          {hypnoses.map((h) => {
            const ouvert = ouverte === h.id
            const minutes = Math.round(
              h.mouvements.reduce((n, m) => n + m.texte.split(/\s+/).filter(Boolean).length, 0) / 100,
            )
            /* Où reprendre une hypnose restée interrompue en base. Toutes ses
               lignes peuvent être là (seule la fermeture a échoué) : la
               reprise ne réécrit alors rien, elle referme. */
            const manquant = h.complete ? null : (pointDeReprise(h.mouvements).restants[0] ?? null)
            return (
              <li key={h.id} className={s.item}>
                <div className={s.ligne}>
                  <button
                    type="button"
                    className={s.entete}
                    onClick={() => setOuverte(ouvert ? '' : h.id)}
                    aria-expanded={ouvert}
                  >
                    <span className={s.titre}>{h.titre}</span>
                    <span className={s.meta}>
                      {dateLongue(h.createdAt)}
                      {h.complete
                        ? minutes > 0
                          ? ` · ≈ ${minutes} min de lecture`
                          : ''
                        : ` · interrompue, ${plural(h.mouvements.length, 'mouvement', 'mouvements')} sur 4`}
                    </span>
                  </button>

                  {/* Reprendre là où l'écriture s'est arrêtée, plutôt que tout
                      repayer. Il faut la matière d'une séance, comme pour en
                      écrire une. */}
                  {!h.complete ? (
                    <button
                      type="button"
                      className={s.pdf}
                      disabled={ecriture || !brouillon || !cabinet?.reel || verrouillee}
                      onClick={() => brouillon && void reprendreHypnose(cle, brouillon, h)}
                      title={
                        verrouillee
                          ? 'L’hypnose n’est plus comprise dans votre offre : l’écriture ne se reprend pas.'
                          : brouillon
                            ? undefined
                            : 'Il faut une séance analysée pour reprendre l’écriture.'
                      }
                    >
                      {manquant ? libelleReprise(manquant) : 'Terminer'}
                    </button>
                  ) : null}

                  {/* Une hypnose interrompue ou en double n'a aucune valeur :
                      elle s'efface sans cérémonie. Une confirmation en un clic
                      suffit — ce n'est pas un dossier de santé, c'est un texte
                      qu'on peut réécrire. */}
                  {/* Le PDF, en un clic : la thérapeute LIT ce texte à voix
                      haute pendant une demi-heure, elle ne le fait pas défiler
                      dans un navigateur. */}
                  <button
                    type="button"
                    className={s.pdf}
                    disabled={pdf === h.id || !h.mouvements.length}
                    onClick={() => void enregistrerPdf(h)}
                    aria-label={`Télécharger « ${h.titre} » en PDF`}
                  >
                    {pdf === h.id ? 'Préparation…' : 'PDF'}
                  </button>

                  {aSupprimer === h.id ? (
                    <span className={s.confirme}>
                      <button type="button" className={s.oui} onClick={() => void supprimer(h.id)}>
                        Supprimer
                      </button>
                      <button type="button" className={s.non} onClick={() => setASupprimer('')}>
                        Annuler
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={s.effacer}
                      onClick={() => setASupprimer(h.id)}
                      aria-label={`Supprimer l'hypnose « ${h.titre} »`}
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                {ouvert ? (
                  <div className={s.corps}>
                    {h.intention ? (
                      <p className={s.intention}>
                        <Overline>Intention</Overline> {h.intention}
                      </p>
                    ) : null}
                    {h.mouvements.map((m) => (
                      <TexteMouvement
                        key={m.mouvement}
                        ecrit={m}
                        classes={{ article: s.mouvement, titre: s.mouvementTitre, para: s.para }}
                        onCorriger={
                          cabinet?.reel && !ecriture ? (texte) => corrigerEnBase(h, m, texte) : undefined
                        }
                        retouche={
                          cabinet?.reel
                            ? {
                                occupe: ecriture,
                                // Hors de l'option Hypnose, l'avis seul : la retouche est refusée.
                                onRetoucher: verrouillee ? undefined : (retour) => retoucherEnBase(h, m, retour),
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </Card>
  )
}
