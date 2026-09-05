import { Card, Notice, Overline } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import {
  buildPatientContext,
  derniereReponseEstMaquette as derniereEstMaquette,
  refreshProfile,
} from '@/services/aiClient'
import { axisBand, profileOf, profilePrecision } from '@/state/selectors'
import { useStore } from '@/state/store'
import type { PsychProfile as Profile } from '@/types/domain'
import s from './PsychProfile.module.css'

/**
 * L'historique d'un axe, retrouvé par son libellé.
 *
 * Le libellé est la seule clé : le modèle est prié de garder les mêmes axes
 * d'une version à l'autre, mais il peut en remplacer un quand la séance en
 * révèle un plus juste. Un axe renommé repart donc d'une courbe vide, ce qui
 * est honnête — ce n'est plus la même mesure.
 */
export function suiteDe(profile: Profile, label: string): number[] {
  const versions = profile.historique ?? []
  return versions
    .map((v) => v.axes.find((a) => a.label === label)?.value)
    .filter((v): v is number => typeof v === 'number')
}

/** Le mouvement d'un axe, une fois la marge d'incertitude retirée. */
export function tendance(
  suite: number[],
  marge: number,
): { sens: 'hausse' | 'baisse' | 'stable'; ecart: number } {
  if (suite.length < 2) return { sens: 'stable', ecart: 0 }
  const ecart = suite[suite.length - 1] - suite[0]
  /* UN ÉCART PLUS PETIT QUE LA MARGE N'EST PAS UNE TENDANCE. La marge dit
     ce qu'on ne sait pas encore ; annoncer « + 3 » quand on mesure à ± 12
     près la rendrait décorative. */
  if (Math.abs(ecart) < marge) return { sens: 'stable', ecart }
  return { sens: ecart > 0 ? 'hausse' : 'baisse', ecart }
}

/**
 * La courbe d'un axe, tracée SUR 0-100 et jamais recadrée sur ses valeurs.
 *
 * Une courbe qui s'ajuste à ses propres extrêmes transforme trois points
 * d'écart en falaise. Sur un axe mesuré à ± douze points, ce serait inventer
 * un mouvement — et cette carte se lit avant une séance.
 */
function Courbe({ suite, titre }: { suite: number[]; titre: string }) {
  const L = 132
  const H = 34
  const x = (i: number) => (suite.length === 1 ? L / 2 : (i / (suite.length - 1)) * L)
  const y = (v: number) => H - (Math.max(0, Math.min(100, v)) / 100) * H
  const trace = suite.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const dernier = suite.length - 1

  return (
    <svg
      className={s.courbe}
      viewBox={`0 -4 ${L} ${H + 8}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={titre}
    >
      {/* Repère à mi-échelle : discret, il donne le seul point fixe qui
          permette de situer la courbe sans axe chiffré. */}
      <line x1="0" y1={y(50)} x2={L} y2={y(50)} className={s.courbeMedian} />
      <path d={trace} className={s.courbeTrait} />
      {suite.map((v, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(v)}
          r={i === dernier ? 3.5 : 2.5}
          className={i === dernier ? s.courbePointFin : s.courbePoint}
        >
          <title>{`Version ${i + 1} : ${v} sur 100`}</title>
        </circle>
      ))}
    </svg>
  )
}

/**
 * Profil psychologique du patient sélectionné : portrait, axes avec leur
 * bande d'incertitude, conseils d'accompagnement et points d'attention.
 *
 * La bande se resserre à chaque séance : la règle de précision (marge et
 * palier de maturité) vit dans `profilePrecision`.
 */
export function PsychProfile() {
  const { state, set } = useStore()
  const cabinet = useMaybeCabinet()
  const key = state.sel
  const profile = profileOf(state, key)
  const precision = profilePrecision(state, key)
  const busy = state.profGen === key
  const resume = state.profNote[key]

  async function refresh() {
    // Une seule actualisation à la fois, tous patients confondus.
    if (state.profGen) return
    set({ profGen: key })
    try {
      /* La séance en mémoire est celle de l'écran Séance, et elle n'est pas
         effacée en changeant de fiche. L'envoyer sans vérifier à qui elle
         appartient faisait analyser le dossier d'un patient AVEC la
         transcription d'une autre — le pire défaut possible ici. */
      const memeFiche = state.sessionPatient === key
      const result = await refreshProfile({
        context: buildPatientContext(state, key),
        notes: memeFiche ? state.sessionNotes : '',
        synthese: memeFiche && state.draft ? state.draft.synthese : '',
        transcript: memeFiche ? state.transcript : '',
      })
      const next: Profile = {
        updated: "Actualisé à l'instant, depuis la dernière séance",
        portrait: result.portrait || profile?.portrait || '',
        axes: (result.axes ?? [])
          .filter((a) => !!a && !!a.label)
          .map((a) => ({
            label: a.label,
            value: Math.max(0, Math.min(100, Math.round(a.value))),
            note: a.note || '',
          })),
        levers: (result.levers ?? []).filter((l) => !!l && !!l.title),
        dynamique: result.dynamique || profile?.dynamique,
        alliance: result.alliance || profile?.alliance,
        care: (result.care ?? []).filter((c) => typeof c === 'string'),
        /* L'HISTORIQUE SUIT. `profileOf` préfère cette version fraîche à
           celle du dossier, et l'IA ne rend pas l'historique : les courbes de
           tendance des axes disparaissaient donc au moment même où une
           version de plus venait de les enrichir — et pour toute la session,
           `profNew` n'étant jamais vidé. On recopie ce que le dossier sait ;
           le nouveau point s'y ajoutera au rechargement, une fois écrit. */
        historique: profile?.historique,
      }
      set((prev) => ({
        profGen: '',
        profNew: { ...prev.profNew, [key]: next },
        profNote: { ...prev.profNote, [key]: result.resume || 'Profil actualisé.' },
      }))
      /* Une actualisation qui ne s'écrit pas est une analyse payée pour rien :
         elle disparaissait au rechargement, après avoir affiché « Actualisé à
         l'instant ». Le profil est versionné en base, comme depuis la séance. */
      if (cabinet?.reel && !derniereEstMaquette()) {
        const r = await cabinet.enregistrerProfil(key, null, {
          portrait: next.portrait,
          axes: next.axes,
          levers: next.levers,
          dynamique: next.dynamique,
          alliance: next.alliance,
          care: next.care,
          resume: result.resume ?? '',
        })
        if (!r.ok) {
          set((prev) => ({
            profNote: {
              ...prev.profNote,
              [key]: "Profil actualisé à l'écran, mais pas conservé : réessayez pour l'enregistrer.",
            },
          }))
        } else {
          /* Écrit : le dossier fait foi. On relit et on retire la version
             d'écran, sans quoi elle masquerait pour le reste de la session ce
             que la base contient — le nouveau point de la courbe compris. */
          await cabinet.recharger()
          set((prev) => {
            const profNew = { ...prev.profNew }
            delete profNew[key]
            return { profNew }
          })
        }
      }
    } catch {
      set((prev) => ({
        profGen: '',
        profNote: { ...prev.profNote, [key]: "L'actualisation a échoué. Réessayez." },
      }))
    }
  }

  const sessionsWord = precision.sessions > 1 ? 'séances' : 'séance'


  // Le profil n'existe qu'à partir d'un patient ; la carte n'est montée
  // qu'avec elle.
  if (!profile) return null

  return (
    <Card className={s.card}>
      <div className={s.head}>
        <div className={s.identity}>
          <h2 className={s.title}>Profil psychologique</h2>
          <span className={s.subtitle}>
            Établi à partir de vos notes, affiné après chaque séance
          </span>
        </div>
        <div className={s.actions}>
          <span className={s.maturity}>{precision.label}</span>
          <span className={s.updated}>{profile.updated}</span>
          <button type="button" className={s.refresh} onClick={refresh} disabled={busy}>
            {busy ? 'Analyse des notes…' : 'Actualiser le profil'}
          </button>
        </div>
      </div>

      <div className={s.body}>
        <div className={s.left}>
          <p className={s.portrait}>{profile.portrait}</p>

          {/* Le mouvement, que l'ancien profil ne disait jamais : une photo
              n'apprend rien à qui suit quelqu'un depuis six séances. */}
          {profile.dynamique ? (
            <div className={s.bloc}>
              <Overline>Ce qui bouge</Overline>
              <p className={s.blocTexte}>{profile.dynamique}</p>
            </div>
          ) : null}

          {profile.alliance ? (
            <div className={s.bloc}>
              <Overline>Dans la relation de travail</Overline>
              <p className={s.blocTexte}>{profile.alliance}</p>
            </div>
          ) : null}

          <div className={s.axes}>
            <Overline>Où en est cette personne</Overline>
            {profile.axes.length === 0 ? (
              <p className={s.vide}>
                Cette version du profil n'a pas rendu d'axes. Actualisez-le : l'analyse les
                redemande explicitement.
              </p>
            ) : null}
            {profile.axes.map((axis) => {
              const band = axisBand(axis.value, precision.margin)
              const suite = suiteDe(profile, axis.label)
              const mouvement = tendance(suite, precision.margin)
              return (
                <div className={s.axis} key={axis.label}>
                  <div className={s.axisHead}>
                    <span className={s.axisLabel}>{axis.label}</span>
                    <span className={s.axisValeur}>{axis.value}</span>
                  </div>

                  <div className={s.axisCorps}>
                    <div className={s.axisMesure}>
                      <div
                        className={s.track}
                        role="img"
                        aria-label={`${axis.value} sur 100, à ± ${precision.margin} points près`}
                      >
                        <span
                          className={s.band}
                          style={{ left: `${band.lo}%`, width: `${band.hi - band.lo}%` }}
                          aria-hidden
                        />
                        <span className={s.mark} style={{ left: `${axis.value}%` }} aria-hidden />
                      </div>
                      <span className={s.axisNote}>{axis.note}</span>
                    </div>

                    {/* La courbe n'apparaît qu'à partir de deux versions : une
                        ligne à un seul point n'est pas une tendance, c'est un
                        point. */}
                    {suite.length > 1 ? (
                      <div className={s.axisTendance}>
                        <Courbe
                          suite={suite}
                          titre={`${axis.label} : ${suite.join(', ')} sur 100, au fil des versions`}
                        />
                        <span
                          className={
                            mouvement.sens === 'stable'
                              ? s.delta
                              : `${s.delta} ${mouvement.sens === 'hausse' ? s.deltaHausse : s.deltaBaisse}`
                          }
                        >
                          {mouvement.sens === 'stable'
                            ? 'stable'
                            : `${mouvement.ecart > 0 ? '+' : '−'}${Math.abs(mouvement.ecart)} pts`}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          <div className={s.marginNote}>
            {`La bande claire indique la marge d'incertitude, ± ${precision.margin} points sur ${precision.sessions} ${sessionsWord}. Elle se réduit à chaque rendez-vous.`}
            {profile.axes.length > 0 && (profile.historique?.length ?? 0) < 2
              ? " La tendance apparaîtra à la prochaine actualisation : il faut deux versions pour tracer un mouvement."
              : ''}
          </div>

          {resume ? <Notice tone="ok">{resume}</Notice> : null}
        </div>

        <div className={s.right}>
          <Overline>Comment l'accompagner</Overline>

          {/* Un titre suivi de rien laissait croire à un écran cassé. Quand
              l'analyse n'a rien rendu, la carte le dit et donne le geste. */}
          {profile.levers.length === 0 ? (
            <p className={s.vide}>
              Cette version du profil n'a pas rendu de leviers. Actualisez-le pour les obtenir.
            </p>
          ) : (
            <div className={s.levers}>
              {profile.levers.map((lever, i) => (
                <div className={s.lever} key={lever.title}>
                  <span className={s.leverNum} aria-hidden>
                    {i + 1}
                  </span>
                  <div className={s.leverBody}>
                    <span className={s.leverTitle}>{lever.title}</span>
                    <span className={s.leverText}>{lever.body}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {profile.care.length > 0 ? (
            <Notice tone="warn">
              <div className={s.careHead}>Points d'attention</div>
              <div className={s.careList}>
                {profile.care.map((point) => (
                  <div className={s.carePoint} key={point}>
                    <span className={s.careDash} aria-hidden>
                      —
                    </span>
                    <span className={s.careText}>{point}</span>
                  </div>
                ))}
              </div>
            </Notice>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
