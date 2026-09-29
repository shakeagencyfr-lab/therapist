import { useEffect, useState, type CSSProperties } from 'react'
import { MOT_MASQUE } from '@/lib/discretion'
import { HEURE_DU_SOIR_PAR_DEFAUT, heureDite, heureDuChamp, phrasePremierSoir, type PreferencesRappels } from '@/lib/rappelsReguliers'
import { usePreferencesRappels, type ChangementRappels, type EtatPreferences, type Resultat } from './usePreferencesRappels'
import p from './Proposition.module.css'
import s from './ReglagesRappels.module.css'

/** La couleur du cabinet, pour l'interrupteur et le bouton. */
function styleAccent(accent?: string): CSSProperties | undefined {
  return accent ? ({ '--accent-local': accent } as CSSProperties) : undefined
}

/**
 * Un interrupteur : une case à cocher annoncée comme telle, dont tout le
 * libellé se touche.
 */
function Interrupteur({
  id,
  coche,
  desactive,
  onChange,
  decritPar,
}: {
  id: string
  coche: boolean
  desactive: boolean
  onChange: (coche: boolean) => void
  decritPar?: string
}) {
  return (
    <span className={s.interrupteur}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={coche}
        disabled={desactive}
        aria-checked={coche}
        aria-describedby={decritPar}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={s.piste} aria-hidden />
    </span>
  )
}

export interface VueReglagesProps {
  etat: EtatPreferences
  preferences: PreferencesRappels | null
  enCours: boolean
  /** Ce téléphone-ci reçoit-il les rappels ? Les réglages valent pour tous les siens. */
  telephoneActif: boolean
  accent?: string
  onRegler: (changement: ChangementRappels) => Promise<Resultat>
  onRelire: () => void
  /** Pour le banc de rendu : l'heure qu'il est. */
  maintenant?: Date
}

/**
 * Ses réglages de rappel, tels qu'ils s'affichent — sans rien lire ni écrire.
 *
 * Séparés du chargement pour que le banc de rendu les montre dans chaque
 * état, et pour qu'on voie d'un coup d'œil ce que la personne lit avant de
 * décider : l'aperçu de l'écran verrouillé est celui qu'elle recevra.
 */
export function VueReglagesRappels({
  etat,
  preferences,
  enCours,
  telephoneActif,
  accent,
  onRegler,
  onRelire,
  maintenant,
}: VueReglagesProps) {
  const [heure, setHeure] = useState(preferences?.soirHeure ?? HEURE_DU_SOIR_PAR_DEFAUT)
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null)

  // L'heure enregistrée change (lecture, autre onglet) : le champ la suit.
  useEffect(() => {
    if (preferences) setHeure(preferences.soirHeure)
  }, [preferences])

  if (etat === 'indisponible') return null

  async function regler(changement: ChangementRappels, reussite: string) {
    setRetour(null)
    const r = await onRegler(changement)
    setRetour(r.ok ? { ok: true, message: reussite } : r)
  }

  const heureLue = heureDuChamp(heure)
  const heureChangee = Boolean(preferences && heureLue && heureLue !== preferences.soirHeure)

  return (
    <section className={p.carte} style={styleAccent(accent)} aria-labelledby="reglages-rappels-titre">
      <h2 id="reglages-rappels-titre" className={p.titre}>
        Vos réglages de rappel
      </h2>

      {etat === 'chargement' ? <p className={p.texte}>Lecture de vos réglages…</p> : null}

      {etat === 'echec' ? (
        <>
          <p className={s.erreur} role="alert">
            Vos réglages n'ont pas pu être lus. Tant qu'ils ne le sont pas, vos rappels gardent ceux
            que vous aviez — et, si vous n'aviez rien choisi, leur contenu reste masqué.
          </p>
          <button type="button" className={s.relire} onClick={onRelire}>
            Réessayer
          </button>
        </>
      ) : null}

      {etat === 'pret' && preferences ? (
        <>
          {!telephoneActif ? (
            <p className={p.texte}>
              Les rappels ne sont pas activés sur cet appareil. Ces réglages valent pour tous ceux où
              ils le sont.
            </p>
          ) : null}

          {/* ── Le rappel du soir ─────────────────────────────────────── */}
          <div className={s.bloc}>
            <div className={s.ligne}>
              <label htmlFor="rappel-soir">
                <span className={s.nom}>Un rappel pour la note du soir</span>
                <span id="rappel-soir-aide" className={s.aide}>
                  Chaque soir à l'heure choisie, s'il n'y a pas encore de note ce jour-là.
                </span>
              </label>
              <Interrupteur
                id="rappel-soir"
                coche={preferences.soirActif}
                desactive={enCours}
                decritPar="rappel-soir-aide"
                onChange={(coche) =>
                  void regler(
                    { soirActif: coche },
                    coche ? 'Rappel du soir activé.' : 'Rappel du soir retiré : plus rien ne vous sera envoyé le soir.',
                  )
                }
              />
            </div>

            {preferences.soirActif ? (
              <>
                <div className={s.heure}>
                  <label className={s.heureLabel} htmlFor="rappel-soir-heure">
                    À
                  </label>
                  <input
                    id="rappel-soir-heure"
                    className={s.heureChamp}
                    type="time"
                    step={60}
                    value={heure}
                    aria-invalid={!heureLue}
                    onChange={(e) => setHeure(e.target.value)}
                  />
                  {heureChangee && heureLue ? (
                    <button
                      type="button"
                      className={s.garder}
                      disabled={enCours}
                      onClick={() => void regler({ soirHeure: heureLue }, `Rappel du soir réglé à ${heureDite(heureLue)}.`)}
                    >
                      {enCours ? 'Enregistrement…' : `Garder ${heureDite(heureLue)}`}
                    </button>
                  ) : null}
                </div>
                <p className={s.suite}>
                  {!heureLue
                    ? 'Choisissez une heure et des minutes.'
                    : heureChangee
                      ? `Il arrive encore à ${heureDite(preferences.soirHeure)} tant que la nouvelle heure n'est pas gardée.`
                      : phrasePremierSoir(preferences.soirHeure, maintenant)}
                </p>
              </>
            ) : null}
          </div>

          {/* ── La discrétion ───────────────────────────────────────────── */}
          <div className={s.bloc}>
            <div className={s.ligne}>
              <label htmlFor="rappel-masque">
                <span className={s.nom}>Masquer le contenu sur l'écran verrouillé</span>
                <span id="rappel-masque-aide" className={s.aide}>
                  Recommandé. Le rappel arrive avec un texte neutre ; le mot se lit en ouvrant votre
                  espace.
                </span>
              </label>
              <Interrupteur
                id="rappel-masque"
                coche={preferences.masquerContenu}
                desactive={enCours}
                decritPar="rappel-masque-aide"
                onChange={(coche) =>
                  void regler(
                    { masquerContenu: coche },
                    coche
                      ? "Contenu masqué : l'écran verrouillé n'affiche plus qu'un texte neutre."
                      : "Contenu affiché : les mots de votre thérapeute se liront sur l'écran verrouillé.",
                  )
                }
              />
            </div>

            <figure className={s.apercu} aria-label="Aperçu de l'écran verrouillé">
              <span className={s.apercuHaut}>Sur l'écran verrouillé</span>
              {preferences.masquerContenu ? (
                <>
                  <span className={s.apercuTitre}>{MOT_MASQUE.titre}</span>
                  <span className={s.apercuTexte}>{MOT_MASQUE.corps}</span>
                </>
              ) : (
                <>
                  <span className={`${s.apercuTitre} ${s.apercuFictif}`}>Le titre du mot</span>
                  <span className={`${s.apercuTexte} ${s.apercuFictif}`}>
                    Le début du mot de votre thérapeute, lisible sans déverrouiller.
                  </span>
                </>
              )}
            </figure>
            {!preferences.masquerContenu ? (
              <p className={s.attention}>
                Toute personne qui voit votre téléphone pourra lire ces mots, et la question de
                votre note du soir.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {retour ? (
        retour.ok ? (
          <p className={p.ok} role="status" style={{ marginTop: 12 }}>
            {retour.message}
          </p>
        ) : (
          <p className={s.erreur} role="alert">
            {retour.message}
          </p>
        )
      ) : null}
    </section>
  )
}

/** Les réglages, lus et écrits pour la personne connectée. */
export function ReglagesRappels({
  patientId,
  accent,
  telephoneActif,
}: {
  patientId: string
  accent?: string
  telephoneActif: boolean
}) {
  const { etat, preferences, enCours, regler, relire } = usePreferencesRappels(patientId)
  return (
    <VueReglagesRappels
      etat={etat}
      preferences={preferences}
      enCours={enCours}
      telephoneActif={telephoneActif}
      accent={accent}
      onRegler={regler}
      onRelire={() => void relire()}
    />
  )
}

/**
 * Juste après l'activation, sur la carte de la journée : le rappel du soir,
 * proposé en un geste.
 *
 * C'est le moment où la question a un sens — le téléphone vient d'accepter
 * les rappels. Proposé, jamais posé d'office : un rappel quotidien que
 * personne n'a demandé finit par faire retirer tous les autres.
 */
export function ProposerLeSoir({ patientId, accent }: { patientId: string; accent?: string }) {
  const { etat, preferences, enCours, regler } = usePreferencesRappels(patientId)
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(null)

  if (retour?.ok) {
    return (
      <p className={p.note} role="status">
        {retour.message}
      </p>
    )
  }
  // Déjà réglé, pas encore lu, ou illisible : on ne propose rien.
  if (etat !== 'pret' || !preferences || preferences.soirActif) return null

  return (
    <div style={{ marginTop: 12 }}>
      <p className={p.texte}>
        Un rappel chaque soir à {heureDite(preferences.soirHeure)} pour noter votre soirée ? Il ne
        vient pas si la note est déjà prise.
      </p>
      <button
        type="button"
        className={p.bouton}
        style={accent ? { background: accent } : undefined}
        disabled={enCours}
        onClick={async () => {
          const r = await regler({ soirActif: true })
          setRetour(
            r.ok
              ? { ok: true, message: `C'est réglé : chaque soir à ${heureDite(preferences.soirHeure)}. L'heure se change dans « Moi ».` }
              : r,
          )
        }}
      >
        {enCours ? 'Un instant…' : 'Oui, chaque soir'}
      </button>
      {retour && !retour.ok ? (
        <p className={s.erreur} role="alert">
          {retour.message}
        </p>
      ) : null}
    </div>
  )
}
