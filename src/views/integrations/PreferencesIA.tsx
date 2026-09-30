import { useCallback, useEffect, useState } from 'react'
import { Card, Notice, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import type { LecturePreferences, PreferenceIA } from '@/cabinet/retouches'
import { CIBLES_RETOUCHE, LIBELLE_CIBLE, PREFERENCES_ACTIVES, PREFERENCES_LUES } from '@/lib/retouche'
import s from './PreferencesIA.module.css'

/** « 30 septembre 2026 » */
function dateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Les préférences, rangées par type de texte, dans l'ordre du produit. */
export function parType(preferences: readonly PreferenceIA[]): Array<{ cible: PreferenceIA['cible']; liste: PreferenceIA[] }> {
  return CIBLES_RETOUCHE.map((cible) => ({ cible, liste: preferences.filter((p) => p.cible === cible) })).filter(
    (g) => g.liste.length > 0,
  )
}

export interface VuePreferencesIAProps {
  lecture: LecturePreferences
  chargement: boolean
  /** L'identifiant de la préférence qui s'oublie en ce moment. */
  enCours: string
  echec: string
  onOublier: (id: string) => void
  onRelire: () => void
}

/**
 * Ce que l'IA a retenu du cabinet, rangé par type de texte — la vue seule,
 * pour l'écran et le banc de rendu.
 */
export function VuePreferencesIA({ lecture, chargement, enCours, echec, onOublier, onRelire }: VuePreferencesIAProps) {
  return (
    <Card className={s.carte}>
      <div className={s.tete}>
        <Title large as="h2">
          Préférences de l'IA
        </Title>
      </div>
      <p className={s.texte}>
        Quand une retouche vous convient, « Retenir cette préférence » garde ce que vous attendiez :
        l'IA le relit à chaque texte du même type, pour votre cabinet, tant que cela ne contredit pas
        ses règles. Elle en relit les {PREFERENCES_LUES} plus récentes ; au-delà de{' '}
        {PREFERENCES_ACTIVES} par type, les plus anciennes s'effacent d'elles-mêmes.
      </p>

      {echec ? <Notice tone="warn">{echec}</Notice> : null}

      {chargement && lecture === null ? (
        <p className={s.muet}>Lecture des préférences…</p>
      ) : lecture === 'indisponible' ? (
        <p className={s.muet}>Les préférences de l'IA ne sont pas encore disponibles sur ce serveur.</p>
      ) : lecture === null ? (
        <p className={s.muet}>
          Les préférences n'ont pas pu être lues.{' '}
          <button type="button" className={s.lien} onClick={onRelire}>
            Réessayer
          </button>
        </p>
      ) : lecture.length === 0 ? (
        <p className={s.muet}>
          Aucune préférence retenue pour l'instant. Sous chaque texte de l'IA, le pouce baissé ouvre la
          retouche ; cochez « Retenir cette préférence » pour que l'IA s'en souvienne.
        </p>
      ) : (
        <div className={s.groupes}>
          {parType(lecture).map(({ cible, liste }) => (
            <section key={cible} className={s.groupe} aria-label={LIBELLE_CIBLE[cible]}>
              <h3 className={s.groupeTitre}>{LIBELLE_CIBLE[cible]}</h3>
              <ul className={s.liste}>
                {liste.map((p) => (
                  <li key={p.id} className={s.ligne}>
                    <span className={s.consigne}>
                      {p.consigne}
                      <span className={s.date}>Retenue le {dateLongue(p.creeLe)}</span>
                    </span>
                    <button
                      type="button"
                      className={s.oublier}
                      disabled={Boolean(enCours)}
                      onClick={() => onOublier(p.id)}
                      aria-label={`Oublier la préférence « ${p.consigne} »`}
                    >
                      {enCours === p.id ? 'Oubli…' : 'Oublier'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  )
}

/**
 * Les préférences de l'IA, dans Intégrations — à côté de la clé ou des
 * jetons qui paient l'analyse, là où la praticienne règle ce qui la regarde.
 * Lues à l'ouverture de l'onglet ; oublier en retire une aussitôt.
 */
export function CartePreferencesIA() {
  const cabinet = useMaybeCabinet()
  const gestes = cabinet?.retouches
  const [lecture, setLecture] = useState<LecturePreferences>(null)
  const [chargement, setChargement] = useState(true)
  const [enCours, setEnCours] = useState('')
  const [echec, setEchec] = useState('')

  const relire = useCallback(async () => {
    if (!gestes) return
    setChargement(true)
    setLecture(await gestes.lire())
    setChargement(false)
  }, [gestes])

  useEffect(() => {
    void relire()
  }, [relire])

  async function oublier(id: string) {
    if (!gestes || enCours) return
    setEnCours(id)
    setEchec('')
    const r = await gestes.oublier(id)
    setEnCours('')
    if (!r.ok) {
      setEchec(r.message)
      return
    }
    setLecture((prev) => (Array.isArray(prev) ? prev.filter((p) => p.id !== id) : prev))
  }

  if (!cabinet?.reel) return null
  return (
    <VuePreferencesIA
      lecture={lecture}
      chargement={chargement}
      enCours={enCours}
      echec={echec}
      onOublier={(id) => void oublier(id)}
      onRelire={() => void relire()}
    />
  )
}
