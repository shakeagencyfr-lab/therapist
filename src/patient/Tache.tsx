import { useState } from 'react'
import { RoundCheck } from '@/components/ui'
import type { PatientModuleRow } from './usePatientData'
import { useDictee } from './useDictee'
import { BoutonDictee } from './BoutonDictee'
import { useBrouillon } from './useBrouillon'
import s from './Tache.module.css'

/** A, B, C… devant chaque option : on désigne une réponse à voix haute. */
const LETTRES = ['A', 'B', 'C', 'D', 'E', 'F']

/**
 * Une tâche, ouverte.
 *
 * L'écran d'accueil ne montrait qu'un titre, une case et un champ de note :
 * on pouvait cocher un exercice sans jamais savoir ce qu'il fallait faire.
 * La consigne était en base — colonne `consigne` de `patient_modules` — et
 * aucun écran ne l'ouvrait.
 *
 * CE QUI MANQUE EST DIT, PAS INVENTÉ. Un module écrit dans l'atelier porte
 * ses étapes ; un module issu d'une séance ne porte que le « pourquoi » que
 * la thérapeute a dicté, parce que le brouillon de séance n'écrit pas
 * d'étapes. Fabriquer une consigne générique par type — « respirez trois
 * fois » — donnerait à lire quelque chose que personne n'a prescrit. On
 * montre ce qu'il y a, et on renvoie à sa thérapeute pour le reste.
 */
export function Tache({
  module,
  accent,
  reponses,
  onFermer,
  onBasculer,
  onNote,
  onRepondre,
}: {
  module: PatientModuleRow
  accent?: string
  /** Ses réponses déjà données, par `moduleId:question`. */
  reponses: Record<string, number>
  onFermer: () => void
  /** Coche ou décoche pour aujourd'hui. Rend faux si la base ne l'a pas enregistré. */
  onBasculer: (fait: boolean) => Promise<boolean>
  /** Rend vrai si le mot a bien été enregistré. */
  onNote: (texte: string) => Promise<boolean>
  /** Enregistre une réponse au quiz. Rend faux si elle n'est pas partie. */
  onRepondre: (question: number, choix: number) => Promise<boolean>
}) {
  /* Fait AUJOURD'HUI : l'exercice se refait chaque jour (0051). */
  const fait = module.faitAujourdhui
  /** La case n'a pas pu être enregistrée : dit sous la case, pas ailleurs. */
  const [caseEchouee, setCaseEchouee] = useState(false)
  /* Le mot en cours survit au retour « ‹ Ma journée » (useBrouillon) : il se
     retrouve à la prochaine ouverture de l'exercice, tant qu'il n'est pas
     enregistré. */
  const [note, setNote, oublierNote] = useBrouillon(`note.${module.id}`, module.patient_note ?? '')
  const [enCours, setEnCours] = useState(false)
  const [enregistre, setEnregistre] = useState(false)
  const [echec, setEchec] = useState(false)
  const dictee = useDictee(note, (suite) => {
    setNote(suite)
    setEnregistre(false)
  })

  const consigne = module.consigne ?? null
  const etapes = consigne?.steps?.filter((e) => e.trim()) ?? []
  const repere = [consigne?.duree, consigne?.quand].filter(Boolean).join(' · ')
  /* LE QUIZ EXISTAIT PARTOUT SAUF ICI. L'IA l'écrit — deux questions imposées
     par le schéma, des jetons payés à chaque génération —, `custom_modules` et
     `patient_modules` le conservent, la table des réponses et sa politique
     l'attendaient. Le seul écran qui l'affichait était l'aperçu de
     démonstration de l'espace cabinet, où c'est la thérapeute qui répondait à
     la place de son patient. */
  const quiz = consigne?.quiz?.filter((q) => q && q.question && q.options?.length) ?? []

  async function enregistrer() {
    if (enCours) return
    setEnCours(true)
    setEchec(false)
    dictee.arreter()
    /* « Enregistré » ne s'affiche QUE si ça l'est. Sinon le patient repart en
       croyant que sa thérapeute lira son mot, et son mot n'existe nulle part —
       et il n'a plus aucune raison d'aller vérifier. */
    const ok = await onNote(note.trim())
    setEnCours(false)
    setEnregistre(ok)
    setEchec(!ok)
    // Enregistré : plus de brouillon. En échec, il reste — le mot aussi.
    if (ok) oublierNote()
  }

  return (
    <div className={s.ecran}>
      <button type="button" className={s.retour} onClick={onFermer}>
        ‹ Ma journée
      </button>

      <h1 className={s.titre}>{module.title}</h1>
      <p className={s.meta}>{repere || module.meta}</p>

      {consigne?.why ? (
        <section className={s.bloc}>
          <h2 className={s.blocTitre}>À quoi ça sert</h2>
          <p className={s.texte}>{consigne.why}</p>
        </section>
      ) : null}

      {etapes.length ? (
        <section className={s.bloc}>
          <h2 className={s.blocTitre}>Comment faire</h2>
          <ol className={s.etapes}>
            {etapes.map((etape, i) => (
              <li key={i} className={s.etape}>
                <span className={s.numero} style={accent ? { background: accent } : undefined}>
                  {i + 1}
                </span>
                <span className={s.etapeTexte}>{etape}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {!consigne?.why && !etapes.length ? (
        <section className={s.bloc}>
          <p className={s.texte}>
            Votre thérapeute a ajouté cet exercice sans consigne écrite : il vous a été expliqué en
            séance. Si vous ne vous en souvenez plus, dites-le-lui dans « Un mot pour votre
            thérapeute », en bas de « Ma journée ».
          </p>
        </section>
      ) : null}

      {quiz.length ? (
        <section className={s.bloc}>
          <h2 className={s.blocTitre}>Avez-vous bien saisi ?</h2>
          {/* LA PROMESSE DOIT ÊTRE VRAIE. L'écran disait « votre thérapeute
              voit seulement si vous y avez répondu », alors que la fiche du
              cabinet affiche le nombre de BONNES réponses (WeekModules,
              quizBadge) et que la base lui laisse lire chaque réponse. Sur une
              application de santé, on dit ce qui est montré. */}
          <p className={s.aide}>
            Deux questions, sans chronomètre. Elles servent à repérer ce qui reste flou : votre
            thérapeute voit vos réponses, pour y revenir avec vous en séance si besoin.
          </p>
          {quiz.map((q, qi) => {
            const donnee = reponses[`${module.id}:${qi}`]
            const repondu = donnee !== undefined
            return (
              <div key={qi} className={s.question}>
                <p className={s.questionTexte}>{q.question}</p>
                <div className={s.options}>
                  {q.options.map((option, oi) => {
                    const choisie = donnee === oi
                    const bonne = repondu && oi === q.correct
                    const ratee = choisie && !bonne
                    return (
                      <button
                        type="button"
                        key={oi}
                        className={
                          bonne ? `${s.option} ${s.optionJuste}` : ratee ? `${s.option} ${s.optionRatee}` : s.option
                        }
                        aria-pressed={choisie}
                        onClick={() => void onRepondre(qi, oi)}
                      >
                        <span className={s.optionLettre} aria-hidden>
                          {bonne ? '✓' : ratee ? '✕' : (LETTRES[oi] ?? '•')}
                        </span>
                        <span className={s.optionTexte}>{option}</span>
                      </button>
                    )
                  })}
                </div>
                {repondu && q.feedback ? <p className={s.retourQuiz}>{q.feedback}</p> : null}
              </div>
            )
          })}
        </section>
      ) : null}

      <section className={s.bloc}>
        <h2 className={s.blocTitre}>Un mot sur cet exercice</h2>
        <p className={s.aide}>Ce que vous en avez fait, ce qui a coincé. Votre thérapeute le lit.</p>
        <textarea
          className={s.champ}
          rows={4}
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
            setEnregistre(false)
            setEchec(false)
          }}
          placeholder="Deux mots suffisent…"
          aria-label={`Un mot sur « ${module.title} »`}
        />
        <BoutonDictee dictee={dictee} accent={accent} />
        <button
          type="button"
          className={s.enregistrer}
          disabled={enCours || enregistre}
          onClick={() => void enregistrer()}
        >
          {enCours ? 'Enregistrement…' : enregistre ? 'Enregistré' : 'Enregistrer mon mot'}
        </button>
        {echec ? (
          <p className={s.echec} role="status">
            Votre mot n'a pas pu être enregistré. Il est encore là : réessayez dans un instant.
          </p>
        ) : null}
      </section>

      {/* La case reste en bas, sous la main, une fois la consigne lue. Elle
          vaut pour aujourd'hui : demain, l'exercice revient. */}
      <div className={s.pied}>
        <RoundCheck
          on={fait}
          onClick={() => {
            setCaseEchouee(false)
            void onBasculer(!fait).then((ok) => setCaseEchouee(!ok))
          }}
          label={fait ? `Décocher ${module.title} pour aujourd'hui` : `Cocher ${module.title} pour aujourd'hui`}
          style={fait && accent ? { background: accent, borderColor: accent } : undefined}
        />
        <span className={s.piedTexte}>{fait ? "Fait aujourd'hui" : "Marquer comme fait aujourd'hui"}</span>
      </div>
      {caseEchouee ? (
        <p className={s.echec} role="status">
          La case n'a pas pu être enregistrée. Vérifiez votre connexion et réessayez.
        </p>
      ) : null}
    </div>
  )
}
